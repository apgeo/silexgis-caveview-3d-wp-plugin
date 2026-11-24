#!/usr/bin/env node
/**
 * The plugin, driven through a real WordPress.
 *
 * Stands up docker-compose.yml beside this file — WordPress on PHP 7.4 (or WP_IMAGE), MariaDB,
 * the plugin bound read-only — installs WordPress through its own install form, then lets
 * php/setup.php activate the plugin, import the example data set and make three pages. Then it
 * reads what a visitor's browser gets:
 *
 *   - a page configured through the box: the viewer and the component loaded from the plugin's
 *     own copies, the site told the shipped viewer's address, the create() call printed, the
 *     model drawn (a canvas), the place list filled from the data set, the journal's two
 *     sections, the body class swapped by the filter, no uncaught error;
 *   - a page configured by a file named after its slug in the uploads directory: drawn the same;
 *   - a page with the shortcode and no configuration: a console warning naming where to put one;
 *   - a page with no model, and one that loads its own viewer: nothing of the plugin loaded;
 *   - the settings screen (in English, then with the site in Romanian), the trips route, the
 *     Deactivate question, and no PHP notice on any of them.
 *
 * Counts and verdicts only.
 *
 *   node tests/wp/check.mjs [--keep]
 *   WP_IMAGE=wordpress:latest node tests/wp/check.mjs
 *
 * Playwright is imported from this repository's node_modules, or from the directory named by
 * PLAYWRIGHT_NODE_MODULES (any project's node_modules with playwright and its Chromium).
 * --keep leaves the stack up at http://127.0.0.1:8091/wp-admin/ (account below).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PLAYWRIGHT_NODE_MODULES ? join(process.env.PLAYWRIGHT_NODE_MODULES, 'x.js') : import.meta.url);
const { chromium } = require('playwright');

const PORT = process.env.WP_PORT || '8091';
const BASE = 'http://127.0.0.1:' + PORT;
const IMAGE = process.env.WP_IMAGE || 'wordpress:6.1.1-php7.4-apache';
const USER = 'tester';
const PASSWORD = 'throwaway-admin-password';
const keep = process.argv.includes('--keep');
// The viewer build the plugin ships, as its main file names it.
const BUILD = /define\( 'SILEX_CE_CAVEVIEW_BUILD', '([^']+)' \);/.exec(readFileSync(join(here, '..', '..', 'plugin', 'silexgis-caveview-3d', 'silexgis-caveview-3d.php'), 'utf8'))[1];

let failed = 0;
let count = 0;
function check(name, ok, detail = '') {
	count++;
	console.log((ok ? 'ok    ' : 'FAIL  ') + name + (ok || !detail ? '' : ' — ' + detail));
	if (!ok) failed++;
}
function compose(...args) {
	return execFileSync('docker', ['compose', ...args], { cwd: here, env: { ...process.env, WP_IMAGE: IMAGE, WP_PORT: PORT }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function wpPhp(script, ...args) {
	return compose('exec', '-T', 'wordpress', 'php', '/silex-test/' + script, ...args).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PHP's own complaints printed into a page with WP_DEBUG on. */
function phpComplaints(html) {
	return (html.match(/<b>(Warning|Notice|Deprecated|Fatal error|Parse error)<\/b>:[^<]*/g) || []).length;
}

async function waitForWordPress() {
	const deadline = Date.now() + 300_000;
	while (Date.now() < deadline) {
		try {
			const r = await fetch(BASE + '/wp-admin/install.php?step=1');
			const body = await r.text();
			if (r.status === 200 && /weblog_title|already installed/i.test(body)) return /already installed/i.test(body);
		} catch { /* not up yet */ }
		await sleep(2000);
	}
	throw new Error('WordPress did not come up on ' + BASE);
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, locale: 'en-US' });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
let pageErrors = [];
let consoleLines = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) consoleLines.push(m.text()); });
page.on('dialog', (d) => d.dismiss().catch(() => {}));

async function visit(url) {
	pageErrors = [];
	consoleLines = [];
	const res = await page.goto(url, { waitUntil: 'load' });
	return { status: res.status(), html: await page.content() };
}

/** The model on the page: drawn (a canvas inside the container), its place list filled. */
async function modelDrawn() {
	try {
		await page.waitForFunction(() => {
			const model = document.getElementById('cave_model');
			const places = document.querySelectorAll('#cave_places li, #cave_places a');
			return model && model.querySelector('canvas') && places.length >= 5;
		}, null, { timeout: 90_000 });
		return true;
	} catch {
		return false;
	}
}

let verdict = 1;
try {
	console.log('image ' + IMAGE);
	compose('up', '-d');
	const installed = await waitForWordPress();
	check('the stack answers on 127.0.0.1:' + PORT, true);
	if (!installed) {
		const res = await page.request.post(BASE + '/wp-admin/install.php?step=2', {
			form: {
				weblog_title: 'CaveView 3D (test)', user_name: USER, admin_password: PASSWORD, admin_password2: PASSWORD,
				admin_email: 'tester@example.invalid', blog_public: '0', Submit: 'Install WordPress', language: '',
			},
		});
		check('WordPress installs through its own install form', res.status() === 200 && /Success!/.test(await res.text()), 'status ' + res.status());
	}
	wpPhp('site-language.php', '');
	const setup = JSON.parse(wpPhp('setup.php'));
	check('the plugin activates', setup.activated === true);
	check('the example data set imports from a zip archive', /^imported \d+$/.test(setup.import), setup.import);

	// ---- the page configured through the box -------------------------------------------
	let r = await visit(setup.box);
	check('box page: answers 200 with no PHP notice', r.status === 200 && phpComplaints(r.html) === 0, `status ${r.status}, ${phpComplaints(r.html)} notice(s)`);
	const scripts = await page.$$eval('script[src]', (els) => els.map((e) => new URL(e.src).pathname));
	const ix = (tail) => scripts.findIndex((s) => s.endsWith(tail));
	check('box page: the viewer comes from the build the plugin ships', ix(`/plugins/silexgis-caveview-3d/vendor/caveview/${BUILD}/js/CaveView2.min.js`) >= 0);
	const order = [`/vendor/caveview/${BUILD}/js/CaveView2.min.js`, '/assets/js/lightbox.js', '/assets/js/text-autolink.js', '/assets/js/cave-embed.js', '/assets/js/silexgis-trips.js', '/assets/js/cave-trips.js'].map(ix);
	check('box page: the six scripts load in order, from the plugin', order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), order.join(','));
	check('box page: the stylesheet comes from the plugin', (await page.$$eval('link[rel=stylesheet]', (els) => els.map((e) => e.href))).some((h) => h.includes('/plugins/silexgis-caveview-3d/assets/css/cave-embed.css?ver=')));
	const site = await page.evaluate(() => window.SilexCaveEmbedSite);
	check('box page: the site tells pages the shipped viewer as home', site && site.home === `/wp-content/plugins/silexgis-caveview-3d/vendor/caveview/${BUILD}/`, site && site.home);
	check('box page: and the root its trips source asks trips/<slot> under', site && site.tripsBase === '/wp-json/silexgis-caveview/v1/', site && site.tripsBase);
	// Asked the way cave-trips.js asks it: base + 'trips/' + slot + '/live'.
	const viaBase = await page.evaluate((b) => fetch(b + 'trips/example-1/live').then((r) => r.status), site && site.tripsBase);
	check('box page: that root answers for a slot the site holds', viaBase !== 404, 'status ' + viaBase);
	check('box page: and the imported data set', site && site.datasets && site.datasets.example && /\/uploads\/silexgis-caveview-3d\/datasets\/example\/$/.test(site.datasets.example.base || ''), JSON.stringify(site && site.datasets));
	check('box page: the create() call is printed', /window\.SilexCaveEmbed\.create\(/.test(r.html));
	check('box page: the model is drawn and its places listed from the data set', await modelDrawn());
	check('box page: the journal\'s shortcodes are expanded into their elements', (await page.$$('.cave_columns .cave_stats[data-for="cave_model"]')).length === 1
		&& (await page.$$('.cave_columns [data-trip-log][data-for="cave_model"]')).length === 1 && !/\[silexgis_cave/.test(r.html));
	check('box page: the body class filter swapped "page"', await page.evaluate(() => document.body.classList.contains('silex-wide-page') && !document.body.classList.contains('page')));
	check('box page: no uncaught error', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

	// ---- fullscreen refused, inside an ancestor that traps a fixed element ------------------
	// What an iPhone does to an element's fullscreen, on a theme whose wrapper is transformed:
	// the viewer must cover the window from under <body> and come back to its place after.
	const before = await page.evaluate(() => {
		Element.prototype.requestFullscreen = function () { return Promise.reject(new TypeError('refused')); };
		Element.prototype.webkitRequestFullscreen = undefined;
		document.querySelector('.cave_embed').parentElement.style.transform = 'translateZ(0)';
		return document.getElementById('cave_model').getBoundingClientRect().height;
	});
	const pressFullscreen = () => page.evaluate(() => {
		const bar = document.querySelector('.cv-toolbar');
		const buttons = bar ? [...bar.children] : [];
		buttons[buttons.length - 1].click();
	});
	await pressFullscreen();
	await sleep(800);
	const covered = await page.evaluate(() => {
		const m = document.getElementById('cave_model');
		const r = m.getBoundingClientRect();
		const c = m.querySelector('canvas').getBoundingClientRect();
		return { underBody: m.parentElement === document.body, w: r.width, h: r.height, cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight };
	});
	check('refused fullscreen: the viewer covers the window from under <body>',
		covered.underBody && Math.abs(covered.w - covered.vw) < 2 && Math.abs(covered.h - covered.vh) < 2, JSON.stringify(covered));
	check('refused fullscreen: and the model is drawn at that size', Math.abs(covered.cw - covered.vw) < 24 && Math.abs(covered.ch - covered.vh) < 24, JSON.stringify(covered));
	await pressFullscreen();
	await sleep(800);
	const back = await page.evaluate(() => {
		const m = document.getElementById('cave_model');
		return { inBlock: Boolean(m.closest('.cave_embed')), h: m.getBoundingClientRect().height };
	});
	check('refused fullscreen: given back, the viewer is in its block at its height', back.inBlock && Math.abs(back.h - before) < 2, JSON.stringify({ ...back, before }));
	check('refused fullscreen: no uncaught error', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

	// ---- the page configured by a file named after its slug ------------------------------
	r = await visit(setup.file);
	check('file page: the file from the uploads\' pages directory is loaded last', (await page.$$eval('script[src]', (els) => els.map((e) => new URL(e.src).pathname))).pop() === '/wp-content/uploads/silexgis-caveview-3d/pages/model-by-file.js');
	check('file page: the model is drawn and its places listed', await modelDrawn());
	check('file page: no uncaught error', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

	// ---- the page with the shortcode and nothing to configure it ---------------------------
	r = await visit(setup.none);
	await sleep(500);
	check('unconfigured page: the console says where a configuration could go',
		consoleLines.some((l) => l.includes('no per-page configuration found at /wp-content/uploads/silexgis-caveview-3d/pages/model-unconfigured.js')), consoleLines.length + ' warning(s)');

	// ---- a page with no model -----------------------------------------------------------------
	r = await visit(setup.plain);
	check('plain page: nothing of the plugin is loaded', !/silexgis-caveview-3d/.test(r.html));
	check('plain page: the body class is left alone', await page.evaluate(() => document.body.classList.contains('page')));

	// ---- a page that loads its own viewer ---------------------------------------------------
	r = await visit(setup.own);
	check('own-viewer page: its own viewer script survived the save', r.html.includes('/somewhere/CaveView/js/CaveView2.js'));
	check('own-viewer page: nothing of the plugin is loaded beside it', !/silexgis-caveview-3d|SilexCaveEmbedSite/.test(r.html));

	// ---- the trips route -------------------------------------------------------------------------
	const live = await page.request.get(BASE + '/wp-json/silexgis-caveview/v1/trips/example-1/live');
	check('the trips route exists, and an installation that does not answer is not an empty list', live.status() !== 404 && live.status() >= 500, 'status ' + live.status());
	const nope = await page.request.get(BASE + '/wp-json/silexgis-caveview/v1/trips/nobody-1/live');
	check('a slot the site has no link for is no route', nope.status() === 404, 'status ' + nope.status());

	// ---- the admin --------------------------------------------------------------------------------
	await page.goto(BASE + '/wp-login.php');
	await page.fill('#user_login', USER);
	await page.fill('#user_pass', PASSWORD);
	await Promise.all([page.waitForNavigation(), page.click('#wp-submit')]);
	r = await visit(BASE + '/wp-admin/options-general.php?page=silexgis-caveview-3d');
	check('settings screen: renders with no PHP notice', r.status === 200 && phpComplaints(r.html) === 0 && /Where the code is/.test(r.html), `status ${r.status}, ${phpComplaints(r.html)} notice(s)`);
	check('settings screen: both fields show the plugin\'s own copy', (r.html.match(/The plugin(?:&#8217;|’|')s own copy/g) || []).length === 2);
	check('settings screen: the imported data set is listed', (await page.$$('#silex-ce-datasets-table tr[data-dataset="example"]')).length === 1);
	r = await visit(BASE + '/wp-admin/plugins.php');
	check('plugins screen: Deactivate asks first while pages carry a model', /return window\.confirm\(&quot;Deactivating SilexGIS CaveView 3D stops the 3D models on 3 published pages/.test(r.html));
	for (const screen of ['silex-cave-autolink', 'silex-cave-trips']) {
		r = await visit(BASE + '/wp-admin/options-general.php?page=' + screen);
		check(`${screen} screen: renders with no PHP notice`, r.status === 200 && phpComplaints(r.html) === 0, `status ${r.status}, ${phpComplaints(r.html)} notice(s)`);
	}
	wpPhp('site-language.php', 'ro_RO');
	r = await visit(BASE + '/wp-admin/options-general.php?page=silexgis-caveview-3d');
	check('settings screen, site in Romanian: the plugin\'s own translation speaks', /Unde este codul/.test(r.html) && /Copia pluginului/.test(r.html));
	wpPhp('site-language.php', '');

	verdict = failed ? 1 : 0;
} catch (e) {
	check('the run completes', false, e.message.split('\n')[0]);
} finally {
	await browser.close();
	if (!keep) {
		try { compose('down', '-v'); } catch (e) { console.log('docker compose down -v failed: ' + e.message.split('\n')[0]); }
	}
}
console.log(`\n${count} checks: ${failed ? failed + ' failed' : 'all good'} (${IMAGE})`);
process.exit(failed ? 1 : verdict);
