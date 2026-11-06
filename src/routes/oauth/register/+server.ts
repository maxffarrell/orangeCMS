import { env } from 'cloudflare:workers';
import { registerClient } from '#lib/server/oauth.js';
import { oauthJson, oauthPreflight } from '#lib/server/oauth-http.js';
import type { RequestHandler } from './$types';

// RFC 7591 dynamic client registration for public clients. Registering grants nothing by
// itself: an admin still has to approve each app on /admin/oauth/authorize.
export const OPTIONS: RequestHandler = oauthPreflight;
export const POST: RequestHandler = async ({ request }) => {
	const db = env.DB;
	if (!db) return oauthJson({ error: 'server_error', error_description: 'Database unavailable' }, 503);
	const raw = await request.text();
	if (raw.length > 8192) return oauthJson({ error: 'invalid_client_metadata', error_description: 'Request too large' }, 413);
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return oauthJson({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, 400);
	}
	const res = await registerClient(db, body);
	if (!res.ok) return oauthJson({ error: res.error, error_description: res.description }, res.status ?? 400);
	return oauthJson(res.value, 201);
};
