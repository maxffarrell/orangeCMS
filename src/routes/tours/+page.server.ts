import { env } from 'cloudflare:workers';
import { getTours } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	const tours = db ? await getTours(db) : [];
	return { tours };
};
