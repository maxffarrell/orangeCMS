import { env } from 'cloudflare:workers';
import { getTour } from '#lib/server/db.js';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = env.DB;
	const tour = db ? await getTour(db, params.slug) : null;
	if (!tour) error(404, 'Tour not found');
	return { tour };
};
