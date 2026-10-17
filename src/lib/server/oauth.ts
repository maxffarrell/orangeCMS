import { env, waitUntil } from 'cloudflare:workers';
import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { site } from '#lib/site.js';

export const OAUTH_SCOPES = [
	'cms:read',
	'cms:write',
	'offline_access',
] as const;
export const OAUTH_RESOURCE_PATH = '/mcp/authorized';
export const OAUTH_METADATA_PATH =
	'/.well-known/oauth-protected-resource/mcp/authorized';
export const OAUTH_AUTHORIZE_PATH = '/admin/oauth/authorize';
export interface OAuthBindings {
	OAUTH_KV?: Cloudflare.Env['OAUTH_KV'];
	OAUTH_ISSUER?: string;
}
type OAuthEnv = { OAUTH_KV: NonNullable<Cloudflare.Env['OAUTH_KV']> };
const servers = new Map<string, OAuthAuthorizationServer<OAuthEnv>>();

/** The issuer is site-local. Configured origins must exactly match the request. */
export function getOAuthIssuer(
	origin: string,
	bindings: OAuthBindings = env,
): string {
	const request = new URL(origin);
	if (request.origin !== origin || request.username || request.password)
		throw new Error('Invalid OAuth origin');
	const isLocal =
		request.hostname === 'localhost' ||
		request.hostname === '127.0.0.1' ||
		request.hostname === '[::1]';
	if (
		request.protocol !== 'https:' &&
		!(request.protocol === 'http:' && isLocal)
	)
		throw new Error('OAuth requires HTTPS');
	const configured =
		bindings.OAUTH_ISSUER ||
		(site.canonicalHost ? `https://${site.canonicalHost}` : origin);
	const issuer = new URL(configured);
	if (issuer.origin !== configured || issuer.origin !== request.origin)
		throw new Error('OAuth issuer does not match this site');
	return issuer.origin;
}
export function getOAuthEnv(bindings: OAuthBindings = env): OAuthEnv {
	if (!bindings.OAUTH_KV)
		throw new Error('OAuth is unavailable: configure an OAUTH_KV binding');
	return { OAUTH_KV: bindings.OAUTH_KV };
}
export const getOAuthResource = (
	origin: string,
	bindings: OAuthBindings = env,
) => getOAuthIssuer(origin, bindings) + OAUTH_RESOURCE_PATH;
export const getOAuthMetadataUrl = (
	origin: string,
	bindings: OAuthBindings = env,
) => getOAuthIssuer(origin, bindings) + OAUTH_METADATA_PATH;

/** The maintained provider owns protocol validation, PKCE, tokens and consent state. */
export function getOAuthServer(
	origin: string,
	bindings: OAuthBindings = env,
): OAuthAuthorizationServer<OAuthEnv> {
	const issuer = getOAuthIssuer(origin, bindings);
	let server = servers.get(issuer);
	if (!server) {
		server = new OAuthAuthorizationServer<OAuthEnv>({
			issuer,
			resources: [issuer + OAUTH_RESOURCE_PATH],
			authorizeEndpoint: issuer + OAUTH_AUTHORIZE_PATH,
			tokenEndpoint: issuer + '/oauth/token',
			clientRegistrationEndpoint: issuer + '/oauth/register',
			scopesSupported: [...OAUTH_SCOPES],
			clientIdMetadataDocumentEnabled: true,
			accessTokenTTL: 3600,
			refreshTokenTTL: 30 * 86400,
			clientRegistrationTTL: 90 * 86400,
			tokenExchangeCallback: ({ scope }) => ({
				refreshTokenTTL: scope.includes('offline_access') ? 30 * 86400 : 0,
			}),
		});
		servers.set(issuer, server);
	}
	return server;
}
export function oauthChallenge(
	origin: string,
	scope = 'cms:read',
	error?: 'invalid_token' | 'insufficient_scope',
	bindings: OAuthBindings = env,
): string {
	return `Bearer resource_metadata="${getOAuthMetadataUrl(origin, bindings)}", scope="${scope}"${error ? `, error="${error}"` : ''}`;
}
const protocolPaths = new Set([
	'/oauth/token',
	'/oauth/register',
	'/.well-known/oauth-authorization-server',
	OAUTH_METADATA_PATH,
	'/.well-known/oauth-protected-resource',
]);

/** Return null for application routes so the SvelteKit hook can continue normally. */
export async function handleOAuthProtocolRequest(
	event: { request: Request; url: URL; platform?: unknown },
	bindings: OAuthBindings = env,
): Promise<Response | null> {
	if (!protocolPaths.has(event.url.pathname)) return null;
	if (!bindings.OAUTH_KV)
		return Response.json(
			{ error: 'temporarily_unavailable' },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } },
		);
	const issuer = getOAuthIssuer(event.url.origin, bindings);
	if (
		event.url.pathname === OAUTH_METADATA_PATH ||
		event.url.pathname === '/.well-known/oauth-protected-resource'
	) {
		const headers = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Cache-Control': 'no-store',
		};
		if (event.request.method === 'OPTIONS')
			return new Response(null, { status: 204, headers });
		if (!['GET', 'HEAD'].includes(event.request.method))
			return new Response(null, {
				status: 405,
				headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' },
			});
		const body = JSON.stringify({
			resource: issuer + OAUTH_RESOURCE_PATH,
			authorization_servers: [issuer],
			scopes_supported: ['cms:read'],
			bearer_methods_supported: ['header'],
			resource_name: site.name,
		});
		return new Response(event.request.method === 'HEAD' ? null : body, {
			headers: { ...headers, 'Content-Type': 'application/json' },
		});
	}
	const ctx = { waitUntil };
	return getOAuthServer(issuer, bindings).fetch(
		event.request,
		getOAuthEnv(bindings),
		ctx as Parameters<OAuthAuthorizationServer<OAuthEnv>['fetch']>[2],
	);
}

export interface OAuthIdentity {
	admin: true;
	canWrite: boolean;
	actorKey: string;
	subject: string;
	grantId: string;
	scope: string[];
}
export async function validateOAuthToken(
	origin: string,
	token: string,
	bindings: OAuthBindings = env,
): Promise<OAuthIdentity | null> {
	if (!bindings.OAUTH_KV) return null;
	const server = getOAuthServer(origin, bindings);
	const identity = await server.validateToken(
		getOAuthResource(origin, bindings),
		token,
		getOAuthEnv(bindings),
	);
	if (!identity || !identity.scope.includes('cms:read')) return null;
	// The provider has already verified this opaque token and its site audience.
	// Its documented user:grant:secret format gives a stable actor across refreshes.
	const grantId = token.split(':')[1];
	if (!grantId) return null;
	return {
		admin: true,
		canWrite: identity.scope.includes('cms:write'),
		actorKey: `oauth:${identity.userId}:${grantId}`,
		subject: identity.userId,
		grantId,
		scope: identity.scope,
	};
}
