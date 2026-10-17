import { env } from 'cloudflare:workers';
import {
	getCollection,
	getEntries,
	saveCollection,
	deleteCollection,
	validateContentFields,
	type ContentField,
} from '#lib/server/db.js';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async ({ params }) => {
	const collection = env.DB
		? await getCollection(env.DB, params.collection)
		: null;
	if (!collection) error(404, 'Collection not found');
	return {
		collection,
		entries: await getEntries(env.DB, params.collection, false),
	};
};
export const actions: Actions = {
	save: async ({ request, params }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		let fields: ContentField[];
		try {
			fields = validateContentFields(
				JSON.parse(String(data.get('fields') ?? '[]')),
			);
		} catch {
			return fail(400, {
				error:
					'Fields must be a JSON array of unique key, label, and type records.',
			});
		}
		if (!title) return fail(400, { error: 'Title is required' });
		try {
			await saveCollection(env.DB, { slug: params.collection, title, fields });
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Invalid collection',
			});
		}
		return { success: true };
	},
	delete: async ({ params }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		await deleteCollection(env.DB, params.collection);
		redirect(303, '/admin/collections');
	},
};
