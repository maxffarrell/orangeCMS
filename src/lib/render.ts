import { marked } from 'marked';
import type { Settings } from '#lib/server/db.js';

export function renderContent(content: string, settings: Settings): string {
	const phone = settings.phone ?? '';
	const email = settings.email ?? '';
	const address = settings.address ?? '';
	const phoneHref = phone.replace(/-/g, '');

	const substituted = content
		.replace(/\{PHONE\}/g, `<a href="tel:${phoneHref}">${phone}</a>`)
		.replace(/\{EMAIL\}/g, `<a href="mailto:${email}">${email}</a>`)
		.replace(/\{ADDRESS\}/g, address);

	return marked(substituted) as string;
}
