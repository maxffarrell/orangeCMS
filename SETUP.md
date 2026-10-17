# Setup and configuration

## Site configuration

Edit `src/lib/site.ts` directly in a standalone installation, or replace it with a consumer overlay. It defines:

- Public name, description, logo, footer text, admin name, and navigation.
- `routes`: public URL patterns mapped to page, collection, entry, form index, or form detail views.
- `settingsFields`: the settings keys and editor controls exposed to administrators.
- Canonical hostname and optional alias hostnames. Empty defaults do not redirect.
- MCP identity, bearer-token prefix, email sender display name, and notification setting key.
- `publicSettings`: the explicit list of setting keys exposed in public page data and anonymous MCP responses. Defaults to empty.

Example route definitions:

```ts
routes: [
	{ path: '/', kind: 'page', page: 'home' },
	{ path: '/journal', kind: 'collection', collection: 'articles' },
	{ path: '/journal/:slug', kind: 'entry', collection: 'articles' },
	{ path: '/responses', kind: 'forms' },
	{ path: '/responses/:slug', kind: 'form' },
	{ path: '/data-policy', kind: 'page', page: 'privacy' },
];
```

The collection slug identifies stored content independently of its URL. Create collections and their field schemas in the CMS; no schema changes or new route directories are required for a new content type. Supported custom field controls include text, multiline text, Markdown, numbers, booleans, URLs, and images. Draft entries remain unavailable on public routes and anonymous MCP queries.

The core reserves `/admin`, `/api`, `/files`, and `/mcp` (including their descendants). These are infrastructure endpoints, not content routes. Custom public templates can be added as consumer overlays when the standard collection/page views are insufficient.

## Cloudflare resources

1. Install with `pnpm install --frozen-lockfile`.
2. Create your own D1 database and R2 bucket. Set their names and database ID in `wrangler.jsonc`; keep bindings `DB`, `FILES`, and `ASSETS`.
3. Configure `CF_ACCESS_TEAM_DOMAIN` and set the Access audience with `pnpm exec wrangler secret put CF_ACCESS_AUD`. Protect `/admin` and `/api/upload` at the edge. The Worker also verifies JWT signatures, issuer, audience, and expiration and fails closed when unconfigured.
4. Initialize your database with `pnpm db:migrate:local`; review selected resources before running `pnpm db:migrate:remote`. The starter migrations contain only generic schema and neutral content. Existing consumers must manage their own migration history.
5. Run `pnpm check` and `pnpm build`, then `pnpm exec wrangler deploy`.

For Workers Builds, use `pnpm build` and `pnpm exec wrangler deploy`. GitHub Actions validates the same compiled Worker without deployment credentials.

## Forms and privacy

Interactive forms use configurable field schemas, validation, conditional fields, and a submission inbox. Date-only past/future constraints use an inclusive UTC calendar day in both the picker and server validation. Set `FORM_DATA_KEY` to a base64-encoded 32-byte secret to collect sensitive answers; without it, sensitive fields are withheld from the public form. Sensitive answers are encrypted in storage and omitted from notification emails and MCP responses. Configure the privacy page, consent text, retention, and administrative access for your installation.

For notifications, configure `FORM_EMAIL_FROM`, Cloudflare Email Routing, and the `EMAIL` binding. Set the destination using the configured notification setting. Notification delivery failure does not discard a form submission.

## MCP and tokens

The stateless MCP endpoint is `/mcp`. Public tools expose published content; scoped bearer tokens unlock administrative reads and opt-in edits. Tokens are hashed in D1, shown once, and revocable. Write tools preview by default and require explicit confirmation to apply changes; writes are validated, rate-limited, and audited.

The `.mcp.json` connector reads `ORANGECMS_MCP_URL` and `ORANGECMS_MCP_TOKEN` from the environment. Never commit credentials, `.dev.vars`, or database snapshots. Run `pnpm mcp:check` against your local endpoint.
