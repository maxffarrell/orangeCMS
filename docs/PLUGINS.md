# Agent plugin installation

orangeCMS includes two skills: `orangecms-setup` for installation and source customization, and `orangecms` for content work through a separately connected site. The same skills ship in Claude Code and portable ChatGPT/Codex plugin formats.

Installing the plugin adds guidance. It does not deploy a CMS, create cloud resources, connect to a site, or grant access to content. There are no bundled endpoints, tokens, or lifecycle hooks.

## Claude Code

Run these commands with a current Claude Code installation:

```sh
claude plugin marketplace add maxffarrell/orangeCMS
claude plugin install orangecms@orangecms
```

Start a session in your application workspace. Invoke `/orangecms:orangecms-setup` to set up or customize a project, or `/orangecms:orangecms` to work with a connected site's content. The repository's `.claude-plugin/marketplace.json` points to the root plugin. See [Claude's marketplace instructions](https://code.claude.com/docs/en/plugin-marketplaces).

For local development, use `claude --plugin-dir /absolute/path/to/orangeCMS`. Validate packaging changes with `claude plugin validate /absolute/path/to/orangeCMS`.

## ChatGPT desktop and Codex

With a current Codex CLI:

```sh
codex plugin marketplace add maxffarrell/orangeCMS
codex plugin add orangecms@orangecms
```

`codex plugin list` shows available plugins. If your CLI lacks these commands, update it or use the desktop marketplace picker. Restart ChatGPT desktop after registering the marketplace, open Plugins, select the orangeCMS marketplace, and install orangeCMS if it is not already installed. Run its **Setup** action to invoke `orangecms-setup`; you can also explicitly ask the agent to use the orangeCMS setup or content skill.

The repo catalog lives in `.agents/plugins/marketplace.json`. The root `plugin.json` declares the onboarding path and `requires_local_executor: true`, because project setup needs local filesystem and command access. Use a supported desktop/local execution surface. See OpenAI's [plugin packaging](https://developers.openai.com/plugins/build/plugins) and [desktop execution](https://developers.openai.com/plugins/deploy/desktop-only) documentation.

These are repository marketplace installation instructions. orangeCMS is **not listed in the public ChatGPT plugin directory**; that requires a separate [submission and review](https://developers.openai.com/plugins/deploy/submission).

## Application workspace versus plugin cache

Installed plugins may be copied into a host-managed cache. Keep your actual orangeCMS checkout or consumer project in your own workspace. Tell the agent which project to use, and customize that project rather than the cached plugin. The setup skill locates the checkout and reads its pinned revision's documentation before applying changes.

## Connect a site when needed

Each CMS installation has its own connections. Use **`https://your-site.example/mcp/authorized`** for browser sign-in with Claude, ChatGPT, or Codex. This endpoint requires OAuth, so clients can reliably discover that sign-in is needed. The site's original `/mcp` endpoint remains available for anonymous published content and manually configured bearer tokens.

### Sign in with OAuth

The site owner must first configure the installation's `OAUTH_KV` binding and Cloudflare Access, as described in [Setup](../SETUP.md#oauth-connections). Installing this plugin does not configure or deploy those resources.

For Claude Code, use the optional [examples/claude-mcp.json](../examples/claude-mcp.json) template from your application checkout:

```sh
claude --mcp-config examples/claude-mcp.json
```

Set `ORANGECMS_MCP_URL` to the site's `/mcp/authorized` URL. The template defaults to `http://localhost:5174/mcp/authorized`; ensure your local server uses that port or override the URL. Open `/mcp` in Claude Code and authenticate the server. Do not add a static `Authorization` header to an OAuth connection: Claude treats a configured header as a fixed credential and does not fall back to OAuth. See [Claude's MCP authentication documentation](https://code.claude.com/docs/en/mcp#authenticate-with-remote-mcp-servers).

For Claude's hosted connector UI, add the site's `/mcp/authorized` URL and choose OAuth. This server supports Claude’s published identity (CIMD) and **Register automatically** (dynamic client registration). For ChatGPT, create a custom remote MCP connection to that URL with OAuth and dynamic client registration. For Codex, add the per-site HTTP MCP connection and use the client's OAuth login action. Available connection controls depend on the client and workspace. Skills and an MCP connection are installed separately; this repository plugin contains no universal hosted endpoint.

The browser opens the site's Cloudflare Access sign-in, followed by its consent page. Review the site, client name, callback address, and requested permissions. **`cms:read`** allows administrative reads; **`cms:write`** additionally allows edits. Read access is the default; grant editing only when intended. **`offline_access`** lets the client maintain its connection with a refresh token. Sensitive submission answers remain excluded from MCP. Writes still preview before applying, even with an editing connection.

Manage and revoke grants at the site’s **Connected apps** (`/admin/connections`) administration screen. Revoking a site's grant disables that connection's tokens; disconnecting a client is a separate client-side action. Reconnect and consent again when changing permissions. No shared orangeCMS account or central authorization service is involved.

### Existing tokens and anonymous access

[examples/claude-mcp-token.json](../examples/claude-mcp-token.json) preserves the manual bearer-token connection to `/mcp`. Set `ORANGECMS_MCP_URL` to that endpoint and supply `ORANGECMS_MCP_TOKEN` through the client's supported secret handling. Create and revoke tokens at the site's `/admin/tokens`; editing requires **allow edits**. With no token, `/mcp` exposes only published content and explicitly public settings. The optional server `MCP_ADMIN_TOKEN` secret permits administrative reads only.

Both templates are optional, are not auto-discovered, and are excluded from the release ZIP. Keep credentials outside committed files. Consult the client's supported environment/header settings for persistent fixed-token connections. See [OpenAI's OAuth requirements](https://developers.openai.com/plugins/build/auth) for remote authenticated MCP interoperability.

## Release ZIP and verification

Download the plugin release under the GitHub tag [`plugin-v1.3.0`](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.3.0), with `orangecms-plugin.zip` as its downloadable asset. You can build the same minimal archive locally:

```sh
pnpm plugin:package
node --test scripts/plugin.test.mjs
```

The build prints a SHA-256 checksum and writes `dist/orangecms-plugin.zip`. It uses Node's standard library; archive verification tests require the standard `unzip` command. The ZIP contains only portable and Claude plugin manifests, MIT license, and skill resources. Application source, databases, migrations, environment files, MCP connection templates, and marketplace catalogs are excluded. Identical inputs produce identical ZIP bytes.

Use the repository marketplaces above for installation. A release ZIP is a distributable package, not proof of approval or listing in a host's public directory.

Before any cloud setup, follow the [zero-cost deployment policy](COSTS.md). Installing the plugin does not authorize a paid plan or paid overages.
