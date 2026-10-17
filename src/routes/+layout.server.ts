import { env } from 'cloudflare:workers';
import { getSettings } from '#lib/server/db.js';
import { site } from '#lib/site.js';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ url }) => {
	const allSettings = env.DB ? await getSettings(env.DB) : {};
	const settings =
		url.pathname === '/admin' || url.pathname.startsWith('/admin/')
			? allSettings
			: Object.fromEntries(
					site.publicSettings
						.filter((key) => key in allSettings)
						.map((key) => [key, allSettings[key]]),
				);
	return { settings, navItems: site.navigation };
};
