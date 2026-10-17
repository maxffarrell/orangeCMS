# orangeCMS

An MIT-licensed, general-purpose CMS built with SvelteKit 3, Svelte 5, TypeScript, Tailwind CSS 4, shadcn-svelte, Cloudflare Workers, D1, R2, and Cloudflare Access.

Create collections with custom fields, publish entries and pages, build forms, manage uploads, and connect tools through MCP. The core has no required business model or fixed public content URLs.

## Local development

Use the Node version in `.node-version` and pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Configure your site in `src/lib/site.ts`. Create content in `/admin`. Local development bypasses Access authentication; keep the development server local.

```sh
pnpm test:unit
pnpm check
pnpm build
pnpm test:routes
```

The production build runs a compiled-Worker smoke test against isolated local D1/R2 bindings, including rendered content, schema-driven editing, form privacy, token scopes, and persistence. It never reads a deployed database.

## Content and routes

Collections define their own fields. Entries share a small set of publishing attributes and store collection-specific values separately. Pages, forms, settings, and branding are also configurable. Public URLs are resolved from the route table in `src/lib/site.ts`, rather than one route directory per content type.

For example, a site can mount a collection at `/journal` and its entries at `/journal/:slug`, or mount the same collection under a different path without editing the CMS router. Navigation is a separate configuration list, so changing labels or links does not change data identity. See [SETUP.md](SETUP.md) for the configuration contract and reserved infrastructure paths.

## Shared core

Consumers can pin this repository as a Git submodule and compose `src/` with private configuration, templates, styles, and assets. Keep deployment resources and site content in the consumer. Check out submodules recursively in CI and compose sources before framework commands. Pin and review core updates before deployment.

## License

[MIT](LICENSE). Bundled third-party components and dependencies retain their respective licenses.
