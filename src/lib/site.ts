import { resolvePublicRoute, getPageHref } from './routing.js';
export interface PublicRoute {
	path: string;
	kind: 'page' | 'collection' | 'entry' | 'forms' | 'form';
	page?: string;
	collection?: string;
}
export interface SettingField {
	key: string;
	label: string;
	type: 'text' | 'textarea' | 'email' | 'url';
}
/** Consumer-owned presentation and URL map. Paths beginning admin, api, files or mcp are reserved. */
export const site = {
	name: 'orangeCMS',
	adminName: 'orangeCMS',
	mcpName: 'orangeCMS',
	emailSenderName: 'orangeCMS Forms',
	tokenPrefix: 'oc_',
	canonicalHost: '',
	aliasHosts: [] as string[],
	description: 'A general purpose content management system.',
	logo: '',
	footerText: '',
	privacyPath: '/privacy',
	formPrivacyNotice:
		'Read the privacy policy before submitting personal information.',
	formNotificationSetting: 'notification_email',
	publicSettings: [] as string[],
	settingsFields: [
		{
			key: 'notification_email',
			label: 'Form notification email',
			type: 'email',
		},
	] as SettingField[],
	navigation: [{ path: '/', label: 'Home', footer_label: 'Home' }],
	routes: [
		{ path: '/', kind: 'page', page: 'home' },
		{ path: '/privacy', kind: 'page', page: 'privacy' },
		{ path: '/content', kind: 'collection', collection: 'articles' },
		{ path: '/content/:slug', kind: 'entry', collection: 'articles' },
		{ path: '/forms', kind: 'forms' },
		{ path: '/forms/:slug', kind: 'form' },
	] as PublicRoute[],
};
export function matchPublicRoute(path: string) {
	return resolvePublicRoute(site.routes, path);
}
function routeHref(
	kind: PublicRoute['kind'],
	values: Record<string, string>,
	collection?: string,
	page?: string,
): string | null {
	const route = site.routes.find(
		(r) =>
			r.kind === kind &&
			(!collection || r.collection === collection) &&
			(!page || r.page === page),
	);
	if (!route) return null;
	const path = route.path.replace(
		/:([a-zA-Z_][a-zA-Z0-9_]*)/g,
		(_, key: string) =>
			values[key] ? encodeURIComponent(values[key]) : ':' + key,
	);
	return path.includes(':') ? null : path;
}
export const pageHref = (slug: string) => getPageHref(site.routes, slug);
export const collectionHref = (collection: string) =>
	routeHref('collection', {}, collection);
export const entryHref = (collection: string, slug: string) =>
	routeHref('entry', { slug }, collection);
export const formsHref = (slug?: string) =>
	routeHref(slug ? 'form' : 'forms', slug ? { slug } : {});
