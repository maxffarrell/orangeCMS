import { env } from 'cloudflare:workers';
import { getFormById, getFormSchema, saveForm } from '#lib/server/db.js';
import { parseFormInput } from '#lib/server/form-admin.js';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = env.DB;
	const id = parseInt(params.id);
	const form = db ? await getFormById(db, id) : null;
	if (!form && db) error(404, 'Form not found');
	const schema = db && form ? await getFormSchema(db, id) : null;
	return { form, schema };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });

		const id = parseInt(params.id);
		const input = parseFormInput(await request.formData(), id);
		if ('error' in input) return fail(400, { error: input.error });

		await saveForm(db, input);
		return { success: true };
	}
};
