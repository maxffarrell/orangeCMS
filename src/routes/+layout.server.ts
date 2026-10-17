import { env } from 'cloudflare:workers';
import { getSettings, type Settings } from '#lib/server/db.js';
import { site } from '#lib/site.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
 const emptySettings: Settings = { phone: '', email: '', address: '', memberships: '' };
 const settings = env.DB ? { ...emptySettings, ...await getSettings(env.DB) } : emptySettings;
 return { settings, navItems: site.navigation };
};
