import { env } from 'cloudflare:workers';
import { getPage, getForms } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const [page, forms] = await Promise.all([
		db ? getPage(db, 'forms') : null,
		db ? getForms(db) : []
	]);
	return { page, forms };
};
