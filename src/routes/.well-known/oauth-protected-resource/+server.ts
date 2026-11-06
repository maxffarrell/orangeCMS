import { OAUTH_SCOPE, resourceFor } from '#lib/server/oauth.js';
import { oauthJson, oauthPreflight } from '#lib/server/oauth-http.js';
import type { RequestHandler } from './$types';

// RFC 9728 protected resource metadata: tells MCP clients which authorization server to use.
export const GET: RequestHandler = ({ url }) =>
	oauthJson({
		resource: resourceFor(url.origin),
		authorization_servers: [url.origin],
		scopes_supported: [OAUTH_SCOPE],
		bearer_methods_supported: ['header']
	}, 200, { 'Cache-Control': 'public, max-age=300' });
export const OPTIONS: RequestHandler = oauthPreflight;
