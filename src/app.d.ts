import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			FILES: R2Bucket;
			CF_ACCESS_TEAM_DOMAIN?: string;
			CF_ACCESS_AUD?: string;
			/** Bearer token that unlocks the MCP admin tools (set with `wrangler secret put`). */
			MCP_ADMIN_TOKEN?: string;
			/** Email Routing send binding for form notifications. */
			EMAIL?: { send(message: unknown): Promise<void> };
			/** Sender for form notifications; its domain needs Email Routing enabled. */
			FORM_EMAIL_FROM?: string;
			/** Base64 32-byte key (`openssl rand -base64 32`) that encrypts sensitive form answers. */
			FORM_DATA_KEY?: string;
		}
	}
}

export {};
