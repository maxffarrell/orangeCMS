import { agentConfig, contentSignals } from '#lib/server/agent-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const disallow = ['/admin', '/api/', '/oauth/', ...(agentConfig().robotsDisallow ?? [])];
	const body = [
		'# Public pages are open to search engines and AI agents; the admin area and',
		'# authenticated endpoints are not for crawlers.',
		'User-agent: *',
		`Content-Signal: ${contentSignals()}`,
		'Allow: /',
		...disallow.map((p) => `Disallow: ${p}`),
		'',
		`Sitemap: ${url.origin}/sitemap.xml`,
		''
	].join('\n');
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
