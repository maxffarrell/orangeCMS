import { env } from 'cloudflare:workers';
import { validateOAuthToken, oauthChallenge } from '#lib/server/oauth.js';
import { verifyApiToken } from '#lib/server/db.js';
import { handleRpc, type RpcResponse } from '#lib/server/mcp.js';
import type { RequestHandler } from './$types';

// Streamable HTTP MCP endpoint (stateless, JSON responses). Public tools need no
// credentials; admin tools unlock with a bearer token created at /admin/tokens
// (or the optional, read-only MCP_ADMIN_TOKEN secret). Edit tools additionally need a
// token created with "allow edits"; they preview by default and every applied edit is audited.
const MAX_BODY = 256 * 1024;

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers':
		'Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
	'Access-Control-Max-Age': '86400',
	'Access-Control-Expose-Headers': 'WWW-Authenticate',
};
const json = (
	body: unknown,
	status = 200,
	extra: Record<string, string> = {},
) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...cors,
			...extra,
		},
	});
const rpcError = (code: number, message: string, status: number) =>
	json({ jsonrpc: '2.0', id: null, error: { code, message } }, status);

function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++)
		diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: cors });

// No server-initiated stream: tell clients to use POST only.
export const GET: RequestHandler = ({ request, url }) => {
	if (
		url.pathname === '/mcp/authorized' &&
		!request.headers.get('Authorization')
	) {
		if (!env.OAUTH_KV) return json({ error: 'OAuth is not configured' }, 503);
		return json({ error: 'unauthorized' }, 401, {
			'WWW-Authenticate': oauthChallenge(url.origin),
		});
	}
	return new Response('MCP endpoint: send JSON-RPC via POST', {
		status: 405,
		headers: { Allow: 'POST, OPTIONS', ...cors },
	});
};
export const DELETE: RequestHandler = GET;

export const POST: RequestHandler = async ({ request, url }) => {
	const db = env.DB;
	if (!db) return rpcError(-32603, 'Database unavailable', 503);

	let admin = false;
	let canWrite = false;
	let tokenId: number | null = null;
	let actorKey: string | undefined;
	const requiresAuth = url.pathname === '/mcp/authorized';
	if (requiresAuth && !env.OAUTH_KV)
		return json({ error: 'OAuth is not configured' }, 503);
	// An empty bearer value (e.g. an unset env var in a client config) is just anonymous access.
	const auth = request.headers
		.get('Authorization')
		?.replace(/^Bearer\s*$/i, '');
	if (auth) {
		const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
		// Tokens created in /admin/tokens, or the optional MCP_ADMIN_TOKEN secret.
		// The env secret is read-only; editing needs a write-enabled token from /admin/tokens.
		const secretMatch =
			!!token && !!env.MCP_ADMIN_TOKEN && safeEqual(token, env.MCP_ADMIN_TOKEN);
		const row = token && !secretMatch ? await verifyApiToken(db, token) : null;
		const oauth =
			token && !secretMatch && !row && env.OAUTH_KV
				? await validateOAuthToken(url.origin, token, env)
				: null;
		if (!secretMatch && !row && !oauth) {
			return json({ error: 'invalid_token' }, 401, {
				'WWW-Authenticate': env.OAUTH_KV
					? oauthChallenge(url.origin, undefined, 'invalid_token')
					: 'Bearer error="invalid_token"',
			});
		}
		admin = true;
		if (oauth) {
			canWrite = oauth.canWrite;
			actorKey = oauth.actorKey;
		}
		if (row) {
			canWrite = row.canWrite;
			tokenId = row.id;
		}
	}

	if (requiresAuth && !admin)
		return json({ error: 'unauthorized' }, 401, {
			'WWW-Authenticate': oauthChallenge(url.origin),
		});

	const raw = await request.text();
	if (raw.length > MAX_BODY) return rpcError(-32600, 'Request too large', 413);
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return rpcError(-32700, 'Parse error', 400);
	}

	const ctx = { db, origin: url.origin, admin, canWrite, tokenId, actorKey };
	const messages = Array.isArray(body) ? body : [body];
	if (messages.length === 0) return rpcError(-32600, 'Invalid Request', 400);
	if (messages.length > 20)
		return rpcError(-32600, 'Batch too large (max 20)', 413);
	// Sequential, so edits within a batch cannot race the per-token hourly edit cap.
	const responses: RpcResponse[] = [];
	for (const m of messages) {
		const r = await handleRpc(m as Parameters<typeof handleRpc>[0], ctx);
		if (r) responses.push(r);
	}

	// Only notifications / responses were sent: acknowledge with no body.
	if (responses.length === 0)
		return new Response(null, { status: 202, headers: cors });
	return json(Array.isArray(body) ? responses : responses[0]);
};
