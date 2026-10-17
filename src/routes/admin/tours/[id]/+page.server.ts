import { env } from 'cloudflare:workers';
import { getTourById } from '#lib/server/db.js';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function toSlug(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const load: PageServerLoad = async ({ params }) => {
	const db = env.DB;
	const tour = db ? await getTourById(db, parseInt(params.id)) : null;
	if (!tour && db) error(404, 'Tour not found');
	return { tour };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const id = parseInt(params.id);
		const data = await request.formData();
		const title = (data.get('title') as string).trim();

		await db
			.prepare(
				`UPDATE tours SET
					slug = ?, title = ?, tour_type = ?, dates = ?, content = ?,
					image_path = ?, booking_url = ?, sort_order = ?, active = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?`
			)
			.bind(
				toSlug(title),
				title,
				(data.get('tour_type') as string) || null,
				(data.get('dates') as string) || null,
				(data.get('content') as string) || '',
				(data.get('image_path') as string) || null,
				(data.get('booking_url') as string) || null,
				parseInt(data.get('sort_order') as string) || 0,
				data.get('active') === '1' ? 1 : 0,
				id
			)
			.run();

		return { success: true };
	}
};
