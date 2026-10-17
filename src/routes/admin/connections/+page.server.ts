import { env } from 'cloudflare:workers';
import { fail } from '@sveltejs/kit';
import {
	getOAuthServer,
	getOAuthEnv,
	getOAuthResource,
} from '#lib/server/oauth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const base = {
		ready: false,
		error: null as string | null,
		grants: [] as {
			id: string;
			name: string;
			scope: string[];
			createdAt: number;
			expiresAt: number | null;
			redirectUri: string | null;
		}[],
		cursor: null as string | null,
		mcpUrl: `${url.origin}/mcp/authorized`,
	};
	if (!env.OAUTH_KV) return base;
	if (!locals.adminIdentity)
		return { ...base, error: 'Sign in to manage your connected applications.' };
	try {
		const api = getOAuthServer(url.origin).getOAuthApi(getOAuthEnv(env));
		const result = await api.listUserGrants(locals.adminIdentity.sub, {
			limit: 50,
			cursor: url.searchParams.get('cursor') || undefined,
		});
		return {
			ready: true,
			error: null,
			cursor: result.cursor || null,
			mcpUrl: getOAuthResource(url.origin),
			grants: result.items.map((grant) => ({
				id: grant.id,
				name:
					typeof grant.metadata?.clientName === 'string'
						? grant.metadata.clientName
						: grant.clientId,
				scope: grant.scope,
				createdAt: grant.createdAt,
				expiresAt: grant.expiresAt ?? null,
				redirectUri: grant.redirectUri ?? null,
			})),
		};
	} catch {
		return {
			...base,
			error:
				'Connected applications could not be loaded. Check this installation’s OAuth configuration.',
		};
	}
};

export const actions: Actions = {
	revoke: async ({ locals, request, url }) => {
		if (!env.OAUTH_KV)
			return fail(503, {
				error: 'OAuth storage is not configured for this installation.',
			});
		if (!locals.adminIdentity)
			return fail(401, {
				error: 'Sign in to manage your connected applications.',
			});
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || !id || id.length > 256)
			return fail(400, { error: 'Choose a connected application to revoke.' });
		try {
			await getOAuthServer(url.origin)
				.getOAuthApi(getOAuthEnv(env))
				.revokeGrant(id, locals.adminIdentity.sub);
			return { revoked: true };
		} catch {
			return fail(503, { error: 'Access could not be revoked. Try again.' });
		}
	},
};
