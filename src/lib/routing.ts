import type { PublicRoute } from './site.js';
const reserved = new Set(['admin', 'api', 'files', 'mcp']);
const parameter = /^:[a-zA-Z_][a-zA-Z0-9_]*$/;
const specificity = (parts: string[]) =>
	parts.filter((part) => !part.startsWith(':')).length;
/** Validate once before matching. Ambiguous route maps fail closed. */
export function validatePublicRoutes(routes: PublicRoute[]): void {
	const seen: string[][] = [];
	for (const route of routes) {
		if (
			!route.path.startsWith('/') ||
			route.path.includes('//') ||
			(route.path !== '/' && route.path.endsWith('/')) ||
			/[?#%\\]/.test(route.path)
		)
			throw new Error('Route paths must be absolute and normalized');
		const parts = route.path.split('/').slice(1);
		if (reserved.has(parts[0]))
			throw new Error('Route uses a reserved infrastructure path');
		const names = parts.filter((part) => part.startsWith(':'));
		if (
			parts.some((part) =>
				part.startsWith(':')
					? !parameter.test(part)
					: !/^[a-zA-Z0-9._~-]*$/.test(part) || part === '.' || part === '..',
			) ||
			new Set(names).size !== names.length
		)
			throw new Error('Invalid route segment');
		if (
			(route.kind === 'form' || route.kind === 'entry') &&
			!names.includes(':slug')
		)
			throw new Error('Detail routes require a :slug parameter');
		if (
			names.some((name) => name !== ':slug') ||
			(names.length && !['entry', 'form', 'page'].includes(route.kind))
		)
			throw new Error('Unsupported route parameter');
		if (
			(route.kind === 'collection' || route.kind === 'entry') &&
			!route.collection
		)
			throw new Error('Collection route requires a collection slug');
		if (route.kind === 'page' && !route.page && !names.includes(':slug'))
			throw new Error('Page route requires a page slug');
		if (!['page', 'collection', 'entry', 'forms', 'form'].includes(route.kind))
			throw new Error('Unsupported route kind');
		if (
			seen.some(
				(previous) =>
					previous.length === parts.length &&
					specificity(previous) === specificity(parts) &&
					previous.every(
						(part, i) =>
							part.startsWith(':') ||
							parts[i].startsWith(':') ||
							part === parts[i],
					),
			)
		)
			throw new Error('Duplicate or ambiguous public routes');
		seen.push(parts);
	}
}
export function resolvePublicRoute(
	routes: PublicRoute[],
	path: string,
): { route: PublicRoute; params: Record<string, string> } | null {
	validatePublicRoutes(routes);
	const normalized = path.length > 1 ? path.replace(/\/$/, '') : path;
	const incoming = normalized.split('/').slice(1);
	if (reserved.has(incoming[0])) return null;
	for (const route of [...routes].sort(
		(a, b) =>
			specificity(b.path.split('/').slice(1)) -
			specificity(a.path.split('/').slice(1)),
	)) {
		const parts = route.path.split('/').slice(1);
		if (parts.length !== incoming.length) continue;
		const params: Record<string, string> = {};
		let matches = true;
		for (let i = 0; i < parts.length; i++) {
			if (parts[i].startsWith(':')) {
				let value: string;
				try {
					value = decodeURIComponent(incoming[i]);
				} catch {
					matches = false;
					break;
				}
				if (
					!value ||
					value.includes('/') ||
					value.includes('\\') ||
					value === '.' ||
					value === '..'
				) {
					matches = false;
					break;
				}
				params[parts[i].slice(1)] = value;
			} else if (parts[i] !== incoming[i]) {
				matches = false;
				break;
			}
		}
		if (matches) return { route, params };
	}
	return null;
}

/** Prefer explicit page mounts, then the configured dynamic page mount. */
export function getPageHref(
	routes: PublicRoute[],
	slug: string,
): string | null {
	const fixed = routes.find(
		(route) =>
			route.kind === 'page' && route.page === slug && !route.path.includes(':'),
	);
	if (fixed) return fixed.path;
	const dynamic = routes.find(
		(route) =>
			route.kind === 'page' &&
			!route.page &&
			route.path.split('/').includes(':slug'),
	);
	return dynamic
		? dynamic.path.replace(':slug', encodeURIComponent(slug))
		: null;
}
