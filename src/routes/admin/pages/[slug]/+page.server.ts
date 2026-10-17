import { env } from 'cloudflare:workers';
import { getPage, savePage, deletePage } from '#lib/server/db.js';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params }) => {
	const page = env.DB ? await getPage(env.DB, params.slug) : null;
	if (!page) error(404, 'Page not found');
	return { page };
};
export const actions: Actions = {
	save: async ({ request, params }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Title is required' });
		await savePage(env.DB, {
			slug: params.slug,
			title,
			eyebrow: String(data.get('eyebrow') ?? '') || null,
			subtitle: String(data.get('subtitle') ?? '') || null,
			content: String(data.get('content') ?? ''),
		});
		return { success: true };
	},
	delete: async ({ params }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		await deletePage(env.DB, params.slug);
		redirect(303, '/admin/pages');
	},
};
