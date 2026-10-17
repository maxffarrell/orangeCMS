---
name: orangecms
description: Discover, read, and manage an orangeCMS site's collections, entries, pages, forms, and settings through its connected MCP endpoint, using scoped access and previewed edits.
---

# Work with orangeCMS content

Use this skill for an existing site's content. Project installation and source-level route or template changes belong to the `orangecms-setup` skill when available, or the project's [setup documentation](https://github.com/maxffarrell/orangeCMS/blob/main/SETUP.md).

## Connect and discover

Use the site's `/mcp/authorized` Streamable HTTP endpoint for an OAuth connection. Use only the orangeCMS tools actually connected in the current client; discover their schemas rather than inventing a tool namespace. If no endpoint is connected, establish the intended site URL and configure a supported per-site HTTP MCP connection. Installing this skill alone does not connect a site or grant access.

OAuth opens the site's Cloudflare Access sign-in and consent screen. Both published client identity (CIMD) and dynamic client registration (**Register automatically** in Claude) are supported. Do not add a fixed `Authorization` header when using OAuth. Request `cms:read` for administrative reads; `cms:write` additionally permits edits and requires explicit consent. `offline_access` permits refresh tokens. Read is the default; do not request editing for read-only work. Revoke grants in the site’s **Connected apps** administration screen at `/admin/connections` and reconnect when changing permissions. This is the site's own login, not a central orangeCMS account.

The original `/mcp` endpoint still supports anonymous published content and allowlisted public settings. Existing bearer tokens from `/admin/tokens` unlock administrative reads; edits require their **allow edits** permission. The optional server `MCP_ADMIN_TOKEN` secret allows administrative reads only. API tokens and OAuth grants are revoked independently. Supply fixed tokens through the client's supported secret/header mechanism, never source files or content arguments. If OAuth discovery or login fails, report the missing configuration or client limitation; do not replace it with broader credentials or bypass Access. The site needs a configured `OAUTH_KV` binding and Access settings for hosted sign-in.

Discover collections with `list_collections`, then use `list_entries` and `get_entry` to inspect their schemas and values. `get_page`, `get_settings`, `list_forms`, and `get_form` cover other content. Administrative submission access remains redacted for sensitive answers. A denied request or unavailable tool is a connection/scope limitation; do not work around it with public routes or a different site's credentials.

## Make edits deliberately

Read the current object and the live tool input schema before writing. Available write tools include `save_collection`, `save_entry`, `save_page`, `save_settings`, and `save_form` when the connected token permits them.

1. Call the applicable write tool with `confirm` omitted or `false`. Inspect the returned target and field changes.
2. Match the preview to the user's requested outcome. Correct unintended changes first. If publication or another change exceeds the user's existing authorization, show the concrete preview and obtain that authorization.
3. Apply the reviewed change using the same arguments with `confirm: true`, within the user's authorized scope. Read back the saved object and verify public behavior if publication was requested. Do not ask again for authorization already provided.

`confirm: true` applies the submitted arguments; it is not an immutable preview ID. Re-read and preview again if the object or requested arguments change before applying. Edits are validated, rate-limited, and audited; report errors and do not treat a preview as a saved change.

Uploads use optional `FILES_KV` storage, configured separately from `OAUTH_KV`. Published media is copied into static assets; unpublished file previews still depend on KV. If a file is unavailable, check whether it is in the published inventory and whether dynamic storage is configured or quota-limited. Do not enable R2, a paid plan, or another fallback to complete a content edit.

Important data semantics:

- `save_collection.fields` replaces the field definitions. Retain existing definitions unless the user requested their removal.
- `save_entry.fields` replaces the custom values object. Preserve unrelated values. Omitted ordinary entry properties keep their current values.
- New entries default to active/published. Set `active: false` explicitly when creating a draft; use `active: true` only when publication is intended. Pages and settings do not provide the same draft toggle, so inspect the target route's visibility before applying.
- Content slugs identify stored objects; public URL mapping and navigation live in the site's source configuration. Creating a page or collection does not automatically add a public route. Report when source configuration changes are needed.
- Settings tools accept configured keys only. Public exposure is controlled separately by `site.publicSettings`; saving a value does not make an otherwise private key public.
- Form schema changes can alter validation and how responses are collected. Preserve existing field IDs and conditions when making a narrow change. Never copy personal submissions into page content, fixtures, or sample configuration.

For sites using static snapshots, a saved active record is eligible CMS content; it does not update the deployed snapshot. Explicit publication uses the project’s local `pnpm publish:static` workflow and a separate authorized deployment. Report a content save as saved, and claim live publication only after verifying the new deployed artifact. Failed exports retain the previous snapshot.

Summarize the actual saved objects, draft/published state where applicable, and any route or permission gap. For source changes, use the project's tests and production smoke suite before proposing publication; routine remote content edits can be verified by tool readback and the affected public URL.
