// Exercise an MCP endpoint end to end, including bearer-token auth.
//   ORANGECMS_MCP_URL   default http://localhost:5174/mcp
//   ORANGECMS_MCP_TOKEN optional; with it, admin tools must appear
import assert from 'node:assert/strict';

const url = process.env.ORANGECMS_MCP_URL || 'http://localhost:5174/mcp';
const token = process.env.ORANGECMS_MCP_TOKEN;
let id = 0;
async function rpc(method, params, auth = token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const init = await rpc('initialize', { protocolVersion: '2025-06-18' }, null);
assert.equal(init.status, 200, `initialize failed (${init.status}) — is the server running at ${url}?`);
console.log(`PASS initialize: ${init.body.result.serverInfo.name} ${init.body.result.protocolVersion}`);

const publicTools = (await rpc('tools/list', undefined, null)).body.result.tools.map(t => t.name);
assert.ok(publicTools.includes('list_tours') && !publicTools.includes('save_form'));
console.log(`PASS anonymous sees ${publicTools.length} public tools`);

assert.equal((await rpc('tools/list', undefined, 'definitely-not-a-token')).status, 401);
console.log('PASS a wrong token is rejected with 401');

if (!token) {
  console.log('SKIP no ORANGECMS_MCP_TOKEN set; not checking admin tools');
} else {
  const res = await rpc('tools/list');
  assert.equal(res.status, 200, `your token was rejected (${res.status})`);
  const names = res.body.result.tools.map(t => t.name);
  assert.ok(names.includes('list_form_submissions'), 'the token must unlock admin read tools');
  console.log(`PASS your token unlocks admin tools (${names.length} tools total)`);
}
