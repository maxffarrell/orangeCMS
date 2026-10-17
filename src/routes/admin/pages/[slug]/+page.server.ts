import { env } from 'cloudflare:workers';
import { getPage, updatePage } from '#lib/server/db.js';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = env.DB;
	const page = db ? await getPage(db, params.slug) : null;
	if (!page && db) error(404, 'Page not found');
	return { page };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const data = await request.formData();
		await updatePage(db, params.slug, {
			eyebrow: (data.get('eyebrow') as string) || null,
			subtitle: (data.get('subtitle') as string) || null,
			content: (data.get('content') as string) || ''
		});

		return { success: true };
	}
};
