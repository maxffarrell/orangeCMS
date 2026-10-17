import { env } from 'cloudflare:workers';
import {
	AuthorizationError,
	CimdFetchError,
} from '@cloudflare/workers-oauth-provider';
import {
	getOAuthServer,
	getOAuthEnv,
	getOAuthResource,
} from '#lib/server/oauth.js';
import { site } from '#lib/site.js';
import type { RequestHandler } from './$types';

const escape = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				char
			]!,
	);
function page(body: string, status = 200, extra?: Headers) {
	const headers = new Headers(extra);
	headers.set('Content-Type', 'text/html; charset=utf-8');
	headers.set('Cache-Control', 'no-store');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Referrer-Policy', 'no-referrer');
	headers.set(
		'Content-Security-Policy',
		"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
	);
	return new Response(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to ${escape(site.adminName)}</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#202020;background:#faf9f6;margin:0;padding:32px 16px}main{max-width:600px;margin:4vh auto;background:white;border:1px solid #dedbd5;border-radius:16px;padding:28px}h1{font-size:28px;line-height:1.2}h2{font-size:18px}p{overflow-wrap:anywhere}.muted{color:#625c55}.notice{background:#fff4df;padding:12px;border-radius:8px}label{display:block;margin:16px 0}input{margin-right:8px}button{font:inherit;cursor:pointer;border:1px solid #ccc;border-radius:8px;padding:10px 18px;background:white;margin:8px 8px 0 0}button[value=approve]{background:#202020;color:white}small{display:block;margin-left:26px}code{overflow-wrap:anywhere}</style></head><body><main>${body}</main></body></html>`,
		{ status, headers },
	);
}
function unavailable() {
	return page(
		'<h1>Connections are unavailable</h1><p>The site owner needs to configure OAuth storage and sign-in for this installation.</p>',
		503,
	);
}
function authorizationFailure(error: unknown) {
	if (error instanceof AuthorizationError) {
		if (error.redirectTo)
			return new Response(null, {
				status: 302,
				headers: { Location: error.redirectTo, 'Cache-Control': 'no-store' },
			});
		return page(
			'<h1>Connection request could not be verified</h1><p>Return to your client and start the connection again.</p>',
			400,
		);
	}
	if (error instanceof CimdFetchError)
		return page(
			'<h1>Client identity is unavailable</h1><p>The client metadata could not be verified. Try again from your client.</p>',
			400,
		);
	return page(
		'<h1>Connection could not be completed</h1><p>Return to your client and try again.</p>',
		503,
	);
}

export const GET: RequestHandler = async ({ request, url, locals }) => {
	if (!env.OAUTH_KV) return unavailable();
	if (!locals.adminIdentity)
		return page(
			'<h1>Sign in required</h1><p>Sign in to this site before connecting an application.</p>',
			401,
		);
	try {
		const api = getOAuthServer(url.origin).getOAuthApi(getOAuthEnv(env));
		const authRequest = await api.parseAuthRequest(request);
		const description = await api.describeConsent(authRequest);
		const transaction = await api.beginConsent(authRequest);
		// Optional permissions are offered explicitly even when a client initially requests read only.
		// The provider validates the administrator's chosen grant against supported scopes.
		const wantsWrite = true;
		const wantsOffline = true;
		return page(
			`<p class="muted">${escape(site.adminName)}</p><h1>Connect ${escape(description.clientName)}?</h1><p>This application is requesting access to <strong>${escape(new URL(getOAuthResource(url.origin)).host)}</strong>.</p>${description.clientDomain ? `<p>Client identity domain: <strong>${escape(description.clientDomain)}</strong></p>` : '<p class="notice">The application name is supplied by the application and is not a verified identity.</p>'}<p>After approval, your browser will return to <strong>${escape(description.redirectHost)}</strong>.</p><p class="muted"><code>${escape(description.redirectUri)}</code></p>${description.redirectIsLoopback ? '<p class="notice">This callback connects to an application on your computer. Another local process could be listening at this address; continue only if you started this connection.</p>' : ''}<h2>Permissions</h2><form method="post"><input type="hidden" name="handle" value="${escape(transaction.handle)}"><input type="hidden" name="scope" value="cms:read"><p><strong>Read site content and administrative data</strong><br><span class="muted">Required for this connection. Sensitive form answers remain excluded.</span></p>${wantsWrite ? '<label><input type="checkbox" name="scope" value="cms:write">Allow editing<small>Can change collections, entries, pages, settings, and forms. Each write still requires a preview and confirmation.</small></label>' : ''}${wantsOffline ? '<label><input type="checkbox" name="scope" value="offline_access" checked>Stay connected<small>Allow the client to refresh its access without another browser sign-in.</small></label>' : ''}<p class="muted">You can revoke access under Connected apps.</p><button type="submit" name="decision" value="approve">Connect</button><button type="submit" name="decision" value="deny">Cancel</button></form>`,
			200,
			transaction.headers,
		);
	} catch (error) {
		return authorizationFailure(error);
	}
};

export const POST: RequestHandler = async ({ request, url, locals }) => {
	if (!env.OAUTH_KV) return unavailable();
	if (!locals.adminIdentity)
		return page(
			'<h1>Sign in required</h1><p>Sign in to this site before connecting an application.</p>',
			401,
		);
	if (request.headers.get('Origin') !== url.origin)
		return page(
			'<h1>Connection request could not be verified</h1><p>Start again from your client.</p>',
			403,
		);
	try {
		const form = await request.formData();
		const handle = form.get('handle');
		if (typeof handle !== 'string' || handle.length > 1024)
			return page(
				'<h1>Invalid connection request</h1><p>Start again from your client.</p>',
				400,
			);
		const api = getOAuthServer(url.origin).getOAuthApi(getOAuthEnv(env));
		if (form.get('decision') === 'deny') {
			const denied = await api.denyConsent(request, handle);
			return new Response(null, { status: 302, headers: denied.headers });
		}
		if (form.get('decision') !== 'approve')
			return page('<h1>Invalid connection request</h1>', 400);
		const selected = form.getAll('scope');
		if (
			!selected.every(
				(scope) =>
					typeof scope === 'string' &&
					['cms:read', 'cms:write', 'offline_access'].includes(scope),
			) ||
			!selected.includes('cms:read')
		)
			return page(
				'<h1>Invalid permissions</h1><p>Start again from your client.</p>',
				400,
			);
		const approved = await api.approveConsent(request, handle, {
			scope: selected as string[],
		});
		const description = await api.describeConsent(approved.request);
		const completed = await api.completeAuthorization({
			request: approved.request,
			userId: locals.adminIdentity.sub,
			scope: approved.request.scope,
			props: { subject: locals.adminIdentity.sub },
			metadata: {
				clientName: description.clientName,
				redirectHost: description.redirectHost,
			},
		});
		approved.headers.set('Location', completed.redirectTo);
		return new Response(null, { status: 302, headers: approved.headers });
	} catch (error) {
		return authorizationFailure(error);
	}
};
