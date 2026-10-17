<script lang="ts">
	import { site } from '#lib/site.js';
	import { AdminPageHeader } from '#lib/components/ui-customized/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
</script>

<svelte:head><title>Connected apps — {site.adminName}</title></svelte:head>

<div class="max-w-4xl px-4 py-10 sm:px-6 lg:px-12">
	<AdminPageHeader
		eyebrow="Integrations"
		title="Connected apps"
		description="Applications you authorized to use this site through OAuth."
	/>
	<p class="mb-6 text-sm text-text-light">
		Connect a client using <code class="break-all">{data.mcpUrl}</code>. Read
		access is the default; editing requires your explicit consent. API tokens
		are managed separately under
		<a class="underline" href="/admin/tokens">API Tokens</a>.
	</p>
	{#if !data.ready}<p class="mb-6 rounded-lg border p-4" role="status">
			OAuth is unavailable. Configure this installation’s OAuth storage and
			sign-in to connect applications.
		</p>{/if}
	{#if data.error || form?.error}<p
			class="mb-6 rounded-lg border border-red-300 p-4 text-red-800"
			role="alert"
		>
			{form?.error || data.error}
		</p>{/if}
	{#if form?.revoked}<p class="mb-6 rounded-lg border p-4" role="status">
			Application access revoked.
		</p>{/if}
	{#if data.ready && data.grants.length === 0}<p class="text-text-light">
			No connected applications on this page.
		</p>{/if}
	<div class="space-y-4">
		{#each data.grants as grant (grant.id)}
			<article class="rounded-xl border bg-white/60 p-5">
				<h2 class="break-words text-lg font-semibold">{grant.name}</h2>
				<p class="mt-1 text-xs text-text-light">
					Application names are supplied by their clients.
				</p>
				<p class="mt-3 text-sm">
					{grant.scope.includes('cms:write')
						? 'Read and edit'
						: 'Read only'}{grant.scope.includes('offline_access')
						? ' · Can stay connected'
						: ''}
				</p>
				<p class="mt-2 text-sm text-text-light">
					Connected {date(grant.createdAt)}. {grant.expiresAt
						? `Grant expires ${date(grant.expiresAt)}.`
						: 'No grant expiration recorded.'}
				</p>
				{#if grant.redirectUri}<p
						class="mt-2 break-all text-xs text-text-light"
					>
						Callback: {grant.redirectUri}
					</p>{/if}
				<form method="POST" action="?/revoke" class="mt-4">
					<input type="hidden" name="id" value={grant.id} />
					<Button
						type="submit"
						variant="outline"
						aria-label={`Revoke access for ${grant.name}`}>Revoke access</Button
					>
				</form>
			</article>
		{/each}
	</div>
	{#if data.cursor}<a
			class="mt-6 inline-block underline"
			href={`?cursor=${encodeURIComponent(data.cursor)}`}>Next page</a
		>{/if}
</div>
