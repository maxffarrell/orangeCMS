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

The core reserves `/admin`, `/api`, `/files`, `/mcp`, `/oauth`, and `/.well-known` (including their descendants). These are infrastructure endpoints, not content routes. Custom public templates can be added as consumer overlays when the standard collection/page views are insufficient.

## Cloudflare resources

1. Install with `pnpm install --frozen-lockfile`.
2. Configure your installation’s D1 database as `DB` and static assets as `ASSETS` in `wrangler.jsonc`. Upload storage is optional: after verifying the actual account’s Workers Free plan and quotas, manually create a dedicated KV namespace and bind it as `FILES_KV`. Do not provision or bind R2 for new installations. Follow [cost requirements](docs/COSTS.md).
3. Configure `CF_ACCESS_TEAM_DOMAIN` and set the Access audience with `pnpm exec wrangler secret put CF_ACCESS_AUD`. Protect `/admin` and `/api/upload` at the edge. The Worker also verifies JWT signatures, issuer, audience, and expiration and fails closed when unconfigured.
4. Initialize the schema with `pnpm db:migrate:local`; review selected resources before running `pnpm db:migrate:remote`. Migrations create empty CMS tables. Starter content is optional and installed separately; see below. Existing consumers must retain and manage their own migration history.
5. Run `pnpm check` and `pnpm build`, then `pnpm exec wrangler deploy`.

For Workers Builds, use `pnpm build` and `pnpm exec wrangler deploy`. GitHub Actions validates the same compiled Worker without deployment credentials.

## Fresh databases and optional starter content

Keep `migrations/0001_initial.sql`: a new database still needs tables, indexes, and constraints before the CMS can run. This is the initial generic schema, not a record of another site's content. Apply future schema changes through new migrations; do not edit an already applied migration.

`pnpm db:migrate:local` creates an empty local database. The CMS can store your own pages, collections, entries, forms, settings, and tokens without installing example content. Public page routes return 404 until the corresponding page exists.

For neutral home and privacy page placeholders and a default retention setting, explicitly run:

```sh
pnpm db:seed:local
```

Review `seeds/starter.sql` first. It uses `INSERT OR IGNORE`: rerunning it preserves existing pages and settings and fills missing starter records. Customize the privacy policy before collecting personal data. To opt into the same placeholders remotely, select your own database, migrate it, then run `pnpm db:seed:remote`.

Existing databases that previously applied `0002_seed.sql` need no rollback, reset, or data deletion. Their stored migration history and content remain intact. Consumers with their own schema or migration chain must keep that chain and plan any schema adoption explicitly; never replace or replay the initial schema against an existing database.

## Local development

Use Node.js 22.17 or newer and pnpm 12 or newer. For local development, install dependencies and use the placeholder resource configuration; no cloud resources need to be provisioned:

```sh
pnpm db:migrate:local
# Optional: add neutral placeholders instead of creating all content yourself.
pnpm db:seed:local
pnpm dev
```

`pnpm dev` serves the application locally with local D1 and KV bindings. Local migration and seed commands use Wrangler's local persistence; they do not contact your remote database. Local Vite development bypasses Cloudflare Access; keep the dev server local. Previewing the compiled production Worker still requires Access configuration and valid JWTs. `pnpm build` also runs the production Worker smoke suite in an isolated disposable database with its own test credentials and content.

## Upload storage

Uploads use Workers KV through the optional **`FILES_KV`** binding. This is separate from OAuth’s **`OAUTH_KV`** namespace; both consume the same account-wide Free-plan storage and operation allowances. Keep deployment namespaces installation-owned. The default configuration does not create remote namespaces or enable R2.

With no `FILES_KV` binding, upload and file-serving requests return an unavailable response. Storage failures and exhausted quotas fail closed with 503; the CMS does not fall back to R2 or silently enable billing. Uploads remain managed in the CMS once a verified Free-plan namespace is configured. KV is subject to platform limits and propagation delay; do not describe its free allowance as unlimited capacity or immediate consistency.

Keep existing `/files/…` references stable during a storage migration by preserving object keys and content types. Removing an R2 binding changes the application’s storage access; it does not copy its objects, disable direct public bucket URLs, delete the bucket, or end storage charges. See the [R2 retirement procedure](docs/COSTS.md#retiring-an-existing-r2-bucket) before changing a deployed consumer.

## Forms and privacy

Interactive forms use configurable field schemas, validation, conditional fields, and a submission inbox. Date-only past/future constraints use an inclusive UTC calendar day in both the picker and server validation. Set `FORM_DATA_KEY` to a base64-encoded 32-byte secret to collect sensitive answers; without it, sensitive fields are withheld from the public form. Sensitive answers are encrypted in storage and omitted from notification emails and MCP responses. Configure the privacy page, consent text, retention, and administrative access for your installation.

For notifications, configure `FORM_EMAIL_FROM`, Cloudflare Email Routing, and the `EMAIL` binding. Set the destination using the configured notification setting. Notification delivery failure does not discard a form submission.

## MCP and tokens

The stateless MCP endpoint is `/mcp`. Public tools expose published content; scoped bearer tokens unlock administrative reads and opt-in edits. Tokens are hashed in D1, shown once, and revocable. Write tools preview by default and require explicit confirmation to apply changes; writes are validated, rate-limited, and audited.

Use `/mcp/authorized` for OAuth connections; it requires authentication and supports reliable client sign-in discovery. The original `/mcp` endpoint preserves anonymous published-content access and existing bearer-token behavior. The optional `examples/claude-mcp.json` template uses OAuth with no fixed header; `examples/claude-mcp-token.json` uses `ORANGECMS_MCP_TOKEN` for a manual token connection to `/mcp`. Never commit credentials, `.dev.vars`, or database snapshots. Run `pnpm mcp:check` against your local endpoint.

## OAuth connections

OAuth uses the installation's own Cloudflare Access sign-in and a consent screen, backed by `@cloudflare/workers-oauth-provider`. There is no central orangeCMS login service. For OAuth, bind a separate Workers KV namespace as **`OAUTH_KV`** in the installation's Wrangler configuration. Placeholder configuration does not create or configure a hosted namespace. Optional `OAUTH_ISSUER` must exactly match the canonical site origin; otherwise the configured canonical hostname or current origin is used. Use separate local/preview and production storage, following your chosen deployment flow. When a consumer configures a production canonical hostname, set a local `OAUTH_ISSUER` matching the development server origin to test OAuth locally.

Protect `/admin/*`, including `/admin/oauth/authorize`, with the installation's Cloudflare Access application and configure `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`. Keep OAuth discovery, `/oauth/register`, `/oauth/token`, and `/mcp/authorized` reachable by remote clients without an edge Access login. The browser consent route verifies the Access identity; MCP requests authenticate with OAuth bearer tokens. Production authorization must not rely on the local development Access bypass.

Token refresh and RFC 7009 revocation share `/oauth/token`; clients discover the revocation endpoint from metadata. Clients connect to `https://your-site.example/mcp/authorized`. The Worker publishes protected-resource and authorization-server discovery metadata and supports authorization-code flow with S256 PKCE and dynamic client registration. Clients must use the exact callback URL they register; do not substitute a guessed ChatGPT or Claude callback. Both Client ID Metadata Documents (CIMD, including Claude’s published identity) and dynamic registration (**Register automatically** in Claude) are supported.

Permissions are `cms:read` for administrative reads, `cms:write` for editing, and `offline_access` for refreshing a connection. Read is the default; editing requires explicit consent. Write tools retain their preview-and-confirm behavior and audit logging. Sensitive form answers remain excluded from MCP regardless of the grant. Administrators manage revocation through **Connected apps** at `/admin/connections`. Access tokens expire after one hour; refresh tokens after 30 days. Existing API tokens remain independently managed in `/admin/tokens`.

A deployment needs the KV binding, Access configuration, and current source before OAuth will work remotely. Verify discovery, browser consent, read-only versus editing scope enforcement, refresh, and revocation against the intended environment. Local automated tests do not prove a successful connection in a hosted ChatGPT or Claude account. See [plugin connection instructions](docs/PLUGINS.md#connect-a-site-when-needed).

## Cost requirement

Follow the [zero-cost deployment policy](docs/COSTS.md). OAuth supports Workers Free with KV; verify the actual account is on the Free plan before enabling it. Free-plan quotas fail closed rather than charge overages. Do not upgrade or enable paid services. Existing R2 and other products have separate pricing, so the whole account must be checked before claiming a zero Cloudflare bill. If account billing cannot be verified, keep `FILES_KV` and `OAUTH_KV` unconfigured.

### Prepare a verified file import offline

The migration preparer reads a private backup directory and produces a Wrangler KV bulk-import file without contacting Cloudflare:

```sh
node scripts/prepare-files-import.mjs --manifest /private/backup/manifest.json --source /private/backup/objects --output /private/backup/kv-import.json
```

The manifest is `{ "objects": [{ "key": "documents/example.pdf", "size": 123, "sha256": "<64 lowercase hex characters>", "http_metadata": { "contentType": "application/pdf" } }] }`. Source files must exist at the matching relative keys. Every byte count and hash is verified. Missing MIME types are inferred only from common file extensions, otherwise use `application/octet-stream`; review the reported inference count. The output contains private file bytes: keep it outside public repositories. Choose a new output path; existing files, including source objects and the manifest, are never overwritten. The encoded bulk payload is capped at 80 MiB to stay below the provider’s request limit. Split a larger inventory into reviewed manifest subsets with separate output paths; preserve the full inventory for final reconciliation.

After verifying the correct account is on Workers Free and its shared quota has capacity, an authorized operator can import the reviewed payload with `pnpm exec wrangler kv bulk put /private/backup/kv-import.json --binding FILES_KV --remote`. Read back every destination object and compare its SHA-256 before planning any source bucket deletion. A local snapshot is not a complete live inventory.
