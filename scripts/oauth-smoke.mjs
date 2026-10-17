import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

/** Exercise the actual compiled Worker and provider using isolated local KV. */
export async function testOAuth({
	origin,
	adminJwt,
	writeTool = 'save_page',
	previewArgs = { slug: 'home', title: 'OAuth smoke preview' },
	applyArgs = {
		slug: 'oauth-smoke-page',
		title: 'OAuth saved page',
		content: 'OAuth persisted content',
		confirm: true,
	},
	readTool = 'get_page',
	readArgs = { slug: 'oauth-smoke-page' },
}) {
	const resource = origin + '/mcp/authorized';
	const adminHeaders = { 'Cf-Access-Jwt-Assertion': adminJwt };
	const challenge = await fetch(resource, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	});
	assert.equal(challenge.status, 401);
	assert.match(challenge.headers.get('WWW-Authenticate'), /resource_metadata=/);
	const metadataUrl = /resource_metadata="([^"]+)"/.exec(
		challenge.headers.get('WWW-Authenticate'),
	)[1];
	const metadata = await (await fetch(metadataUrl)).json();
	assert.equal(metadata.resource, resource);
	assert.deepEqual(metadata.authorization_servers, [origin]);
	const server = await (
		await fetch(origin + '/.well-known/oauth-authorization-server')
	).json();
	assert.equal(server.issuer, origin);
	assert.ok(server.code_challenge_methods_supported.includes('S256'));
	assert.equal(
		server.authorization_endpoint,
		origin + '/admin/oauth/authorize',
	);
	assert.equal(server.token_endpoint, origin + '/oauth/token');
	const callback = 'http://127.0.0.1:34791/callback';
	const register = await fetch(server.registration_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_name: 'Smoke OAuth client <untrusted>',
			redirect_uris: [callback],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
		}),
	});
	assert.equal(register.status, 201, 'dynamic client registration');
	const client = await register.json();
	const verifier = randomBytes(32).toString('base64url');
	const pkce = createHash('sha256').update(verifier).digest('base64url');
	const authUrl = (scope = 'cms:read offline_access', extra = {}) => {
		const url = new URL(server.authorization_endpoint);
		url.search = new URLSearchParams({
			response_type: 'code',
			client_id: client.client_id,
			redirect_uri: callback,
			scope,
			state: 'smoke-state',
			code_challenge: pkce,
			code_challenge_method: 'S256',
			resource,
			...extra,
		}).toString();
		return url;
	};
	const consentPage = async (scope, extra = {}) => {
		const response = await fetch(authUrl(scope, extra), {
			headers: adminHeaders,
			redirect: 'manual',
		});
		const html = await response.text();
		assert.equal(response.status, 200, 'Access-authenticated consent');
		assert.ok(html.includes('127.0.0.1'), 'consent shows redirect domain');
		assert.ok(
			html.includes('&lt;untrusted&gt;'),
			'unverified client strings are escaped',
		);
		assert.ok(
			!html.includes('client <untrusted>'),
			'client HTML must not render',
		);
		assert.match(
			response.headers.get('content-security-policy') ?? '',
			/frame-ancestors 'none'/,
		);
		const handle = /name="handle"\s+value="([^"]+)"/.exec(html)?.[1];
		assert.ok(handle, 'browser-bound consent handle rendered');
		const cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(';')[0])
			.join('; ');
		assert.ok(cookie, 'consent cookie');
		const writeInput = /<input[^>]+value="cms:write"[^>]*>/.exec(html)?.[0];
		assert.ok(
			writeInput && !/checked/.test(writeInput),
			'editing is offered and requires an explicit check',
		);
		return { handle, cookie };
	};
	const decide = (
		{ handle, cookie },
		scopes = ['cms:read', 'offline_access'],
		decision = 'approve',
		overrides = {},
	) =>
		fetch(server.authorization_endpoint, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				...adminHeaders,
				Origin: origin,
				Cookie: cookie,
				...overrides,
			},
			body: new URLSearchParams([
				['handle', handle],
				['decision', decision],
				...scopes.map((scope) => ['scope', scope]),
			]),
		});
	const token = (params) =>
		fetch(server.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ client_id: client.client_id, ...params }),
		});
	const authorize = async (scopes) => {
		const consent = await consentPage(scopes.join(' '));
		const approved = await decide(consent, scopes);
		assert.equal(approved.status, 302, 'explicit consent approves');
		const redirect = new URL(approved.headers.get('location'));
		assert.equal(redirect.origin, new URL(callback).origin);
		assert.equal(redirect.searchParams.get('state'), 'smoke-state');
		assert.equal(redirect.searchParams.get('iss'), origin);
		assert.ok(redirect.searchParams.get('code'));
		const code = redirect.searchParams.get('code');
		const response = await token({
			grant_type: 'authorization_code',
			code,
			redirect_uri: callback,
			code_verifier: verifier,
			resource,
		});
		assert.equal(response.status, 200, 'code exchange');
		return { tokens: await response.json(), code, consent };
	};
	const rpc = async (accessToken, method = 'tools/list', params) => {
		const response = await fetch(resource, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
		});
		return { status: response.status, body: await response.json() };
	};
	assert.notEqual(
		(await fetch(authUrl(), { redirect: 'manual' })).status,
		200,
		'consent requires verified admin login',
	);
	const forged = await fetch(authUrl(), {
		headers: { 'Cf-Access-Jwt-Assertion': 'forged' },
		redirect: 'manual',
	});
	assert.notEqual(forged.status, 200, 'forged Access assertion rejected');
	const mismatch = await fetch(
		authUrl(undefined, {
			redirect_uri: 'https://attacker.example.test/callback',
		}),
		{ headers: adminHeaders, redirect: 'manual' },
	);
	assert.equal(mismatch.status, 400);
	assert.equal(
		mismatch.headers.get('location'),
		null,
		'unregistered callback never redirected',
	);
	const unsafePkce = await fetch(
		authUrl(undefined, { code_challenge_method: 'plain' }),
		{ headers: adminHeaders, redirect: 'manual' },
	);
	assert.notEqual(unsafePkce.status, 200, 'plain PKCE rejected');
	const wrongResource = await fetch(
		authUrl(undefined, {
			resource: 'https://other.example.test/mcp/authorized',
		}),
		{ headers: adminHeaders, redirect: 'manual' },
	);
	assert.notEqual(wrongResource.status, 200, 'foreign resource rejected');
	const unsafeAdmin = await fetch(origin + '/admin/settings?/save', {
		method: 'POST',
		headers: { ...adminHeaders, Origin: 'https://attacker.example.test' },
		body: new URLSearchParams({ unrelated: 'must not apply' }),
	});
	assert.equal(
		unsafeAdmin.status,
		403,
		'framework still rejects cross-site admin form posts',
	);
	const csrf = await consentPage('cms:read');
	assert.equal(
		(await decide({ ...csrf, cookie: '' }, ['cms:read'])).status,
		400,
		'consent cannot be forged without browser cookie',
	);
	const crossOrigin = await consentPage('cms:read');
	assert.ok(
		(
			await decide(crossOrigin, ['cms:read'], 'approve', {
				Origin: 'https://attacker.example.test',
			})
		).status >= 400,
		'cross-origin consent rejected',
	);
	const denied = await decide(await consentPage('cms:read'), [], 'deny');
	assert.equal(denied.status, 302);
	assert.equal(
		new URL(denied.headers.get('location')).searchParams.get('error'),
		'access_denied',
	);
	const temporary = await authorize(['cms:read']);
	assert.equal(
		temporary.tokens.refresh_token,
		undefined,
		'staying connected requires explicit offline consent',
	);
	const read = await authorize(['cms:read', 'offline_access']);
	assert.ok(read.tokens.refresh_token, 'offline access returns refresh token');
	assert.equal(read.tokens.expires_in, 3600);
	assert.equal(
		(await decide(read.consent)).status,
		400,
		'consent handle is one-time',
	);
	const readList = await rpc(read.tokens.access_token);
	assert.equal(readList.status, 200);
	const names = readList.body.result.tools.map((tool) => tool.name);
	assert.ok(
		names.includes('list_form_submissions') && !names.includes(writeTool),
		'read scope does not grant editing',
	);
	const blocked = await rpc(read.tokens.access_token, 'tools/call', {
		name: writeTool,
		arguments: applyArgs,
	});
	assert.ok(
		blocked.body.error || blocked.body.result?.isError,
		'read token cannot invoke writes',
	);
	const refresh = await token({
		grant_type: 'refresh_token',
		refresh_token: read.tokens.refresh_token,
		resource,
	});
	assert.equal(refresh.status, 200);
	const renewed = await refresh.json();
	assert.equal(
		(await rpc(renewed.access_token)).status,
		200,
		'refreshed access token works',
	);
	const escalated = await token({
		grant_type: 'refresh_token',
		refresh_token: renewed.refresh_token,
		resource,
		scope: 'cms:read cms:write offline_access',
	});
	if (escalated.status === 200) {
		const limited = await escalated.json();
		assert.ok(
			!limited.scope.split(' ').includes('cms:write'),
			'refresh cannot escalate scope',
		);
		const limitedNames = (
			await rpc(limited.access_token)
		).body.result.tools.map((tool) => tool.name);
		assert.ok(!limitedNames.includes(writeTool));
	} else assert.equal(escalated.status, 400);
	assert.notEqual(
		(
			await token({
				grant_type: 'authorization_code',
				code: read.code,
				redirect_uri: callback,
				code_verifier: verifier,
				resource,
			})
		).status,
		200,
		'authorization code is one-time',
	);
	assert.equal(
		(await rpc(renewed.access_token)).status,
		401,
		'code replay revokes compromised grant',
	);
	const edit = await authorize(['cms:read', 'cms:write', 'offline_access']);
	const editNames = (await rpc(edit.tokens.access_token)).body.result.tools.map(
		(tool) => tool.name,
	);
	assert.ok(
		editNames.includes(writeTool),
		'explicit edit consent unlocks edit tools',
	);
	const preview = await rpc(edit.tokens.access_token, 'tools/call', {
		name: writeTool,
		arguments: previewArgs,
	});
	assert.equal(preview.status, 200);
	assert.ok(!preview.body.result.isError, 'edit token can preview a write');
	const applied = await rpc(edit.tokens.access_token, 'tools/call', {
		name: writeTool,
		arguments: applyArgs,
	});
	assert.ok(
		applied.body.result && !applied.body.result.isError,
		'explicitly confirmed OAuth write succeeds',
	);
	const readback = await rpc(edit.tokens.access_token, 'tools/call', {
		name: readTool,
		arguments: readArgs,
	});
	assert.ok(
		JSON.stringify(readback.body.result).includes('OAuth persisted content'),
		'OAuth write persists to D1',
	);
	const connections = await fetch(origin + '/admin/connections', {
		headers: adminHeaders,
	});
	assert.equal(connections.status, 200);
	assert.ok(
		(await connections.text()).includes('Smoke OAuth client'),
		'connected app is visible',
	);
	const revoke = await fetch(server.revocation_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: client.client_id,
			token: edit.tokens.refresh_token,
			token_type_hint: 'refresh_token',
		}),
	});
	assert.equal(revoke.status, 200);
	assert.equal(
		(await rpc(edit.tokens.access_token)).status,
		401,
		'revocation disables grant access',
	);
	assert.notEqual(
		(
			await token({
				grant_type: 'refresh_token',
				refresh_token: edit.tokens.refresh_token,
				resource,
			})
		).status,
		200,
		'revoked grant cannot refresh',
	);
	const uiGrant = await authorize(['cms:read', 'cms:write', 'offline_access']);
	const uiPage = await fetch(origin + '/admin/connections', {
		headers: adminHeaders,
	});
	const grantId = /name="id"\s+value="([^"]+)"/.exec(await uiPage.text())?.[1];
	assert.ok(grantId, 'connected app revocation control');
	const uiRevoked = await fetch(origin + '/admin/connections?/revoke', {
		method: 'POST',
		headers: { ...adminHeaders, Origin: origin },
		body: new URLSearchParams({ id: grantId }),
	});
	assert.equal(uiRevoked.status, 200, 'connected app can be revoked in admin');
	assert.equal(
		(await rpc(uiGrant.tokens.access_token)).status,
		401,
		'admin revocation disables access',
	);
	console.log(
		'PASS OAuth discovery, Access consent, PKCE, scopes, refresh, revocation and isolation',
	);
}
