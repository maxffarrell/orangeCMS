import { agentSkill } from '#lib/server/agent-discovery.js';
import type { RequestHandler } from './$types';

// RFC 9727 API catalog (a linkset, RFC 9264) pointing agents at the site's machine interfaces.
export const GET: RequestHandler = ({ url }) => {
	const o = url.origin;
	const body = {
		linkset: [
			{
				anchor: `${o}/mcp`,
				'service-desc': [{ href: `${o}/.well-known/mcp/server-card.json`, type: 'application/json' }],
				'service-doc': [{ href: `${o}/.well-known/agent-skills/${agentSkill().name}/SKILL.md`, type: 'text/markdown' }],
				status: [{ href: `${o}/mcp`, type: 'application/json' }]
			},
			{
				anchor: `${o}/mcp/authorized`,
				'service-desc': [{ href: `${o}/.well-known/oauth-authorization-server`, type: 'application/json' }]
			}
		]
	};
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/linkset+json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }
	});
};
