import { env } from 'cloudflare:workers';
import {
	getCollection,
	getEntryById,
	getEntry,
	saveEntry,
	deleteEntry,
} from '#lib/server/db.js';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async ({ params }) => {
	const collection = env.DB
		? await getCollection(env.DB, params.collection)
		: null;
	if (!collection) error(404, 'Collection not found');
	const entry =
		params.id === 'new'
			? null
			: await getEntryById(env.DB, params.collection, Number(params.id));
	if (params.id !== 'new' && !entry) error(404, 'Entry not found');
	return { collection, entry };
};
export const actions: Actions = {
	save: async ({ request, params }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const collection = await getCollection(db, params.collection);
		if (!collection) error(404, 'Collection not found');
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		const title = String(data.get('title') ?? '').trim();
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title)
			return fail(400, {
				error:
					'Provide a title and a lowercase slug using letters, digits, and hyphens.',
			});
		const previous =
			params.id === 'new'
				? null
				: await getEntryById(db, params.collection, Number(params.id));
		if (params.id !== 'new' && !previous) error(404, 'Entry not found');
		const duplicate = await getEntry(db, params.collection, slug);
		if (duplicate && duplicate.id !== previous?.id)
			return fail(400, { error: 'Entry slug already exists' });
		const fields: Record<string, unknown> = {};
		for (const field of collection.fields) {
			const value = data.get('field_' + field.key);
			if (
				field.required &&
				field.type !== 'boolean' &&
				!String(value ?? '').trim()
			)
				return fail(400, { error: field.label + ' is required' });
			if (field.type === 'boolean') fields[field.key] = value === 'on';
			else if (field.type === 'number') {
				if (value === '' || value === null) fields[field.key] = null;
				else if (!Number.isFinite(Number(value)))
					return fail(400, { error: field.label + ' must be a number' });
				else fields[field.key] = Number(value);
			} else fields[field.key] = String(value ?? '');
		}
		try {
			await saveEntry(db, {
				id: previous?.id,
				collection: params.collection,
				slug,
				title,
				content: String(data.get('content') ?? ''),
				image_path: String(data.get('image_path') ?? '') || null,
				fields,
				sort_order: Number(data.get('sort_order')) || 0,
				active: data.get('active') === 'on' ? 1 : 0,
			});
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Invalid entry',
			});
		}
		redirect(303, '/admin/collections/' + params.collection);
	},
	delete: async ({ params }) => {
		if (!env.DB) return fail(500, { error: 'Database unavailable' });
		await deleteEntry(env.DB, params.collection, Number(params.id));
		redirect(303, '/admin/collections/' + params.collection);
	},
};
