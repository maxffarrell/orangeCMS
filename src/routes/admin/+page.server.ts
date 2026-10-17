import { env } from 'cloudflare:workers';
import { getCollections, getPages, getForms } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async () => {
	const db = env.DB;
	const [collections, pages, forms] = db
		? await Promise.all([getCollections(db), getPages(db), getForms(db)])
		: [[], [], []];
	return {
		collectionCount: collections.length,
		pageCount: pages.length,
		formCount: forms.length,
	};
};
