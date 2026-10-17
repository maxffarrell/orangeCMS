# Free-plan deployment requirements

This project’s deployment policy requires the Cloudflare **Workers Free plan**, including Free-plan KV. Verify the actual deployment account, product plans, and current usage before provisioning or activating remote resources. An account name, a local test, or an existing binding does not prove its plan. Do not upgrade plans, enable a paid service, or accept usage-based overages. If account billing cannot be verified, leave remote upload and OAuth storage unconfigured and report that limitation.

## Uploads and OAuth

Uploads use optional **`FILES_KV`** storage. OAuth uses separate optional **`OAUTH_KV`** storage and the existing D1 audit database. Neither requires R2, a paid identity provider, a Durable Object, or a central orangeCMS service. The maintained OAuth library is MIT licensed. The default configuration does not provision remote namespaces. Local tests use isolated local D1/KV.

Workers Free currently includes 100,000 KV reads per day; 1,000 writes, deletes, and list requests each per day; and 1 GB stored. These account allowances are shared across namespaces, including uploads, OAuth, and other applications. A single operation in the CMS can consume multiple KV operations. Free-plan limit excess causes operations to fail; paid-plan KV has usage-based overages. Verify current [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/), and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) before production changes.

Without `FILES_KV`, upload and file-serving routes are unavailable. Missing storage and quota failures return 503; application code does not fall back to R2 or enable paid services. Without `OAUTH_KV`, OAuth discovery and authenticated MCP are unavailable, while public MCP and API tokens remain usable. These application behaviors cannot verify or change the account’s billing plan.

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
