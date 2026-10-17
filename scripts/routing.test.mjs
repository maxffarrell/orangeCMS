import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	resolvePublicRoute,
	validatePublicRoutes,
	getPageHref,
} from '../src/lib/routing.ts';
test('content URL maps are configurable', () => {
	const routes = [
		{ path: '/journal/:slug', kind: 'entry', collection: 'articles' },
		{ path: '/support/:slug', kind: 'form' },
	];
	assert.deepEqual(resolvePublicRoute(routes, '/journal/a-post')?.params, {
		slug: 'a-post',
	});
	assert.equal(resolvePublicRoute(routes, '/content/a-post'), null);
	assert.equal(
		resolvePublicRoute(routes, '/support/request')?.route.kind,
		'form',
	);
	assert.equal(resolvePublicRoute(routes, '/journal/a%2Fb'), null);
	assert.equal(resolvePublicRoute(routes, '/journal/%ZZ'), null);
});
test('reserved, duplicate, and ambiguous routes fail closed', () => {
	for (const routes of [
		[{ path: '/admin/custom', kind: 'page', page: 'custom' }],
		[{ path: '/mcp/:slug', kind: 'form' }],
		[
			{ path: '/', kind: 'page', page: 'a' },
			{ path: '/', kind: 'page', page: 'b' },
		],
		[
			{ path: '/journal/:slug', kind: 'entry', collection: 'articles' },
			{ path: '/:slug/index', kind: 'page' },
		],
		[{ path: '/journal/:name', kind: 'entry', collection: 'articles' }],
		[{ path: '/journal//index', kind: 'page', page: 'index' }],
	])
		assert.throws(() => validatePublicRoutes(routes));
});

test('page URLs prefer explicit mappings and support encoded dynamic slugs', () => {
	const routes = [
		{ path: '/pages/:slug', kind: 'page' },
		{ path: '/landing', kind: 'page', page: 'home' },
	];
	assert.equal(getPageHref(routes, 'home'), '/landing');
	assert.equal(getPageHref(routes, 'details'), '/pages/details');
	assert.equal(getPageHref(routes, 'two words'), '/pages/two%20words');
	assert.equal(
		getPageHref([{ path: '/', kind: 'page', page: 'home' }], 'missing'),
		null,
	);
	assert.equal(
		getPageHref(
			[{ path: '/fixed/:slug', kind: 'page', page: 'fixed' }],
			'other',
		),
		null,
	);
});

test('fixed sections take precedence over a root dynamic page mount', () => {
	const routes = [
		{ path: '/:slug', kind: 'page' },
		{ path: '/content', kind: 'collection', collection: 'articles' },
		{ path: '/privacy', kind: 'page', page: 'privacy' },
	];
	validatePublicRoutes(routes);
	assert.equal(
		resolvePublicRoute(routes, '/content')?.route.kind,
		'collection',
	);
	assert.equal(resolvePublicRoute(routes, '/privacy')?.route.page, 'privacy');
	assert.deepEqual(resolvePublicRoute(routes, '/example')?.params, {
		slug: 'example',
	});
	assert.equal(resolvePublicRoute(routes, '/admin'), null);
	assert.equal(resolvePublicRoute(routes, '/mcp'), null);
	assert.equal(getPageHref(routes, 'example'), '/example');
});
