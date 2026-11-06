// Shared response helpers for the public OAuth endpoints.
export const oauthCors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Protocol-Version',
	'Access-Control-Max-Age': '86400'
};
export const oauthJson = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...oauthCors, ...extra }
	});
export const oauthPreflight = () => new Response(null, { status: 204, headers: oauthCors });
