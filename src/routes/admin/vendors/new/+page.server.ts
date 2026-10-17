import { env } from 'cloudflare:workers';
import { upsertVendor } from '#lib/server/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
	save: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const slug = (data.get('slug') as string)?.trim();

		if (!name || !slug) return fail(400, { error: 'Name and slug are required' });

		await upsertVendor(db, {
			name,
			slug,
			logo_path: (data.get('logo_path') as string) || null,
			photo_path: (data.get('photo_path') as string) || null,
			description: (data.get('description') as string)?.trim() || null,
			sort_order: parseInt(data.get('sort_order') as string) || 0,
			active: data.get('active') === 'on' ? 1 : 0
		});

		redirect(303, '/admin/vendors');
	}
};
