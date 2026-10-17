<script lang="ts">
	import { untrack } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { RadioGroup, RadioGroupItem } from '#lib/components/ui/radio-group/index.js';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '#lib/components/ui/select/index.js';
	import {
		Field,
		FieldDescription,
		FieldError,
		FieldLabel,
		FieldLegend,
		FieldSet,
		FieldTitle
	} from '#lib/components/ui/field/index.js';
	import LockIcon from '@lucide/svelte/icons/lock';
	import FormDatePicker from './FormDatePicker.svelte';
	import { isVisible, type AnswerValue, type FormField } from '#lib/forms.js';

	interface Props {
		fields: FormField[];
		/** Values to start from (e.g. echoed back after a failed submission). */
		initial?: Record<string, AnswerValue>;
		errors?: Record<string, string>;
	}
	let { fields, initial = {}, errors = {} }: Props = $props();

	// Live values drive conditional (showIf) fields. Controls are shadcn-svelte components
	// that still submit as ordinary named inputs, so the form works as a plain HTML POST.
	let values = $state<Record<string, AnswerValue>>(untrack(() => ({ ...initial })));

	const text = (key: string) => (typeof values[key] === 'string' ? (values[key] as string) : '');
	const has = (key: string, option: string) => {
		const v = values[key];
		return Array.isArray(v) ? v.includes(option) : v === option;
	};
	function toggle(key: string, option: string, on: boolean) {
		const current = Array.isArray(values[key]) ? (values[key] as string[]) : [];
		values[key] = on ? [...current.filter((o) => o !== option), option] : current.filter((o) => o !== option);
	}
</script>

<FieldSet>
	<div class="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2">
		{#each fields as field (field.key)}
			{#if isVisible(field, values)}
				{@const id = `f_${field.key}`}
				{@const err = errors[field.key]}
				{@const span = field.width === 'half' ? '' : 'sm:col-span-2'}

				{#if field.type === 'heading'}
					<div class="sm:col-span-2 border-b border-gold/30 pb-2 pt-4 first:pt-0">
						<FieldTitle class="font-display text-[1.3rem] italic font-light text-heading">{field.label}</FieldTitle>
						{#if field.help}<FieldDescription class="mt-1">{field.help}</FieldDescription>{/if}
					</div>
				{:else}
					<Field class="{span} gap-2" data-invalid={!!err}>
						{#if field.type === 'checkbox'}
							<div class="flex items-start gap-3">
								<Checkbox
									{id}
									name={id}
									class="mt-0.5"
									aria-invalid={!!err}
									checked={values[field.key] === 'Yes'}
									onCheckedChange={(c) => (values[field.key] = c ? 'Yes' : 'No')}
								/>
								<FieldLabel for={id} class="block font-normal text-text-mid">
									{field.label}{#if field.required}<span class="text-destructive"> *</span>{/if}
								</FieldLabel>
							</div>
						{:else if field.type === 'radio'}
							<FieldLegend variant="label" class="mb-0">
								{field.label}{#if field.required}<span class="text-destructive"> *</span>{/if}
								{#if field.sensitive}<LockIcon class="ml-1 inline size-3 text-text-light" aria-label="Stored encrypted" />{/if}
							</FieldLegend>
							<RadioGroup
								name={id}
								value={text(field.key)}
								onValueChange={(v) => (values[field.key] = v)}
								aria-invalid={!!err}
							>
								{#each field.options ?? [] as option, i}
									<div class="flex items-center gap-3">
										<RadioGroupItem id="{id}_{i}" value={option} aria-invalid={!!err} />
										<FieldLabel for="{id}_{i}" class="font-normal text-text-mid">{option}</FieldLabel>
									</div>
								{/each}
							</RadioGroup>
						{:else if field.type === 'checkboxes'}
							<FieldLegend variant="label" class="mb-0">
								{field.label}{#if field.required}<span class="text-destructive"> *</span>{/if}
								{#if field.sensitive}<LockIcon class="ml-1 inline size-3 text-text-light" aria-label="Stored encrypted" />{/if}
							</FieldLegend>
							<div class="flex flex-col gap-3">
								{#each field.options ?? [] as option, i}
									<div class="flex items-center gap-3">
										<Checkbox
											id="{id}_{i}"
											name={id}
											value={option}
											aria-invalid={!!err}
											checked={has(field.key, option)}
											onCheckedChange={(c) => toggle(field.key, option, !!c)}
										/>
										<FieldLabel for="{id}_{i}" class="font-normal text-text-mid">{option}</FieldLabel>
									</div>
								{/each}
							</div>
						{:else}
							<FieldLabel for={id}>
								{field.label}{#if field.required}<span class="text-destructive"> *</span>{/if}
								{#if field.sensitive}<LockIcon class="ml-1 inline size-3 text-text-light" aria-label="Stored encrypted" />{/if}
							</FieldLabel>
							{#if field.type === 'textarea'}
								<Textarea
									{id}
									name={id}
									rows={4}
									placeholder={field.placeholder}
									aria-invalid={!!err}
									maxlength={5000}
									value={text(field.key)}
									oninput={(e) => (values[field.key] = e.currentTarget.value)}
								/>
							{:else if field.type === 'select'}
								<Select
									type="single"
									name={id}
									value={text(field.key)}
									onValueChange={(v) => (values[field.key] = v)}
								>
									<SelectTrigger {id} class="w-full" aria-invalid={!!err}>
										{text(field.key) || 'Select…'}
									</SelectTrigger>
									<SelectContent>
										{#each field.options ?? [] as option}
											<SelectItem value={option} label={option}>{option}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
							{:else if field.type === 'date'}
								<FormDatePicker
									{id}
									name={id}
									value={text(field.key)}
									range={field.range}
									invalid={!!err}
									onchange={(iso) => (values[field.key] = iso)}
								/>
							{:else}
								<Input
									{id}
									name={id}
									type={field.type}
									placeholder={field.placeholder}
									aria-invalid={!!err}
									maxlength={500}
									autocomplete={field.sensitive ? 'off' : undefined}
									inputmode={field.type === 'number' ? 'decimal' : undefined}
									step={field.type === 'number' ? 'any' : undefined}
									value={text(field.key)}
									oninput={(e) => (values[field.key] = e.currentTarget.value)}
								/>
							{/if}
						{/if}
						{#if field.help}<FieldDescription>{field.help}</FieldDescription>{/if}
						{#if err}<FieldError>{err}</FieldError>{/if}
					</Field>
				{/if}
			{/if}
		{/each}
	</div>
</FieldSet>
