#!/usr/bin/env node
// The checks that need no WordPress, in seconds: every PHP file parses on PHP 7.4 and 8.3, the
// trips proxy driven from its failing side, the JSON fault locator, the rule that keeps a
// configuration's addresses on the site (and the box's copy of it), what the enqueue hook prints
// inside script elements, the translations up to date, and the journal stamp current.
//
//   node tests/run.mjs
//
// PHP runs in Docker (php:7.4-cli and php:8.3-cli), so nothing but Node, Python 3 and Docker
// is needed on the machine. The WordPress check is separate: node tests/wp/check.mjs.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = join(root, 'plugin', 'silexgis-caveview-3d');
const python = process.platform === 'win32' ? 'python' : 'python3';
let failed = 0;

function run(name, command, args, input) {
  const r = spawnSync(command, args, { cwd: root, input, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').pop();
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  — ${last}`);
  if (!ok) console.log(out.split('\n').filter((l) => /^FAIL|rror/.test(l)).slice(0, 20).join('\n'));
  return out;
}
const php = (image, ...args) => ['run', '--rm', '-v', `${root}:/w:ro`, image, 'php', ...args];

function phpFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'vendor' ? [] : phpFiles(p);
    return n.endsWith('.php') ? [p] : [];
  });
}
const files = phpFiles(plugin).map((p) => '/w/' + p.slice(root.length + 1).split('\\').join('/'));

for (const image of ['php:7.4-cli', 'php:8.3-cli']) {
  run(`every plugin PHP file parses (${image})`, 'docker', ['run', '--rm', '-v', `${root}:/w:ro`, image, 'sh', '-c',
    files.map((f) => `php -l ${f} >/dev/null || exit 1`).join('; ') + `; echo ${files.length} files`]);
  run(`trips proxy (${image})`, 'docker', php(image, '/w/tests/trips-proxy.php'));
  run(`JSON fault locator (${image})`, 'docker', php(image, '/w/tests/json-fault.php'));
  run(`configuration addresses (${image})`, 'docker', php(image, '/w/tests/config-addresses.php'));
  run(`inline scripts (${image})`, 'docker', php(image, '/w/tests/inline-scripts.php'));
}
const verdicts = execFileSync('docker', php('php:7.4-cli', '/w/tests/config-addresses.php', '--json'), { encoding: 'utf8', maxBuffer: 64 << 20 });
run('the box\'s own address rule agrees with the save\'s', process.execPath, [join(root, 'tests', 'config-addresses-box.mjs')], verdicts);
run('translations up to date', python, [join(root, 'tools', 'build-translations.py'), '--check']);
run('journal stamp current', python, [join(root, 'tools', 'stamp-journal.py'), '--check']);
for (const f of readdirSync(join(plugin, 'assets', 'js'))) {
  run(`${f} parses`, process.execPath, ['--check', join(plugin, 'assets', 'js', f)]);
}

console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
