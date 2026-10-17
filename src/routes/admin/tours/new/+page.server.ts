import { env } from 'cloudflare:workers';
import { upsertTour } from '#lib/server/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {};
};

function toSlug(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const actions: Actions = {
	save: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const data = await request.formData();
		const title = (data.get('title') as string).trim();
		const slug = toSlug(title);

		if (!title || !slug) return fail(400, { error: 'Title is required' });

		try {
			await upsertTour(db, {
				slug,
				title,
				tour_type: (data.get('tour_type') as string) || null,
				dates: (data.get('dates') as string) || null,
				content: (data.get('content') as string) || '',
				image_path: (data.get('image_path') as string) || null,
				booking_url: (data.get('booking_url') as string) || null,
				sort_order: parseInt(data.get('sort_order') as string) || 0,
				active: data.get('active') === '1' ? 1 : 0
			});
		} catch {
			return fail(400, { error: 'A tour with that name already exists.' });
		}

		redirect(303, '/admin/tours');
	}
};
