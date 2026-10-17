import { env } from 'cloudflare:workers';
import { getForms, deleteForm } from '#lib/server/db.js';
import { DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS, getDataKey, getRetentionDays, setRetentionDays } from '#lib/server/privacy.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const forms = db ? await getForms(db) : [];
	const retentionDays = db ? await getRetentionDays(db) : DEFAULT_RETENTION_DAYS;
	const encryptionReady = !!(await getDataKey(env.FORM_DATA_KEY));
	return { forms, retentionDays, encryptionReady, minRetention: MIN_RETENTION_DAYS };
};

export const actions: Actions = {
	toggle: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const id = parseInt(data.get('id') as string);
		await db
			.prepare('UPDATE forms SET featured = CASE WHEN featured = 1 THEN 0 ELSE 1 END WHERE id = ?')
			.bind(id)
			.run();
		return { success: true };
	},
	retention: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const days = parseInt(String((await request.formData()).get('days') ?? ''));
		if (!Number.isFinite(days) || days < MIN_RETENTION_DAYS) {
			return fail(400, { error: `Retention must be at least ${MIN_RETENTION_DAYS} days.` });
		}
		await setRetentionDays(db, days);
		return { success: true };
	},
	delete: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const id = parseInt(data.get('id') as string);
		await deleteForm(db, id);
		return { success: true };
	}
};
