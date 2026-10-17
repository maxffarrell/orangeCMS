<script lang="ts">
	import { enhance } from '$app/forms';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogMedia,
		AlertDialogTitle,
		AlertDialogTrigger
	} from '#lib/components/ui/alert-dialog/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		name: string;
		id?: number | string;
		action?: string;
		label?: string;
		iconOnly?: boolean;
		class?: string;
	}

	let {
		name,
		id,
		action = '?/delete',
		label = 'Delete',
		iconOnly = false,
		class: className
	}: Props = $props();

	let open = $state(false);
	let pending = $state(false);
</script>

<AlertDialog bind:open>
	<AlertDialogTrigger
		class={cn(
			buttonVariants({ variant: 'ghost', size: iconOnly ? 'icon-sm' : 'sm' }),
			'text-destructive/70 hover:bg-destructive/10 hover:text-destructive',
			className
		)}
		aria-label="{label} {name}"
	>
		<Trash2Icon />
		{#if !iconOnly}<span>{label}</span>{/if}
	</AlertDialogTrigger>
	<AlertDialogContent size="sm">
		<AlertDialogHeader>
			<AlertDialogMedia class="bg-destructive/10 text-destructive">
				<Trash2Icon />
			</AlertDialogMedia>
			<AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
			<AlertDialogDescription>
				This permanently removes it from the site. This can’t be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
			<form
				method="POST"
				{action}
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
						open = false;
					};
				}}
			>
				{#if id !== undefined}<input type="hidden" name="id" value={id} />{/if}
				<Button type="submit" variant="destructive" disabled={pending} class="w-full">
					{#if pending}<Spinner />{/if}
					Delete
				</Button>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
