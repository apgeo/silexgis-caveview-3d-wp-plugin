#!/usr/bin/env node
/**
 * The box's own script, held to the server's verdicts.
 *
 * The "Model 3D" box says while a configuration is typed whether its addresses will be
 * refused, and tells the block editor after a save that they were. The server decides; the
 * box only says so early — which is worth something only while the two agree. This takes
 * the functions out of includes/meta-box.php as they are written there, and asks them the
 * same cases config-addresses.php asked the server, comparing verdict by verdict.
 *
 *   docker run --rm -v "$PWD":/w:ro php:7.4-cli php /w/tests/config-addresses.php --json \
 *     | node config-addresses-box.mjs [path/to/meta-box.php]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(process.argv[2] || join(here, '..', 'plugin', 'silexgis-caveview-3d', 'includes', 'meta-box.php'), 'utf8');
const server = JSON.parse(readFileSync(0, 'utf8'));

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
	if (!ok) console.log('FAIL  ' + name + (detail ? '  — ' + String(detail).slice(0, 200) : ''));
	if (ok) passed++; else failed++;
}

// From the list of fields to the end of addressFaults(): the part of the box's script that
// judges addresses. The one PHP expression in it is the list itself, which the server printed.
const from = source.indexOf('var FIELDS = ');
const to = source.indexOf("// Why the text as it stands could not be saved");
if (from < 0 || to < from) {
	console.log('FAIL  the box\'s script judges the addresses a configuration names  — no such part in it');
	console.log('\n1 checks: 0 passed, 1 failed');
	process.exit(1);
}
const php = /<\?php echo wp_json_encode\( silex_ce_config_address_fields\(\) \); \?>/;
let script = source.slice(from, to);
check('the list of fields in the box comes from the server', php.test(script) && !/<\?php/.test(script.replace(php, '')));
script = script.replace(php, JSON.stringify(server.fields));
const box = runInNewContext(script + '\n({ sitePath: sitePath, nameBeneath: nameBeneath, addressFaults: addressFaults });');

for (const [value, verdict] of server.paths) check('path ' + JSON.stringify(value) + ': the box says ' + verdict + ' as the server does', box.sitePath(value) === verdict);
for (const [value, verdict] of server.names) check('name ' + JSON.stringify(value) + ': the box says ' + verdict + ' as the server does', box.nameBeneath(value) === verdict);
for (const [name, json, faults] of server.configs) {
	// The box judges what JSON.parse made of the text, in this realm's arrays.
	const got = Array.from(box.addressFaults(JSON.parse(json)));
	check(name + ': the box names ' + (faults.length ? faults.join(', ') : 'nothing') + ' as the server does', isDeepStrictEqual(got, faults), JSON.stringify(got));
}
const [example, exampleFaults] = server.example;
check('the journal\'s configuration: the box refuses nothing, as the server does', exampleFaults.length === 0 && box.addressFaults(JSON.parse(example)).length === 0);

console.log('\n' + (passed + failed) + ' checks: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
