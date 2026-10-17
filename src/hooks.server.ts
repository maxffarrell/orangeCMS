import { handleOAuthProtocolRequest } from '#lib/server/oauth.js';
import { site } from '#lib/site.js';
import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let cachedKeys:
	| { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> }
	| undefined;

// The site lives at one canonical host. Requests that reach the Worker on an alias
// host are sent to the same path and query on the canonical host (308 keeps the
// method, so even a stray form POST isn't turned into a GET). This is a safety net:
// the primary redirect should be a Cloudflare Single Redirect rule at the edge
// configured for the deployment, which never invokes the Worker at all.
const CANONICAL_HOST = site.canonicalHost;
const ALIAS_HOSTS = new Set(site.aliasHosts.map((host) => host.toLowerCase()));

export const handle: Handle = async ({ event, resolve }) => {
	if (CANONICAL_HOST && ALIAS_HOSTS.has(event.url.hostname.toLowerCase())) {
		return new Response(null, {
			status: 308,
			headers: {
				Location: `https://${CANONICAL_HOST}${event.url.pathname}${event.url.search}`,
				'Cache-Control': 'public, max-age=3600',
			},
		});
	}

	const protocolResponse = await handleOAuthProtocolRequest(event, env);
	if (protocolResponse) return protocolResponse;

	const path = event.url.pathname;
	if (dev) event.locals.adminIdentity = { sub: 'local-development' };
	const isAdmin = path === '/admin' || path.startsWith('/admin/');
	const isUpload = path === '/api/upload' || path.startsWith('/api/upload/');
	if ((isAdmin || isUpload) && !dev) {
		const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
		const aud = env.CF_ACCESS_AUD;
		if (
			!teamDomain ||
			!aud ||
			!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(teamDomain)
		) {
			return new Response('Admin authentication is unavailable', {
				status: 503,
				headers: { 'Cache-Control': 'no-store' },
			});
		}

		const unauthorized = () =>
			isUpload
				? Response.json({ message: 'Authentication required' }, { status: 401 })
				: new Response(null, { status: 302, headers: { Location: '/' } });
		const jwt = event.request.headers.get('Cf-Access-Jwt-Assertion');
		if (!jwt) return unauthorized();

		try {
			const issuer = `https://${teamDomain}`;
			if (cachedKeys?.issuer !== issuer) {
				cachedKeys = {
					issuer,
					keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
				};
			}
			const { payload } = await jwtVerify(jwt, cachedKeys.keys, {
				audience: aud,
				issuer,
				algorithms: ['RS256'],
				requiredClaims: ['exp', 'sub'],
			});
			event.locals.adminIdentity = {
				sub: payload.sub!,
				...(typeof payload.email === 'string' ? { email: payload.email } : {}),
			};
		} catch {
			return unauthorized();
		}
	}

	return resolve(event);
};
