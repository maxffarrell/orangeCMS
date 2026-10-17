import { env } from 'cloudflare:workers';
import {
	getCollections,
	getCollection,
	saveCollection,
} from '#lib/server/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async () => ({
	collections: env.DB ? await getCollections(env.DB) : [],
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
		if (await getCollection(env.DB, slug))
			return fail(400, { error: 'Collection already exists' });
		await saveCollection(env.DB, { slug, title, fields: [] });
		redirect(303, '/admin/collections/' + slug);
	},
};
