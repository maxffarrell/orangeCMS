import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { registerHooks } from 'node:module';
import {
	mkdtemp,
	mkdir,
	readFile,
	writeFile,
	rm,
	symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Only the Workers host imports are stubbed; all OAuth protocol and crypto code
// runs from the installed provider library against an isolated storage fixture.
const hooks = registerHooks({
	resolve(specifier, context, next) {
		if (specifier === 'cloudflare:workers')
			return {
				url: 'data:text/javascript,export const env={};export const waitUntil=(p)=>p;export class WorkerEntrypoint{}',
				shortCircuit: true,
			};
		return next(specifier, context);
	},
});
after(() => hooks.deregister());
globalThis.Cloudflare = {
	compatibilityFlags: { global_fetch_strictly_public: true },
};
after(() => {
	delete globalThis.Cloudflare;
});
const temp = await mkdtemp(join(tmpdir(), 'orangecms-oauth-test-'));
after(() => rm(temp, { recursive: true, force: true }));
await mkdir(join(temp, 'src/lib/server'), { recursive: true });
await writeFile(
	join(temp, 'package.json'),
	JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }),
);
await symlink(resolve('node_modules'), join(temp, 'node_modules'), 'dir');
for (const file of ['server/oauth', 'site', 'routing']) {
	const source = await readFile(
		new URL(`../src/lib/${file}.ts`, import.meta.url),
		'utf8',
	);
	await writeFile(
		join(temp, `src/lib/${file}.js`),
		ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ES2022,
			},
		}).outputText,
	);
}
const {
	getOAuthIssuer,
	getOAuthServer,
	getOAuthEnv,
	getOAuthResource,
	validateOAuthToken,
	handleOAuthProtocolRequest,
} = await import(pathToFileURL(join(temp, 'src/lib/server/oauth.js')).href);
class MemoryKV {
	rows = new Map();
	async put(key, value, options = {}) {
		this.rows.set(key, {
			value,
			metadata: options.metadata ?? null,
			expiration:
				options.expiration ??
				(options.expirationTtl
					? Math.floor(Date.now() / 1000) + options.expirationTtl
					: undefined),
		});
	}
	async get(key, options) {
		const row = this.rows.get(key);
		if (!row || row.expiration < Date.now() / 1000) return null;
		return options?.type === 'json' || options === 'json'
			? JSON.parse(row.value)
			: row.value;
	}
	async delete(key) {
		this.rows.delete(key);
	}
	async list({ prefix = '' } = {}) {
		return {
			keys: [...this.rows]
				.filter(([key]) => key.startsWith(prefix))
				.map(([name, row]) => ({
					name,
					metadata: row.metadata,
					expiration: row.expiration,
				})),
			list_complete: true,
			cacheStatus: null,
		};
	}
}
const origin = 'https://cms.example.test';
const bindings = { OAUTH_KV: new MemoryKV(), OAUTH_ISSUER: origin };
const requestEvent = (path, init) => {
	const request = new Request(origin + path, init);
	return { request, url: new URL(request.url) };
};
test('OAuth issuer rejects insecure deployment URLs and configured origin mismatches', () => {
	assert.equal(getOAuthIssuer(origin, bindings), origin);
	assert.equal(
		getOAuthIssuer('http://localhost:8787', {}),
		'http://localhost:8787',
	);
	assert.throws(() => getOAuthIssuer('http://cms.example.test', {}));
	assert.throws(() =>
		getOAuthIssuer('https://attacker.example.test', bindings),
	);
	assert.throws(() => getOAuthEnv({}));
});
test('provider-backed discovery advertises PKCE, registration and site-specific resource', async () => {
	const metadata = await handleOAuthProtocolRequest(
		requestEvent('/.well-known/oauth-authorization-server'),
		bindings,
	);
	const info = await metadata.json();
	assert.equal(info.issuer, origin);
	assert.equal(info.authorization_endpoint, origin + '/admin/oauth/authorize');
	assert.equal(info.registration_endpoint, origin + '/oauth/register');
	assert.ok(info.code_challenge_methods_supported.includes('S256'));
	const resource = await handleOAuthProtocolRequest(
		requestEvent('/.well-known/oauth-protected-resource/mcp/authorized'),
		bindings,
	);
	assert.equal((await resource.json()).resource, origin + '/mcp/authorized');
});
test('provider enforces PKCE, scopes, audience, one-use codes, refresh and revocation', async () => {
	const server = getOAuthServer(origin, bindings),
		oauth = server.getOAuthApi(getOAuthEnv(bindings));
	const client = await oauth.createClient({
		clientName: 'Test client',
		redirectUris: ['https://client.example.test/callback'],
		tokenEndpointAuthMethod: 'none',
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});
	const verifier = 'a'.repeat(43);
	const challenge = Buffer.from(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
	).toString('base64url');
	const params = new URLSearchParams({
		client_id: client.clientId,
		redirect_uri: client.redirectUris[0],
		response_type: 'code',
		code_challenge: challenge,
		code_challenge_method: 'S256',
		resource: getOAuthResource(origin, bindings),
		scope: 'cms:read cms:write offline_access',
		state: 'state',
	});
	const auth = await oauth.parseAuthRequest(
		new Request(origin + '/admin/oauth/authorize?' + params),
	);
	const consent = await oauth.beginConsent(auth);
	await assert.rejects(() =>
		oauth.approveConsent(
			new Request(origin + '/admin/oauth/authorize', { method: 'POST' }),
			consent.handle,
			{ scope: auth.scope },
		),
	);
	const cookie = consent.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
	const approved = await oauth.approveConsent(
		new Request(origin + '/admin/oauth/authorize', {
			method: 'POST',
			headers: { Cookie: cookie },
		}),
		consent.handle,
		{ scope: auth.scope },
	);
	const completed = await oauth.completeAuthorization({
		request: approved.request,
		userId: 'test-user',
		scope: approved.request.scope,
		metadata: {},
		props: {},
	});
	const code = new URL(completed.redirectTo).searchParams.get('code');
	const tokenRequest = async (values) => {
		const response = await handleOAuthProtocolRequest(
			requestEvent('/oauth/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ client_id: client.clientId, ...values }),
			}),
			bindings,
		);
		return { status: response.status, body: await response.json() };
	};
	const exchange = {
		grant_type: 'authorization_code',
		code,
		code_verifier: verifier,
		redirect_uri: client.redirectUris[0],
		resource: getOAuthResource(origin, bindings),
	};
	assert.equal(
		(await tokenRequest({ ...exchange, code_verifier: 'b'.repeat(43) })).status,
		400,
	);
	let tokens = await tokenRequest(exchange);
	assert.equal(tokens.status, 200, JSON.stringify(tokens.body));
	let identity = await validateOAuthToken(
		origin,
		tokens.body.access_token,
		bindings,
	);
	assert.equal(identity.canWrite, true);
	assert.equal(identity.subject, 'test-user');
	assert.ok(identity.actorKey.startsWith('oauth:test-user:'));
	assert.equal(
		await server
			.validateToken(
				'https://different.example.test/mcp/authorized',
				tokens.body.access_token,
				getOAuthEnv(bindings),
			)
			.catch(() => null),
		null,
	);
	assert.equal((await tokenRequest(exchange)).status, 400);
	assert.equal(
		await validateOAuthToken(origin, tokens.body.access_token, bindings),
		null,
		'code replay revokes the compromised grant',
	);
	const second = await oauth.completeAuthorization({
		request: approved.request,
		userId: 'test-user',
		scope: approved.request.scope,
		metadata: {},
		props: {},
	});
	tokens = await tokenRequest({
		...exchange,
		code: new URL(second.redirectTo).searchParams.get('code'),
	});
	assert.equal(tokens.status, 200);
	identity = await validateOAuthToken(
		origin,
		tokens.body.access_token,
		bindings,
	);
	const refreshed = await tokenRequest({
		grant_type: 'refresh_token',
		refresh_token: tokens.body.refresh_token,
		resource: getOAuthResource(origin, bindings),
	});
	assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
	assert.equal(
		(await validateOAuthToken(origin, refreshed.body.access_token, bindings))
			.actorKey,
		identity.actorKey,
	);
	await oauth.revokeGrant(identity.grantId, identity.subject);
	assert.equal(
		await validateOAuthToken(origin, refreshed.body.access_token, bindings),
		null,
	);
});

test('read-only consent honors offline access and refresh cannot escalate scope', async () => {
	for (const offline of [false, true]) {
		const localBindings = { OAUTH_KV: new MemoryKV(), OAUTH_ISSUER: origin };
		const oauth = getOAuthServer(origin, localBindings).getOAuthApi(
			getOAuthEnv(localBindings),
		);
		const client = await oauth.createClient({
			clientName: 'Read client',
			redirectUris: ['https://client.example.test/callback'],
			tokenEndpointAuthMethod: 'none',
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
		});
		const verifier = 'r'.repeat(43),
			challenge = Buffer.from(
				await crypto.subtle.digest(
					'SHA-256',
					new TextEncoder().encode(verifier),
				),
			).toString('base64url');
		const params = new URLSearchParams({
			client_id: client.clientId,
			redirect_uri: client.redirectUris[0],
			response_type: 'code',
			code_challenge: challenge,
			code_challenge_method: 'S256',
			resource: getOAuthResource(origin, localBindings),
			scope: offline ? 'cms:read offline_access' : 'cms:read',
		});
		const auth = await oauth.parseAuthRequest(
			new Request(origin + '/admin/oauth/authorize?' + params),
		);
		const completed = await oauth.completeAuthorization({
			request: auth,
			userId: 'read-user',
			scope: auth.scope,
			metadata: {},
			props: {},
		});
		const code = new URL(completed.redirectTo).searchParams.get('code');
		const response = await handleOAuthProtocolRequest(
			requestEvent('/oauth/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					client_id: client.clientId,
					grant_type: 'authorization_code',
					code,
					code_verifier: verifier,
					redirect_uri: client.redirectUris[0],
				}),
			}),
			localBindings,
		);
		const tokens = await response.json();
		assert.equal(response.status, 200, JSON.stringify(tokens));
		assert.equal(
			(await validateOAuthToken(origin, tokens.access_token, localBindings))
				.canWrite,
			false,
		);
		if (!offline) assert.equal(tokens.refresh_token, undefined);
		else {
			assert.equal(typeof tokens.refresh_token, 'string');
			const refresh = await handleOAuthProtocolRequest(
				requestEvent('/oauth/token', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						client_id: client.clientId,
						grant_type: 'refresh_token',
						refresh_token: tokens.refresh_token,
						scope: 'cms:read cms:write offline_access',
					}),
				}),
				localBindings,
			);
			const result = await refresh.json();
			if (refresh.ok)
				assert.equal(
					(await validateOAuthToken(origin, result.access_token, localBindings))
						.canWrite,
					false,
				);
			else assert.equal(result.error, 'invalid_scope');
		}
	}
});
