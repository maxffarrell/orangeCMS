import { agentSkill } from '#lib/server/agent-discovery.js';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const skill = agentSkill();
	if (params.name !== skill.name) error(404, 'Not found');
	return new Response(skill.body, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }
	});
};
