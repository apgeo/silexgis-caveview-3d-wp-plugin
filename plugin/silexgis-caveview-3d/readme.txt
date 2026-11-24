=== SilexGIS CaveView 3D ===
Contributors: apgeo
Tags: cave, 3d, survey, caveview, speleology
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A cave's 3D survey model on a page — its places, photographs and the trips a SilexGIS installation publishes — driven by configuration.

== Description ==

The plugin puts the SilexCaveEmbed component on a page: the survey drawn by the CaveView.js
viewer, a list of places that fly the camera, photographs by station, place names in the prose
turned into links, and — where a SilexGIS installation publishes them — the cave's trips, live
and replayed, read through this site's own proxy so that the share link never appears in a page.

A page carries the shortcode `[silexgis_cave]`, which expands to the container markup, and a
configuration: the JSON object `SilexCaveEmbed.create()` receives. The plugin enqueues the
stylesheet and scripts itself, in the footer, versioned by each file's modification time; the
page content holds markup only, so nothing an editor pass strips can break a model.

Smaller shortcodes are for an expedition's journal: `[silexgis_cave_day_trips day="2026-09-14"]`
(optionally `to="2026-09-17"`) shows the published trips that were in the cave on those days,
`[silexgis_cave_stats]` the expedition's figures per caver and per club,
`[silexgis_cave_trip_log]` a table of every published report, and `[silexgis_cave_columns]` sets
what stands between its tags side by side.

**A page is configured in one of three ways** (in this order of precedence):

1. the shortcode's `config="..."` attribute names a file `<name>.js` in the pages' directory;
2. the page's own meta `_silex_cave_embed_config`, kept by the box *3D model (SilexCaveEmbed)*
   below the content, in the block editor and the classic editor alike — the JSON object,
   validated as it is typed and on save. Writing it needs the `unfiltered_html` capability
   (Editor or Administrator on a single site), and the addresses in it must be paths on this
   site;
3. a file `<slug>.js` in the pages' directory, named after the page's slug.

The pages' directory is `wp-content/uploads/silexgis-caveview-3d/pages/`.

**The code ships with the plugin**: the component, and a build of the SilexGIS fork of
CaveView.js. Either can be replaced by a directory on the site, named on *Settings → 3D models*.

**Data sets.** A cave can be drawn from plain files — `cave.json` (the survey file, the named
places, the photographs), `trips.json` and `media/` — with no installation behind it. The site
writes such a set for each cave whose published trips it follows, and imports others from zip
archives on *Settings → 3D models*. A page names a set with `data: { group: "<name>" }`.

**The other two screens**: *Settings → 3D models (caves)*, the table of place names for the
automatic links in the prose, and *Settings → Published trips*, the SilexGIS installation's
address and the share links by slot. The proxy's REST routes are
`silexgis-caveview/v1/trips/{slot}`, `/live`, `/past` and `/past/{trip}`.

= External services =

When an administrator enters a SilexGIS installation's address and share links on *Settings →
Published trips*, the site's server reads that installation's public published-trip routes:
every five minutes (to keep its copy of each cave), and when a page asks for the trips being
followed. What is sent is the share link's token in the request address; nothing about the
site's readers is sent. Without that setting the plugin contacts no service. SilexGIS is
software a caving group installs on its own server; the installation's terms and privacy are
its operator's.

== Languages ==

The admin screens are in the site's language (Settings → General), or in the language an
administrator chose in their own profile. The strings are written in English, with a Romanian
translation in `languages/`. A language is added by copying `languages/silexgis-caveview-3d.pot`
to `silexgis-caveview-3d-<locale>.po`, translating it, and running `tools/build-translations.py`
from the plugin's repository, which writes the `.mo` and `.l10n.php` WordPress reads.

The language the pages open in is set apart, on *Settings → 3D models*: by default the site's own
where the component has it (English or Romanian), English otherwise. A reader can switch on the page.

== Installation ==

1. Upload the zip on *Plugins → Add New → Upload Plugin* (or the `silexgis-caveview-3d`
   directory to `wp-content/plugins/`) and activate the plugin.
2. Put `[silexgis_cave id="cave_model" places_id="cave_places"]` into a page, and its
   configuration into the box below the content.
3. For published trips, enter the SilexGIS installation's address and share links on
   *Settings → Published trips*.

== Frequently Asked Questions ==

= What happens when the configuration I paste is not JSON? =

Nothing is saved: the page keeps the configuration it had, and the message names the line
and column where the text stops being JSON, with the usual slip by name — a comment, single
quotes, a trailing comma. The refused text is offered back in the box.

= Who can set a page's configuration? =

A user with the `unfiltered_html` capability — on a single site, an Editor or an
Administrator. For everybody, the addresses in it (`home`, `surveyDirectory`,
`terrainDirectory`, `pictures.root`, `pictures.thumbnails`, `trips.source.base`) must be paths
on this site, beginning with a single `/`; a configuration naming another host is refused at
save and never printed.

= What happens when I deactivate the plugin? =

Every page with a model loses its stylesheet and scripts, the shortcode is shown to readers as
text, and the published trips' routes answer 404. While a published page carries a model, the
Deactivate link asks before doing it.

= What does deleting the plugin remove? =

Nothing. The share links, the alias table, the settings and each page's configuration are the
site's own; a reinstall finds them where they were.

== Changelog ==

= 0.1.0 =
* First release as a generic plugin: the component and a build of the CaveView.js fork
  (2.9.0-slx.25: toolbar titles from the viewer's catalogue, and a refused fullscreen — as on
  an iPhone — covers the window instead) ship inside it; shortcodes `[silexgis_cave]`, `[silexgis_cave_day_trips]`,
  `[silexgis_cave_stats]`, `[silexgis_cave_trip_log]`, `[silexgis_cave_columns]`; REST namespace
  `silexgis-caveview/v1`.
* A page's configuration in post meta, through a box on the page, or in a file named after the page.
* The site's own copy of each cave as a data set, and data sets imported from zip archives.
* A same-origin proxy for a SilexGIS installation's published trips, keeping the share links on the server.
* Admin screens in English and Romanian.
