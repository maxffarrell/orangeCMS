import { env } from 'cloudflare:workers';
import { getFormById, getSubmissions } from '#lib/server/db.js';
import { getDataKey, revealAnswers } from '#lib/server/privacy.js';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Download one person's response as JSON (supports data-access / portability requests).
export const GET: RequestHandler = async ({ params }) => {
	const db = env.DB;
	if (!db) error(500, 'Database unavailable');
	const formId = parseInt(params.id);
	const form = await getFormById(db, formId);
	const submission = (await getSubmissions(db, formId, 200)).find((s) => s.id === parseInt(params.sid));
	if (!form || !submission) error(404, 'Response not found');
	const answers = await revealAnswers(await getDataKey(env.FORM_DATA_KEY), formId, submission.answers);
	const body = {
		form: form.title,
		submitted_at_utc: submission.created_at,
		answers: Object.fromEntries(answers.map((a) => [a.label, a.value]))
	};
	return new Response(JSON.stringify(body, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="response-${submission.id}.json"`,
			'Cache-Control': 'no-store'
		}
	});
};
