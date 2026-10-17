<script lang="ts">
	import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#lib/components/ui/accordion/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#lib/components/ui/empty/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import { ToggleGroup, ToggleGroupItem } from '#lib/components/ui/toggle-group/index.js';
	import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#lib/components/ui/tooltip/index.js';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import type { AuditChange, AuditView } from '#lib/audit.js';

	let { entries }: { entries: AuditView[] } = $props();

	let filter = $state('all');
	const kinds = $derived([...new Map(entries.map((e) => [e.kind, e.label])).entries()]);
	const shown = $derived(filter === 'all' ? entries : entries.filter((e) => e.kind === filter));

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	function ago(iso: string): string {
		const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
		const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
		for (const [unit, size] of steps) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
		return 'just now';
	}
	const full = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const clip = (v: string) => (v.length > 600 ? `${v.slice(0, 600)}…` : v);
</script>

{#snippet diff(changes: AuditChange[])}
	<dl class="divide-y text-[0.78rem]">
									{#each changes as c (c.field)}
										<div class="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr]">
											<dt class="font-mono text-[0.72rem] text-text-light">{c.field}</dt>
											<dd class="min-w-0 space-y-1 break-words">
												{#if c.from && c.from !== 'null'}
													<p class="rounded bg-destructive/10 px-2 py-1 text-destructive line-through decoration-destructive/40">{clip(c.from)}</p>
												{/if}
												<p class="rounded bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-400">{clip(c.to) || '(empty)'}</p>
											</dd>
										</div>
									{/each}
								</dl>
{/snippet}

{#if entries.length === 0}
	<Empty class="py-10">
		<EmptyHeader>
			<EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia>
			<EmptyTitle>No edits yet</EmptyTitle>
			<EmptyDescription>Changes made through the MCP edit tools will be recorded here, with what changed and which token made them.</EmptyDescription>
		</EmptyHeader>
	</Empty>
{:else}
	<div class="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
		<ToggleGroup type="single" variant="outline" size="sm" bind:value={filter} aria-label="Filter by content type">
			<ToggleGroupItem value="all">All</ToggleGroupItem>
			{#each kinds as [kind, label] (kind)}
				<ToggleGroupItem value={kind}>{label}</ToggleGroupItem>
			{/each}
		</ToggleGroup>
		<span class="text-[0.72rem] text-text-light">{shown.length} of {entries.length} recent edits</span>
	</div>

	<TooltipProvider delayDuration={150}>
		<Accordion type="multiple" class="divide-y">
			{#each shown as e (e.id)}
				<AccordionItem value={String(e.id)} class="border-0">
					<AccordionTrigger class="items-center gap-3 px-6 py-3 hover:no-underline">
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
							<Badge variant={e.created ? 'default' : 'secondary'}>{e.created ? 'Created' : 'Updated'} {e.label.toLowerCase()}</Badge>
							<span class="min-w-0 truncate text-[0.88rem] text-heading">{e.name}</span>
						</div>
						<div class="hidden shrink-0 items-center gap-3 text-[0.72rem] font-normal text-text-light sm:flex">
							<span>{e.token}</span>
							<Tooltip>
								<TooltipTrigger class="cursor-default tabular-nums">{ago(e.at)}</TooltipTrigger>
								<TooltipContent>{full(e.at)}</TooltipContent>
							</Tooltip>
						</div>
					</AccordionTrigger>
					<AccordionContent class="px-6 pb-4">
						<p class="mb-3 text-[0.72rem] text-text-light sm:hidden">{e.token} · {ago(e.at)}</p>
						{#if e.changes.length === 0}
							<p class="text-[0.8rem] text-text-light">{e.truncated ? 'This change was too long to store in full, so its details are not available.' : 'No field details were recorded.'}</p>
						{:else}
							{#if e.changes.length > 4}
								<ScrollArea class="h-72 rounded-md border">{@render diff(e.changes)}</ScrollArea>
							{:else}
								<div class="rounded-md border">{@render diff(e.changes)}</div>
							{/if}
							{#if e.truncated}<p class="mt-2 text-[0.7rem] text-text-light">This entry was too long to store in full; later fields are not shown.</p>{/if}
						{/if}
					</AccordionContent>
				</AccordionItem>
			{/each}
		</Accordion>
	</TooltipProvider>
{/if}
