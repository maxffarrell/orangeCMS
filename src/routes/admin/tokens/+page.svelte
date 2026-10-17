<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import {
		AdminPageHeader,
		AdminSection,
		AuditLog,
	} from '#lib/components/ui-customized/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import {
		Table,
		TableHeader,
		TableBody,
		TableRow,
		TableHead,
		TableCell,
	} from '#lib/components/ui/table/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const created = $derived(form && 'created' in form ? form.created : null);
	const errorMessage = $derived(form && 'error' in form ? form.error : null);
	const headClass =
		'text-[0.58rem] tracking-[0.25em] uppercase text-text-light';

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied');
		} catch {
			toast.error('Copy failed — select and copy manually');
		}
	}
</script>

<svelte:head><title>API Tokens — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-4xl">
	<AdminPageHeader
		eyebrow="Integrations"
		title="API Tokens"
		description="Bearer tokens that unlock the admin tools on the MCP server (view form responses, and — for tokens with edit access — change collections, entries, pages, settings and forms) for Claude Code and other API clients."
	/>

	{#if !data.ready}
		<Alert variant="destructive" class="mb-6">
			<AlertDescription
				>Token storage isn't set up yet. Apply <code
					>migrations/0005_api_tokens.sql</code
				>
				and <code>migrations/0007_token_scopes_audit.sql</code> to the database.</AlertDescription
			>
		</Alert>
	{/if}
	{#if errorMessage}
		<Alert variant="destructive" class="mb-6"
			><AlertDescription>{errorMessage}</AlertDescription></Alert
		>
	{/if}

	{#if created}
		<Alert class="mb-6 border-gold/50">
			<AlertDescription>
				<p class="mb-2 font-medium text-heading">
					Copy your new token now — it won't be shown again.
				</p>
				<div class="flex items-center gap-2">
					<code
						class="min-w-0 flex-1 break-all rounded bg-cream-dark px-3 py-2 font-mono text-[0.78rem] text-heading"
						>{created}</code
					>
					<Button
						type="button"
						variant="outline-dark"
						size="sm"
						onclick={() => copy(created)}
					>
						<CopyIcon data-icon="inline-start" /> Copy
					</Button>
				</div>
				<p class="mt-3 text-[0.78rem] text-text-mid">
					Add it to Claude Code: <code class="font-mono"
						>claude mcp add --transport http {site.mcpName}
						{data.mcpUrl} --header "Authorization: Bearer {created}"</code
					>
				</p>
			</AlertDescription>
		</Alert>
	{/if}

	<div class="flex flex-col gap-5">
		<AdminSection title="Create token">
			<form
				method="POST"
				action="?/create"
				use:enhance
				class="flex flex-wrap items-end gap-3"
			>
				<div class="min-w-64 flex-1">
					<Label for="name">Name</Label>
					<Input
						id="name"
						name="name"
						type="text"
						required
						maxlength={80}
						placeholder="e.g. Claude Code on my laptop"
					/>
				</div>
				<div class="flex w-full items-start gap-2">
					<Checkbox id="can_write" name="can_write" value="on" class="mt-0.5" />
					<Label
						for="can_write"
						class="items-start text-[0.8rem] leading-snug font-normal text-text-mid"
					>
						Allow edits. Leave off for a read-only token. Edit tools preview
						changes first, are limited to 30 applied edits per hour, and every
						edit is logged below.
					</Label>
				</div>
				<Button variant="gold" type="submit" disabled={!data.ready}
					>Generate token</Button
				>
			</form>
			<p class="mt-3 text-[0.75rem] text-text-light">
				Server address: <code class="font-mono">{data.mcpUrl}</code>. Only a
				hash of each token is stored.
			</p>
		</AdminSection>

		<AdminSection title="Your tokens" contentClass="p-0">
			{#if data.tokens.length === 0}
				<p class="px-6 py-8 text-center text-[0.85rem] text-text-light">
					No tokens yet.
				</p>
			{:else}
				<Table class="w-full">
					<TableHeader>
						<TableRow>
							<TableHead class="pl-6 {headClass}">Name</TableHead>
							<TableHead class="hidden sm:table-cell {headClass}"
								>Token</TableHead
							>
							<TableHead class="hidden md:table-cell {headClass}"
								>Last used</TableHead
							>
							<TableHead class="pr-6 {headClass}"
								><span class="sr-only">Actions</span></TableHead
							>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each data.tokens as t (t.id)}
							<TableRow>
								<TableCell class="pl-6 whitespace-normal">
									<div class="text-[0.88rem] text-heading">{t.name}</div>
									<div class="font-mono text-[0.7rem] text-text-light">
										created {t.created_at} UTC · {t.can_write
											? 'read + edit'
											: 'read-only'}
									</div>
								</TableCell>
								<TableCell
									class="hidden sm:table-cell font-mono text-[0.78rem] text-text-mid"
									>{t.prefix}…</TableCell
								>
								<TableCell
									class="hidden md:table-cell font-mono text-[0.75rem] text-text-light"
									>{t.last_used_at ?? 'never'}</TableCell
								>
								<TableCell class="pr-6 text-right">
									{#if t.revoked_at}
										<Badge variant="secondary">Revoked</Badge>
									{:else}
										<form
											method="POST"
											action="?/revoke"
											use:enhance
											class="inline"
										>
											<input type="hidden" name="id" value={t.id} />
											<Button
												type="submit"
												variant="ghost"
												size="sm"
												class="text-text-mid hover:text-red-500">Revoke</Button
											>
										</form>
									{/if}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</AdminSection>

		<AdminSection
			title="Recent edits via API"
			description="Every edit applied through the MCP tools, newest first. Expand an entry to see what changed."
			contentClass="p-0"
		>
			<AuditLog entries={data.audit} />
		</AdminSection>
	</div>
</div>
