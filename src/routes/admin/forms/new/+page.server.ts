import { env } from 'cloudflare:workers';
import { saveForm } from '#lib/server/db.js';
import { parseFormInput } from '#lib/server/form-admin.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const input = parseFormInput(await request.formData());
		if ('error' in input) return fail(400, { error: input.error });

		const id = await saveForm(db, input);
		redirect(303, `/admin/forms/${id}`);
	}
};
