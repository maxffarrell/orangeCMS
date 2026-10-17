import { env } from 'cloudflare:workers';
import { getPage, getTours } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async () => {
 const [page, tours] = await Promise.all([env.DB ? getPage(env.DB, 'home') : null, env.DB ? getTours(env.DB) : []]);
 return { page, tours };
};
