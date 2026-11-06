import { env } from 'cloudflare:workers';
import { exchangeToken } from '#lib/server/oauth.js';
import { oauthJson, oauthPreflight } from '#lib/server/oauth-http.js';
import type { RequestHandler } from './$types';

export const OPTIONS: RequestHandler = oauthPreflight;
export const POST: RequestHandler = async ({ request }) => {
	const db = env.DB;
	if (!db) return oauthJson({ error: 'server_error', error_description: 'Database unavailable' }, 503);
	const raw = await request.text();
	if (raw.length > 8192) return oauthJson({ error: 'invalid_request', error_description: 'Request too large' }, 413);
	const params: Record<string, string> = {};
	try {
		if ((request.headers.get('content-type') ?? '').includes('application/json')) {
			for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) if (typeof v === 'string') params[k] = v;
		} else {
			for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
		}
	} catch {
		return oauthJson({ error: 'invalid_request', error_description: 'Malformed body' }, 400);
	}
	const res = await exchangeToken(db, params);
	if (!res.ok) {
		const headers: Record<string, string> = res.status === 401 ? { 'WWW-Authenticate': 'Bearer error="invalid_client"' } : {};
		return oauthJson({ error: res.error, error_description: res.description }, res.status ?? 400, headers);
	}
	return oauthJson(res.value);
};
