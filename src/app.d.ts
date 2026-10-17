import type {
	D1Database,
	KVNamespace,
} from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			adminIdentity?: { sub: string; email?: string };
		}
	}
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			/** Per-installation OAuth state; absence disables OAuth and preserves API tokens. */
			OAUTH_KV?: KVNamespace;
			/** Optional canonical HTTPS origin for OAuth discovery and token audiences. */
			OAUTH_ISSUER?: string;
			/** Uploaded files stored in a separate KV namespace. Free limits require Workers Free. */
			FILES_KV?: KVNamespace;
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
