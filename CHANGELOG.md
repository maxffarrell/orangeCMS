# Changelog

CMS source releases use `cms-v*` tags. Agent plugin releases use `plugin-v*` tags
and have an independent version; installing the plugin does not update a deployed CMS.

## CMS 1.1.0 — 2026-11-07

Changes since `plugin-v1.3.0` (2026-10-17).

### Fixed

- **OAuth consent submission:** keep the consent page's referrer policy at
  `same-origin`, preventing browsers from sending an opaque origin that SvelteKit
  rejects as a cross-site POST when the administrator clicks Connect.
  ([#6](https://github.com/maxffarrell/orangeCMS/pull/6))
- **OAuth callback redirects:** allow the validated client's callback origin (or
  native application scheme) in the consent page's CSP `form-action`. Connect and
  Cancel can now redirect to the client; a first click no longer silently consumes
  consent and leaves a second click failing as already used.
  ([#8](https://github.com/maxffarrell/orangeCMS/pull/8))
- **OAuth failure explanations:** show the library's escaped rejection reason to
  the signed-in administrator and log rejected or failed consent requests, making
  expired, reused, browser-unbound, or otherwise invalid requests diagnosable.
  ([#7](https://github.com/maxffarrell/orangeCMS/pull/7))
- **Static publication:** capture anonymous SvelteKit navigation data even when
  the framework marks it `private, no-store`. HTML validation remains strict;
  navigation responses with load errors are rejected and a failed export preserves
  the previous approved snapshot. Added unit and compiled Worker smoke coverage.
  ([47c381b](https://github.com/maxffarrell/orangeCMS/commit/47c381b5895f7454311182fa5af6db2f16f52947))

### Runtime and dependencies

- **Upgrade prerequisite:** Node.js **26.12.1 or newer within the 26.x line** is
  now required, replacing the previous Node.js 22.17+ requirement. The repository
  pins 26.12.1 and enforces the supported range through package engines, strict
  engine checks, and a preinstall check. This change addresses CVE-2026-111497.
  Upgrade local and CI Node runtimes before installing dependencies; use pnpm
  12 or newer (the repository pins 12.4.1).
  ([#3](https://github.com/maxffarrell/orangeCMS/pull/3))
- Updated Vite from 8.3.2 to 8.3.3 and refreshed the dependency lockfile.
  ([#4](https://github.com/maxffarrell/orangeCMS/pull/4))

### Upgrade and validation

- Update the CMS source in each installation and build/deploy through that
  installation's existing deployment flow. Publishing this release does not
  deploy consumer sites. Static snapshots still require explicit publication.
- This release adds no database migrations. Preserve existing data, migration
  history, site configuration, and secrets when adopting the source changes.
- Agent plugin manifests and skills remain at **1.3.0**; no new plugin ZIP is
  needed for these runtime fixes.
- The complete source CI suite passed on `e5bc8155bc2b0b6efe9cf15cc2ba22e6c504b23d`:
  public-source audit, unit tests, Svelte typechecking, production Worker smoke
  tests with local D1/KV, configurable-route fixtures, and plugin packaging.
  [CI run](https://github.com/maxffarrell/orangeCMS/actions/runs/42388436623).

[Full source comparison](https://github.com/maxffarrell/orangeCMS/compare/plugin-v1.3.0...cms-v1.1.0)

## Earlier agent plugin releases

Their original release notes remain available:

- [1.3.0](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.3.0):
  verified static-publication guidance, backend-outage behavior, and cost controls.
- [1.2.0](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.2.0):
  KV-only uploads, offline migration preparation, and updated setup/content skills.
- [1.1.1](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.1.1):
  Workers Free verification and zero-cost setup policy.
- [1.1.0](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.1.0):
  per-site OAuth for remote MCP clients and connected-app permissions/revocation.
- [1.0.0](https://github.com/maxffarrell/orangeCMS/releases/tag/plugin-v1.0.0):
  initial installable agent skills and portable/Claude plugin packaging.
