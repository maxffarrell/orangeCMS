import { env } from 'cloudflare:workers';
import { getTours, deleteTour } from '#lib/server/db.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const tours = db ? await getTours(db, false) : [];
	return { tours };
};

export const actions: Actions = {
	toggle: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const id = parseInt(data.get('id') as string);
		await db
			.prepare(
				'UPDATE tours SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
			)
			.bind(id)
			.run();
		return { success: true };
	},
	delete: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const id = parseInt(data.get('id') as string);
		await deleteTour(db, id);
		return { success: true };
	}
};
