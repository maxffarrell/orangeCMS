import { site } from '#lib/site.js';
import { agentSkill } from '#lib/server/agent-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const body = {
		$schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server-card.schema.json',
		version: '1.0.0',
		protocolVersion: '2025-06-18',
		serverInfo: { name: site.mcpName, title: `${site.name} content`, version: '1.0.0' },
		description: `Read ${site.name}'s published content. Administrative tools need OAuth sign-in.`,
		documentationUrl: `${url.origin}/.well-known/agent-skills/${agentSkill().name}/SKILL.md`,
		transport: { type: 'streamable-http', endpoint: '/mcp' },
		capabilities: { tools: { listChanged: false } },
		authentication: {
			required: false,
			schemes: ['oauth2'],
			authorizationServer: `${url.origin}/.well-known/oauth-authorization-server`,
			note: 'Public tools work anonymously on /mcp; /mcp/authorized requires OAuth.'
		}
	};
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }
	});
};
