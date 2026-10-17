# orangeCMS

An MIT-licensed, general-purpose CMS built with SvelteKit 3, Svelte 5, TypeScript, Tailwind CSS 4, shadcn-svelte, Cloudflare Workers, D1, Workers KV, and Cloudflare Access.

Create collections with custom fields, publish entries and pages, build forms, manage uploads, and connect tools through MCP. The core has no required business model or fixed public content URLs.

## Agent installation

Install the orangeCMS skills through Claude or ChatGPT/Codex, then run the setup workflow in your own project. Claude Code can install it with `/plugin install orangecms --marketplace maxffarrell/orangeCMS`. See [plugin installation](docs/PLUGINS.md) for marketplace commands, the downloadable package, and optional per-site MCP connections.

Uploads use optional Workers KV storage with no R2 fallback. Follow the [Free-plan requirements and billing checks](docs/COSTS.md) before enabling uploads or OAuth remotely. The source does not guarantee a zero bill for an existing account; plans and existing resources must be verified. No paid OAuth provider is required.

## Local development

Use the Node version in `.node-version` and pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local # optional neutral home/privacy placeholders
pnpm dev
```

The migration creates empty tables; optional starter content lives in `seeds/starter.sql`. Create your own pages in `/admin` if you skip seeding. Configure your site in `src/lib/site.ts`. Create content in `/admin`. Local development bypasses Access authentication; keep the development server local.

```sh
pnpm test # unit checks, typecheck, production smoke, and consumer route fixtures
```

The production build runs a compiled-Worker smoke test against isolated local D1/KV bindings, including rendered content, schema-driven editing, form privacy, token scopes, and persistence. It never reads a deployed database.

## Content and routes

Collections define their own fields. Entries share a small set of publishing attributes and store collection-specific values separately. Pages, forms, settings, and branding are also configurable. Public URLs are resolved from the route table in `src/lib/site.ts`, rather than one route directory per content type.

For example, a site can mount a collection at `/journal` and its entries at `/journal/:slug`, or mount the same collection under a different path without editing the CMS router. Navigation is a separate configuration list, so changing labels or links does not change data identity. See [SETUP.md](SETUP.md) for the configuration contract and reserved infrastructure paths.

## Static publishing

Save content in the CMS, then explicitly run `pnpm publish:static` to prepare a static public snapshot for deployment. Saving and publishing are separate actions: active content in the CMS does not update an already deployed snapshot. See [publishing configuration](SETUP.md#static-publishing) for the required source, route inventory, and deployment steps.

The snapshot includes rendered public pages, their Svelte hydration/data assets, and local media. Public browsing can then use static assets without reading D1 or KV. Admin, OAuth/MCP, uploads, and form submissions remain live backend functions. A failed export retains the previous successful snapshot; it does not publish a partial replacement. There is no automatic authenticated deployment button in the admin UI.

## Shared core

Consumers can pin this repository as a Git submodule and compose `src/` with private configuration, templates, styles, and assets. Keep deployment resources and site content in the consumer. Check out submodules recursively in CI and compose sources before framework commands. Pin and review core updates before deployment.

## License

[MIT](LICENSE). Bundled third-party components and dependencies retain their respective licenses.

## Test coverage

`pnpm test:unit` exercises real form validation, conditional fields, encryption/redaction, route resolution, and migrated SQLite persistence through a D1-compatible adapter. Token tests check hashing, permissions, revocation, and usage tracking.

`pnpm build` includes the production Worker smoke suite: rendered D1 content, authenticated admin CRUD, scoped MCP edits and audit logs, privacy-preserving form storage/email/export, settings persistence, Access JWT verification, and valid/invalid KV uploads. All fixtures are synthetic and isolated from deployed resources.

`pnpm test:routes` builds separate consumer fixtures with remapped public paths and with no public form routes. It verifies former paths return 404, saved public settings reach rendered content, and core admin checks still run when forms are unmounted. GitHub Actions runs all of these checks.
