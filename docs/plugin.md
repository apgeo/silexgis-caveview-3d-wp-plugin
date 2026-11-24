# The WordPress plugin

**SilexGIS CaveView 3D** puts a cave's 3D survey model on a page — its places, its
photographs and its published trips — driven by configuration. It wraps the `SilexCaveEmbed`
component (`docs/component.md`) and ships it together with a build of the
[CaveView.js fork](https://github.com/apgeo/CaveView.js/tree/silexgis) it is written against.

## What it does

- **Enqueues the stylesheet and scripts of a page that carries a model**, in the footer,
  versioned by each file's modification time. The content of the page holds markup only:
  the block editor strips `<link>` and `<script>` from anything that is not a raw-HTML
  block.
- **Recognises such a page by its content, not its id** — the `[silexgis_cave]` shortcode,
  or the container's class `cave_embed_model` written by hand in a raw-HTML block — so a
  preview, a duplicate or a new page needs no plugin change.
- **Expands `[silexgis_cave]`** into the container markup the `SilexCaveEmbed`
  component needs. A raw-HTML block dies to the editor's "convert to blocks" prompt; a
  shortcode survives even when it is absorbed into a paragraph.
- **Expands `[silexgis_cave_day_trips day="2026-09-14" to="2026-09-17"]` and
  `[silexgis_cave_stats]`** into one empty, hidden element each, which the component's journal
  module fills: the trips that were in the cave on those days, as chips, and the
  expedition's figures. `model="…"` names which model's trips where a page has two. A day
  that is not a calendar day emits nothing, and a model id keeps only the characters an id
  is made of. A page whose configuration asks for chips under its day headings or for the
  figures at the end of the article needs neither.
- **Expands `[silexgis_cave_trip_log]`** the same way, into the element the journal module
  fills with a table of every published report, and **`[silexgis_cave_columns] …
  [/silexgis_cave_columns]`** into a frame that sets what stands between its tags side by side
  where the article is wide enough and one under the other where it is not — the figures
  and the log at the end of an article:
  `[silexgis_cave_columns][silexgis_cave_stats model="cave_model"][silexgis_cave_trip_log model="cave_model"][/silexgis_cave_columns]`.
- **Prints the alias table** (the station → names table kept under *Settings → 3D models
  (caves)*) onto the page just before the component that reads it.
- **Serves the cave's published trips** through four public REST routes under
  `silexgis-caveview/v1/trips/<slot>`, each a bytes-in-bytes-out read of a SilexGIS
  installation's anonymous route for a share link the site holds in its own options — the
  link never appears in a page, a URL or a log.
- **Keeps a copy of each cave as a data set** — its trips, and the cave itself: survey file,
  named places, photographs — and **imports data sets from archives** (see *Data sets*), with two
  more public routes, `silexgis-caveview/v1/cave/<group>/cave.json` and `…/file/<key>.<ext>`, for a
  site that keeps no copy.
- **Swaps nothing in the theme by itself.** A page built around a model often wants the width a
  sidebar would take, and each theme says that its own way. A site that wants it hands the
  plugin pairs of body classes to swap on pages with a model:

  ```php
  add_filter( 'silex_ce_body_class_swap', function () {
      return array( 'visible-sidebar-right' => 'invisible-sidebar-right' );
  } );
  ```

  `silex_ce_page_has_model()` answers the same question for any other theme code.

## Where the code comes from

The plugin ships the component (`assets/`) and a build of the CaveView fork
(`vendor/caveview/<version>/`), and both are updated with the plugin. Either can be replaced by a
directory on the site, named on *Settings → 3D models* — a newer viewer build uploaded ahead of a
plugin release, or a component under development. Such a directory is a path from the root of the
host, and the settings screen refuses one whose code is not there (`js/cave-embed.js` under the
component directory, `js/CaveView2.min.js` under the viewer build). The override is read from the
disk under the WordPress directory, so it serves only a WordPress installed at the root of its
host; the copies the plugin ships have no such limit.

Every page with a model is told the viewer build's address as `SilexCaveEmbedSite.home`, so a
page's configuration needs no `home` of its own.

## Configuring a page

A page needs two things: the shortcode in its content, which puts the container on the
page —

```
[silexgis_cave id="cave_model" places_id="cave_places"]
  An optional caption, as enclosed content.
[/silexgis_cave]
```

(attributes: `id`, `places` = `on`|`off`, `places_id`, `height`, `width`, `class`,
`config`; the caption goes between the tags, never in an attribute, because attributes die
to curly-quote substitution) — and its **configuration**, the JSON object that
`SilexCaveEmbed.create()` receives: the survey, the viewer's home, the places with their
stations, the pictures by station, the published trips' slots. The fields are documented
in the component's own documentation (`docs/component.md`). A page gets its configuration
in one of three ways, and when more than one is present this is the order of precedence:

1. **The shortcode's `config="..."` attribute** names a file
   `<pages directory><name>.js` explicitly. It survives a slug rename, and it
   wins whenever it is present.
2. **The page's own meta**, `_silex_cave_embed_config`, kept by the box **3D model
   (SilexCaveEmbed)** (*Model 3D (SilexCaveEmbed)* on a site in Romanian) below the content on any page or post, in the block editor (through
   its bridge for classic boxes) and in the classic editor alike. The box holds the JSON
   object; it is validated as it is typed and again on save. A text that is not JSON is
   refused: the page keeps the configuration it had, the person is told where the text
   stops being JSON (line and column, and the usual slip by name — a comment, single
   quotes, a trailing comma), and the refused text is offered back in the box. The plugin
   prints the configuration as an inline `window.SilexCaveEmbed.create({...})` right after
   `cave-embed.js` — or after `cave-trips.js` when the configuration has a `trips`
   section, because `create()` looks for the trips module at the moment it is called. The
   meta is registered for the REST API (`meta._silex_cave_embed_config` on
   `wp/v2/pages` and `wp/v2/posts`), where a text that is not JSON is a 400 naming the
   same place.
3. **A file named after the page's slug**, `<pages directory><slug>.js`. The file is loaded
   as the last script of the set, and calls `create()` itself.

The *pages directory* is `wp-content/uploads/silexgis-caveview-3d/pages/` — outside the
plugin, which an update replaces whole — or, where *Settings → 3D models* names a component
directory of its own, `pages/` inside it.

A page that ends up configured by none of these renders its containers empty and says why
in the browser console, naming the file it looked for and the box it could have used.

### Who may write a page's configuration, and what it may name

A configuration is not text: it names the directories every reader's browser requests the
page's stylesheet, model, pictures and trips from. Two rules follow, and they are
independent — either would be enough, and both are kept.

**Writing it needs the `unfiltered_html` capability**, the one WordPress requires before
it lets a `<link>` or a `<script>` through in a page's content — on a single site, Editor
and Administrator; on a multisite network, or where `DISALLOW_UNFILTERED_HTML` is set,
fewer or nobody, and then a page is configured by a file. Being able to edit the post is
not enough. A user without the capability is not offered the box, its save handler takes
nothing from them, and the REST API answers `403 silex_ce_config_forbidden` before the
post is created or changed. Reading is as before: whoever can edit the post sees its
configuration in the REST API's `edit` context. A save that sends the configuration back
unchanged — the block editor sends every registered meta whenever one of them was edited
— is not a write, and is let through for anybody who may save the post.

**The fields that become addresses stay on this site**, whoever writes them. They are
checked when the configuration is saved and again before it is printed:

| field | what the component does with it | must be |
|---|---|---|
| `home` | the viewer's stylesheet `<home>css/caveview.css`, its language catalogue `<home>lib/lang-<language>.json` | a path on this site |
| `surveyDirectory` | the model, `<surveyDirectory><survey>` | a path on this site |
| `terrainDirectory` | the terrain tiles and `tileSets.json` | a path on this site |
| `pictures.root`, `pictures.thumbnails` | each picture's link and its thumbnail | a path on this site |
| `trips.source.base` | the published trips' routes | a path on this site |
| `survey` | joined onto `surveyDirectory` as it stands (one name, or a list) | a file name beneath it |
| `language` | part of the catalogue's file name | a language code, or nothing |

*A path on this site* begins with a single `/` followed by something other than a slash,
and contains no host or scheme, no `//`, no backslash, no control character and no `..`
segment (written out or percent-encoded). *A file name beneath* a directory does not begin
with `/`, carries no scheme, and is otherwise held to the same. A key named `__proto__` is
refused anywhere in the configuration: printed as a JavaScript object literal it would
become the object's prototype and carry a field past the check of that field. Picture
names and trip slots need no rule — the component percent-encodes them. An absent field is
fine; the component's own defaults are on this site.

A configuration that breaks the rule is refused the way a text that is not JSON is: the
box says so while it is typed, the save keeps the previous configuration and names the
fields, the REST API answers `400 silex_ce_config_address` with the fields in
`data.fields`. One that reaches the database some other way is **not printed**: the page
falls back to its slug-named file if there is one, and its console names the fields. That
warning quotes text from the database — the refused keys by name, and the slug — so it is
printed as the `create()` call is, with `<` and `>` as escape sequences: inside a script
element a `<!--` followed by a `<script` makes the browser read past the element's own
closing tag, and everything the page prints after it would become script text.

## The options

| option | what it holds | where it is edited |
|---|---|---|
| `silex_ce_assets_base` | a component directory of the site's own (with `css/`, `js/`, `pages/`), or empty (the default) for the plugin's `assets/` | *Settings → 3D models* |
| `silex_ce_caveview_home` | a CaveView build of the site's own, or empty (the default) for the plugin's `vendor/caveview/<version>/`; every page is told the build in use as `SilexCaveEmbedSite.home` | *Settings → 3D models* |
| `silex_ce_label_scale` | how large the models write their station names, as a part of the viewer's own size (`1` by default) | *Settings → 3D models* |
| `silex_ce_language` | the language a page with a model opens in unless its configuration names one: `auto` (the default: the site's language where the component offers it, English otherwise), `ro` or `en`; pages are always handed the two-letter code, never `auto` | *Settings → 3D models* |
| `silex_cave_autolink` | the alias table for automatic place links (`{version, switches, entries}`) | *Settings → 3D models (caves)* |
| `silex_cave_trips` | the SilexGIS installation's address and the share links by slot, with the text of the links field as it was typed (`{base, slots, text}`) | *Settings → Published trips* |
| `silex_trips_generation` | the counter the trips cache's keys carry; forgetting is moving it on | the proxy, on save and on *Empty the cache* |
| `silex_ce_cache_notice` | whether a page says, in one small line, when the installation is not answering and its trips are the site's copy (`1` by default) | *Settings → 3D models* |
| `silex_ce_bundle_state` | what the last writing of each cave's copy did: when it was written and tried, the last failure, the validators of its tracks; the survey file it names and its digest, when `cave.json` was written (`survey`, `surveySha256`, `caveWrittenAt`); and what the last writing fetched (`tally`, with `surveyFetched`/`surveyRefused`) | the scheduled event and *Write the copy of the trips now* |
| `silex_ce_keep_copy` | whether the site keeps its own copy of what the installation publishes (`1` by default); off, nothing is written and the pages read the installation as they are asked | *Settings → 3D models* |
| post meta `_silex_cave_embed_config` | a page's configuration, as a JSON string | the box on the page |

A path given for either must start and end with `/`, contain no whitespace and no `..`, **and
have its code behind it**: the settings screen refuses a path whose witness file
(`js/cave-embed.js` under the component directory, `js/CaveView2.min.js` under the
CaveView build) is not on the server, keeps the stored value and says which file it looked
for. So a mistyped setting, or the next viewer build named before it is uploaded, is never
saved — the files go up first, the path follows. What this does not cover: a directory
emptied *after* its path was saved is still enqueued from, with every file answering 404,
and the screen then shows the witness as missing; and a stored value of the wrong shape,
which only something other than the screen could have written, is ignored in favour of the
plugin's own copy.

## The site's copy of the trips

A page about an expedition draws its list, its replays, its day chips and its figures from the
cave's finished trips. The plugin keeps one file per cave with all of them —
`wp-content/uploads/silexgis-caveview-3d/trips/<group>/trips.json`, the photographs and map sheets
beside it under `media/` — written from the installation through the links on *Published
trips*, by a scheduled event every five minutes and by *Write the copy of the trips now* on
*Settings → 3D models* (`includes/trips-bundle.php`). Every page with a model is told where it
is, and reads it as a plain file the web server hands over: as fast as any other file, with no
PHP behind it. The page then asks the installation, through the proxy, only for what the file
cannot know — whoever is underground now, trips finished since it was written.

What it costs the installation: one list per cave each time, and a track only where it changed —
each is asked with the validator its last answer carried, and an unchanged one comes back "not
modified" with no body. A picture is fetched once and kept under a name made from its address
without the signature.

When the installation does not answer, the file is left exactly as it was: the last copy that
could be written stays the page's for as long as that takes, and the settings screen shows the
failed try and why. A page drawn from it while the installation is silent says so in one small
line with the copy's date, unless *A note when a page is drawn from the copy* is switched off. A page that
names a file in its own configuration (`trips.export.url`) keeps it as the copy of last resort,
read only when the site's copy cannot be.

## Data sets

The copy is also the cave itself. Beside `trips.json` the writing puts `cave.json`
(`includes/cave-data.php`), taken from the newest finished trip's survey block: the survey file,
the places the cave names (in the installation's order, with their depth, note and whether each is
a landmark), and the photographs at its stations, named relative to the directory. The survey file
is stored as `media/survey-<first 16 hex of its SHA-256>.<lox|3d|plt>` and fetched again only when
the installation's `modelSha256` differs from the digest of the one held (or none is held); the
old file is then removed. `cave.json` is rewritten only when what it says changed, so a browser is
answered "not modified" between changes. Such a directory is a **data set**, in the form
`standalone/README.md` describes, and a page draws the whole cave from it with
`"data": { "group": "<group>" }`: every page with a model is told each set's address in
`window.SilexCaveEmbedSite.datasets` (`{ base, writtenAt }`), beside `tripBundles`.

**Imported sets.** On *Settings → 3D models*, *Data sets*, a zip archive of such a directory is
imported under a name (small letters, digits, `-` and `_`, at most 40) into
`wp-content/uploads/silexgis-caveview-3d/datasets/<name>/`, and pages name it the same way. Every entry
is judged before anything is written: a path that is absolute or leads out of the set or is more
than two folders deep, a kind of file other than JSON, a survey or a picture (no script, no
markup — the files are served as they are), more than 200 MB unpacked, or no `cave.json` of the
set's form at the root, and the whole archive is refused with nothing written, saying why. A set
is unpacked beside the old one and renamed over it, so a page never reads half of one. Each set has
a delete button. An imported set comes over the site's copy of the same name. A SilexGIS
installation will later be able to export such an archive for a cave and its published trips.

**Keeping no copy.** With *Keep a copy of the installation's data on this site* switched off, the
scheduled writing and its button do nothing (the copy already on disk is left, unused), pages are
told no copy of the trips (`tripBundles` is empty) and, for each group,
`{ base: "/wp-json/silexgis-caveview/v1/cave/<group>/", trips: false }`: `cave.json` there is built from the
installation's answer as it is asked, and the files it names are fetched through
`…/file/<key>.<ext>`, the key being a hash of the installation's address without its signature —
so no signed address leaves the server. The installation's answer is kept a minute, and a read that
found nothing twenty seconds. Nothing of the cave is shown while the installation is away.

## Languages

Every word the plugin's admin screens print — the settings screen, *Published trips*, the alias
table, the box on a page, the notices, the Deactivate question, the plugin's description on the
Plugins screen — is written in English in the code and goes through WordPress's translation
functions under the text domain `silexgis-caveview-3d` (header: `Text Domain`, `Domain Path:
/languages`). The plugin loads its own catalogue on `init`, from `languages/`, and WordPress picks
the file by `determine_locale()`: the site's language (*Settings → General → Site Language*), or,
in the admin, the user's own *Language* from their profile when they have set one. So a site in
Romanian shows the screens in Romanian, word for word as they read before they were English, and an
administrator who wants English sets English in their profile; a site in any other language shows
English until a translation for it is added. No WordPress language pack is needed: the plugin's
strings come from its own files.

`languages/` holds:

- `silexgis-caveview-3d.pot` — the template: every translatable string of the code, with the
  translators' notes;
- `silexgis-caveview-3d-ro_RO.po` — the Romanian, the one file a person edits;
- `silexgis-caveview-3d-ro_RO.mo` and `silexgis-caveview-3d-ro_RO.l10n.php` — what WordPress reads: the
  `.mo` everywhere, the `.l10n.php` first on WordPress 6.5 and later. Both are written from the
  `.po` and never edited by hand.

`tools/build-translations.py` (Python standard library, no gettext tools) writes all of them:
the `.pot` from the PHP, and for every `.po` its `.mo` and `.l10n.php`. With `--check` it writes
nothing and fails when any of them is out of date, or when a `.po` leaves a string of the code
untranslated, has an entry for a string the code no longer has, or changes a placeholder.

```
python3 tools/build-translations.py           # after changing a string or a translation
python3 tools/build-translations.py --check
```

**Adding a language**: copy `silexgis-caveview-3d.pot` to `silexgis-caveview-3d-<locale>.po` (for German
`silexgis-caveview-3d-de_DE.po`), fill in its header's `Language` and `Plural-Forms`, translate every
`msgstr` (each plural form the language has), run the generator, and upload the three files beside
the others. **Changing a string in the code**: run the generator; `--check` then names the
translations that need the new wording.

The pages' own language is a separate matter: the component's catalogue, chosen per page by the
setting *Default language of the pages* (`silex_ce_language`, see the options), by a page's
configuration, or by the reader on the page.

## Deactivating, and updates

Switching the plugin off stops every
model page at once — no stylesheet, no scripts, the shortcode shown to readers as text —
and takes the published trips' routes away (`silexgis-caveview/v1` answers 404), with nothing on
the public side saying why. So while any published page carries a marker or the shortcode,
the **Deactivate** link on the Plugins screen asks first, naming both. The question guards
that link only: the bulk action above the list asks nothing, nor does WordPress when it
deactivates a plugin whose main file it cannot find — replace the plugin's files in place,
never by deleting the directory first. Nothing outside the plugin watches for it being off.

The header carries `Update URI: false`: the plugin is in no public directory yet, and without
that line WordPress would ask wordpress.org for updates under the name `silexgis-caveview-3d`,
which anybody could register there.

## Uninstalling

Deleting the plugin from the Plugins screen removes **nothing** from the database, and
`uninstall.php` exists to say so: the share links in `silex_cave_trips` are minted by a
SilexGIS installation and cannot be minted again from here, the alias table is typed in by
hand, and a page's configuration belongs to the page as much as its text does. A reinstall
finds all of it where it was. What the plugin writes that is not configuration is the trips
cache, which lapses by itself, and the copy of the trips under `wp-content/uploads/`, which is
left as published data a reinstall writes over; deactivating takes its scheduled event off.

