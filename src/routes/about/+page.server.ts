import { env } from 'cloudflare:workers';
import { getPage } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const page = db ? await getPage(db, 'about') : null;
	return { page };
};
