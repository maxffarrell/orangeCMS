import { env } from 'cloudflare:workers';
import { getPage, getVendors } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const [page, vendors] = await Promise.all([
		db ? getPage(db, 'vendors') : null,
		db ? getVendors(db) : []
	]);
	return { page, vendors };
};
