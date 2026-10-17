<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminPageHeader, AdminSection } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let saving = $state(false);
	let phone = $state(untrack(() => data.settings?.phone ?? ''));
	let email = $state(untrack(() => data.settings?.email ?? ''));
	let address = $state(untrack(() => data.settings?.address ?? ''));
	let memberships = $state(untrack(() => data.settings?.memberships ?? ''));
</script>

<svelte:head><title>Settings — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-2xl">
	<AdminPageHeader eyebrow="Configuration" title="Settings" description="Contact info used across the site and via template variables in Markdown." />

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update({ reset: false });
				if (result.type === 'success') toast.success('Settings saved successfully.');
				else if (result.type === 'failure') toast.error((result.data as Record<string, string>)?.error ?? 'Something went wrong.');
			};
		}}
		class="flex flex-col gap-5"
	>
		<AdminSection title="Contact Information">
				<div class="flex flex-col gap-5">
					<div>
						<Label for="phone">
							Phone
							<code class="ml-2 bg-cream-dark px-1.5 py-0.5 rounded text-heading normal-case tracking-normal font-mono text-[0.78em]">{'{PHONE}'}</code>
						</Label>
						<Input id="phone" name="phone" type="tel" bind:value={phone} placeholder="+1 (555) 000-0000" />
					</div>
					<div>
						<Label for="email">
							Email
							<code class="ml-2 bg-cream-dark px-1.5 py-0.5 rounded text-heading normal-case tracking-normal font-mono text-[0.78em]">{'{EMAIL}'}</code>
						</Label>
						<Input id="email" name="email" type="email" bind:value={email} placeholder="hello@example.test" />
					</div>
					<div>
						<Label for="address">
							Address
							<code class="ml-2 bg-cream-dark px-1.5 py-0.5 rounded text-heading normal-case tracking-normal font-mono text-[0.78em]">{'{ADDRESS}'}</code>
						</Label>
						<Input id="address" name="address" type="text" bind:value={address} placeholder="123 Main St, City, State" />
					</div>
				</div>
			</AdminSection>

		<AdminSection title="Memberships">
				<Label for="memberships">Membership Organizations</Label>
				<Textarea
					id="memberships"
					name="memberships"
					rows={4}
					bind:value={memberships}
					placeholder="Member associations and accreditations"
					class="mt-1"
				/>
				<p class="mt-2.5 text-[0.7rem] text-text-light">Displayed in the footer and memberships bar on the homepage. Comma-separated.</p>
			</AdminSection>

		<div class="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-cream-dark bg-cream/90 px-1 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
			<Button variant="gold" type="submit" disabled={saving}>
				{#if saving}<Spinner class="mr-1.5" />{/if}
				{saving ? 'Saving…' : 'Save Settings'}
			</Button>
		</div>
	</form>
</div>
