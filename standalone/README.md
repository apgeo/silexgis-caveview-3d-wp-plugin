# The cave component on any web page

The component that draws a cave's 3D survey with its places, photographs, published trips,
replays, journal and figures is plain JavaScript. It needs no WordPress, no jQuery and no
SilexGIS installation: the WordPress plugin only adds a settings screen, a proxy for live
trips and a copy of what an installation publishes. This directory is a working example of a
page with none of that.

`index.html` here is a complete page. `set-example/` is an invented data set (the survey is
the demo survey that ships with CaveView, `P8_Master.3d`; the places, the photograph and the
trip are invented).

## Files a page needs

`node tools/build-zip.mjs` (from the repository's root) writes this kit with every file in place, as
`dist/silexgis-caveview-3d-standalone-<version>.zip` and unpacked in `dist/standalone/`. To build a
page of your own, copy these next to it (the paths are the ones `index.html` uses):

| Path | From | What it is |
|---|---|---|
| `caveview/` | `plugin/silexgis-caveview-3d/vendor/caveview/<version>/` (a build of the SilexGIS fork of CaveView.js, 2.9.0-slx.18 or later) | the 3D viewer: `js/CaveView2.min.js`, `css/`, `images/`, `lib/`, `js/workers/` |
| `js/cave-embed.js` | `plugin/silexgis-caveview-3d/assets/js/` | the component |
| `js/text-autolink.js` | same | optional: turns place names written in the text into links |
| `js/lightbox.js` | same | optional: opens photographs over the page |
| `js/silexgis-trips.js` | same | the trips replay engine, built from the SilexGIS repository |
| `js/cave-trips.js` | same | trips: the list, the replay, links to people and moments |
| `js/cave-journal.js` | same | loaded by `cave-trips.js` by itself, from the same directory: day chips, the log, the figures, scanned maps |
| `css/cave-embed.css` | `plugin/silexgis-caveview-3d/assets/css/` | the component's stylesheet |
| a data set | see below | the cave and its trips |

Load the scripts in the order `index.html` does: the viewer, `cave-embed.js`, then the
optional ones, then `silexgis-trips.js` and `cave-trips.js`. Serve the files from a web server
(the viewer fetches the survey; a page opened as `file://` cannot).

The browser may report two missing files, and both are harmless: `tileSets.json`
(the viewer looks for terrain and draws none) and `caveview/lib/lang-en.json` (an English
viewer uses its built-in words).

## The markup

```html
<div class="cave_embed">
  <div class="cave_embed_places" id="my_places"></div>
  <div class="cave_embed_model cv-container" id="my_model"></div>
</div>
```

The switches, the tabs, the trips list, the replay strip, the log and the figures are added by
the component inside the block.

## The configuration

```js
SilexCaveEmbed.create({
  container: 'my_model',          // the model's element
  placeList: 'my_places',         // the place list's element
  home: 'caveview/',              // the viewer's directory
  language: 'en',                 // 'ro' or 'en'; the reader can switch with the RO/EN buttons
  data: { url: 'my-set/' },       // the data set: the cave and its trips
  trips: { list: { aside: true }, log: {}, stats: { tab: true } }
});
```

Instead of a data set, a page can still say everything itself — `surveyDirectory` and
`survey`, `places`, `pictures: { root, thumbnails, byStation }`.
What the page says itself always comes over what a data set says.

Links in the text drive the model. A station: `<a class="cv_goto" data-selection="<station>">`.
A trip, a person or a moment: `data-silexgis-trip`, `data-silexgis-caver` (the person's number
on that trip), `data-silexgis-moment` (an ISO time), `data-silexgis-play`. Places marked as
`landmark` are linked in the text by themselves.

## The data set

A directory with two documents and the files they name. The plugin's own copy of what a
SilexGIS installation publishes has exactly this form, and so does a set imported into the
plugin from an archive.

```
my-set/
  cave.json      the cave: its survey file, its places, photographs at stations
  trips.json     the trips: the list and each trip's track
  media/         the files both name (the survey, photographs, scanned maps)
```

`cave.json` (`format: "silexgis-cave/1"`):

```json
{
  "format": "silexgis-cave/1",
  "writtenAt": "2026-10-16T08:00:00Z",
  "survey": { "file": "media/survey.lox", "format": "lox", "sha256": "…" },
  "places": [
    { "station": "cave.entrance.0", "label": "Entrance", "depth": 0, "landmark": true },
    { "station": "cave.branch.12", "label": "The gallery", "note": "120 – 130" }
  ],
  "pictures": [
    { "station": "cave.branch.12", "file": "media/photo.jpg", "thumbnail": "media/photo-480.jpg", "caption": "…" }
  ]
}
```

- `survey.file` — the survey (`.lox`, `.3d` or `.plt`), relative to the set's directory.
- `places` — in the order the list shows them. `depth` is metres below the entrance (a number),
  `note` is what the list shows where there is no single depth, `landmark` names the place on
  the model and links it in the text.
- `pictures` — photographs at stations. Addresses are relative to the set's directory, or
  absolute (`/…`, `https://…`); any other kind of address is ignored.

`trips.json` (`format: "silexgis-trips-export/1"`) is the shape a SilexGIS installation's
published-trip routes answer in: `past.trips` is the list of finished trips (the answer of
`/api/v1/public/trips/{token}/past`), and `tracks` holds each trip's track by its id (the
answer of `/api/v1/public/trips/{token}/past/{id}`), with every file address pointing into the
set instead of at the installation. `set-example/trips.json` is a small complete one.

A set with no `trips.json` is a cave without trips; a page without `trips` in its
configuration does not ask for one.

## Archives

A data set travels as a zip archive of its directory (`cave.json` and `trips.json` at the
root of the archive, the files under `media/`). The WordPress plugin imports such an archive
on its settings screen. A SilexGIS installation will later be able to write one for a cave
and its published trips; until then a set is written by hand or taken from the plugin's own
copy (`wp-content/uploads/silexgis-caveview-3d/trips/<group>/`).
