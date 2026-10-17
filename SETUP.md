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
  { path: "/", kind: "page", page: "home" },
  { path: "/journal", kind: "collection", collection: "articles" },
  { path: "/journal/:slug", kind: "entry", collection: "articles" },
  { path: "/responses", kind: "forms" },
  { path: "/responses/:slug", kind: "form" },
  { path: "/data-policy", kind: "page", page: "privacy" },
];
```

The collection slug identifies stored content independently of its URL. Create collections and their field schemas in the CMS; no schema changes or new route directories are required for a new content type. Supported custom field controls include text, multiline text, Markdown, numbers, booleans, URLs, and images. Draft entries remain unavailable on public routes and anonymous MCP queries.

The core reserves `/admin`, `/api`, `/files`, and `/mcp` (including their descendants). These are infrastructure endpoints, not content routes. Custom public templates can be added as consumer overlays when the standard collection/page views are insufficient.

## Cloudflare resources

1. Install with `pnpm install --frozen-lockfile`.
2. Create your own D1 database and R2 bucket. Set their names and database ID in `wrangler.jsonc`; keep bindings `DB`, `FILES`, and `ASSETS`.
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

`pnpm dev` serves the application locally with local D1 and R2 bindings. Local migration and seed commands use Wrangler's local persistence; they do not contact your remote database. Local Vite development bypasses Cloudflare Access; keep the dev server local. Previewing the compiled production Worker still requires Access configuration and valid JWTs. `pnpm build` also runs the production Worker smoke suite in an isolated disposable database with its own test credentials and content.

## Forms and privacy

Interactive forms use configurable field schemas, validation, conditional fields, and a submission inbox. Date-only past/future constraints use an inclusive UTC calendar day in both the picker and server validation. Set `FORM_DATA_KEY` to a base64-encoded 32-byte secret to collect sensitive answers; without it, sensitive fields are withheld from the public form. Sensitive answers are encrypted in storage and omitted from notification emails and MCP responses. Configure the privacy page, consent text, retention, and administrative access for your installation.

For notifications, configure `FORM_EMAIL_FROM`, Cloudflare Email Routing, and the `EMAIL` binding. Set the destination using the configured notification setting. Notification delivery failure does not discard a form submission.

## MCP and tokens

The stateless MCP endpoint is `/mcp`. Public tools expose published content; scoped bearer tokens unlock administrative reads and opt-in edits. Tokens are hashed in D1, shown once, and revocable. Write tools preview by default and require explicit confirmation to apply changes; writes are validated, rate-limited, and audited.

The optional `examples/claude-mcp.json` connector template reads `ORANGECMS_MCP_URL` and `ORANGECMS_MCP_TOKEN` from the environment. Never commit credentials, `.dev.vars`, or database snapshots. Run `pnpm mcp:check` against your local endpoint.
