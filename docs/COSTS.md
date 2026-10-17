# Free-plan deployment requirements

This project’s deployment policy requires the Cloudflare **Workers Free plan**, including Free-plan KV. Verify the actual deployment account, product plans, and current usage before provisioning or activating remote resources. An account name, a local test, or an existing binding does not prove its plan. Do not upgrade plans, enable a paid service, or accept usage-based overages. If account billing cannot be verified, leave remote upload and OAuth storage unconfigured and report that limitation.

## Uploads and OAuth

Uploads use optional **`FILES_KV`** storage. OAuth uses separate optional **`OAUTH_KV`** storage and the existing D1 audit database. Neither requires R2, a paid identity provider, a Durable Object, or a central orangeCMS service. The maintained OAuth library is MIT licensed. The default configuration does not provision remote namespaces. Local tests use isolated local D1/KV.

Workers Free currently includes 100,000 KV reads per day; 1,000 writes, deletes, and list requests each per day; and 1 GB stored. These account allowances are shared across namespaces, including uploads, OAuth, and other applications. A single operation in the CMS can consume multiple KV operations. Free-plan limit excess causes operations to fail; paid-plan KV has usage-based overages. Verify current [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/), and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) before production changes.

Without `FILES_KV`, uploads and dynamic file previews are unavailable; published media already copied into Static Assets remains independent of KV. Missing storage and quota failures return 503; application code does not fall back to R2 or enable paid services. Without `OAUTH_KV`, OAuth discovery and authenticated MCP are unavailable, while public MCP and API tokens remain usable. These application behaviors cannot verify or change the account’s billing plan.

Free quotas trade availability for a billing ceiling on that product and plan. They do not establish that an entire existing account has no charges. Check [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and existing Access, email, domain, build, storage, and other subscriptions before making a whole-account claim. Do not silently enable paid overages to keep a site available.

## Retiring an existing R2 bucket

R2 has a free allowance plus billable storage and operations, rather than the required hard-capped Free-plan model. Removing its Worker binding does **not** stop storage charges or disable direct public bucket URLs. Existing buckets need a separate retirement process; changing source configuration is not evidence that a live bucket has been migrated or deleted. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

1. Verify access to the correct deployment account and enumerate the complete live bucket, following pagination. Record keys, sizes, content types, and available integrity metadata; include other bucket state that can retain storage, such as unfinished multipart uploads.
2. Export every live object to a protected backup. Verify counts, bytes, and cryptographic hashes against retrieved objects. A local snapshot or a known subset is not proof that the live inventory is complete.
3. Import into the chosen verified Free-plan destination, preserving keys and content types. Read back every imported object and compare its hash. Test the deployed CMS’s file URLs and upload behavior after cutover. Reconcile changes made during migration before calling it complete.
4. Obtain explicit approval for the concrete deletion set after the verified inventory and backups are reviewable. Retire public endpoints and delete the approved objects and bucket, accounting for retained uploads or other storage state. Confirm the remote result and account billing separately. Do not delete data solely to avoid a possible bill.

If account access, inventory, backup verification, or destination readback is unavailable, report migration and retirement as incomplete. Do not claim zero existing R2 charges or public-access removal from local code or tests.

## Connected build services

A source push can trigger an existing Cloudflare Workers Builds integration. Free includes a hard build-minute quota, while Paid can bill excess build minutes. Verify the deployment account's plan and build usage before pushing a connected consumer branch under a strict zero-cost requirement. If verification is unavailable, keep the reviewed consumer changes local and leave its PR in draft; do not trigger a potentially billable build. Generic source publication without a Cloudflare integration does not provision Cloudflare resources. See [Workers Builds pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

## Static publication and outage behavior

Published public pages and copied media can be served as Cloudflare Workers Static Assets, avoiding per-visit D1/KV reads. Requests served directly as static assets are free and unlimited, with no additional asset-storage charge. Requests that invoke the Worker still use Workers quotas and pricing. See [Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

Keep public snapshot paths asset-first. A broad `run_worker_first` rule would invoke the Worker for those requests and can make them fail at the Free Worker request limit even when an asset exists. Reserve Worker-first routing for dynamic backend paths. A successful outage test must use the actual asset routing configuration, not only a development server’s cache.

Publishing locally can read the configured source to render pages and copy media; it does not make those source reads free of quota usage. Deployment and connected builds have their own account limits. Stay on verified Free plans; this project provides no account-wide spending-cap switch. Cloudflare [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) send notifications when a spend threshold is crossed; they are informational and do not stop services or prevent paid overages. Previously created R2 buckets or other subscriptions require separate retirement and verification.
