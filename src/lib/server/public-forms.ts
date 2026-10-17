import { env } from 'cloudflare:workers';
import {
	addSubmission,
	getFormBySlug,
	getPage,
	getSettings,
} from '#lib/server/db.js';
import { collectableFields, validateSubmission } from '#lib/forms.js';
import { emailSubmission } from '#lib/server/notify.js';
import {
	getDataKey,
	protectAnswers,
	purgeExpiredSubmissions,
	redactAnswers,
} from '#lib/server/privacy.js';
import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

// Forms can carry personal data (echoed back after a failed submit), so never cache them.
import { site } from '#lib/site.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function loadPublicForm(
	slug: string,
	setHeaders: RequestEvent['setHeaders'],
) {
	setHeaders(NO_STORE);
	const db = env.DB;
	if (!db) error(404, 'Form not found');
	const found = await getFormBySlug(db, slug);
	if (!found) error(404, 'Form not found');
	const page = await getPage(db, 'forms');
	// Sensitive fields require an encryption key.
	const canEncrypt = !!(await getDataKey(env.FORM_DATA_KEY));
	return {
		page,
		form: found.form,
		schema: {
			slug: found.schema.slug,
			fields: collectableFields(found.schema.fields, canEncrypt),
			submitLabel: found.schema.submit_label,
			successMessage: found.schema.success_message,
			accepting: found.schema.accepting === 1,
			hasSensitive: canEncrypt && found.schema.fields.some((f) => f.sensitive),
		},
	};
}

export async function submitPublicForm(
	slug: string,
	request: Request,
	url: URL,
) {
	// (No-store is set in `load`, which also runs for this POST; POST responses aren't cached.)
	const db = env.DB;
	if (!db)
		return fail(500, {
			message: 'Form submissions are unavailable right now.',
		});
	const found = await getFormBySlug(db, slug);
	if (!found) error(404, 'Form not found');
	if (found.schema.accepting !== 1) {
		return fail(403, {
			message: 'This form is not accepting responses right now.',
		});
	}

	const data = await request.formData();
	// Honeypot: real visitors never see or fill this field. Pretend success to bots.
	if (((data.get('website') as string | null) ?? '') !== '')
		return { success: true };

	const key = await getDataKey(env.FORM_DATA_KEY);
	const fields = collectableFields(found.schema.fields, !!key);
	const { answers, errors, values } = validateSubmission(fields, data);
	if (Object.keys(errors).length > 0) {
		return fail(400, {
			message: 'Please fix the highlighted fields.',
			errors,
			values,
		});
	}

	// Sensitive answers are encrypted before they touch the database.
	await addSubmission(
		db,
		found.form.id,
		key ? await protectAnswers(key, found.form.id, answers) : answers,
	);

	// Reply-To is the first valid email answer, so the admin can reply straight to the client.
	const replyField = fields.find((f) => f.type === 'email');
	const reply = replyField ? values[replyField.key] : undefined;
	await emailSubmission(env, {
		to: (await getSettings(db))[site.formNotificationSetting] ?? '',
		formTitle: found.form.title,
		answers: redactAnswers(answers), // sensitive details are never included in email
		replyTo: typeof reply === 'string' ? reply : undefined,
		adminUrl: `${url.origin}/admin/forms/${found.form.id}/submissions`,
	});

	// Enforce the retention period without needing a scheduled job.
	await purgeExpiredSubmissions(db);
	return { success: true };
}

export type PublicFormData = Awaited<ReturnType<typeof loadPublicForm>>;
