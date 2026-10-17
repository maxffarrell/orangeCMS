import assert from 'node:assert/strict';
import {
	cp,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

// Optional, isolated integration test. It compiles a consumer URL map and runs
// the same production Worker tests, leaving the checkout and its build intact.
const source = resolve('.');
const fixture = await mkdtemp(join(tmpdir(), 'orangecms-custom-routes-'));
async function run(args, extraEnv = {}) {
	const child = spawn(process.execPath, args, {
		cwd: fixture,
		stdio: 'inherit',
		env: { ...process.env, ...extraEnv },
	});
	child.on('error', (error) => {
		throw error;
	});
	const code = await new Promise((resolveExit) =>
		child.on('exit', resolveExit),
	);
	assert.equal(code, 0, 'Custom route integration command failed');
}
try {
	await cp(source, fixture, {
		recursive: true,
		filter: (path) =>
			!['.git', 'node_modules', '.svelte-kit', '.wrangler'].includes(
				basename(path),
			),
	});
	await symlink(
		join(source, 'node_modules'),
		join(fixture, 'node_modules'),
		'dir',
	);
	const configPath = join(fixture, 'src/lib/site.ts');
	const config = await readFile(configPath, 'utf8');
	await writeFile(
		configPath,
		config +
			`
// Consumer-specific mount points, independent of source file route names.
site.routes = [
 { path: '/', kind: 'page', page: 'home' },
 { path: '/policy', kind: 'page', page: 'privacy' },
 { path: '/journal', kind: 'collection', collection: 'articles' },
 { path: '/journal/:slug', kind: 'entry', collection: 'articles' },
 { path: '/responses', kind: 'forms' },
 { path: '/responses/:slug', kind: 'form' }
];
site.privacyPath = '/policy';
site.canonicalHost = 'canonical.example.test';
site.aliasHosts = ['alias.example.test'];
site.settingsFields.push({key:'public_notice',label:'Public notice',type:'text'});
site.publicSettings.push('public_notice');
`,
	);
	await run([join(source, 'node_modules/vite/bin/vite.js'), 'build']);
	await run(['scripts/smoke-cms.mjs'], {
		CMS_SMOKE_CANONICAL_HOST: 'canonical.example.test',
		CMS_SMOKE_ALIAS_HOSTS: 'alias.example.test',
		CMS_SMOKE_ABSENT_PATHS:
			'/content,/content/smoke-entry,/forms,/forms/smoke-form,/privacy',
	});
	console.log(
		'PASS custom route map compiles, serves new mounts, and removes former mounts',
	);
	// Sites can omit public forms entirely; their content administration must
	// still receive the same CRUD and authentication checks.
	await writeFile(
		configPath,
		(await readFile(configPath, 'utf8')) +
			`
site.routes = site.routes.filter(route => route.kind !== 'form' && route.kind !== 'forms');
`,
	);
	await run([join(source, 'node_modules/vite/bin/vite.js'), 'build']);
	await run(['scripts/smoke-cms.mjs'], {
		CMS_SMOKE_CANONICAL_HOST: 'canonical.example.test',
		CMS_SMOKE_ALIAS_HOSTS: 'alias.example.test',
		CMS_SMOKE_ABSENT_PATHS:
			'/responses,/responses/smoke-form,/forms,/forms/smoke-form',
	});
	console.log(
		'PASS a site with no public forms still runs core administration smoke checks',
	);
} finally {
	await rm(fixture, { recursive: true, force: true });
}
