import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { unstable_readConfig } from 'wrangler';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

// Adapter 8's Node development/build-analysis shim omits WorkerEntrypoint.
// Namespace access keeps that optional in Node; the production adapter rewrites
// the same Workers import to the native runtime, where the real class is used.
function oauthProviderWorkersCompatibility(): Plugin {
	return {
		name: 'orangecms-oauth-provider-workers-compatibility',
		enforce: 'pre',
		transform(code, id) {
			if (
				!id.includes('/@cloudflare/workers-oauth-provider/') ||
				!id.endsWith('/dist/oauth-provider.js')
			)
				return;
			const namedImport =
				/import\s*\{\s*WorkerEntrypoint\s*\}\s*from\s*["']cloudflare:workers["'];?/;
			if (!namedImport.test(code))
				throw new Error(
					'OAuth provider Workers import changed; review the adapter compatibility transform',
				);
			return {
				code: code.replace(
					namedImport,
					`import * as oauthWorkersRuntime from 'cloudflare:workers';
const WorkerEntrypoint = oauthWorkersRuntime.WorkerEntrypoint ?? class {
 constructor() { throw new Error('WorkerEntrypoint is unavailable in the Node development adapter'); }
};`,
				),
				map: null,
			};
		},
	};
}

// The adapter generates the configured Worker entry. Dispatch protocol endpoints
// before SvelteKit, whose cookie-based CSRF check intentionally rejects native
// OAuth form posts. Other requests retain the unchanged framework protections.
function oauthCloudflareAdapter() {
	const base = adapter();
	return {
		...base,
		async adapt(builder: Parameters<typeof base.adapt>[0]) {
			await base.adapt(builder);
			const config = unstable_readConfig({});
			const entry = config.main;
			if (!entry)
				throw new Error('OAuth requires a Cloudflare Worker main entry');
			let source = await readFile(entry, 'utf8');
			const marker = 'async fetch(req, env) {';
			if (!source.includes(marker))
				throw new Error(
					'Cloudflare adapter entry changed; review OAuth protocol dispatch',
				);
			let modulePath = relative(
				dirname(entry),
				resolve('src/lib/server/oauth.ts'),
			)
				.split('\\')
				.join('/');
			if (!modulePath.startsWith('.')) modulePath = './' + modulePath;
			source =
				`import { handleOAuthProtocolRequest } from ${JSON.stringify(modulePath)};\n` +
				source.replace(
					marker,
					`${marker}\n const protocol = await handleOAuthProtocolRequest({ request: req, url: new URL(req.url) }, env);\n if (protocol) return protocol;`,
				);
			await writeFile(entry, source);
		},
	};
}

export default defineConfig({
	plugins: [
		oauthProviderWorkersCompatibility(),
		tailwindcss(),
		sveltekit({
			adapter: oauthCloudflareAdapter(),
			preprocess: vitePreprocess(),
		}),
	],
	// Runtime-provided Workers modules (send_email binding); not bundled.
	build: { rollupOptions: { external: ['cloudflare:email'] } },
	ssr: {
		external: ['cloudflare:email'],
		noExternal: ['@cloudflare/workers-oauth-provider'],
	},
});
