#!/usr/bin/env node
// Packages the release: the WordPress plugin as an installable zip, and the standalone kit (the
// component on a page with no WordPress) as a directory and a zip.
//
//   node tools/build-zip.mjs            # writes dist/
//
// dist/silexgis-caveview-3d-<version>.zip           upload on Plugins → Add New → Upload Plugin
// dist/standalone/                                  the kit, ready to serve
// dist/silexgis-caveview-3d-standalone-<version>.zip
//
// Node only (no zip tool, no package): the archive is written here, deflated by zlib, with a fixed
// date on every entry so the same sources always give the same bytes. It refuses to package a
// cave-trips.js whose stamp for cave-journal.js is stale (tools/stamp-journal.py rewrites it).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'silexgis-caveview-3d';
const plugin = join(root, 'plugin', slug);
const dist = join(root, 'dist');

const main = readFileSync(join(plugin, `${slug}.php`), 'utf8');
const version = /^\s*\*\s*Version:\s*(\S+)/m.exec(main)?.[1];
const build = /define\( 'SILEX_CE_CAVEVIEW_BUILD', '([^']+)' \);/.exec(main)?.[1];
if (!version || !build) throw new Error('the plugin header names no Version, or no SILEX_CE_CAVEVIEW_BUILD');
if (!existsSync(join(plugin, 'vendor', 'caveview', build, 'js', 'CaveView2.min.js'))) {
  throw new Error(`vendor/caveview/${build}/ is not in the plugin`);
}

// The stamp cave-trips.js asks for cave-journal.js under: the first twelve hex of its SHA-256.
const js = join(plugin, 'assets', 'js');
const stamp = createHash('sha256').update(readFileSync(join(js, 'cave-journal.js'))).digest('hex').slice(0, 12);
const asked = /var JOURNAL_STAMP = '([0-9a-f]{12})';/.exec(readFileSync(join(js, 'cave-trips.js'), 'utf8'))?.[1];
if (asked !== stamp) throw new Error(`cave-trips.js asks for cave-journal.js under ${asked}, the file is ${stamp}: run tools/stamp-journal.py`);

/** Every file under dir, as paths relative to it with "/" separators, sorted. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full).map((p) => `${name}/${p}`));
    else out.push(name);
  }
  return out;
}

/** A zip archive of [archive path, bytes] pairs. */
function zip(entries) {
  const DOS_TIME = 0;            // 00:00:00
  const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;   // 2026-01-01, fixed so a rebuild is byte-identical
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // UTF-8 names
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);    // made by: Unix, 2.0 (so the mode below is read)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);   // a plain file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// The plugin, under its own directory name, as WordPress unpacks it.
const pluginEntries = walk(plugin).map((p) => [`${slug}/${p}`, readFileSync(join(plugin, p))]);
pluginEntries.push([`${slug}/LICENSE.txt`, readFileSync(join(root, 'LICENSE'))], [`${slug}/NOTICE.md`, readFileSync(join(root, 'NOTICE.md'))]);
const pluginZip = join(dist, `${slug}-${version}.zip`);
writeFileSync(pluginZip, zip(pluginEntries));

// The standalone kit: the example page and its data set, the component, the viewer build.
const kit = join(dist, 'standalone');
cpSync(join(root, 'standalone'), kit, { recursive: true });
cpSync(join(plugin, 'assets', 'js'), join(kit, 'js'), { recursive: true });
cpSync(join(plugin, 'assets', 'css'), join(kit, 'css'), { recursive: true });
cpSync(join(plugin, 'vendor', 'caveview', build), join(kit, 'caveview'), { recursive: true });
for (const notice of ['LICENSE', 'NOTICE.md']) cpSync(join(root, notice), join(kit, notice));
const kitEntries = walk(kit).map((p) => [`${slug}-standalone/${p}`, readFileSync(join(kit, p))]);
const kitZip = join(dist, `${slug}-standalone-${version}.zip`);
writeFileSync(kitZip, zip(kitEntries));

for (const [file, count] of [[pluginZip, pluginEntries.length], [kitZip, kitEntries.length]]) {
  const bytes = readFileSync(file);
  console.log(`${relative(root, file).split(sep).join('/')}  ${count} files  ${bytes.length} bytes  sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
}
console.log(`${relative(root, kit).split(sep).join('/')}/  the kit, unpacked`);
