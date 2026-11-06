<script lang="ts">
	import { AdminPageHeader, AdminSection } from '#lib/components/ui-customized/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Connect an app — CMS</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-2xl">
	<AdminPageHeader eyebrow="Integrations" title="Connect an app" description="An app is asking to connect to this site's content tools." />

	{#if data.error}
		<Alert variant="destructive"><AlertDescription>{data.error}</AlertDescription></Alert>
	{:else}
		<AdminSection title="Allow {data.appName}?">
			<p class="text-[0.9rem] text-text-mid">
				<strong class="text-heading">{data.appName}</strong> will be able to:
			</p>
			<ul class="mt-3 list-disc space-y-1 pl-5 text-[0.85rem] text-text-mid">
				<li>read this site's content and, for admins, form responses (sensitive answers stay hidden)</li>
				<li>edit content through the MCP tools: changes are previewed first, applied only on confirmation, limited to 30 per hour, and logged under API Tokens</li>
			</ul>
			<p class="mt-3 break-all text-[0.78rem] text-text-mid">The app's name is chosen by the app itself. After you approve, you will be sent back to: <span class="font-mono">{data.redirectUri}</span></p>
			{#if data.loopback}
				<Alert variant="destructive" class="mt-3"><AlertDescription>This address is a program running on your own computer. Approve only if you just started connecting an app from this computer.</AlertDescription></Alert>
			{/if}
			<p class="mt-3 text-[0.78rem] text-text-light">You can disconnect it at any time under API Tokens → Connected apps. Only approve apps you started connecting yourself.</p>
			<form method="POST" class="mt-6 flex gap-3">
				<Button type="submit" name="decision" value="approve" variant="gold">Allow access</Button>
				<Button type="submit" name="decision" value="deny" variant="outline">Cancel</Button>
			</form>
		</AdminSection>
	{/if}
</div>
