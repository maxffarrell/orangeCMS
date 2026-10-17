<script lang="ts">
	import { formsHref } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminSection } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import FileDropZone from '#lib/components/FileDropZone.svelte';
	import FormBuilder from '#lib/components/FormBuilder.svelte';
	import type { Form, FormSchema } from '#lib/server/db.js';

	interface Props {
		form?: Form | null;
		schema?: FormSchema | null;
	}
	let { form = null, schema = null }: Props = $props();

	const creating = untrack(() => !form);
	let saving = $state(false);
	let online = $state(untrack(() => (creating ? true : !!schema)));
	let featured = $state(untrack(() => form?.featured === 1));
	let accepting = $state(
		untrack(() => (schema ? schema.accepting === 1 : true)),
	);
	let title = $state(untrack(() => form?.title ?? ''));
	let description = $state(untrack(() => form?.description ?? ''));
	let sortOrder = $state(untrack(() => String(form?.sort_order ?? 0)));
	let submitLabel = $state(untrack(() => schema?.submit_label ?? ''));
	let successMessage = $state(untrack(() => schema?.success_message ?? ''));
	const slug = untrack(() => schema?.slug ?? '');
</script>

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			await update({ reset: false });
			if (result.type === 'success') toast.success('Form saved successfully.');
			else if (result.type === 'failure')
				toast.error(
					(result.data as Record<string, string>)?.error ??
						'Something went wrong.',
				);
		};
	}}
	class="flex flex-col gap-5"
>
	<AdminSection title="Form Details">
		<div class="flex flex-col gap-4">
			<div>
				<Label for="title"
					>Title {#if creating}<span
							class="text-red-400 normal-case tracking-normal font-body">*</span
						>{/if}</Label
				>
				<Input
					id="title"
					name="title"
					type="text"
					bind:value={title}
					required
					placeholder="e.g. Contact Request"
				/>
			</div>
			<div>
				<Label for="description">Description</Label>
				<Input
					id="description"
					name="description"
					type="text"
					bind:value={description}
					placeholder="Short description shown on the forms page"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Label>Form type</Label>
				<input
					type="hidden"
					name="mode"
					value={online ? 'online' : 'download'}
				/>
				<div class="flex items-center gap-3">
					<Switch bind:checked={online} id="mode-online" />
					<Label
						for="mode-online"
						class="mb-0 normal-case tracking-normal text-[0.85rem]"
					>
						{online
							? 'Online form — visitors fill it in on the website'
							: 'Download only — visitors download a PDF'}
					</Label>
				</div>
			</div>
			<FileDropZone
				name="file_path"
				value={form?.file_path ?? ''}
				accept="application/pdf"
				prefix="forms/"
				label={online ? 'Printable PDF (optional)' : 'PDF File *'}
			/>
		</div>
	</AdminSection>

	{#if online}
		<AdminSection
			title="Questions"
			description="Choose an input type for each question. Visitors see them in this order."
		>
			<FormBuilder fields={schema?.fields ?? []} />
		</AdminSection>

		<AdminSection title="Online Form Settings">
			<div class="flex flex-col gap-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<Label for="slug">URL slug</Label>
						<div
							class="flex items-center gap-1 font-mono text-[0.8rem] text-text-light"
						>
							<Input
								id="slug"
								name="slug"
								type="text"
								value={slug}
								placeholder="auto from title"
								class="font-mono text-[0.85rem]"
							/>
						</div>
					</div>
					<div>
						<Label for="submit_label">Submit button text</Label>
						<Input
							id="submit_label"
							name="submit_label"
							type="text"
							bind:value={submitLabel}
							placeholder="Submit"
							maxlength={60}
						/>
					</div>
				</div>
				<div>
					<Label for="success_message">Confirmation message</Label>
					<Textarea
						id="success_message"
						name="success_message"
						bind:value={successMessage}
						rows={3}
						placeholder="Shown after a visitor submits the form"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label>Accepting responses</Label>
					<input type="hidden" name="accepting" value={accepting ? '1' : '0'} />
					<div class="flex items-center gap-3">
						<Switch bind:checked={accepting} />
						<span class="text-[0.82rem] text-text-mid"
							>{accepting
								? 'Open'
								: 'Closed — the form is shown but cannot be submitted'}</span
						>
					</div>
				</div>
			</div>
		</AdminSection>
	{/if}

	<AdminSection title="Display">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<Label for="sort_order">Sort Order</Label>
				<Input
					id="sort_order"
					name="sort_order"
					type="number"
					bind:value={sortOrder}
					min="0"
					class="font-mono text-[0.88rem]"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Label>Featured</Label>
				<input type="hidden" name="featured" value={featured ? '1' : '0'} />
				<div class="flex items-center gap-3">
					<Switch bind:checked={featured} />
					<span class="text-[0.82rem] text-text-mid"
						>{featured ? 'Featured' : 'Standard'}</span
					>
				</div>
			</div>
		</div>
	</AdminSection>

	<div
		class="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-cream-dark bg-cream/90 px-1 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
	>
		<Button variant="gold" type="submit" disabled={saving}>
			{#if saving}<Spinner class="mr-1.5" />{/if}
			{saving ? 'Saving…' : creating ? 'Create Form' : 'Save Changes'}
		</Button>
		<Button
			variant="ghost"
			href="/admin/forms"
			class="text-text-light hover:text-heading">Cancel</Button
		>
		{#if !creating && schema && formsHref(schema.slug)}
			<Button
				variant="ghost"
				href={formsHref(schema.slug) ?? undefined}
				target="_blank"
				class="ml-auto text-text-light hover:text-heading">View live</Button
			>
		{/if}
	</div>
</form>
