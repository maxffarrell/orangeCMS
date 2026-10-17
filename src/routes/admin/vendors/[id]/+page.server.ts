import { env } from 'cloudflare:workers';
import { getVendorById, upsertVendor, deleteVendor } from '#lib/server/db.js';
import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = env.DB;
	if (!db) error(503, 'Database unavailable');
	const vendor = await getVendorById(db, parseInt(params.id));
	if (!vendor) error(404, 'Vendor not found');
	return { vendor };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const slug = (data.get('slug') as string)?.trim();

		if (!name || !slug) return fail(400, { error: 'Name and slug are required' });

		await upsertVendor(db, {
			id: parseInt(params.id),
			name,
			slug,
			logo_path: (data.get('logo_path') as string) || null,
			photo_path: (data.get('photo_path') as string) || null,
			description: (data.get('description') as string)?.trim() || null,
			sort_order: parseInt(data.get('sort_order') as string) || 0,
			active: data.get('active') === 'on' ? 1 : 0
		} as Parameters<typeof upsertVendor>[1] & { id: number });

		redirect(303, '/admin/vendors');
	},
	delete: async ({ params }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		await deleteVendor(db, parseInt(params.id));
		redirect(303, '/admin/vendors');
	}
};
