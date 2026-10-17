---
name: orangecms-setup
description: Set up or customize an orangeCMS project, including standalone and private consumer installations, content models, public routes, Cloudflare configuration, and local verification.
---

# orangeCMS setup

orangeCMS is a general-purpose SvelteKit 3 / Svelte 5 CMS using TypeScript, Tailwind CSS 4, shadcn-svelte, Cloudflare Workers, D1, Workers KV, and Cloudflare Access. No business domain or public content URL is mandatory.

## Find the project

An installed plugin directory contains guidance, not necessarily the CMS source. Locate the user's orangeCMS checkout or consumer project first. Read its `AGENTS.md`, `README.md`, `SETUP.md`, package scripts, and consumer composition instructions if present. Do not edit the installed plugin/cache directory to customize a site.

If a new checkout is requested, clone `https://github.com/maxffarrell/orangeCMS.git` into the user's intended workspace. Resolve an unspecified destination before creating files. The authoritative setup guide is [SETUP.md](https://github.com/maxffarrell/orangeCMS/blob/main/SETUP.md); inspect documentation from the selected revision when working with a pinned core.

## Start locally

Use `.node-version` and `package.json` for supported Node/pnpm versions. In the CMS project:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Migrations create the required empty database schema; starting fresh does not eliminate them. Optional sample content is separate: run `pnpm db:seed:local` only when sample content is wanted and the project provides that script. Create real collections, entries, pages, forms, and settings through `/admin`. An empty installation needs content for its configured home page before `/` can render it.

Local development bypasses Cloudflare Access. Keep that server local. Cloud resource creation, remote migrations, and deployment are separate tasks; ordinary local setup does not authorize them.

## Customize the site

- Standalone: edit `src/lib/site.ts`, templates, styles, and assets in the project.
- Private consumer: keep site configuration, content, branding, deployment resources, and custom templates in the consumer; pin the shared core as a submodule. Follow the consumer's source-composition script before framework commands. CI must check out submodules recursively. Avoid changing the pinned core just to customize one site.
- `site.routes` maps public URL patterns to `page`, `collection`, `entry`, `forms`, or `form` views. A collection's stored slug is independent of its public URL. Pair collection index and entry routes as needed, for example `/journal` and `/journal/:slug`. Set navigation separately and update `privacyPath` when remapping the privacy page.
- `/admin`, `/api`, `/files`, `/mcp`, `/oauth`, and `/.well-known`, including descendants, are reserved infrastructure paths. New content types do not need dedicated SvelteKit route directories.
- Define collections and their custom field schemas in the CMS. Controls include text, multiline text, Markdown, number, boolean, URL, and image. Check existing schemas before modifying them; schema and value replacements can remove omitted fields.
- `site.settingsFields` defines editable settings keys. `site.publicSettings` is an explicit public allowlist, empty by default. Keep notification destinations and other private settings out of it. Branding, host redirects, MCP identity, and email sender labels also live in site configuration.

## Configure production when requested

Cost requirement: follow the project's [zero-cost deployment policy](https://github.com/maxffarrell/orangeCMS/blob/main/docs/COSTS.md). Verify the deployment account uses Workers Free before provisioning or enabling upload or OAuth KV. Do not upgrade plans or enable paid services. Free KV quotas reject excess operations; paid-plan allowances can incur overages. Existing R2 and other products have separate billing, so do not claim the entire account is free without checking them. If billing cannot be verified, leave `FILES_KV` and `OAUTH_KV` unconfigured and report that limitation. Local setup and tests remain local. Before pushing a consumer branch, inspect any existing Cloudflare build integration and verify its plan and free allowance; when verification is unavailable, keep changes local and the PR in draft instead of triggering potentially billable builds.

Use installation-owned D1 and KV resources and Wrangler configuration, preserving `DB` and `ASSETS`. Uploads use optional `FILES_KV`; OAuth uses separate optional `OAUTH_KV`, sharing the same account Free-plan allowances. There is no R2 fallback or default R2 binding. Missing storage or exhausted quotas must fail closed instead of enabling billing. Never copy a different site's resource IDs, content, secrets, or database snapshots. Apply the project's migrations to the selected database; a consumer with an existing migration history must plan upgrades rather than replay a fresh baseline blindly.

Configure Access team domain and audience and protect `/admin` and `/api/upload` at the edge. Production Worker authentication verifies Access JWTs and fails closed when unconfigured. Set `FORM_DATA_KEY` to a base64-encoded 32-byte secret for sensitive form answers. Configure notification sender, destination setting, and `EMAIL` binding only when notifications are needed. Sensitive answers are encrypted and excluded from emails and MCP; without the key, sensitive controls are withheld.

For OAuth, connect clients to `/mcp/authorized`. Configure installation-owned `OAUTH_KV` storage and Access-protected `/admin/oauth/authorize`; keep discovery and `/oauth/register`, `/oauth/token`, and `/mcp/authorized` outside edge Access login. Consent defaults to `cms:read`; `cms:write` explicitly enables edits, and `offline_access` enables refreshing the connection. Administrators can revoke grants in **Connected apps**. Preserve `/mcp` for anonymous content and existing manual tokens. Plugin installation alone does not configure hosted OAuth. Use the project's current setup documentation for namespace and deployment details.

For an existing R2 consumer, preserve object keys and content types while migrating. Removing the binding does not migrate objects, disable direct bucket URLs, or stop storage charges. Obtain a complete live inventory, export and hash-verify all objects, import and verify destination readback, then obtain explicit deletion approval before retiring the bucket. A local snapshot alone does not prove live completeness.

Keep credentials in local ignored environment files, client secrets, or provider secret storage. Use the project's current documentation for exact commands and selected resources.

## Publish a static public snapshot

Use the project’s local `pnpm publish:static` workflow and current setup documentation for source and route configuration. A consumer needs its wrapper to include custom public routes. Saving a draft or active record does not replace an already deployed snapshot. Export anonymously; never add admin credentials to capture privileged pages or data. Include public Svelte hydration assets, data snapshots, and referenced local `/files/…` media, not just HTML. Published pages use full document navigation to avoid mixing published client versions with current dynamic form/admin routes, while hydration retains menus and animations. Unpublished file previews still depend on KV. Leave admin, MCP/OAuth, uploads, and form submissions dynamic.

A failed export must preserve the last successful artifact. Review and outage-test the result before any separately authorized deployment. Stop or block the source and serve the artifact without D1/KV; verify direct paths, internal navigation, menus, animation visibility, images, and PDFs. Install into fresh build assets. Set `STATIC_PUBLISHING=1` for the static deployment and keep public static paths asset-first; the guard blocks live-CMS fallback for missing public snapshots. Keep the local rendering source outside that guard while preparing a replacement. Local export does not verify account billing or stop existing R2 charges. There is no automatic admin deploy button.

## Verify the outcome

Run `pnpm test` for unit tests, typecheck, compiled-Worker smoke, and configurable-route fixtures. `pnpm build` includes the isolated local D1/KV production smoke suite. A consumer may define additional composition and smoke commands; run those too when changing that consumer. Test the actual customized paths and rendered content, including former paths returning 404 where routes were moved.

Before publishing a reusable core, run `pnpm check:public` if available and inspect the staged diff for installation-specific content, domains, contacts, assets, resource IDs, and credentials. Report verified local behavior separately from deployment or remote CI status.
