// OAuth 2.1 authorization server for the MCP endpoint: authorization code + PKCE (S256 only),
// dynamic client registration for public clients, rotating refresh tokens. Opaque tokens, stored
// as SHA-256 hashes. Approval happens on /admin/oauth/authorize, which sits behind the admin
// login, so only a signed-in admin can grant a connector edit access.
import type { D1Database } from '@cloudflare/workers-types';

export const OAUTH_SCOPE = 'mcp:edit';
export const ACCESS_PREFIX = 'oat_';
const REFRESH_PREFIX = 'ort_';
const CODE_PREFIX = 'ocd_';
const CODE_TTL = 300;
const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 86400;
// Registration is open (clients are public), so it is capped to bound D1 writes and storage.
const MAX_CLIENTS = 100;

const nowSec = () => Math.floor(Date.now() / 1000);

async function sha256Bytes(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (v: string) => toHex(await sha256Bytes(v));
const b64url = (b: Uint8Array) =>
	btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (prefix: string) => prefix + toHex(crypto.getRandomValues(new Uint8Array(32)));

let schemaReady = false;
/** Creates the OAuth tables on first use (idempotent), so deploys don't depend on a migration. */
export async function ensureOAuthSchema(db: D1Database): Promise<void> {
	if (schemaReady) return;
	await db.batch([
		db.prepare(
			'CREATE TABLE IF NOT EXISTS oauth_clients (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL UNIQUE, client_name TEXT NOT NULL, redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL)'
		),
		db.prepare(
			'CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, resource TEXT NOT NULL, expires_at INTEGER NOT NULL)'
		),
		db.prepare(
			'CREATE TABLE IF NOT EXISTS oauth_tokens (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, resource TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, created_at INTEGER NOT NULL)'
		),
		db.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client ON oauth_tokens (client_id)')
	]);
	schemaReady = true;
}

/** The protected resource a token is bound to. */
export const resourceFor = (origin: string) => `${origin}/mcp`;

// Redirect URIs are restricted to the connector products and loopback (native/CLI clients), so
// an authorization code can never be delivered to an arbitrary site.
const REDIRECT_HOSTS = new Set(['chatgpt.com', 'chat.openai.com', 'claude.ai', 'claude.com']);
export function isAllowedRedirectUri(value: string): boolean {
	if (typeof value !== 'string' || value.length > 300) return false;
	let u: URL;
	try {
		u = new URL(value);
	} catch {
		return false;
	}
	if (u.hash || u.username || u.password) return false;
	if (u.protocol === 'https:') return REDIRECT_HOSTS.has(u.hostname);
	if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
	return false;
}

export interface OAuthClient {
	id: number;
	client_id: string;
	client_name: string;
	redirect_uris: string[];
}

export type OAuthResult<T> = { ok: true; value: T } | { ok: false; error: string; description: string; status?: number };
const bad = (error: string, description: string, status = 400): { ok: false; error: string; description: string; status: number } => ({
	ok: false,
	error,
	description,
	status
});

const cleanName = (v: unknown) =>
	(typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) || 'MCP client';

export async function registerClient(db: D1Database, body: unknown): Promise<OAuthResult<Record<string, unknown>>> {
	const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	const uris = b.redirect_uris;
	if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5 || !uris.every((u) => typeof u === 'string' && isAllowedRedirectUri(u))) {
		return bad('invalid_redirect_uri', 'redirect_uris must list 1-5 https URLs on chatgpt.com or claude.ai, or loopback http URLs');
	}
	const method = b.token_endpoint_auth_method ?? 'none';
	if (method !== 'none') return bad('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported');
	await ensureOAuthSchema(db);

	const now = nowSec();
	let count = (await db.prepare('SELECT COUNT(*) AS n FROM oauth_clients').first<{ n: number }>())?.n ?? 0;
	if (count >= MAX_CLIENTS) {
		// Drop registrations that never got an active token (never approved), then re-check.
		await db
			.prepare(
				`DELETE FROM oauth_clients WHERE created_at < ?
				   AND client_id NOT IN (SELECT client_id FROM oauth_tokens WHERE revoked_at IS NULL AND expires_at > ?)`
			)
			.bind(now - 600, now)
			.run();
		count = (await db.prepare('SELECT COUNT(*) AS n FROM oauth_clients').first<{ n: number }>())?.n ?? 0;
		if (count >= MAX_CLIENTS) return bad('temporarily_unavailable', 'Too many registered clients; try again later', 429);
	}
	const clientId = crypto.randomUUID();
	const name = cleanName(b.client_name);
	await db
		.prepare('INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)')
		.bind(clientId, name, JSON.stringify(uris), now)
		.run();
	return {
		ok: true,
		value: {
			client_id: clientId,
			client_id_issued_at: now,
			client_name: name,
			redirect_uris: uris,
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			scope: OAUTH_SCOPE
		}
	};
}

export async function getClient(db: D1Database, clientId: string): Promise<OAuthClient | null> {
	await ensureOAuthSchema(db);
	const row = await db
		.prepare('SELECT id, client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = ?')
		.bind(clientId)
		.first<{ id: number; client_id: string; client_name: string; redirect_uris: string }>();
	if (!row) return null;
	try {
		return { ...row, redirect_uris: JSON.parse(row.redirect_uris) as string[] };
	} catch {
		return null;
	}
}

export interface AuthRequest {
	client: OAuthClient;
	redirectUri: string;
	state: string | null;
	challenge: string;
	resource: string;
}

/** Validates an /authorize request. Any failure is shown to the admin; nothing is redirected. */
export async function validateAuthRequest(
	db: D1Database,
	params: URLSearchParams,
	origin: string
): Promise<OAuthResult<AuthRequest>> {
	const clientId = params.get('client_id') ?? '';
	const client = clientId ? await getClient(db, clientId) : null;
	if (!client) return bad('invalid_request', 'Unknown client. Reconnect from the app to start over.');
	const redirectUri = params.get('redirect_uri') ?? '';
	if (!client.redirect_uris.includes(redirectUri)) return bad('invalid_request', 'The redirect address does not match this app’s registration.');
	if (params.get('response_type') !== 'code') return bad('invalid_request', 'Unsupported response type.');
	const challenge = params.get('code_challenge') ?? '';
	if (params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
		return bad('invalid_request', 'PKCE with S256 is required.');
	}
	const resource = resourceFor(origin);
	const asked = params.get('resource');
	if (asked && asked !== resource && asked !== origin && asked !== `${origin}/`) {
		return bad('invalid_target', 'This approval is for a different server.');
	}
	const state = params.get('state');
	if (state && state.length > 500) return bad('invalid_request', 'State is too long.');
	return { ok: true, value: { client, redirectUri, state: state || null, challenge, resource } };
}

async function prune(db: D1Database, now: number) {
	await db.batch([
		db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').bind(now),
		db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').bind(now - 86400)
	]);
}

export async function issueCode(db: D1Database, req: AuthRequest): Promise<string> {
	const code = randomToken(CODE_PREFIX);
	const now = nowSec();
	await db
		.prepare('INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(await sha256Hex(code), req.client.client_id, req.redirectUri, req.challenge, req.resource, now + CODE_TTL)
		.run();
	await prune(db, now);
	return code;
}

async function issueTokens(db: D1Database, clientId: string, resource: string) {
	const now = nowSec();
	const access = randomToken(ACCESS_PREFIX);
	const refresh = randomToken(REFRESH_PREFIX);
	await db.batch([
		db
			.prepare('INSERT INTO oauth_tokens (token_hash, kind, client_id, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(await sha256Hex(access), 'access', clientId, resource, now + ACCESS_TTL, now),
		db
			.prepare('INSERT INTO oauth_tokens (token_hash, kind, client_id, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(await sha256Hex(refresh), 'refresh', clientId, resource, now + REFRESH_TTL, now)
	]);
	return {
		access_token: access,
		token_type: 'Bearer',
		expires_in: ACCESS_TTL,
		refresh_token: refresh,
		scope: OAUTH_SCOPE
	};
}

type TokenBody = Record<string, string | undefined>;

export async function exchangeToken(db: D1Database, p: TokenBody): Promise<OAuthResult<ReturnType<typeof issueTokens> extends Promise<infer R> ? R : never>> {
	await ensureOAuthSchema(db);
	const clientId = p.client_id ?? '';
	if (!clientId || !(await getClient(db, clientId))) return bad('invalid_client', 'Unknown client', 401);
	const now = nowSec();

	if (p.grant_type === 'authorization_code') {
		const verifier = p.code_verifier ?? '';
		if (!p.code || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return bad('invalid_request', 'code and a valid code_verifier are required');
		// Single use: the code is deleted as it is read, whether or not the rest checks out.
		const row = await db
			.prepare('DELETE FROM oauth_codes WHERE code_hash = ? RETURNING client_id, redirect_uri, code_challenge, resource, expires_at')
			.bind(await sha256Hex(p.code))
			.first<{ client_id: string; redirect_uri: string; code_challenge: string; resource: string; expires_at: number }>();
		if (!row || row.expires_at < now || row.client_id !== clientId || row.redirect_uri !== p.redirect_uri) {
			return bad('invalid_grant', 'The authorization code is invalid or expired');
		}
		if (b64url(await sha256Bytes(verifier)) !== row.code_challenge) return bad('invalid_grant', 'PKCE verification failed');
		return { ok: true, value: await issueTokens(db, clientId, row.resource) };
	}

	if (p.grant_type === 'refresh_token') {
		if (!p.refresh_token?.startsWith(REFRESH_PREFIX)) return bad('invalid_grant', 'Invalid refresh token');
		// Rotation: the presented refresh token is revoked atomically and replaced.
		const row = await db
			.prepare(
				`UPDATE oauth_tokens SET revoked_at = ?
				  WHERE token_hash = ? AND kind = 'refresh' AND client_id = ? AND revoked_at IS NULL AND expires_at > ?
				  RETURNING resource`
			)
			.bind(now, await sha256Hex(p.refresh_token), clientId, now)
			.first<{ resource: string }>();
		if (!row) {
			// Presenting an already-used refresh token signals theft or a replay: end the whole grant.
			const reused = await db
				.prepare("SELECT 1 AS x FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh' AND client_id = ? AND revoked_at IS NOT NULL")
				.bind(await sha256Hex(p.refresh_token), clientId)
				.first();
			if (reused) await revokeConnection(db, clientId, false);
			return bad('invalid_grant', 'The refresh token is invalid, expired or already used');
		}
		return { ok: true, value: await issueTokens(db, clientId, row.resource) };
	}
	return bad('unsupported_grant_type', 'Use authorization_code or refresh_token');
}

/** Resolves an OAuth access token for this server, or null. Reads only; never writes. */
export async function verifyOAuthAccessToken(db: D1Database, token: string, origin: string): Promise<{ id: number } | null> {
	if (!token.startsWith(ACCESS_PREFIX)) return null;
	try {
		await ensureOAuthSchema(db);
		const row = await db
			.prepare(
				`SELECT c.id FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id
				  WHERE t.token_hash = ? AND t.kind = 'access' AND t.revoked_at IS NULL AND t.expires_at > ? AND t.resource = ?`
			)
			.bind(await sha256Hex(token), nowSec(), resourceFor(origin))
			.first<{ id: number }>();
		// Audit and rate-limit rows use the negated client id, which cannot collide with api_tokens ids.
		return row ? { id: -row.id } : null;
	} catch (e) {
		console.error('verifyOAuthAccessToken failed', e);
		return null;
	}
}

export interface OAuthConnection {
	client_id: string;
	client_name: string;
	hosts: string;
	created_at: number;
}

export async function listConnections(db: D1Database): Promise<OAuthConnection[]> {
	await ensureOAuthSchema(db);
	const now = nowSec();
	const rows = await db
		.prepare(
			`SELECT c.client_id, c.client_name, c.redirect_uris, c.created_at FROM oauth_clients c
			  WHERE EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.client_id = c.client_id AND t.kind = 'refresh'
			                  AND t.revoked_at IS NULL AND t.expires_at > ?)
			  ORDER BY c.id DESC LIMIT 50`
		)
		.bind(now)
		.all<{ client_id: string; client_name: string; redirect_uris: string; created_at: number }>();
	return rows.results.map((r) => {
		let hosts = '';
		try {
			hosts = [...new Set((JSON.parse(r.redirect_uris) as string[]).map((u) => new URL(u).hostname))].join(', ');
		} catch {
			/* leave blank */
		}
		return { client_id: r.client_id, client_name: r.client_name, hosts, created_at: r.created_at };
	});
}

/**
 * Revokes every token and pending code for an app. By default the registration is deleted too,
 * so a disconnected app must register and be approved again; a replay-triggered revocation
 * (deleteClient = false) keeps it so the legitimate app can simply reconnect.
 */
export async function revokeConnection(db: D1Database, clientId: string, deleteClient = true): Promise<void> {
	await ensureOAuthSchema(db);
	const stmts = [
		db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND revoked_at IS NULL').bind(nowSec(), clientId),
		db.prepare('DELETE FROM oauth_codes WHERE client_id = ?').bind(clientId)
	];
	if (deleteClient) stmts.push(db.prepare('DELETE FROM oauth_clients WHERE client_id = ?').bind(clientId));
	await db.batch(stmts);
}
