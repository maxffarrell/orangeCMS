import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

async function load(t) {
	const temp = await mkdtemp(join(tmpdir(), 'orangecms-agent-test-'));
	t.after(() => rm(temp, { recursive: true, force: true }));
	await mkdir(join(temp, 'src/lib/server'), { recursive: true });
	await writeFile(join(temp, 'package.json'), JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }));
	for (const file of ['server/agent-discovery', 'agent', 'site', 'routing']) {
		const source = await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8');
		const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
		await writeFile(join(temp, `src/lib/${file}.js`), out);
	}
	return import(pathToFileURL(join(temp, 'src/lib/server/agent-discovery.js')).href);
}

test('Markdown is chosen only when it is preferred over HTML', async (t) => {
	const { wantsMarkdown } = await load(t);
	assert.equal(wantsMarkdown('text/markdown'), true);
	assert.equal(wantsMarkdown('text/markdown, text/html;q=0.5'), true);
	assert.equal(wantsMarkdown('text/html,application/xhtml+xml,*/*;q=0.8'), false);
	assert.equal(wantsMarkdown('*/*'), false);
	assert.equal(wantsMarkdown('text/html, text/markdown;q=0.1'), false);
	assert.equal(wantsMarkdown(null), false);
});

test('HTML converts to Markdown without markup, scripts, navigation or forms', async (t) => {
	const { htmlToMarkdown } = await load(t);
	const md = htmlToMarkdown(
		'<html><head><title>Tours &amp; More</title></head><body><nav>Menu</nav><main><h2>Iceland</h2><p>See <a href="/tours/iceland">the <b>tour</b></a>.</p><ul><li>One</li><li>Two</li></ul><script>alert(1)</script><form><input></form></main></body></html>',
		'https://example.test',
	);
	assert.match(md, /^# Tours & More/);
	assert.ok(md.includes('## Iceland'));
	assert.ok(md.includes('[the tour](https://example.test/tours/iceland)'), md);
	assert.ok(md.includes('- One') && md.includes('- Two'));
	for (const leaked of ['<', 'alert', 'Menu']) assert.ok(!md.includes(leaked), leaked);
});

test('a generic skill is derived from the site identity unless one is configured', async (t) => {
	const { agentSkill, sha256Hex } = await load(t);
	const skill = agentSkill();
	assert.match(skill.name, /^[a-z0-9-]+$/);
	assert.ok(skill.body.startsWith('---\nname: ' + skill.name));
	assert.match(await sha256Hex('x'), /^2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881$/);
});
