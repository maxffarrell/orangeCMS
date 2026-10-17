import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderContent } from '../src/lib/render.ts';
test('public settings render as escaped text without interpreting HTML or Markdown', () => {
	const html = renderContent('Hello {{setting:display_name}}.', {
		display_name: '<img src=x onerror=alert(1)> **bold**',
	});
	assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; **bold**'));
	assert.ok(!html.includes('<img'));
	assert.ok(!html.includes('<strong>'));
	assert.ok(!renderContent('{{setting:missing}}', {}).includes('undefined'));
});
test('setting placeholders cannot become executable URL attributes', () => {
	const html = renderContent('[Open]({{setting:target}})', {
		target: 'javascript:alert(1)',
	});
	assert.ok(!html.includes('javascript:'));
	assert.ok(!html.includes('ORANGECMSSETTINGTOKEN'));
});
