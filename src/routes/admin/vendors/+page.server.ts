import { env } from 'cloudflare:workers';
import { getVendors, deleteVendor } from '#lib/server/db.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const vendors = db ? await getVendors(db, false) : [];
	return { vendors };
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const id = parseInt(data.get('id') as string);
		await deleteVendor(db, id);
		return { success: true };
	},
	toggle: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const id = parseInt(data.get('id') as string);
		await db
			.prepare('UPDATE vendors SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?')
			.bind(id)
			.run();
		return { success: true };
	}
};
