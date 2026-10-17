# orangeCMS

A configurable content management system built with SvelteKit 3, Svelte 5, TypeScript, Tailwind CSS 4, shadcn-svelte, Cloudflare Workers, D1, R2, and Cloudflare Access. Includes pages, listings, vendors, downloadable and interactive forms, API tokens, audit logs, privacy controls, and an MCP endpoint.

## Start locally

Use the Node version in `.node-version` and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Local development bypasses Cloudflare Access. Production requires a valid Access team domain and application audience and rejects requests when authentication is unconfigured. Never expose the development server publicly.

Configure your identity, navigation, and canonical domains in `src/lib/site.ts`. Edit pages and contact settings in `/admin`, and replace the starter content and empty static directory with your own content. No production data, photographs, logos, infrastructure IDs, or credentials are included.

```sh
pnpm check
pnpm build
```

The build includes an isolated production Worker smoke test covering CMS content, D1 persistence, forms, API/MCP authentication, and Access verification. It does not access a deployed database.

## Deployment

See [SETUP.md](SETUP.md). Create your own Cloudflare resources and configure `wrangler.jsonc` before deploying.

## Use as a shared core

Pin this repository as a Git submodule in a private site repository. Compose its `src` into a generated source directory and overlay only your site-specific components, route templates, configuration, and styles. Keep production migrations, content, assets, and deployment configuration in the consuming repository. Run composition before development, typechecking, or building, and enable recursive submodule checkout in CI.

The schema migration filenames are stable. For an existing database, preserve its migration history and seed data in the consumer; do not replay starter seeds over a live site. Review and pin core updates before deploying them.

Dependency versions and lockfile are pinned to the source application's stack. Shared code changes should pass both standalone and consuming-site smoke tests.
