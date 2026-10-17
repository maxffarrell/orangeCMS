import { env } from 'cloudflare:workers';
import { getSettings, updateSettings, type Settings } from '#lib/server/db.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const emptySettings: Settings = { phone: '', email: '', address: '', memberships: '' };
	const settings = db ? await getSettings(db) : emptySettings;
	return { settings };
};

export const actions: Actions = {
	save: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const data = await request.formData();
		const existing = await getSettings(db);
		const fieldValue = (key: keyof Settings): string => {
			if (!data.has(key)) return existing[key] ?? '';

			const value = String(data.get(key) ?? '');
			if (!value.trim() && existing[key]?.trim()) return existing[key];

			return value;
		};
		const settings: Settings = {
			phone: fieldValue('phone'),
			email: fieldValue('email'),
			address: fieldValue('address'),
			memberships: fieldValue('memberships')
		};

		const hadSettings = Object.values(existing).some((value) => value?.trim());
		const submittedEmptySettings = Object.values(settings).every((value) => !value.trim());
		if (hadSettings && submittedEmptySettings) {
			return fail(400, { error: 'Settings were not saved because the submitted form was empty.' });
		}

		await updateSettings(db, settings);

		return { success: true };
	}
};
