import { env } from 'cloudflare:workers';
import { getSettings, updateSettings } from '#lib/server/db.js';
import { site } from '#lib/site.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async () => ({
	settings: env.DB ? await getSettings(env.DB) : {},
});
export const actions: Actions = {
	save: async ({ request }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const settings = Object.fromEntries(
			site.settingsFields.map((field) => [
				field.key,
				String(data.get(field.key) ?? ''),
			]),
		);
		await updateSettings(env.DB, settings);
		return { success: true };
	},
};
