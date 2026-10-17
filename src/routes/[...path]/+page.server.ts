import { env } from 'cloudflare:workers';
import {
	getPage,
	getCollection,
	getEntries,
	getEntry,
	getForms,
} from '#lib/server/db.js';
import { matchPublicRoute } from '#lib/site.js';
import { loadPublicForm, submitPublicForm } from '#lib/server/public-forms.js';
import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const match = matchPublicRoute(url.pathname);
	if (!match) error(404, 'Page not found');
	const { route, params } = match;
	const db = env.DB;
	const page =
		db && route.kind === 'page'
			? await getPage(db, route.page ?? params.slug)
			: null;
	const collection =
		db && route.collection ? await getCollection(db, route.collection) : null;
	const entries =
		db && route.kind === 'collection' && collection
			? await getEntries(db, collection.slug, true)
			: [];
	const entry =
		db && route.kind === 'entry' && collection
			? await getEntry(db, collection.slug, params.slug)
			: null;
	if (
		(route.kind === 'page' && !page) ||
		(route.kind === 'entry' && (!entry || !entry.active)) ||
		(route.kind === 'collection' && !collection)
	)
		error(404, 'Content not found');
	const forms = db && route.kind === 'forms' ? await getForms(db) : [];
	const publicForm =
		route.kind === 'form'
			? await loadPublicForm(params.slug, setHeaders)
			: null;
	return {
		kind: route.kind,
		page,
		collection,
		entries,
		entry,
		forms,
		publicForm,
	};
};
export const actions: Actions = {
	submit: async ({ url, request }) => {
		const match = matchPublicRoute(url.pathname);
		if (!match || match.route.kind !== 'form') error(404, 'Form not found');
		return submitPublicForm(match.params.slug, request, url);
	},
};
