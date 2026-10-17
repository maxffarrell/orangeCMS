export interface StaticPublicRoute {
	path: string;
	kind: string;
}
/** Assets are resolved before this Worker. An opted-in deployment must never
 * render unpublished content when a public HTML/navigation asset is missing.
 * Forms and infrastructure remain dynamic; unbundled file URLs support previews.
 */
export function getStaticPublishingResponse(
	request: Request,
	mode: string | undefined,
	routes: readonly StaticPublicRoute[],
): Response | null {
	if (mode !== '1' || !['GET', 'HEAD'].includes(request.method)) return null;
	const path = new URL(request.url).pathname;
	let decoded: string;
	try { decoded = decodeURIComponent(path); } catch { return missing(request); }
	if (/%(?:2e|2f|5c)/i.test(path) || /[\\\x00-\x1f\x7f]/.test(decoded)) return missing(request);
	const infrastructure = /^\/(?:admin|api|files|mcp|oauth|\.well-known)(?:\/|$)/;
	if (infrastructure.test(path)) return null;
	if (infrastructure.test(decoded)) return missing(request);
	const page = path.replace(/\/__data\.json$/, '') || '/';
	for (const route of routes) {
		if (route.kind !== 'form' && route.kind !== 'forms') continue;
		const pattern = route.path.split('/').map((part) => part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
		if (new RegExp('^' + pattern + '/?$').test(page)) return null;
	}
	return missing(request);
}
function missing(request: Request): Response {
	return new Response(request.method === 'HEAD' ? null : 'Published page not found', {
		status: 404,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
	});
}
