import { env } from 'cloudflare:workers';
import { getPages, savePage } from '#lib/server/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async () => ({
	pages: env.DB ? await getPages(env.DB) : [],
});
export const actions: Actions = {
	create: async ({ request }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		const title = String(data.get('title') ?? '').trim();
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title)
			return fail(400, {
				error:
					'Provide a title and a lowercase slug using letters, digits, and hyphens.',
			});
		if ((await getPages(env.DB)).some((p) => p.slug === slug))
			return fail(400, { error: 'A page with this slug already exists.' });
		await savePage(env.DB, {
			slug,
			title,
			eyebrow: null,
			subtitle: null,
			content: '',
		});
		redirect(303, '/admin/pages/' + slug);
	},
};
