import { site } from '#lib/site.js';
import { formatAnswer, type Answer } from '../forms.js';

// Emails a form response to the admin via Cloudflare Email Routing's `send_email`
// binding (free). Requirements: Email Routing enabled on the sender's domain, and
// the recipient added as a verified destination address in Email Routing.

const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
const b64 = (s: string) => {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/.{1,76}/g, '$&\r\n').trimEnd();
};
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function buildRawEmail(opts: {
	from: string;
	to: string;
	subject: string;
	body: string;
	replyTo?: string;
}): string {
	const domain = opts.from.split('@')[1] ?? 'localhost';
	const headers = [
		`From: ${clean(site.emailSenderName)} <${opts.from}>`,
		`To: ${opts.to}`,
		`Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(clean(opts.subject))))}?=`,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: <${crypto.randomUUID()}@${domain}>`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64'
	];
	if (opts.replyTo && EMAIL_RE.test(opts.replyTo)) headers.splice(2, 0, `Reply-To: ${opts.replyTo}`);
	return `${headers.join('\r\n')}\r\n\r\n${b64(opts.body)}\r\n`;
}

export interface NotifyEnv {
	EMAIL?: { send(message: unknown): Promise<void> };
	FORM_EMAIL_FROM?: string;
}

/** Best-effort: never throws, so a mail problem can't lose a submission. */
export async function emailSubmission(
	env: NotifyEnv,
	opts: { to: string | undefined; formTitle: string; answers: Answer[]; replyTo?: string; adminUrl: string }
): Promise<void> {
	const from = env.FORM_EMAIL_FROM;
	if (!env.EMAIL || !from || !opts.to || !EMAIL_RE.test(opts.to)) return;
	try {
		const lines = opts.answers.map((a) => `${a.label}\n  ${formatAnswer(a.value).replace(/\n/g, '\n  ')}`);
		const withheld = opts.answers.some((a) => a.sensitive)
			? '\nSome sensitive details were withheld from this email for privacy. View them in the admin area.\n'
			: '';
		const body = `New response to "${opts.formTitle}"\n\n${lines.join('\n\n')}\n${withheld}\n---\nAll responses: ${opts.adminUrl}\n`;
		const raw = buildRawEmail({ from, to: opts.to, subject: `New response: ${opts.formTitle}`, body, replyTo: opts.replyTo });
		// Loaded lazily: this module only exists inside the Workers runtime, not during Node-based build analysis.
		const { EmailMessage } = await import('cloudflare:email');
		await env.EMAIL.send(new EmailMessage(from, opts.to, raw));
	} catch (e) {
		console.error('form email notification failed', e);
	}
}
