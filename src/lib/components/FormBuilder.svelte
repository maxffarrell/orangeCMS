<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { NativeSelect, NativeSelectOption } from '#lib/components/ui/native-select/index.js';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import LockIcon from '@lucide/svelte/icons/lock';
	import {
		CHOICE_TYPES,
		FIELD_TYPES,
		FIELD_TYPE_LABELS,
		slugifyKey,
		type FieldType,
		type FormField
	} from '#lib/forms.js';

	interface Props {
		/** Hidden input name that receives the serialized field list. */
		name?: string;
		fields: FormField[];
	}
	let { name = 'fields', fields: initial }: Props = $props();

	// Editable copy. Options are edited as one-per-line text and keys stay stable
	// once a field is saved so existing submissions keep matching their questions.
	interface Item {
		uid: number;
		key: string;
		keyTouched: boolean;
		type: FieldType;
		label: string;
		required: boolean;
		placeholder: string;
		help: string;
		optionsText: string;
		half: boolean;
		showField: string;
		showEquals: string;
		sensitive: boolean;
		range: '' | 'past' | 'future';
	}

	let uid = 0;
	const toItem = (f: FormField, saved: boolean): Item => ({
		uid: ++uid,
		key: f.key,
		keyTouched: saved,
		type: f.type,
		label: f.label,
		required: !!f.required,
		placeholder: f.placeholder ?? '',
		help: f.help ?? '',
		optionsText: (f.options ?? []).join('\n'),
		half: f.width === 'half',
		showField: f.showIf?.field ?? '',
		showEquals: f.showIf?.equals ?? '',
		sensitive: !!f.sensitive,
		range: f.range ?? ''
	});

	let items = $state<Item[]>(untrack(() => initial.map((f) => toItem(f, true))));
	let newType = $state<FieldType>('text');
	let open = $state<number | null>(null);

	const serialized = $derived(
		JSON.stringify(
			items.map((i) => {
				const f: FormField = { key: i.key, type: i.type, label: i.label };
				if (i.type !== 'heading') {
					if (i.required) f.required = true;
					if (i.placeholder) f.placeholder = i.placeholder;
					if (i.half) f.width = 'half';
				}
				if (i.help) f.help = i.help;
				if (i.sensitive && i.type !== 'heading') f.sensitive = true;
				if (i.type === 'date' && i.range) f.range = i.range;
				if (CHOICE_TYPES.includes(i.type)) {
					f.options = i.optionsText.split('\n').map((o) => o.trim()).filter(Boolean);
				}
				if (i.showField && i.showEquals) f.showIf = { field: i.showField, equals: i.showEquals };
				return f;
			})
		)
	);

	function uniqueKey(label: string, self?: Item): string {
		const base = slugifyKey(label || 'field');
		let key = base;
		for (let n = 2; items.some((i) => i !== self && i.key === key); n++) key = `${base.slice(0, 36)}_${n}`;
		return key;
	}

	function add() {
		const item = toItem(
			{ key: '', type: newType, label: newType === 'heading' ? 'New section' : 'New question' },
			false
		);
		item.key = uniqueKey(item.label);
		items.push(item);
		open = item.uid;
	}

	function relabel(item: Item) {
		// Keep the key in sync with the label until the form has been saved once.
		if (!item.keyTouched) item.key = uniqueKey(item.label, item);
	}

	function move(index: number, by: -1 | 1) {
		const to = index + by;
		if (to < 0 || to >= items.length) return;
		[items[index], items[to]] = [items[to], items[index]];
	}

	function remove(index: number) {
		const [gone] = items.splice(index, 1);
		for (const i of items) {
			if (i.showField === gone.key) {
				i.showField = '';
				i.showEquals = '';
			}
		}
	}

	const selectClass = 'w-full';
</script>

<input type="hidden" {name} value={serialized} />

<div class="flex flex-col gap-3">
	{#if items.length === 0}
		<p class="rounded-lg border border-dashed border-cream-dark px-4 py-8 text-center text-[0.85rem] text-text-light">
			No questions yet. Add your first one below.
		</p>
	{/if}

	{#each items as item, index (item.uid)}
		{@const isOpen = open === item.uid}
		{@const earlier = items.slice(0, index).filter((i) => i.type !== 'heading')}
		<div class="rounded-lg border border-cream-dark bg-card {item.type === 'heading' ? 'bg-cream/40' : ''}">
			<div class="flex items-center gap-2 px-3 py-2">
				<Button
					type="button"
					variant="ghost"
					class="h-auto min-w-0 flex-1 justify-start gap-3 rounded-md px-1 py-1 text-left font-normal hover:bg-transparent"
					aria-expanded={isOpen}
					onclick={() => (open = isOpen ? null : item.uid)}
				>
					<span class="shrink-0 rounded bg-navy/5 px-2 py-0.5 text-[0.6rem] tracking-[0.12em] text-text-mid uppercase dark:bg-white/10">
						{FIELD_TYPE_LABELS[item.type]}
					</span>
					<span class="truncate font-body text-[0.88rem] {item.type === 'heading' ? 'font-display italic' : ''} text-heading">
						{item.label || 'Untitled'}
					</span>
					{#if item.required}<span class="text-[0.7rem] text-red-400">required</span>{/if}
					{#if item.sensitive}<LockIcon class="size-3 text-text-light" aria-label="Sensitive" />{/if}
				</Button>
				<Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onclick={() => move(index, -1)}>
					<ChevronUpIcon />
				</Button>
				<Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === items.length - 1} onclick={() => move(index, 1)}>
					<ChevronDownIcon />
				</Button>
				<Button type="button" variant="ghost" size="icon-sm" aria-label="Remove field" class="text-text-light hover:text-red-500" onclick={() => remove(index)}>
					<Trash2Icon />
				</Button>
			</div>

			{#if isOpen}
				<div class="grid grid-cols-1 gap-4 border-t border-cream-dark px-4 py-4 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<Label for="fb-label-{item.uid}">{item.type === 'heading' ? 'Heading' : 'Question'}</Label>
						<Input id="fb-label-{item.uid}" type="text" bind:value={item.label} oninput={() => relabel(item)} maxlength={600} />
					</div>

					<div>
						<Label for="fb-type-{item.uid}">Input type</Label>
						<NativeSelect id="fb-type-{item.uid}" bind:value={item.type} class={selectClass}>
							{#each FIELD_TYPES as t}
								<NativeSelectOption value={t}>{FIELD_TYPE_LABELS[t]}</NativeSelectOption>
							{/each}
						</NativeSelect>
					</div>

					{#if item.type !== 'heading'}
						<div>
							<Label for="fb-width-{item.uid}">Width</Label>
							<NativeSelect id="fb-width-{item.uid}" bind:value={() => (item.half ? 'half' : 'full'), (v) => (item.half = v === 'half')} class={selectClass}>
								<NativeSelectOption value="full">Full width</NativeSelectOption>
								<NativeSelectOption value="half">Half width</NativeSelectOption>
							</NativeSelect>
						</div>
					{/if}

					{#if CHOICE_TYPES.includes(item.type)}
						<div class="sm:col-span-2">
							<Label for="fb-opts-{item.uid}">Options <span class="normal-case tracking-normal text-text-light">(one per line)</span></Label>
							<Textarea id="fb-opts-{item.uid}" bind:value={item.optionsText} rows={4} />
						</div>
					{/if}

					{#if item.type !== 'heading'}
						{#if !['select', 'radio', 'checkbox', 'checkboxes', 'date'].includes(item.type)}
							<div>
								<Label for="fb-ph-{item.uid}">Placeholder</Label>
								<Input id="fb-ph-{item.uid}" type="text" bind:value={item.placeholder} maxlength={200} />
							</div>
						{/if}
						<div class="flex items-end gap-3 pb-1">
							<Switch bind:checked={item.required} id="fb-req-{item.uid}" />
							<Label for="fb-req-{item.uid}" class="mb-0">Required</Label>
						</div>
					{/if}

					{#if item.type === 'date'}
						<div>
							<Label for="fb-range-{item.uid}">Allowed dates</Label>
							<NativeSelect id="fb-range-{item.uid}" bind:value={item.range} class={selectClass}>
								<NativeSelectOption value="">Any date</NativeSelectOption>
								<NativeSelectOption value="past">Past dates only (e.g. birth date)</NativeSelectOption>
								<NativeSelectOption value="future">Future dates only (e.g. expiry)</NativeSelectOption>
							</NativeSelect>
						</div>
					{/if}

					{#if item.type !== 'heading'}
						<div class="flex items-start gap-3 sm:col-span-2">
							<Switch bind:checked={item.sensitive} id="fb-sens-{item.uid}" />
							<div>
								<Label for="fb-sens-{item.uid}" class="mb-0">Sensitive personal data</Label>
								<p class="text-[0.72rem] text-text-light">
									Encrypted when stored, left out of notification emails, and hidden from the MCP server. Use for date of birth, passport, health needs. Not collected until the encryption key is configured.
								</p>
							</div>
						</div>
					{/if}

					<div class="sm:col-span-2">
						<Label for="fb-help-{item.uid}">{item.type === 'heading' ? 'Intro text' : 'Help text'}</Label>
						<Input id="fb-help-{item.uid}" type="text" bind:value={item.help} maxlength={400} />
					</div>

					{#if earlier.length > 0}
						<div class="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
							<div>
								<Label for="fb-sf-{item.uid}">Only show when…</Label>
								<NativeSelect id="fb-sf-{item.uid}" bind:value={item.showField} class={selectClass}>
									<NativeSelectOption value="">Always show</NativeSelectOption>
									{#each earlier as e (e.uid)}
										<NativeSelectOption value={e.key}>{e.label || e.key}</NativeSelectOption>
									{/each}
								</NativeSelect>
							</div>
							{#if item.showField}
								{@const dep = earlier.find((e) => e.key === item.showField)}
								<div>
									<Label for="fb-se-{item.uid}">…equals</Label>
									{#if dep && CHOICE_TYPES.includes(dep.type)}
										<NativeSelect id="fb-se-{item.uid}" bind:value={item.showEquals} class={selectClass}>
											<NativeSelectOption value="">Choose…</NativeSelectOption>
											{#each dep.optionsText.split('\n').map((o) => o.trim()).filter(Boolean) as o}
												<NativeSelectOption value={o}>{o}</NativeSelectOption>
											{/each}
										</NativeSelect>
									{:else if dep?.type === 'checkbox'}
										<NativeSelect id="fb-se-{item.uid}" bind:value={item.showEquals} class={selectClass}>
											<NativeSelectOption value="">Choose…</NativeSelectOption>
											<NativeSelectOption value="Yes">Checked</NativeSelectOption>
											<NativeSelectOption value="No">Unchecked</NativeSelectOption>
										</NativeSelect>
									{:else}
										<Input id="fb-se-{item.uid}" type="text" bind:value={item.showEquals} />
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<p class="text-[0.7rem] text-text-light sm:col-span-2">
						Field ID: <code class="font-mono">{item.key}</code>
					</p>
				</div>
			{/if}
		</div>
	{/each}

	<div class="mt-1 flex flex-wrap items-center gap-2">
		<NativeSelect bind:value={newType} aria-label="New field type" class="w-56">
			{#each FIELD_TYPES as t}
				<NativeSelectOption value={t}>{FIELD_TYPE_LABELS[t]}</NativeSelectOption>
			{/each}
		</NativeSelect>
		<Button type="button" variant="outline-dark" onclick={add}><PlusIcon data-icon="inline-start" /> Add field</Button>
	</div>
</div>
