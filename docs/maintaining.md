# Maintaining: the viewer fork, this plugin, and the sites that use it

Three kinds of repository are involved, and changes flow one way:

```
CaveView.js fork  ──build──▶  this plugin  ──release zip──▶  a site's own repository
(apgeo/CaveView.js,            (vendor/caveview/<version>/      (its settings, its pages'
 branch silexgis)               + the component in assets/)      configurations, theme tweaks)
```

**Nothing is edited downstream.** A viewer fix is made in the fork, released as a new build, and
vendored here; a component fix is made here, released, and installed on a site. A site never
carries a patched copy of the plugin or of the viewer — when it needs something the plugin cannot
do, the plugin grows a setting or a filter for it.

## The viewer build (`plugin/silexgis-caveview-3d/vendor/caveview/<version>/`)

The component is written against the fork's own API — `focusStation`, `setStationMedia`,
`addLiveMarker`, `setStationMediaMarkers`, the size classes and the toolbar strip — so it needs a
build of the fork's `silexgis` branch, not an upstream CaveView.js release.

Vendoring a new build:

1. In the fork, the version is stamped in both `package.json` and `src/js/core/constants.js`
   (`2.9.0-slx.<n>`), `npm test` passes, and the commit is pushed to `silexgis` on GitHub (a
   build vendored from an unpushed commit has no public source).
2. Build from a clean clone at that commit, and copy `build/CaveView/js/CaveView2.min.js`,
   `js/workers/*.js` (the four non-minified workers), `css/caveview.css`, `images/logo.svg`, and
   **`lib/lang-ro.json` by hand** (a tracked file the build does not write) into
   `vendor/caveview/<version>/`. Remove the previous directory: the plugin ships one build.
3. Set `SILEX_CE_CAVEVIEW_BUILD` in `silexgis-caveview-3d.php`, the commit in `NOTICE.md`, and the
   version in `readme.txt`'s changelog.
4. Run `node tests/wp/check.mjs`: it asserts the page loads the build named by the constant and the
   model is drawn.

Never rebuild a version in place: a changed build gets the next number, so a browser holding the
old file under the old address is never handed different bytes under it.

The fork's `silexgis` branch is shared with other consumers (the SilexGIS application, ThIDE and
others vendor the same builds), and the same GitHub repository also carries unrelated `modernized/*`
branches. Vendor only from `silexgis` and only stamped `2.9.0-slx.<n>` versions.

## The trips fold (`assets/js/silexgis-trips.js`)

Compiled from SilexGIS (`client/src/publictrips/`, `npm run build:trips`), never edited here. When
SilexGIS changes what its published-trip routes answer, rebuild it there and copy it here in the
same release as any change to `cave-trips.js` that depends on it. The routes are SilexGIS's public
contract with every site running this plugin: a change that renames or removes a member breaks
sites that have not updated, so SilexGIS adds before it removes.

## Releasing the plugin

1. `node tests/run.mjs` and `node tests/wp/check.mjs` (both images) green.
2. Bump `Version:` and `SILEX_CE_VERSION` in `silexgis-caveview-3d.php` and `Stable tag:` in
   `readme.txt`; add the changelog entry.
3. `node tools/build-zip.mjs`; tag `v<version>` and attach both zips to a GitHub release. The zips
   are reproducible: the same commit builds the same bytes, so the published sha256 can be checked.

## A site that uses the plugin

A site's repository pins a released zip (by version and sha256) and keeps only what is its own:
its settings, its pages' configuration files (`wp-content/uploads/silexgis-caveview-3d/pages/`), a
small site plugin for theme adjustments (the `silex_ce_body_class_swap` filter, styles), and its
deploy tooling. Updating is installing the next zip. If a site needs a fix before a release, it
waits for the release or names a component directory of its own on *Settings → 3D models* for the
time being — and the fix still lands here first.

## Before WordPress.org

The plugin is not in the WordPress.org directory (`Update URI: false`). Listing it would need:
removing `Update URI: false`; the readme's *External services* section kept accurate; human-readable
source for the minified viewer build and the compiled trips fold available (they are, in the two
repositories named in `NOTICE.md`, and the readme must link them); the AGPL-licensed trips fold
either accepted by the review as GPL-compatible or relicensed by its copyright holder; and a clean
run of the Plugin Check plugin.
