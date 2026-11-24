# SilexCaveEmbed

A cave model on a page, driven entirely by configuration: which survey to load, which
places to offer, where the photographs live. Everything specific to a cave or a page is
the config object, so a second page is data rather than another copy of the code.

The WordPress plugin in this repository wraps it: it holds a page's configuration in post
meta and emits exactly the container markup and the `SilexCaveEmbed.create({...})` call
below. Without WordPress, a page loads the same files itself (see `standalone/`).

## Files

| file | what it is |
|---|---|
| `js/cave-embed.js` | the component. Defines `window.SilexCaveEmbed` |
| `js/lightbox.js` | overlay pictures. Defines `FOOBOX.init()` for markup-driven galleries and `SilexLightbox.open(url, caption)` for a single picture the viewer hands over |
| `css/cave-embed.css` | the block's layout, the place list, the prose links, the trips list and the replay strip, and the responsive rules |
| `js/text-autolink.js` | the engine that turns place names (and, for a page that asks, the party's names) in the prose into links. Defines `window.SilexCaveAutolink` |
| `js/cave-trips.js` | the cave's published trips on the model: the list, the party drawn live, the replay of a finished trip with the road each of them took. Defines `window.SilexCaveTrips`; needs `silexgis-trips.js` and a `trips.source` in the page config (the same-origin proxy is the plugin's; see `docs/plugin.md`) |
| `js/cave-journal.js` | what an expedition's journal shows beside the model: a chip per trip under each day's heading, the expedition's figures, scanned maps with the party on them, the photographs of a replay. Defines `window.SilexCaveJournal`. **Not enqueued**: `cave-trips.js` brings it in itself, from beside its own address, for a page whose `trips` configuration has a `days`, `stats`, `maps` or `photos` section, under a stamp that is the first twelve characters of the file's SHA-256 (`tools/stamp-journal.py` writes it into `cave-trips.js`; `tools/build-zip.mjs` refuses to package either with a stale one) |
| `js/silexgis-trips.js` | the SilexGIS fold — where each of the party is at an instant — as one bundle. **Built, not written**: in the SilexGIS repository, `npm run build:trips` (from `client/vite.trips.config.ts`) writes it to `client/dist-trips/`; copy it here. Never edited by hand. Licensed AGPL-3.0-or-later, like SilexGIS (see `NOTICE.md`) |

It needs the SilexGIS fork of CaveView.js loaded first (`js/CaveView2.min.js` of a build of
the fork's `silexgis` branch; the plugin ships one under `vendor/caveview/<version>/` and tells
every page its address as `home`). It does not need jQuery, WordPress, or anything about a
particular cave.

## Markup

```html
<div class="cave_embed">
  <div class="cave_embed_places" id="example_places"></div>
  <div class="cave_embed_model"  id="example_model"></div>
</div>
```

The block floats right of the article on a wide screen and goes full width, model first,
below 900px. Width and height are `--cave-embed-width` / `--cave-embed-height` on
`.cave_embed`.

## Creating one

```js
const cave = SilexCaveEmbed.create({
  container: 'example_model',
  placeList: 'example_places',
  home: '/caveview/',                  // the viewer build; the plugin passes its own
  surveyDirectory: '/surveys/',
  survey: 'P8_Master.3d',
  places: [ { label: 'Aven foot', station: 'p8.christmas_aven.2', depth: 52 } ],
  pictures: {
    root: '/pictures/',
    thumbnails: '/pictures/thumbnails/',
    byStation: { 'p8.christmas_aven.2': ['aven-foot.jpg'] }
  }
});
```

Thumbnails are looked up as `thumbnails + 'tn_' + name`. **Case matters** — the server is
case-sensitive, and a `.JPG` on disk will not answer a request for `.jpg`.

## What it gives you

* **A place list** beside the model. Clicking an entry flies the camera there.
* **Photographs on the model.** The viewer shows the pictures held for whichever station
  the pointer rests on — and, on a touch screen, whichever was tapped. Clicking one opens
  it in the page lightbox if `lightbox.js` is loaded, otherwise the viewer's own popup.
* **Links in the prose.** Any `<a class="cv_goto" data-selection="station.path">` on the
  page flies the model to that station. The station goes in a data attribute rather than
  an `onclick` or a `javascript:` href because WordPress strips both from post content.
* **`cave.focus(station)`** to drive it from your own code.
* **`cave.setTeams([...])`** — markers the page maintains, for showing where each team is:

  ```js
  cave.setTeams([
    { id: 'team1', label: 'Team 1', sublabel: 'since 18:20',
      station: 'p8.christmas_aven.2', color: '#ffcc00' }
  ]);
  ```

  Call it again with the same ids to move them; ids you drop are taken off the model. A
  team at a station the loaded survey does not contain is reported in the console rather
  than silently drawn nowhere. This is the hook a trip journal would use to show a party's
  progress — it is wired now so that using it later is data, not code.

## Finding station paths

A station path is what the survey calls the place, e.g.
`p8.christmas_aven.2`. The reliable way to find one is to ask the
loaded model rather than to guess:

```js
const tree = cave.viewer.getSurveyTree();
tree.traverse(n => { if (n.comment) console.log(n.comment, n.x, n.y, n.z); });
```

Stations the surveyors commented are the named landmarks — they are the ones worth
putting in a place list. Note that `tree.getPath()` returns `""` in this build; rebuild a
path from the parent chain instead.

## The reader's two switches

The component puts a small bar above the block with two choices, remembered per browser
in `localStorage`:

* **Model pe toată lățimea** — the block takes the full content width with the article
  below it, instead of floating beside the text. Off by default.
* **Listă puncte** — whether the station list is shown at all. On by default.

Both change how wide the model is, and the toolbar is rebuilt when they do, because which
controls fit is a property of the box rather than of the page. Pass `switches: false` to
leave them out.

## The toolbar

`toolbar: { placement: 'top' }` puts **all fifteen** of the viewer's controls over the
model, and lets them wrap rather than taking any away: a reader who cannot reach a view is
worse off than one who gives up a strip of model to a taller bar.

Two pieces of arithmetic keep that from eating the model:

* **the bundle caps the bar at half the model's width** — measured at exactly 50% across
  six widths from 380px to 1097px. The stylesheet here overrides that so the bar may use
  the model's full width, which is what keeps fifteen controls on one row from about
  660px of model upwards.
* below 900px the controls are shrunk through the bundle's own
  `--cv-toolbar-button-size`, rather than removed. At full size fifteen controls wrap to
  four rows on a phone — 154px over a 320px model, half of it gone; at 28px they come to
  two rows and 21%.

Pass `toolbar: { buttons: [...] }` to ask for fewer.

## Language

`language` defaults to `'ro'` and is handed to the viewer, which fetches
`<home>lib/lang-<code>.json`. That fetch is asynchronous and lands *after* the first
model, so the toolbar waits for the same file before it is built — a bar built earlier
keeps the English labels it was born with, and the viewer announces the catalogue on its
configuration object rather than on itself, so there is no event to wait for.

## Two things the host page must not do

* **Do not put asset tags in post content.** The block editor strips `<link>` and
  `<script>` from anything that is not a raw-HTML block. The plugin enqueues these files
  instead, and prints a page's own configuration.
* **Do not let a heading clear the float.** Some themes set `clear: both` on headings,
  which pushes the whole article below a floated block — the stylesheet here overrides it
  for headings that follow `.cave_embed`, and only while the block is floated.

## Opening state

`view` (default `VIEW_ELEVATION_N`), `scraps` and `stationComments` are applied after a
survey loads, not in the construction config — the viewer builds its settings as its own
defaults, then the config, then whatever was last stored by its "save as default" button,
so the stored value wins and one press of that button by anybody would otherwise decide
what every later visitor sees.

They are applied **twice**, 700ms apart. `scraps` is refused at the moment the survey is
announced — it needs geometry still being built — and silently stays off, where the
viewpoint and `stationComments` take straight away. Note also that `viewer.view` **always
reads back as 1** in this build; the setter works, the getter does not report, so check a
viewpoint by what is drawn rather than by asking.

## Pictures, three ways

* **Over the model**, for the station the pointer is on — the viewer's own strip, from
  `setStationMedia`.
* **Over the model, from the list** — resting on a row shows that station's thumbnails
  without moving the camera, because running an eye down a list should not fly the model
  about.
* **As a gallery**, from the "poze" link on a row, or by clicking a thumbnail in either
  strip.

On a page that loads no `lightbox.js` the "poze" link opens the station's first picture in
a tab of its own instead. Only where `pictures.root` followed by the file name is an http or
https address once resolved against the page — which a root beginning with `/` is. A root
that would be run rather than fetched (`javascript:`, `data:`) opens nothing and says so in
the console: the root is whatever was typed into the page's configuration.

## Following a link

`cave.focus(ref)` takes either a station or a named part of the survey. Which one a
reference is cannot be told by looking at it — the dotted paths are the same shape — so a
station is tried first and a section only if the survey has no station by that name. A
station is flown to, marked and given its popup; a section is framed, which draws the
viewer's box around its extent. A name that is neither warns once.

## Zooming to a place

Flying to a station leaves the camera at whatever distance it was already at, so a link
followed from the text arrived at the right place still looking at the whole cave. The
zoom is a two-step the viewer offers no single call for, and is what the page this
component replaces used:

```js
viewer.sectionByName = 'p8.christmas_aven';   // frames it, and draws the box
viewer.setPOI = true;                         // closes the camera in
```

`focus()` does this after the fly completes, taking the section from the first two
components of the station path. A section reference is framed by `focusSurvey` and then
closed in the same way.

## Caching, and why the survey needed more than a header

Set `Cache-Control` on the directories that hold surveys, photographs and map tiles (a month
is reasonable) and on scripts and styles (a week: WordPress appends its own `?ver=` from the
file's modification time, so an edit still busts it). A server that sends none makes every
visit re-fetch everything.

That alone fixes the scripts and styles but **not a large survey**: Chrome refuses to store
any single resource beyond a fraction of its disk cache, and a survey of twenty megabytes is
past it — measured as `fromDiskCache: false` on a second visit while every file beside it
came back `true`.

The fix is to make it smaller. A `.lox` is not compressed, and gzip -9 typically takes one
to between a fifth and an eighth of its size. The server declines to deflate `application/octet-stream` on the fly, so
each survey is **pre-compressed beside itself** as `<name>.lox.gz`, and a rewrite hands that
over when the client accepts gzip:

The viewer asks for the `.lox` and knows nothing about it; a client that does not accept
gzip still gets the plain file. After this the survey caches (`fromDiskCache: true`) and
the model is ready in about 5s rather than 10.

**If you replace a survey, replace its `.gz` too** — the rewrite prefers the `.gz`, so a
new `.lox` beside a stale `.gz` would serve the old cave.

## Stacked, on a phone

Below 900px the block stacks — switches, model, list — and **the model needs its flex
basis handed back**:

```css
.cave_embed_model { flex: 0 0 auto; height: var(--cave-embed-height); }
```

The row layout gives it `flex: 1 1 0` so it does not claim the width of the canvas it
already holds; without that the list wraps above it. But a flex-basis is on the *main*
axis, and stacked the main axis is vertical — the same declaration set the height basis to
zero and the model collapsed to 2px on every phone while still reporting a canvas. If you
change the row rule, change this one with it.

The model is also taller stacked (400px, or 280px on a phone held sideways) than the
desktop proportion would suggest, and the viewer's two 80px dials are scaled to 0.62 below
640px: the toolbar and the dials cost a fixed number of pixels whatever the model is, and
at 320px they left the cave a thin strip down the middle.
## Automatic links from the prose

`text-autolink.js` turns place names written in ordinary text into links that drive the
model, at display time — the post content is never modified. It emits exactly the anchors
a person would have typed (`a.cv_goto[data-selection]`), plus `data-autolink="1"` so the
two can be told apart, so everything downstream is the code that already existed.

Three sources, each switchable in **Setări → Modele 3D (peșteri)**:

| source | where it comes from | maintenance |
|---|---|---|
| `comments` | the surveyors' own station comments inside the `.lox` | none — travels with the survey |
| `aliases`  | the station → names table in the WordPress admin | for spellings a survey does not carry |
| `depths`   | `-815 m` matched to the nearest known station | none, once places have depths |

What it refuses to do: rewrite anything inside an existing link, the model's own
interface, `script`/`style`/`code`/`pre`, or `[data-no-autolink]`; link a name claimed by
two different stations (a guess is worse than no link); or link the same name more than
once per paragraph and twice per page (`limitPerBlock`, `limitPerName`).

A fourth source is the trips module, which hands the engine the party of every trip being
followed so a caver's name in the prose becomes a link that follows them (`data-silexgis-caver`,
and `data-silexgis-trip` for the trip they are that person on). On an expedition the same person
is on several trips, and what a name can carry then depends on their place in each party, which
is how the published page identifies a person: the same place on every trip → one link naming the
person and **no trip**, so it follows them in whichever trip the reader has open (the page cannot
tell which trip a paragraph is about, and naming one would put "follow them on trip C" in a
paragraph about trip A); a different place on different trips → **no link**, since no single link
can say who that is. Both are said in the console rather than done in silence. The engine itself
refuses to let one entry overwrite another for the same name: equal station but different
attributes is ambiguous, exactly as two stations are.

Matching ignores diacritics both ways — text typed "Gaura de soarece" finds the station
commented "Gaura de șoarece" — and the **original** spelling is what ends up inside the
link. Depth matching requires a sign: "815 m de coardă" is rope, "-815 m" is a place.

The depth index is built by measuring: any configured place without an explicit depth has
its station resolved in the survey and its depth computed from the entrance. Without that
only the named landmarks have depths and most written depths find nothing.

Both pages use it. On the journal it runs from the component (`api.autolink()`, re-runnable
after new text arrives); on the presentation page `text-links.js` polls for the survey and
runs the same engine — that page's viewer object exposes the survey tree but no event
emitter, so waiting for an event there fails silently.

The alias table's JSON shape (`{version, switches, entries:[{cave, station, names[], depth}]}`)
is deliberately portable: the same table can later be served by SilexGIS for pages that are
not WordPress, without re-typing it. The admin screen shows it for export.

## The cave's published trips

`cave-trips.js` puts the cave's published trips on the model: the list beside it and
inside it, the party drawn live while a watch is armed, and any finished trip of the cave
played back with the road each of them took. It reads through the site's own proxy
(the plugin's `includes/trips-proxy.php`, routes `silexgis-caveview/v1/trips/<slot>…`) and never through the installation directly, so the
share token is never in a page. It folds nothing itself: where each of the party is at an
instant, and what each of them stands as, is decided by the SilexGIS bundle beside it.

**What the installation answers.** Since 2026-09-24 the installation lists, for any one of
the page's links, every trip of the cave being followed (`/live`) and every finished one
inside its window (`/past`); a link per trip is no longer how the page learns about trips,
and a trip published tomorrow appears with nothing on the page changed. The page asks each
of its links in turn and takes the first answer, starting from the one that answered last,
so a lapsed first link costs one refused request and not one per poll. Only a `404` moves
on to the next link, and only a `404` through every link makes the page fall back to
reading each link on its own (an installation too old to have the list). Anything else —
a `503` from the proxy, a limiter's `429`, a lost connection — is a failure of that read:
whatever did answer is shown, the reader is told the read failed, and it is retried with
backoff (5 s doubling to four live intervals), never turned into "no trip of this cave is
being followed" or into per-link reads for the rest of the page's life. An older proxy's
empty `200` on a total failure is still taken as the answer it claims to be, since nothing
distinguishes it from one; the proxy's own fix for that is a `503`.

Where the page does read each link on its own, a link answering `404` has lapsed and its
trip is dropped. A link refused any other way has said nothing about its trip: it keeps
the row it last answered with, the links that did answer are shown, the reader is told
once that a read failed (every time, where the party on screen is the one not read), and
nothing is concluded from that read about a trip being gone. It is asked again on the
ladder, but never later than the page's own pace, which the trips that answered are owed.
Only when no link answered at all is the read a failed read, with the last answer standing.

**Polling** (`trips.poll`): `liveMs` (30 s) while a party is underground, `idleMs`
(5 min) otherwise, so a party arming in the afternoon on a page opened in the morning, and
a closed watch crossing into the archive, both arrive without a reload. `idleMs: 0`
restores never asking again while nothing is live; a page setting only `liveMs` keeps the
idle default. Nothing is read for a hidden tab, but a read that came due while it was
hidden is made the moment it is seen again. A `503` or `429` carrying `Retry-After`
(seconds or an HTTP date) is believed according to who says it: from the site's proxy — a
JSON refusal whose `code` begins `silex_trips_` — the next retry is that wait, between one
second and ten minutes; from anything else (WordPress in maintenance mode says ten minutes
of an update that takes seconds) at most a minute of it is listened to and never less than
the ladder's own step. Without a usable header the ladder applies. The archive failing by
itself does not slow the reads of a party underground: it climbs a ladder of its own.

**A watched trip becoming history** leaves the followed list some minutes before the
archive lists it, and for some seconds its replay may not be readable either. The trip
stays chosen and as it last stood meanwhile; its track is asked for every
`poll.handoverEveryMs` (10 s), and only a trip still refused as not there after
`poll.handoverMs` (a minute) is said to be no longer published. Answered, it becomes a
replay standing at its end. The asking is one request each time, through the link that
answered the list and not through each of the page's links in turn: what the track route
says of a trip is about the cave, whichever link asks. (A page reading each link on its
own has no such link to name, and asks through the trip's own link and then the others,
as a row pressed does.) The row says it is waiting
(`labels.preparing`) — its own row, whichever trip the reader presses meanwhile, and
pressing another ends the waiting. Where the page lets go of the trip and opens a replay
in its place, *Ieșirea urmărită nu mai este publicată.* is what stands over it once it has
arrived.

**The party.** Each member is listed with a word for where they stand — *în peșteră*,
*ieșit*, *nu a intrat încă* — as the bundle's own `standingOf` reads the envelope's flags,
with a tint only as a second signal; the three are counted above the list. The first
member of an unnamed party is *Primul din echipă*. Where the envelope's model declares
places (`model.places`, each a station with a label — shipped by the application from its
next release, absent today), the marker and the row of a member at one of them carry its
name; the page's own `places` list outranks the declared name for a station it names too,
and an envelope declaring no places names nothing, whatever the page's list says. **That
is a replay's half only.** A finished trip's track carries a model; a row of the
installation's list of the trips being followed carries none, by that list's design, so a
party underground is named nothing even once the application ships places — until it puts
them where this page reads a followed party from, which is not decided.

A follow belongs to the trip it was made in. Whom the view keeps up with is a place in one
party, and the same number is somebody else in the next: when the page itself moves on from
a trip — its publication withdrawn, its track refused — nobody is followed in whatever it
opens, and that party is drawn whole. Where the person followed is on another of the page's
trips as well (known of the trips being followed, whose parties the page holds), their row
carries the open trip's title, since a link naming a person and no trip follows them in
whichever trip happens to be open.

**The replay strip** names the trip and its dates — both ends for a trip over several days
— and carries, besides the scrubber and the clock (which gains the day, `06.09 09:00`,
when the window crosses a local midnight), a chooser of whom the view keeps up with:
*nimeni*, each team, each member. Choosing from it is the same follow as clicking a name in
the party list or following a link in the prose, and the chooser shows a follow made any
of those ways. The controls are named for a reader who is told the strip rather than shown
it: the scrubber is *Momentul reluării* (`labels.scrub`) and says its value as the clock
beside it, not as the instant in milliseconds it holds; the step and play buttons carry
`labels.stepBack`, `stepForward`, `play` and `pause` as their names, not only as tooltips.

**A replay that starts by itself does not, for a reader who asked for less motion**
(`prefers-reduced-motion`): the finished trip the page opens when nobody is underground,
and an address saying `play`, both stand ready at their instant with the play button. A row
the reader presses and a link in the prose they follow are their own asking and play as
for anybody.

**Links about the replay alone.** Besides `data-silexgis-trip` and `-caver`, a link may
carry only `data-silexgis-play` ("start it"; `0`, `no`, `false` or `off` for "stop"), only
`data-silexgis-moment` (an instant to go to in whatever replay is open), or an empty
`data-silexgis-team=""` (the members on no team). The viewer component takes those too,
where this module is loaded; without it they are left the ordinary links they are.

**The page's own address.** A replay somebody chose is written into the fragment of the
page's address — `#past=<trip>&caver=<ordinal>` or `&team=<id>`, `&at=<instant>`, `&play=1`
while running — in the words the application's own published page reads, through the
bundle's `writePastLink`; the fragment rather than the query string because a WordPress
query string is WordPress's and a page cache would answer it as a different page. Written
with `history.replaceState`, at most once a second, never as a history entry. The
application's page writes no instant; this one does, since a reader who winds to the
moment a paragraph describes and copies the address means that moment.

*Chosen* is the reader pressing a row, following a link, putting a hand on the scrubber,
the play button or whom the view keeps up with — or arriving by such an address. The
replay the page opens by itself when nobody is underground is nobody's choice and is not
written, so the article's plain address stays the article's.

**The fragment is the whole page's.** A fragment that is not empty and does not name a
replay — a plain anchor, a comment's, a lightbox's, another script's parameters, even one
that merely shares a name with `at` or `team` — is never written over and never altered,
whatever is on screen; with one in place the replay is simply not in the address. Where a
fragment naming a replay carries other parameters too, only `past`, `team`, `caver`, `at`
and `play` are rewritten and the rest are carried exactly as they stand.

An address is honoured on arrival and again whenever the reader follows another while the
page is open (a link to another moment of the same article loads nothing, so the page
listens for it). It opens the trip as a `data-silexgis-*` link would — at the instant, not
running unless `play` says so, keeping up with whom it names — as soon as the trip is
listed, unless the reader chooses something first; another moment of the replay already
open is gone to without reading its track again. An address followed while the page is
open leaves what is on screen where it is until the trip's track has arrived.

If the trip's track is refused, the address stays and the reader is told, once, that the
replay is being tried again (`labels.replayRetry`). Meanwhile the page is the page it
would have been without the address: what was on screen stays, and with nothing on screen
the party underground — or else the newest other finished trip, standing ready — is
opened, with nobody followed, and the lists are read at their own pace. The track is asked
for again on a ladder of its own (5 s, doubling), which a read is brought forward for,
until it has been refused for `poll.addressMs` (two minutes: six tries); then the reader
is told it could not be loaded (`labels.unopened`, *Reluarea la care trimite adresa nu a
putut fi încărcată.*), over the model and in the list, and the address is let go of. A
reader who meanwhile chooses anything else — a row, or a hand on what stands in: its play
button, its scrubber, one of its party — has chosen, and the address is asked for no more.

An address naming a trip the page does not list — or one listed whose track is not there
— is said to the reader over the model and in the list (`labels.unlisted`, *Ieșirea la
care trimite adresa nu este publicată pe această pagină.*); what the page then opens by
itself stands ready rather than playing, and the sentence is what stands over the model
once that has arrived. In both cases the address is left as the reader brought it until
they choose something, and the line in the list goes when that address no longer stands:
when they choose, or when the fragment becomes anything else, a plain anchor included.

**On a phone** (below 640px) the list inside the model is a sheet along the model's bottom
edge across its width, and the scrubber's thumb is 24px with `touch-action: pan-y`, so a
vertical swipe over the strip still scrolls the page. The open sheet lies over the picture
strips anchored in the same corner (`z-index: 27`: above the viewer's strip, the place
list's thumbnails and the place label; below the toolbar, the tour's caption and the
note), so a press on one of its rows is not taken by a thumbnail.

## The trips list beside the model, and the strip

**The page says *tură*, not *ieșire*, for a trip** (the owner's word, 2026-10-09), here, in
the journal's sections and on the plugin's screens. *Ieșit* and *Ieșiți* are still what
somebody who has come out is.

**A trip is one line**: its title, its party by name, and its days, small — *20.09*,
*20-25.09* within a month, *29.09-4.10* across two. The names of a finished trip are in its
track, so the list reads every track once, a little after the list itself (`list.names:
false` leaves the names out and reads none), and says beside its title how many trips it
holds and how many people between them. How a trip stands is on every row as a tooltip and
as `data-state`, and written out only under the row that is open.

**What is said of the open trip is said under its own row**, and of no other: how it
stands, its days in full, its camp, its headcount; a button that plays or pauses it; a
button for its log (below); and its party, each with where they stand. That is the line a
row used to carry under every trip, and the party box that used to stand under the whole
list.

**Left of the model unless the reader says otherwise** (`list.left`, true by default; the
switch *Ture în stânga modelului*): a column of its own beside the place list and the
model, as tall as the model and scrolling inside itself, on a screen at least 1101px wide.
The block then takes the article's full width — three columns do not fit in the part of it
the block has beside the text; measured on the journal page, the model was left 404px.
Below that width the switch is not offered and the list is under the model, where it
scrolls after some seven rows. The button on the title folds the list down to that title
(kept per browser, like the switches).

**Every finished trip on one clock** (`list.all`, the row *Toate turele*, offered where
there is more than one): the trips are put together as one track — each trip a team of it,
named by its title — and played by the same fold, from the first report of the first to
the last of the last. At an instant, whoever was underground then is drawn and listed, from
whichever trip; two trips in the cave at once are drawn at once. No roads are drawn in this
mode, and it is not written into the page's address.

**The replay runs over the trip, not over its watch.** The fold's window runs from the watch
being armed to its being closed, which for a trip followed as it happened is the trip. A
watch armed after the party's first report, or closed more than six hours after its last,
was opened to write the trip up afterwards; the window is then the reports' own, first to
last (`replayWindow()`). On the journal page the slider ran from each trip to the day it
was imported, and the trip was its first hundredth.

**Everybody is shown, and the view stays where the reader put it.** The chooser on the strip
starts at *toți participanții* — it used to read *nimeni*, nobody singled out, and was read
as nobody shown. Choosing a person or a team shows that one alone; the view goes after them
as they move only where the reader switches *Camera urmărește selecția* on
(`replay.camera`, off by default). A link in the prose that names somebody takes the view
to them once, whichever way that switch stands.

**Gone in, and reported nowhere yet, is at the entrance** (`entrance`, on by default): drawn
at the page's own place of depth 0 and said to be *la intrare*.

**The order of the block is said in the stylesheet, not left to the order things were made
in:** switches, tabs, the row the lists and the model share, the replay strip, the credit
line, the trips list. The strip used to come after the list, a screen below the model it
plays on once an expedition's thirty trips were listed.

**A row is "tocmai încheiată" only when its trip was.** A closed watch is followed for two
days yet, and its row said "just ended" for as long as it was — true of a party out this
evening, false of a trip typed up from its paper log a fortnight later. The word is kept
for a trip whose last day is no more than two days behind the moment its watch closed
(`justEnded()`); any other closed trip is *încheiată*.

**On a trip whose watch has closed, somebody nobody reported is *fără rapoarte***, and the
count line says *Fără rapoarte: n*, not "not in yet": nothing more will be said of them. A
replay is not such a trip — at an instant of it, somebody not yet in is exactly that.

**Somebody who is out is not drawn.** The last place a person was reported stays with them
after they have come out, and drawn there they stood at the bottom of the cave to the end
of a replay, listed as out. They are listed, with that word.

**The replay's speed** is one of seven (`replay.speeds`: ×1, ×10, ×60, ×300, ×900, ×3600, ×14400). A
replay opens at the slowest of them that gets through its window in about `replay.aimSeconds`
(ninety) — an afternoon at ×300, a camp of four days at ×3600 — and a speed the reader
picks is kept for every replay after it. `aimSeconds: 0` opens every replay at
`replay.defaultSpeed`.

**English.** A page whose viewer `language` is English gets the trips module's sentences
in English too (`LABELS_EN`); a label the page sets outranks both.

## Other views in the model's place

`cave.addTab(key, label)` adds a view beside the model and returns the element to draw it
into: it takes the model's place exactly — the same share of the row, the same height — under
the same switches and beside the same place list, and is chosen by a row of tabs that exists
only once somebody has added one (the first tab is the model, `labels.tabModel`).
`cave.showTab(key)`, `cave.onTab(fn)`, `cave.tab`. While another view is shown the model's box
is out of the layout, and it is told its box changed when it comes back. The replay strip is
outside the box and stays, which is what lets a map play.

## The line under the model

*Această vizualizare a fost generată folosind SilexGIS.*, small, under the model, the name a
link to the application's sources. `labels.credit` words it (`{link}` is where the name
goes); a page whose `language` is English gets *This visualisation was generated with
SilexGIS.*; `credit: false` leaves it out.

## The journal's sections

Four sections of a `trips` configuration, each off until a page asks for it, drawn by
`cave-journal.js`. None of them asks the installation anything: every one is worked out in
the reader's browser from the tracks the trips module has already read (`trips.tracks()`
reads each finished trip's track once, one at a time, and stops where a limiter says to).

`timeZone` (an IANA name, beside these sections) is the cave's own clock: which day a report
belongs to. Without it the reader's zone is used, as for the hours on the strip.

**`days`** — `{ headings: 'h2.wp-block-heading', year: 2026 }`. Under every heading of the
article that names a day (*Luni, 5 octombrie*) or a stretch of days (*Luni, 14 septembrie –
Joi, 17 septembrie*) goes a row of chips, one per trip that was in the cave then, each with
its party. Pressing one goes to the model, opens that trip at that day and plays it. Which
trips: from a track, any trip with a report in the stretch or somebody underground across
it; without a track in hand (a trip still being followed), by the trip's own dates. A
heading that names no day gets nothing, a day with no trip shows nothing, and the chips are
under `[data-no-autolink]`, so the names on them are not read as prose. A page can place a
row itself with `[silexgis_cave_day_trips day="2026-09-14" to="2026-09-17"]`, which the heading
it stands under then leaves alone. `auto: false` fills only those.

**`stats`** — `{ tab: true, panel: 'end', clubs: { 'Club': ['name', …] } }`. The expedition's
figures per caver and per club: days and hours in the cave, metres gone down and come up, the
depth reached, the number of trips. Shown for everybody (four bar charts, longest first), for
one caver (six figures, hours day by day, depth against time, their trips as chips that open
the replay following them), for every club, and for one club (its sums, its hours day by
day, its people). As a tab in the model's place, and as a panel — at the end of the article
(`panel: 'end'`), in an element the page names, or wherever `[silexgis_cave_stats]` stands —
with a button that hides it, kept per browser. Neither is offered until a finished trip
gives it something to show.

**`log`** — `{ tab: true, split: 'auto' }`. Every published report as a table: when, which
trip, who, how deep, where, and — where the installation publishes them — what they were
doing and what was noted. As a tab, beside the model where the article's column is wide
enough (`split`, `splitMinWidth`), and in any box the page wrote for it:
`<div data-trip-log>`, which is what `[silexgis_cave_trip_log]` emits. A box has a title, its
own two choosers and its own scroll; narrowing it does not narrow the tab's. A row pressed
in the tab takes the replay to that report and leaves the reader reading; pressed in a box
further down the article it takes them to the model as well. A page with a box and no `log`
section has the log in that box and nowhere else.

**Side by side.** `[silexgis_cave_columns] … [/silexgis_cave_columns]` (the element
`.cave_columns`) sets what it holds in columns of at least 380px: the figures and the log
beside each other at the end of an article on a desk, one under the other on a telephone.

How each figure is made, since it is the first thing anybody asks:

* **A person is the name the installation publishes for them.** A published track numbers
  people by their place in one party, which means nothing in the next. Somebody published
  without a name is in no person's figures, and the panel says how many reports that left out.
* **Hours** are the time between a report after which somebody was underground (`in`, not
  `out`) and their next report, all their trips taken as one sequence. **Days** are the
  calendar days, in `timeZone`, those stretches touch.
* **Handed over underground.** Where one trip's log ends for somebody within two minutes of
  another's finding them still down, the end of the first is not a way out: it is dropped,
  so the stay is one stay and no climb to the surface is counted. Where somebody is left
  underground by one trip and next reported on another more than `maxSilenceHours` (36)
  later, nothing is counted for the gap.
* **Descent and climb** are the differences in depth between consecutive reports that have
  one: the depth the report carries, failing that the station's (`cave.depthOf()`: the page's
  own list, else measured off the survey against the place whose `depth` is 0), with going in
  and coming out as the entrance. **Depth reached** is the greatest of them.
* **A club** is its people added together — days included, as its hours are. Who belongs to
  which is in the page's configuration, because the installation publishes no club.

**`maps`** — `{ sheets: [{ title, image, points: [{ station, x, y }] }] }`. A scanned map as a
tab in the model's place: the sheet drawn whole, the stations it has points for, the party at
theirs with the road each took so far, moved by the same replay strip. A link in the prose
naming a station lights it on the open sheet. Zoom by the buttons, drag once zoomed. Besides
the sheets the page configures, any a track's survey comes with (`model.rasterMaps`, a point
being a fraction 0–1 of the picture) is offered **where it still has a picture's address** —
through the site's proxy it does not, since that address is signed; in an export file it
does. No sheet, no tab.

**`photos`** — `{ holdMs: 2500, max: 6 }`. While a replay runs, a strip of photographs over
whichever drawing is open: those of the stations the party is at (the page's own
`pictures.byStation`, and a published survey's where they carry an address), and those hung
on that moment of the trip (`track.pictures`, by the fold's own `pastPicturesAt`), each
opening in the lightbox. A set stays up for `holdMs` of the reader's own time after the party
has moved on, since at three hundred times life speed a place is left before its picture has
been seen.

**`log`** — `{ tab: true, split: false }`. Every report of every finished trip as a table,
oldest first: when, on which trip, who, how deep, where, and — on an installation that
publishes a report's words (`TripPastTracks:PublishReportWords`) — what the party was doing
and what was noted; without them those two columns are not drawn, and a going-in and a
coming-out are still said. Two choosers narrow it to a trip and to a person; the button
*Jurnalul turei* in an open trip's details opens it narrowed to that trip, and to whoever
is shown alone in it. Pressing a report takes the replay to it, showing whom it is about,
and leaves the reader in the log; the report a replay has reached is marked. As a tab in
the model's place, or — the switch *Jurnal lângă model* — beside the model
(`cave.setSplit('log', true)`): the block then takes the full width, the place list gives
way, and the marked report is kept in view.

**The party's names under a day's heading** (`days.links`, with `cavers.autolink`). The
trips module links a name to the person on the trips being followed; once an expedition is
over every trip is finished, most people were on several, and a name alone says neither
which trip nor when. A paragraph stands under the heading of its day, so a name written
there is linked to that person on the trip they were on that day
(`data-silexgis-trip`, `-caver`, `-moment`, `-play="0"`), at their first reported place of
the day — and, where the same paragraph links a place and they were reported there that
day (or within fifteen metres of its depth), at the moment they were. Made in the reader's
browser from the tracks; nothing is written into the article.

## While a replay is on the model

**Over the model** (`trips.replay.overlay`, on; `overlayTeams`, 6): the day and hour the
clock has reached, and who is underground then, team by team — with every trip on one clock
each trip is a team. It is read through, never pressed, and gives way to the photographs of
a replay and to the list inside the model. It is what a reader who has given the model the
whole screen still has of the party list.

**Several of the party at one station** are one marker, labelled with their names one under
the other (`markers: { names: true, maxNames: 10 }`) instead of with how many they are.

**The whole screen** (`trips.replay.fullscreen`, on): two buttons at the end of the strip.
The first gives the screen to the model *and the strip*, since a model on the whole screen
with its replay left behind on the page cannot be stopped; the second to the whole block —
lists, tabs, panels — laid out to the screen (`api.fullscreen('model' | 'all' | null)`,
`api.fullscreenMode`, `api.onFullscreen(fn)`). The button that took the screen gives it
back. Where a browser gives no element the screen (a telephone's Safari) the block is fixed
over the page instead, and Escape leaves it.

**Starting again** (`trips.replay.loop`, on; `loopHoldMs`, 2500): the replay the page opened
by itself (`openWith: 'all'`) stands at its end for a moment and starts again, until the
reader chooses something — a trip, one of a party, a link in the article, a place, the
replay's own play, step or scrubber. The speed and the two screen buttons are not choices
of what is on the model and leave it running. A replay the reader started ends where it ends.

## The size of the survey's writing

`labelScale` (1): how large station names and their comments are drawn, as a part of the
viewer's own size. It is said to the viewer as its theme's `fontsize` for each kind of
station when the viewer is built, which every build honours; `api.setLabelScale(n)` changes
it while the model is up on a build that can (`stationLabelScale`, fork 2.9.0-slx.17).
`theme` passes any other member of the viewer's theme through.

## Fed from a file

`trips.export: { url, mode }` reads the cave's finished trips from a file written ahead of
time by `tools/export-trips.py` — the list, every track, and the pictures they point at,
exactly as the installation's published routes answered on the day it was written:

| `mode` | what answers |
|---|---|
| `'first'` (default) | the file at once, for what it holds; the installation as well, for whoever is underground now and for trips finished since. Where it does not answer, the page is the file's and says nothing of a failure |
| `'only'` | the file and nothing else — a page with no installation behind it. A `trips` section with an `export` and no `source` is this |
| `'fallback'` | the installation first, as on a page without a file; the file where a read of it fails |

Nobody is underground in a file. The file is fetched with `cache: 'no-cache'`, so a new one
is seen at once in spite of the week this directory's files are cached for. It holds what
the page shows and nothing else: no link, no signed address, not the survey's own file.

## Which way the model is being looked at

The viewer will not tell you. `viewer.view` answers `VIEW_PLAN` whatever the view actually
is, and so does `getView()` — measured by setting each of the five views in turn and reading
all five back as `1`. The property is also **non-configurable**, so it cannot be wrapped to
listen in (`defineProperty` throws `Cannot redefine property: view`).

So the component keeps the note itself. Every place here that changes the view goes through
`setView()`, and the one other thing that can change it — a reader pressing a view button in
the toolbar — is watched directly, since those buttons are ours and their order is the list
we asked for. That is the complete set of ways the view can change, which is what makes the
note trustworthy. `api.setView('VIEW_PLAN')` is the public form; plain assignment to
`viewer.view` works but leaves the note stale.

This exists so that **flying to a place keeps the view it was seen from**. Framing a section
swings the camera on its own; without knowing what the reader was looking at there is nothing
to put back. `focus()` re-applies the remembered view one frame after the flight.

Verified by reading the viewer's own HUD out of the rendered frame (the dials are drawn into
the canvas, so this is the only truthful readout): on load `0° / 000°`, and after flying to a
place still `0° / 000°` — the same north elevation, only closer. In plan view the inclination
is likewise kept at `-90°`; the bearing is left free, which is what plan view means.

## The slow turn

`autoRotate: { enabled, rate, delay }` starts a slow rotation once the survey is in, so the
cave reads as a solid shape rather than a flat drawing. It stops permanently at the first
sign of the reader doing anything — pointer, wheel, touch, key, following a link, starting
the tour, reset — because a view drifting under someone trying to read it is worse than no
movement. Skipped entirely under `prefers-reduced-motion`. The journal page uses `0.075`.

`rate` is the viewer's own `autoRotateSpeed`: from `-1` to `1`, the sign being the
direction. `1` is a whole turn in about five and a half seconds at sixty frames a second;
the viewer's default, `0.18`, is one in thirty; `0.075` is one in about seventy-three. A
page that names no rate turns at the viewer's default. The component used to write the rate
to `autoRotateRate`, a name no release of the viewer has — the assignment made a plain
field, raised nothing and read back as written, so every page turned at the default
whatever it asked for.

Note `viewer.autoRotate` reads back `false` even while the model is turning; like `view`, it
is a getter that does not report.

## Links before the survey

The text is linked **twice**: once as soon as the component runs, and again when the survey
lands. Two of the three vocabulary sources — the named places in the page config and the
alias table — are already in hand at the first pass, so links appear in about 3 seconds
instead of waiting ~10 for 21 MB of survey. The second pass adds what only the survey knows:
the surveyors' station comments, and the depths measured from it. The engine never rewrites
text it has already linked, so the second pass only adds.

### Flying to a place keeps the view (fixed in the fork, 2.9.0-slx.7)

Following a link or a place centres the station **without turning the model**: a reader
looking at the north elevation arrives at the same elevation, only closer.

This could not be fixed from here, and the attempts are recorded so they are not repeated:
re-assigning `viewer.view` after the flight re-frames the whole cave and undoes the zoom
(and before the flight it is undone by the move still in flight); `cameraMove`'s angle
setters had no effect called from outside a prepared move; and `sectionByName` on its own
did not move the camera at all.

The cause was in `CameraMove.preparePoint()`: it leaves the camera **where it is** and
swings it round to face the new target — a rotation by definition. `animateMove()` then
only slerps the quaternion when `rotation > 0`, so the camera never translated at all.

The fork gained `preparePointKeepingView()`, which translates the camera by the same
vector as the target, leaving the direction of view untouched, and `focusStation()` takes
`keepView: true` to use it. The option is off by default, so every other caller is
unaffected. This component passes it on every focus.

Verified from the viewer's own HUD (the only truthful readout — the `view` getter answers
VIEW_PLAN whatever the view is): north elevation `0° / 000°` before a flight and
`0° / 000°` after; plan `-90° / 000°` before and after.

**A warning about measuring any of this.** The HUD dials are drawn into the canvas and are
the only truthful readout of orientation, but cropping and thresholding them is **not** a
reliable instrument — two captures of a provably identical frame differed by more than two
genuinely distinct views differ from each other. Nor is comparing whole frames: consecutive
captures of a *static* model are never byte-identical. Read the dials by eye from a
screenshot; do not build a threshold on them.

**The slow turn is refused while the survey builds.** `viewer.autoRotate = true` set shortly
after `newCave` silently does not take — the rate is accepted, the flag stays false — the
same refusal that makes the opening state apply `scraps` twice. The flag reads back
honestly, so `startRotating()` retries every 700 ms until it sticks (measured: on at 10.9 s).

## What a reader sees on arriving at a place

Following a link or a place in the list ends with three things, all of them chosen rather
than inherited:

- **The station marked**, with the viewer's own red station ring. Framing the survey
  section is what closes the camera in, but `sectionByName` does it by *selecting* that
  section, which replaces the station `focusStation()` had just selected and closes its
  popup. So the station is selected again afterwards with `highlightStation()`, which sets
  the highlight without starting a camera move of its own and so cannot disturb the one in
  flight. `frameSection: false` turns the section framing off altogether for a page that
  wants the station alone.
- **A small label**, just right of the middle: the name people use for the place (from the
  page's own list, or the surveyors' comment) and its depth. The viewer's own popup —
  raw station name and full coordinates, drawn over the place itself — is suppressed for
  this path by `placeLabel` (default on). It still appears when a station in the model is
  clicked, which is the one place it belongs: reading coordinates off the survey. It is
  rendered into the WebGL scene, so it can only be suppressed, never restyled or hidden.
  The label sits right of centre because that is where the place is — flying to a station
  makes it the camera's target, which is the centre of the view.
- **Photographs in the bottom-left corner**, both the component's own hover strip and the
  viewer's `.cv-media-strip`. The viewer places its strip beside the station on purpose, so
  the thumbnails can be reached before the hover ends; that is right for hovering a station
  and wrong for arriving at one, where it covers the thing being looked at. The override
  needs `!important` because the viewer re-places the strip with inline styles on every
  frame it is shown. Both use the same corner: one is driven by hovering a row in the list
  and the other by hovering a station in the model, and one pointer cannot do both.
