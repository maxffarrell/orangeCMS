import { env } from 'cloudflare:workers';
import {
	deleteSubmission,
	getFormById,
	getFormSchema,
	getSubmissions,
	setSubmissionRead
} from '#lib/server/db.js';
import { getDataKey, revealAnswers } from '#lib/server/privacy.js';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = env.DB;
	const id = parseInt(params.id);
	const form = db ? await getFormById(db, id) : null;
	if (!form && db) error(404, 'Form not found');
	const [schema, rows] = db && form
		? await Promise.all([getFormSchema(db, id), getSubmissions(db, id, 200)])
		: [null, []];
	// Decrypted only for the authenticated admin, only in this response.
	const key = await getDataKey(env.FORM_DATA_KEY);
	const submissions = await Promise.all(
		rows.map(async (r) => ({ ...r, answers: await revealAnswers(key, id, r.answers) }))
	);
	return { form, fields: schema?.fields ?? [], submissions };
};

export const actions: Actions = {
	read: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		await setSubmissionRead(db, parseInt(data.get('id') as string), data.get('read') === '1');
		return { success: true };
	},
	delete: async ({ request }) => {
		const db = env.DB;
		if (!db) return fail(500, { error: 'Database unavailable' });
		const data = await request.formData();
		await deleteSubmission(db, parseInt(data.get('id') as string));
		return { success: true };
	}
};
