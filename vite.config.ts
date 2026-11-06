import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			// SvelteKit's built-in form-POST origin check is off ('*'); hooks.server.ts enforces the same
			// rule for every route except /oauth/token, whose server-to-server form POSTs have no Origin.
			csrf: { trustedOrigins: ['*'] },
			preprocess: vitePreprocess()
		})
	],
	// Runtime-provided Workers modules (send_email binding); not bundled.
	build: { rollupOptions: { external: ['cloudflare:email'] } },
	ssr: { external: ['cloudflare:email'] }
});
