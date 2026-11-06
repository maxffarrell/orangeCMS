import { env } from 'cloudflare:workers';
import { createApiToken, listApiTokens, listAudit, revokeApiToken } from '#lib/server/db.js';
import { ensureOAuthSchema, listConnections, revokeConnection } from '#lib/server/oauth.js';
import { toAuditView, type AuditView } from '#lib/audit.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const db = env.DB;
	let tokens: Awaited<ReturnType<typeof listApiTokens>> = [];
	let ready = true;
	let audit: AuditView[] = [];
	let apps: Awaited<ReturnType<typeof listConnections>> = [];
	if (db) {
		try {
			tokens = await listApiTokens(db);
			await ensureOAuthSchema(db); // the audit query joins oauth_clients
			audit = (await listAudit(db)).map(toAuditView);
			apps = await listConnections(db);
		} catch {
			ready = false; // migration 0005 not applied yet
		}
	}
	return { tokens, audit, apps, ready, mcpUrl: `${url.origin}/mcp` };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const name = ((data.get('name') as string | null) ?? '').trim().slice(0, 80);
		const canWrite = data.get('can_write') === 'on';
		if (!name) return fail(400, { error: 'Give the token a name, e.g. "Claude Code on my laptop"' });
		try {
			return { created: await createApiToken(db, name, canWrite), name };
		} catch {
			return fail(500, { error: 'Could not create token. Have migrations 0005 and 0007 been applied?' });
		}
	},
	revokeApp: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const clientId = String((await request.formData()).get('client_id') ?? '');
		if (clientId) await revokeConnection(db, clientId);
		return { revokedApp: true };
	},
	revoke: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		await revokeApiToken(db, parseInt(((await request.formData()).get('id') as string) ?? ''));
		return { revoked: true };
	}
};
