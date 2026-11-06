import { env } from 'cloudflare:workers';
import { issueCode, validateAuthRequest } from '#lib/server/oauth.js';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Approval screen for an OAuth connector. It lives under /admin, so the admin login must have
// succeeded before this code runs. Every parameter is re-validated on submit.
export const load: PageServerLoad = async ({ url }) => {
	const db = env.DB;
	if (!db) error(503, 'Database unavailable');
	const res = await validateAuthRequest(db, url.searchParams, url.origin);
	if (!res.ok) return { error: res.description };
	return {
		error: null,
		appName: res.value.client.client_name,
		redirectUri: res.value.redirectUri,
		loopback: ['localhost', '127.0.0.1', '[::1]'].includes(new URL(res.value.redirectUri).hostname)
	};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const db = env.DB;
		if (!db) error(503, 'Database unavailable');
		const res = await validateAuthRequest(db, url.searchParams, url.origin);
		if (!res.ok) error(400, res.description);
		const approve = (await request.formData()).get('decision') === 'approve';
		const target = new URL(res.value.redirectUri);
		if (res.value.state) target.searchParams.set('state', res.value.state);
		if (approve) target.searchParams.set('code', await issueCode(db, res.value));
		else target.searchParams.set('error', 'access_denied');
		// SvelteKit 3 blocks external redirects unless allowlisted: allow only this registered origin.
		redirect(303, target.toString(), { external: [target.origin] });
	}
};
