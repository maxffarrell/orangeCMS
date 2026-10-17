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

Each CMS installation exposes its own Streamable HTTP endpoint at its origin plus `/mcp`. Anonymous access provides published content and explicitly public settings. Administrative access requires a site token; editing also requires its allow-edits permission. Create and revoke tokens at that site's `/admin/tokens`.

For Claude Code, [examples/claude-mcp.json](../examples/claude-mcp.json) is an optional connection template. From your application checkout, set `ORANGECMS_MCP_URL` to the intended endpoint and provide `ORANGECMS_MCP_TOKEN` through your shell's secret handling when administrative access is needed, then launch:

```sh
claude --mcp-config examples/claude-mcp.json
```

The template defaults to `http://localhost:5174/mcp`; ensure your development server uses that port or override the URL. The template is not auto-discovered or included in the plugin ZIP. Keep credentials outside committed files. Follow the client's [MCP configuration documentation](https://code.claude.com/docs/en/mcp) for persistent connections.

For Codex, configure a separate per-site HTTP MCP connection using its supported token environment/header settings. Connecting a remote site in ChatGPT is a different workflow from installing these skills. orangeCMS currently uses bearer tokens and does not implement OAuth discovery or authorization. ChatGPT's authenticated remote MCP workflow expects OAuth 2.1; a CMS token alone does not provide that integration. An installation would need a compatible OAuth integration before authenticated ChatGPT remote access works. See [OpenAI's authentication requirements](https://developers.openai.com/plugins/build/auth). Do not bypass authentication to enable editing.

## Release ZIP and verification

Download the plugin release under the GitHub tag [`plugin-v1.0.0`](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.0.0), with `orangecms-plugin.zip` as its downloadable asset. You can build the same minimal archive locally:

```sh
pnpm plugin:package
node --test scripts/plugin.test.mjs
```

The build prints a SHA-256 checksum and writes `dist/orangecms-plugin.zip`. It uses Node's standard library; archive verification tests require the standard `unzip` command. The ZIP contains only portable and Claude plugin manifests, MIT license, and skill resources. Application source, databases, migrations, environment files, MCP connection templates, and marketplace catalogs are excluded. Identical inputs produce identical ZIP bytes.

Use the repository marketplaces above for installation. A release ZIP is a distributable package, not proof of approval or listing in a host's public directory.
