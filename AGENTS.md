# Working on orangeCMS

orangeCMS is a general-purpose SvelteKit 3 / Svelte 5 CMS on Cloudflare Workers, D1, and Workers KV. Keep reusable source, fixtures, and documentation free of installation-specific content and resource identifiers.

Read `skills/orangecms-setup/SKILL.md` for project setup or source customization, and `skills/orangecms/SKILL.md` for working through a connected CMS MCP service. The plugin's installed cache is guidance, not the user's editable website workspace.

- Use the versions in `.node-version` and `package.json`; install with `pnpm install --frozen-lockfile`.
- For a new local database, run `pnpm db:migrate:local`. Optional neutral content is installed separately with `pnpm db:seed:local`. Initial migrations create schema; collections and custom fields are data, so they do not require new SQL migrations.
- Keep existing consumers' migration history and private configuration intact. Add schema changes as new migrations; never reset an existing database to initialize a project.
- Configure branding, public routes, navigation, setting editors, and the public-settings allowlist in `src/lib/site.ts`. `/admin`, `/api`, `/files`, `/mcp`, `/oauth`, and `/.well-known` are reserved endpoints.
- Public settings are opt-in. Sensitive form answers require `FORM_DATA_KEY`, are encrypted in D1, and are excluded from email/MCP. Production admin/upload routes verify Cloudflare Access JWTs and fail closed when unconfigured.
- Uploads use optional `FILES_KV` only, with no R2 fallback. Verify the deployment account is Workers Free before provisioning or enabling remote storage; leave it unconfigured when verification is unavailable. `FILES_KV` and `OAUTH_KV` are separate namespaces sharing account quotas.
- OAuth connections use `/mcp/authorized`, per-site `OAUTH_KV`, Access-protected `/admin/oauth/authorize`, and explicit read/edit consent. Keep protocol/discovery endpoints outside edge Access; retain `/mcp` anonymous/static-token compatibility. Connected apps and API tokens revoke separately.
- Local setup does not provision or deploy cloud resources. Preserve the user's chosen deployment flow when extending a consumer.

`pnpm test` runs unit tests, typechecking, production Worker smoke tests against isolated local D1/KV, and consumer route fixtures. For plugin changes, also run `pnpm plugin:package` and validate the packaged files. Before publishing reusable changes, inspect the staged diff and run `pnpm check:public`; it scans indexed paths and does not replace review.

Agent packaging uses portable `plugin.json`, `.claude-plugin/` metadata, and `.agents/plugins/marketplace.json`. Keep skills self-contained and package only manifests, skills/resources, and the license. Site URLs and tokens are connected separately, never baked into the distributable.

The Cloudflare adapter wrapper dispatches public OAuth protocol endpoints before SvelteKit so native token exchanges work while framework CSRF checks remain enabled. Preserve that wrapper and validate it through compiled Worker smoke tests.

Cost requirement: follow `docs/COSTS.md`. Use Workers Free for zero-cost OAuth; verify the actual deployment account before provisioning/activation. Never upgrade plans, enable paid services, or assume included paid-plan allowances prevent overages. If billing cannot be verified, leave uploads and OAuth unconfigured and explain the limitation. Local tests must remain local. Removing an R2 binding does not stop existing storage charges or public bucket access. Retire existing buckets only after complete live inventory, verified export and destination readback, and explicit deletion approval.

A connected consumer branch can trigger Cloudflare Workers Builds on push. Under the zero-cost requirement, verify its actual plan/build allowance first; otherwise keep consumer changes local and its PR in draft rather than trigger potentially billable remote builds.

Static publishing is explicit through `pnpm publish:static`: saved CMS content is not automatically deployed. Keep only anonymous public HTML/data/assets in the artifact, include local media and the Svelte client/navigation data, and keep backend operations dynamic. Preserve the previous artifact on any export failure. Consumer wrappers must enumerate their custom public routes. Verify public browsing from an asset-only environment with the source backend stopped and no D1/KV; do not treat cached successful HTML as proof. Install only into fresh build assets and set `STATIC_PUBLISHING=1` on the static deployment to block live-CMS fallback for missing public pages. Keep that flag disabled on the separate local rendering configuration. Keep public assets outside Worker-first routing so they survive backend quota outages.
