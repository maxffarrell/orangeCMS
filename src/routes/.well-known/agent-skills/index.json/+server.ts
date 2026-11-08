import { agentSkill, sha256Hex } from '#lib/server/agent-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const skill = agentSkill();
	const body = {
		$schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
		skills: [
			{
				name: skill.name,
				type: 'skill-md',
				description: skill.description,
				url: `${url.origin}/.well-known/agent-skills/${skill.name}/SKILL.md`,
				digest: `sha256:${await sha256Hex(skill.body)}`
			}
		]
	};
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }
	});
};
