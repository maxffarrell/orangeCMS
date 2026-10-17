# Setup and operations

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Create a D1 database and R2 bucket in your Cloudflare account. Replace the placeholder database ID, database name, bucket name, and Worker name in `wrangler.jsonc`. Keep the binding names `DB`, `FILES`, and `ASSETS`.
3. Set `CF_ACCESS_TEAM_DOMAIN` to your Access team hostname. Set `CF_ACCESS_AUD` using `pnpm exec wrangler secret put CF_ACCESS_AUD`.
4. Protect `/admin` and `/api/upload` with Cloudflare Access applications using the configured audience. The Worker validates signed JWTs and fails closed if configuration is missing. API and MCP clients use scoped tokens created in the admin interface.
5. Configure `FORM_EMAIL_FROM` for your own Email Routing domain, and the `EMAIL` binding if form email delivery is required. No sender address is provided by default.
6. Apply migrations locally first with `pnpm db:migrate:local`. Initialize your own remote database with `pnpm db:migrate:remote` only after verifying the selected resources.
7. Configure public identity and canonical domain options in `src/lib/site.ts`; populate CMS pages/settings and upload your own assets.
8. Run `pnpm check` and `pnpm build`, then deploy with `pnpm exec wrangler deploy`.

For Cloudflare Workers Builds, use `pnpm build` as the build command and `pnpm exec wrangler deploy` as the deploy command. The smoke test must succeed before deployment. GitHub Actions validates builds without deployment credentials.

The supplied `.mcp.json` reads `ORANGECMS_MCP_URL` and `ORANGECMS_MCP_TOKEN` from your environment. Never commit tokens or `.dev.vars`. Use the token prefix shown by the admin interface. `pnpm mcp:check` validates endpoint authentication with your local configuration.

Back up D1 and R2 before schema upgrades. Form submissions and audit records may contain personal data; configure privacy policy text, retention, and access controls for your own organization.
