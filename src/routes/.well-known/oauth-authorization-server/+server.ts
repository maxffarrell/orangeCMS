import { OAUTH_SCOPE } from '#lib/server/oauth.js';
import { oauthJson, oauthPreflight } from '#lib/server/oauth-http.js';
import type { RequestHandler } from './$types';

// RFC 8414 authorization server metadata.
export const GET: RequestHandler = ({ url }) =>
	oauthJson({
		issuer: url.origin,
		authorization_endpoint: `${url.origin}/admin/oauth/authorize`,
		token_endpoint: `${url.origin}/oauth/token`,
		registration_endpoint: `${url.origin}/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		scopes_supported: [OAUTH_SCOPE]
	}, 200, { 'Cache-Control': 'public, max-age=300' });
export const OPTIONS: RequestHandler = oauthPreflight;
