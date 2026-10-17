# Working on orangeCMS

orangeCMS is a general-purpose SvelteKit 3 / Svelte 5 CMS on Cloudflare Workers, D1, and R2. Keep reusable source, fixtures, and documentation free of installation-specific content and resource identifiers.

Read `skills/orangecms-setup/SKILL.md` for project setup or source customization, and `skills/orangecms/SKILL.md` for working through a connected CMS MCP service. The plugin's installed cache is guidance, not the user's editable website workspace.

- Use the versions in `.node-version` and `package.json`; install with `pnpm install --frozen-lockfile`.
- For a new local database, run `pnpm db:migrate:local`. Optional neutral content is installed separately with `pnpm db:seed:local`. Initial migrations create schema; collections and custom fields are data, so they do not require new SQL migrations.
- Keep existing consumers' migration history and private configuration intact. Add schema changes as new migrations; never reset an existing database to initialize a project.
- Configure branding, public routes, navigation, setting editors, and the public-settings allowlist in `src/lib/site.ts`. `/admin`, `/api`, `/files`, `/mcp`, `/oauth`, and `/.well-known` are reserved endpoints.
- Public settings are opt-in. Sensitive form answers require `FORM_DATA_KEY`, are encrypted in D1, and are excluded from email/MCP. Production admin/upload routes verify Cloudflare Access JWTs and fail closed when unconfigured.
- OAuth connections use `/mcp/authorized`, per-site `OAUTH_KV`, Access-protected `/admin/oauth/authorize`, and explicit read/edit consent. Keep protocol/discovery endpoints outside edge Access; retain `/mcp` anonymous/static-token compatibility. Connected apps and API tokens revoke separately.
- Local setup does not provision or deploy cloud resources. Preserve the user's chosen deployment flow when extending a consumer.

`pnpm test` runs unit tests, typechecking, production Worker smoke tests against isolated local D1/R2, and consumer route fixtures. For plugin changes, also run `pnpm plugin:package` and validate the packaged files. Before publishing reusable changes, inspect the staged diff and run `pnpm check:public`; it scans indexed paths and does not replace review.

Agent packaging uses portable `plugin.json`, `.claude-plugin/` metadata, and `.agents/plugins/marketplace.json`. Keep skills self-contained and package only manifests, skills/resources, and the license. Site URLs and tokens are connected separately, never baked into the distributable.

The Cloudflare adapter wrapper dispatches public OAuth protocol endpoints before SvelteKit so native token exchanges work while framework CSRF checks remain enabled. Preserve that wrapper and validate it through compiled Worker smoke tests.

Cost requirement: follow `docs/COSTS.md`. Use Workers Free for zero-cost OAuth; verify the actual deployment account before provisioning/activation. Never upgrade plans, enable paid services, or assume included paid-plan allowances prevent overages. If billing cannot be verified, leave OAuth unconfigured and explain the limitation. Local tests must remain local.
