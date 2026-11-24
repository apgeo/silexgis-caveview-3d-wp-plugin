# Notices

The plugin and the component are licensed under the GNU General Public License, version 2 or
(at your option) any later version — see `LICENSE`. Three parts come from elsewhere; their
licences are below.

## CaveView.js (the SilexGIS fork) — MIT

`plugin/silexgis-caveview-3d/vendor/caveview/<version>/` is a build of the `silexgis` branch of
<https://github.com/apgeo/CaveView.js>, a fork of CaveView.js by aardgoose
(<https://github.com/aardgoose/CaveView.js>). The source of every build is that branch at the
commit stamped with the build's version (`2.9.0-slx.23` is commit `e6363220`). The build bundles
three.js (MIT, <https://github.com/mrdoob/three.js>).

> The MIT License (MIT) — Copyright (c) 2016 (as written in the CaveView.js LICENSE file)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## The SilexGIS published-trip fold — AGPL-3.0-or-later OR GPL-2.0-or-later

`plugin/silexgis-caveview-3d/assets/js/silexgis-trips.js` is compiled, unchanged, from SilexGIS
(<https://github.com/apgeo/silexgis>): the source is `client/src/publictrips/index.ts` and the files
it imports, built with `npm run build:trips` (`client/vite.trips.config.ts`). It is the rule that
decides where each member of a published trip was at a given moment, compiled from the same source
the SilexGIS application uses so that the two cannot disagree. SilexGIS as a whole is
AGPL-3.0-or-later; the files compiled into this one are offered under AGPL-3.0-or-later OR
GPL-2.0-or-later, and are used here under GPL-2.0-or-later. The file's first line says the same.

## The example survey

`standalone/set-example/media/P8_Master.3d` is the demonstration survey shipped in the CaveView.js
repository (`docs/surveys/P8_Master.3d`), used here unchanged. Every place name, photograph and
trip in `standalone/set-example/` and `examples/` is invented.
