---
name: orangecms-setup
description: Set up or customize an orangeCMS project, including standalone and private consumer installations, content models, public routes, Cloudflare configuration, and local verification.
---

# orangeCMS setup

orangeCMS is a general-purpose SvelteKit 3 / Svelte 5 CMS using TypeScript, Tailwind CSS 4, shadcn-svelte, Cloudflare Workers, D1, R2, and Cloudflare Access. No business domain or public content URL is mandatory.

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
- `/admin`, `/api`, `/files`, and `/mcp`, including descendants, are reserved infrastructure paths. New content types do not need dedicated SvelteKit route directories.
- Define collections and their custom field schemas in the CMS. Controls include text, multiline text, Markdown, number, boolean, URL, and image. Check existing schemas before modifying them; schema and value replacements can remove omitted fields.
- `site.settingsFields` defines editable settings keys. `site.publicSettings` is an explicit public allowlist, empty by default. Keep notification destinations and other private settings out of it. Branding, host redirects, MCP identity, and email sender labels also live in site configuration.

## Configure production when requested

Use installation-owned D1/R2 resources and Wrangler configuration, preserving bindings `DB`, `FILES`, and `ASSETS`. Never copy a different site's resource IDs, content, secrets, or database snapshots. Apply the project's migrations to the selected database; a consumer with an existing migration history must plan upgrades rather than replay a fresh baseline blindly.

Configure Access team domain and audience and protect `/admin` and `/api/upload` at the edge. Production Worker authentication verifies Access JWTs and fails closed when unconfigured. Set `FORM_DATA_KEY` to a base64-encoded 32-byte secret for sensitive form answers. Configure notification sender, destination setting, and `EMAIL` binding only when notifications are needed. Sensitive answers are encrypted and excluded from emails and MCP; without the key, sensitive controls are withheld.

Keep credentials in local ignored environment files, client secrets, or provider secret storage. Use the project's current documentation for exact commands and selected resources.

## Verify the outcome

Run `pnpm test` for unit tests, typecheck, compiled-Worker smoke, and configurable-route fixtures. `pnpm build` includes the isolated local D1/R2 production smoke suite. A consumer may define additional composition and smoke commands; run those too when changing that consumer. Test the actual customized paths and rendered content, including former paths returning 404 where routes were moved.

Before publishing a reusable core, run `pnpm check:public` if available and inspect the staged diff for installation-specific content, domains, contacts, assets, resource IDs, and credentials. Report verified local behavior separately from deployment or remote CI status.
