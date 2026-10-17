<script lang="ts">
	import { site, formsHref, pageHref } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import PageHero from '#lib/components/PageHero.svelte';
	import FormRenderer from '#lib/components/FormRenderer.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import LockIcon from '@lucide/svelte/icons/lock';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import type { AnswerValue } from '#lib/forms.js';
	import type { AnswerValue as Value } from '#lib/forms.js';
	import type { PublicFormData } from '#lib/server/public-forms.js';

	let {
		data,
		form,
	}: {
		data: PublicFormData;
		form: {
			success?: boolean;
			errors?: Record<string, string>;
			values?: Record<string, Value>;
			message?: string;
		} | null;
	} = $props();
	let submitting = $state(false);
	const errors = $derived(
		(form && 'errors' in form ? form.errors : {}) as Record<string, string>,
	);
	const values = $derived(
		(form && 'values' in form ? form.values : {}) as Record<
			string,
			AnswerValue
		>,
	);
	const message = $derived(form && 'message' in form ? form.message : '');
</script>

<svelte:head>
	<title>{data.form.title} — {site.name}</title>
	<meta name="description" content={data.form.description ?? data.form.title} />
</svelte:head>

<PageHero
	title={data.form.title}
	eyebrow="Forms"
	subtitle={data.form.description}
/>

<section class="py-[clamp(4rem,8vw,6rem)] bg-cream">
	<div class="container max-w-[820px]">
		{#if form?.success}
			<Card
				class="rounded-2xl border border-gold/40 bg-card shadow-none ring-0 py-0"
			>
				<CardContent
					class="flex flex-col items-center gap-4 p-10 text-center"
					role="status"
				>
					<CheckCircleIcon class="size-10 text-gold" />
					<h2 class="font-display text-[1.6rem] text-heading">Thank you</h2>
					<p class="max-w-[48ch] text-text-mid">
						{data.schema.successMessage ??
							'Your response has been received. We will be in touch shortly.'}
					</p>
					<Button variant="outline-dark" href={formsHref() ?? '/'}
						>Back to forms</Button
					>
				</CardContent>
			</Card>
		{:else}
			{#if !data.schema.accepting}
				<Alert class="mb-6"
					><AlertDescription
						>This form is not accepting responses right now. Please try again
						later.</AlertDescription
					></Alert
				>
			{/if}
			{#if message}
				<Alert variant="destructive" class="mb-6"
					><AlertDescription role="alert">{message}</AlertDescription></Alert
				>
			{/if}
			<Card
				class="rounded-2xl border border-cream-dark bg-card shadow-none ring-0 py-0"
			>
				<CardContent class="p-[clamp(1.25rem,4vw,2.5rem)]">
					<form
						method="POST"
						action="?/submit"
						novalidate
						use:enhance={() => {
							submitting = true;
							return async ({ update }) => {
								submitting = false;
								await update({ reset: false });
							};
						}}
					>
						<!-- Honeypot: hidden from people, tempting to bots. -->
						<div class="absolute -left-[9999px]" aria-hidden="true">
							<Label for="website">Website</Label>
							<Input
								id="website"
								name="website"
								type="text"
								tabindex={-1}
								autocomplete="off"
							/>
						</div>
						<fieldset
							disabled={!data.schema.accepting || submitting}
							class="contents"
						>
							<FormRenderer
								fields={data.schema.fields}
								initial={values}
								{errors}
							/>
							<p
								class="mt-8 flex items-start gap-2 text-[0.8rem] leading-relaxed text-text-light"
							>
								<LockIcon class="mt-0.5 size-3.5 shrink-0" />
								<span>
									{site.formPrivacyNotice}
									{#if data.schema.hasSensitive}Sensitive details (marked with a
										lock) are stored encrypted and are never sent by email.{/if}
									See our
									<a
										href={pageHref('privacy') ?? site.privacyPath}
										class="underline underline-offset-2 hover:text-heading"
										>Privacy Policy</a
									>.
								</span>
							</p>
							<div class="mt-6 flex flex-wrap items-center gap-4">
								<Button
									type="submit"
									variant="gold"
									class="text-[0.72rem] tracking-[0.1em] uppercase"
								>
									{#if submitting}<Spinner class="mr-1.5" />{/if}
									{data.schema.submitLabel ?? 'Submit'}
								</Button>
								{#if data.form.file_path}
									<Button
										variant="ghost"
										href={data.form.file_path}
										download
										class="gap-2 text-text-mid"
									>
										<DownloadIcon size={13} /> Prefer paper? Download the PDF
									</Button>
								{/if}
							</div>
						</fieldset>
					</form>
				</CardContent>
			</Card>
		{/if}
	</div>
</section>
