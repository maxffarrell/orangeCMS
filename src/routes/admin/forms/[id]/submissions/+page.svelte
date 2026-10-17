<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { AdminPageHeader, ConfirmDelete } from '#lib/components/ui-customized/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#lib/components/ui/empty/index.js';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import LockIcon from '@lucide/svelte/icons/lock';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { formatAnswer } from '#lib/forms.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// Sensitive values stay masked until an admin deliberately reveals them.
	let revealed = $state<Record<string, boolean>>({});
</script>

<svelte:head><title>Responses — {data.form?.title} — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-4xl">
	<AdminPageHeader
		title="Responses"
		meta="{data.submissions.length} {data.submissions.length === 1 ? 'response' : 'responses'}"
		breadcrumbs={[
			{ label: 'Admin', href: '/admin' },
			{ label: 'Forms', href: '/admin/forms' },
			{ label: data.form?.title ?? 'Form', href: `/admin/forms/${data.form?.id}` },
			{ label: 'Responses' }
		]}
	/>

	{#if data.submissions.length === 0}
		<Empty class="border border-dashed border-cream-dark py-16">
			<EmptyHeader>
				<EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
				<EmptyTitle class="font-display text-[1.3rem] italic font-light">No responses yet</EmptyTitle>
				<EmptyDescription>Submissions from the public form will appear here.</EmptyDescription>
			</EmptyHeader>
		</Empty>
	{/if}

	<div class="flex flex-col gap-4">
		{#each data.submissions as s (s.id)}
			<Card class="rounded-xl shadow-none ring-0 border {s.is_read ? 'border-cream-dark' : 'border-gold/50'} bg-card py-0 gap-0">
				<CardContent class="p-5">
					<div class="mb-3 flex flex-wrap items-center gap-3">
						<span class="font-mono text-[0.75rem] text-text-light">{s.created_at} UTC</span>
						{#if !s.is_read}<Badge>New</Badge>{/if}
						<div class="ml-auto flex items-center gap-1">
							<Button variant="ghost" size="sm" href="/admin/forms/{data.form?.id}/submissions/{s.id}/export" class="text-text-mid hover:text-heading" data-sveltekit-reload>
								<DownloadIcon data-icon="inline-start" /> Export
							</Button>
							<form method="POST" action="?/read" use:enhance>
								<input type="hidden" name="id" value={s.id} />
								<input type="hidden" name="read" value={s.is_read ? '0' : '1'} />
								<Button type="submit" variant="ghost" size="sm" class="text-text-mid hover:text-heading">
									Mark {s.is_read ? 'unread' : 'read'}
								</Button>
							</form>
							<ConfirmDelete id={s.id} name="this response" iconOnly />
						</div>
					</div>
					<dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
						{#each s.answers as a}
							<dt class="text-[0.72rem] tracking-[0.04em] text-text-light">{a.label}</dt>
							<dd class="text-[0.88rem] text-heading whitespace-pre-wrap break-words">
								{#if a.sensitive && !revealed[`${s.id}:${a.key}`]}
									<span class="inline-flex items-center gap-2">
										<LockIcon class="size-3.5 text-text-light" /> <span class="tracking-widest">••••••••</span>
										<Button type="button" variant="ghost" size="xs" onclick={() => (revealed[`${s.id}:${a.key}`] = true)}>Show</Button>
									</span>
								{:else}
									{formatAnswer(a.value)}
								{/if}
							</dd>
						{/each}
					</dl>
				</CardContent>
			</Card>
		{/each}
	</div>
</div>
