# SilexGIS CaveView 3D — WordPress plugin

A cave's 3D survey model on a WordPress page — its places, its photographs and the trips a
[SilexGIS](https://github.com/apgeo/silexgis) installation publishes, live and replayed —
driven by configuration. The same component runs on any web page without WordPress.

It draws the survey with a build of the SilexGIS fork of
[CaveView.js](https://github.com/apgeo/CaveView.js/tree/silexgis) (`.lox`, `.3d` and `.plt`
surveys), and adds:

- a **place list** beside the model that flies the camera to each place, and place names in the
  page's text turned into links to the model;
- **photographs at stations**, shown on hover or tap and opened in a lightbox;
- a cave's **published trips** from a SilexGIS installation — the party underground drawn live,
  finished trips replayed with the road each person took, a log, day-by-day chips and an
  expedition's figures — read through the site's own proxy, so the share link never appears in a
  page;
- **data sets**: a cave and its trips as plain files (`cave.json`, `trips.json`, `media/`) that a
  page draws with no installation behind it, kept up to date by the site or imported from a zip.

## Repository layout

| path | what it is |
|---|---|
| `plugin/silexgis-caveview-3d/` | the WordPress plugin, exactly as installed (`assets/` the component, `vendor/caveview/<version>/` the viewer build) |
| `standalone/` | the component on a plain page, with an example data set |
| `examples/` | page configurations, as pasted into the plugin's box |
| `docs/` | [the plugin](docs/plugin.md), [the component and its configuration](docs/component.md), [how this repository relates to the viewer fork and to sites that use it](docs/maintaining.md) |
| `tests/` | `run.mjs` (seconds, no WordPress) and `wp/check.mjs` (a real WordPress in Docker) |
| `tools/` | `build-zip.mjs` (the release zips), `build-translations.py`, `stamp-journal.py` |

## Install

Download `silexgis-caveview-3d-<version>.zip` from the
[releases](https://github.com/apgeo/silexgis-caveview-3d-wp-plugin/releases) (or build it, below),
then in WordPress: *Plugins → Add New → Upload Plugin*. Requires WordPress 6.0 and PHP 7.4 or later.

Put the shortcode in a page —

```
[silexgis_cave id="cave_model" places_id="cave_places"]An optional caption.[/silexgis_cave]
```

— and its configuration, as JSON, in the *3D model (SilexCaveEmbed)* box below the editor. The
smallest one names a survey:

```json
{
  "container": "cave_model",
  "placeList": "cave_places",
  "surveyDirectory": "/wp-content/uploads/caves/",
  "survey": "my-cave.lox",
  "places": [ { "station": "mycave.entrance.0", "label": "Entrance", "depth": 0 } ]
}
```

`examples/` has a configuration drawn from a data set and one with every address field; the
fields are documented in [docs/component.md](docs/component.md).

## Without WordPress

`node tools/build-zip.mjs` writes `dist/standalone/` — `index.html`, the component, the viewer
build and an example data set — which any static web server can serve. See
[standalone/README.md](standalone/README.md).

## Develop

Needs Node 22.2 or later, Python 3 and Docker (PHP runs in containers).

```sh
node tests/run.mjs                    # PHP 7.4 and 8.3 unit checks, translations, stamps (~15 s)
node tests/wp/check.mjs               # WordPress 6.1 on PHP 7.4 in Docker (~4 min)
WP_IMAGE=wordpress:latest node tests/wp/check.mjs
node tools/build-zip.mjs              # dist/: the plugin zip and the standalone kit
```

`tests/wp/check.mjs` imports Playwright with Chromium from this directory's `node_modules`, or from
the directory named by `PLAYWRIGHT_NODE_MODULES`.

After editing `assets/js/cave-journal.js`, run `python3 tools/stamp-journal.py` (it is loaded by
`cave-trips.js` under a stamp of its contents). After changing a translatable string, run
`python3 tools/build-translations.py`.

## Licence

GPL-2.0-or-later (`LICENSE`). The CaveView.js build is MIT, and the SilexGIS trips fold
(`assets/js/silexgis-trips.js`) is used under GPL-2.0-or-later, one of the two licences SilexGIS
offers it under; see [NOTICE.md](NOTICE.md).
