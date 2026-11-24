/* ==========================================================================
 * SilexCaveTrips — the trips of a cave, on the model this page already shows.
 *
 * A club publishes a trip from SilexGIS and gets a link. This turns those links
 * into two things on an ordinary article: the party drawn on the cave while they
 * are underground, and any finished trip of the same cave played back point by
 * point, with the road each of them took drawn along the passages they used.
 *
 * Three rules this file is built around, and none of them is negotiable:
 *
 *   1. It folds nothing itself. "Where was each of the party at this instant" is
 *      one rule with one home, and that home is the SilexGIS bundle loaded beside
 *      this file as `SilexGisTrips`. A second spelling here is the one nobody runs
 *      the tests against, and a withholding honoured on one page and forgotten on
 *      the other is exactly what the publication surface exists to prevent.
 *
 *   2. It does not know where the data comes from. `trips.source` is an object
 *      with live(), past() and track(); the built-in one talks to a same-origin
 *      proxy, and anything else answering those three calls does just as well.
 *
 *   3. It never says where somebody is when it does not know. A member whose
 *      place is withheld, was measured on another survey, or was never reported
 *      is listed and said to be so — never drawn at a guess and never quietly
 *      left out of the party.
 *
 * Needs: cave-embed.js (the viewer component) and silexgis-trips.js (the fold).
 * ========================================================================== */
(function (window, document) {
	'use strict';

	// Where this file was loaded from, read while it is the script running: the module it
	// brings in for the day chips, the figures and the maps lives beside it. That module is
	// asked for under the stamp below and not under an address of its own, since nothing on
	// the page names it for WordPress to version; the stamp changes when that file does.
	var HERE = (document.currentScript && document.currentScript.src) || '';
	var JOURNAL_STAMP = '3fd11aca62a6';

	var DEFAULTS = {
		/** Where the trips come from. See proxySource() for the built-in one. */
		source: null,

		/**
		 * A file holding the cave's finished trips and their tracks, written out ahead of
		 * time (`{ url, mode }`), so that the page does not depend on the installation
		 * answering: see exportSource(). Null for a page read from the installation alone.
		 */
		export: null,

		/**
		 * The sections the module beside this one draws — a chip per trip under each day's
		 * heading (`days`), the expedition's figures (`stats`), scanned maps with the party
		 * on them (`maps`), photographs at their moment of a replay (`photos`). Each is off
		 * until a page asks for it, and the module is not loaded for a page asking for none.
		 */
		days: null,
		stats: null,
		maps: null,
		photos: null,

		/** Both list surfaces, each with a reader's switch of its own. */
		list: {
			// true to place a list beside the model, the id of an element to fill that
			// element instead, or false for none
			aside: true,
			// a button over the model opening the same list inside it
			inViewer: true,
			asideOpen: true,
			inViewerOpen: true,
			// Where the list beside the model opens: as a column of its own to the left of
			// it on a screen wide enough to have one, or under it (false). The reader's
			// switch outranks this once they have touched it; on a narrow screen the list
			// is under the model whatever this says.
			left: true,
			// Whether a row names the trip's party. The names of a finished trip are in its
			// track, so every track is read once, a while after the list.
			names: true,
			// Whether the list offers every finished trip at once, on one clock.
			all: true
		},

		// How often a trip still being followed is asked about again. Thirty seconds
		// against a coordinator who types a position every several minutes: asking more
		// often would be a read of somebody else's database per reader per interval, for
		// an answer that has not changed.
		//
		// `idleMs` is the pace with nobody underground, and it is not zero. A page left
		// open through a day of an expedition sees the morning party come out and the
		// afternoon party go in, and with polling stopped the moment no row was live the
		// afternoon party was a reload away, while a watch that had closed stood as "just
		// closed" for as long as the tab was open. Five minutes is two requests to this
		// site's proxy per reader per five minutes; the proxy's cache bounds what reaches
		// the installation whatever the number of readers. `0` restores the old behaviour
		// of never asking again while nothing is live. A page that sets only `liveMs`
		// keeps this default, because the groups are merged and not replaced.
		//
		// `handoverMs` and `handoverEveryMs` are about one moment: the trip a reader has
		// chosen leaving the followed list. Nearly always that is a watch becoming history,
		// two days after it closed — and for some seconds the site's proxy has no replay
		// of it to hand over yet, so the trip is in neither list and its track is refused.
		// It is asked about again every `handoverEveryMs`, and only after `handoverMs` of
		// being refused is it taken to have been withdrawn. A minute is three times what
		// the proxy needs to catch up with the installation.
		//
		// `addressMs` is about another: the page's own address naming a trip whose replay
		// cannot be read. Its track is asked for again on a ladder of its own while the
		// lists keep their pace, and a track still refused this long after the first
		// refusal is given up — the reader is told it could not be loaded, and the address
		// is let go of. Two minutes is six tries, the last some two and a half minutes
		// after the first.
		poll: { liveMs: 30000, idleMs: 300000, handoverMs: 60000, handoverEveryMs: 10000, addressMs: 120000 },

		/**
		 * Turning the party's own names, where they appear in the article's prose, into
		 * links that select their trip and follow them through it.
		 *
		 * <b>Off by default is deliberate, and so is what turns it on.</b> The names a
		 * published page shows are whatever the installation publishes — captions an
		 * administrator chose, or roster names where it publishes those — and a page that
		 * autolinked them everywhere would be deciding on the club's behalf that every
		 * mention of a person in an article is about a moment in a cave. So a page that
		 * wants it says so.
		 *
		 * `minLength` is higher than the place engine's, because a two- or three-letter
		 * word that happens to be somebody's short name is a word that appears in ordinary
		 * Romanian prose all day, and each of those would be a link that carries the reader
		 * away from what they were reading.
		 */
		cavers: {
			autolink: false,
			minLength: 4,
			// A name is linked at most this many times in the whole article, and at most
			// once per paragraph: the point is to offer the reader a way in, not to turn a
			// trip report into a page of links.
			limitPerName: 2,
			limitPerBlock: 1,
			linkClass: 'cave_caver_link'
		},

		replay: {
			speeds: [1, 10, 60, 300, 900, 3600, 14400, 43200, 86400, 172800],
			defaultSpeed: 60,
			// How long a replay should take to watch when nobody has said how fast. A trip
			// of an afternoon and a camp of four days are both "a trip", and one speed for
			// both makes the first a blink or the second a quarter of an hour: the replay
			// opens at the slowest listed speed that gets through its window in about this
			// many seconds. A speed the reader picks is kept for every replay after it. `0`
			// opens every replay at `defaultSpeed`.
			aimSeconds: 90,
			// What the page opens by itself when nobody is underground: the newest finished
			// trip ('latest'), or every finished trip on one clock ('all', where the list
			// offers that row). An address naming a trip, and a party underground, come first
			// either way.
			openWith: 'latest',
			// A stretch of a replay in which nothing is reported is not watched through: where
			// the next report is further off than this many seconds of the reader's own time
			// at the speed in force, the clock goes straight to that long before it. Nothing
			// moves between two reports — a marker stands where it was last reported — so what
			// is jumped is a still picture under a running clock, and what is left is a replay
			// in which the reader never waits longer than this for something to happen.
			// `0` plays every minute.
			skipQuietSeconds: 2,
			// Whether the view flies to whoever is being followed each time they move. Off
			// unless the reader switches it on: a replay is watched as a whole, and a
			// camera that leaves for a new place at every report shows none of them.
			camera: false,
			// Whether somebody who has gone in and of whom no place has been reported yet
			// is drawn at the entrance — the page's own place of depth 0. They are in the
			// cave and that is the one place in it they are known to have been.
			entrance: true,
			// A replay the page opened by itself — every trip on one clock — starts again
			// when it reaches its end, after `loopHoldMs`, until the reader chooses
			// something: a trip, one of a party, a link in the article, a place, the
			// replay's own controls. `false` plays it once.
			loop: true,
			loopHoldMs: 2500,
			// Over the model while a replay is on it: the day and hour the clock has
			// reached, and who is underground then, team by team — so that a reader who
			// has given the model the whole screen still knows what they are looking at.
			overlay: true,
			overlayTeams: 6,
			// The two buttons that give the model, or the whole block, the screen.
			fullscreen: true,
			tickMs: 200,
			// how long a marker takes to slide between two stations while playing.
			// Short, because a replay at sixty times life speed issues moves far closer
			// together than the viewer's own 600ms default and the marker would never
			// arrive. Scrubbing sets it to zero — see moveDuration().
			moveMs: 220
		},

		/** The road each of the party took, drawn along the passages they used. */
		trails: { enabled: true, width: 4 },

		/**
		 * Marker and trail colours, taken in order. A person keeps their colour for as
		 * long as the page is open, because a colour that moved between people would be
		 * worse than no colour at all.
		 */
		colors: ['#ffcc00', '#4dc3ff', '#ff6b6b', '#8ce99a', '#e599f7', '#ffa94d', '#63e6be', '#ffd43b'],

		labels: {
			title: 'Ture în peșteră',
			// Beside the title, small: how many trips, and how many people between them.
			totals: '{trips} ture',
			totalPeople: '{people} participanți',
			headcount: '{n} participanți',
			allTrips: 'Toate turele',
			allTripsHelp: 'Toate turele pe un singur ceas: fiecare echipă apare cât a fost în peșteră.',
			live: 'în desfășurare',
			// A watch that has closed is not a party underground, and the page has to be
			// able to say so: it is still the present tense, it is simply over.
			recent: 'tocmai încheiată',
			past: 'încheiată',
			noRoad: 'traseu neafișabil pe această topografie',
			nothingToPlay: 'fără trasee înregistrate',
			more: 'există și ture mai vechi',
			button: 'Ture',
			switchAside: 'Listă ture',
			switchInViewer: 'Ture pe hartă',
			switchLeft: 'Ture în stânga modelului',
			switchCamera: 'Camera urmărește selecția',
			foldList: 'Ascunde lista turelor',
			unfoldList: 'Arată lista turelor',
			party: 'Echipa',
			backToNow: 'Oprește',
			// Said for a moment when a press elsewhere on the page — a row of the log, a place
			// in the list — stopped a replay that was playing.
			paused: 'Animația e pusă pe pauză.',
			fullscreenModel: 'Modelul pe tot ecranul',
			fullscreenAll: 'Tot panoul pe tot ecranul',
			fullscreenLeave: 'Ieși din ecranul complet',
			nobodyIn: 'nimeni în peșteră',
			play: 'Pornește',
			pause: 'Pauză',
			stepBack: 'Raportul anterior',
			stepForward: 'Raportul următor',
			speed: 'Viteză',
			replayOf: 'Reluare:',
			loading: 'Se încarcă turele…',
			offline: 'Turele nu au putut fi încărcate.',
			// Said, where the site's settings ask for it, while the installation does not answer
			// and the page is drawn from the copy the site keeps. {when} is that copy's date.
			cacheNote: 'Instalația SilexGIS nu răspunde acum: turele sunt arătate din copia păstrată de site ({when}).',
			cacheNoteUndated: 'Instalația SilexGIS nu răspunde acum: turele sunt arătate din copia păstrată de site.',
			noTrips: 'Nicio tură publicată pentru această peșteră.',
			gone: 'Tura urmărită nu mai este publicată.',
			// Said while a trip that has left the followed list has no replay to hand over
			// yet. Neutral on purpose: at that moment the page cannot tell a watch that has
			// just become history from a publication that was withdrawn, and the first is
			// by far the ordinary case.
			preparing: 'Urmărirea turei s-a încheiat; reluarea turei este în pregătire.',
			// The replay of a trip being handed over was asked for and the read failed.
			replayRetry: 'Reluarea nu a putut fi încărcată; se încearcă din nou.',
			// On the strip, where the clock will be, while a chosen track is on its way.
			loadingReplay: 'se încarcă…',
			// The page's own address names a trip the lists do not carry: a link shared
			// before a publication lapsed, or one mistyped. Said over the model, and in the
			// list for as long as that address stands — the note is gone in seconds, and a
			// reader arriving by a link starts at the top of the article, not at the model.
			unlisted: 'Tura la care trimite adresa nu este publicată pe această pagină.',
			// The page's own address names a trip that is listed, and its replay went on
			// being refused for as long as the page asks for one. Said over the model and
			// in the list, as the sentence above is and for the same reason.
			unopened: 'Reluarea la care trimite adresa nu a putut fi încărcată.',
			// The scrubber's name, for a reader who is told the strip rather than shown it.
			scrub: 'Momentul reluării',
			withheld: 'poziție neafișată',
			otherModel: 'raportată pe altă topografie',
			unreported: 'fără poziție raportată',
			atEntrance: 'la intrare',
			// Kept although nothing can currently render it, and that is deliberate
			// rather than an oversight.
			//
			// A depth report is resolved to a station as it is recorded — the nearest
			// station at that depth is found and stamped on the row beside the depth —
			// and a depth matching no station is refused outright rather than stored
			// without one. So a stored position never has a depth and no station. Both
			// published routes then drop the station and the depth together on one
			// decision, so neither can hand over the one without the other. The shape is
			// expressible and the fold can return it; nothing produces it.
			//
			// The number would carry its own sign, exactly as the application that
			// publishes it renders it: prefixing a minus here would print "−-138 m" the
			// day a depth arrived negative, and inventing one would state a direction
			// nobody sent.
			depthOnly: 'la {d} m, fără punct pe topografie',
			out: 'ieșit',
			underground: 'în peșteră',
			notStarted: 'nu a intrat încă',
			unteamed: 'fără echipă',
			nth: 'Al {n}-lea din echipă',
			// The first of anything is "primul"; "al 1-lea" is not Romanian.
			first: 'Primul din echipă',
			// The three standings summed up, above the party. Label and count rather than
			// count and word, so that one person and three need no agreement.
			standings: 'În peșteră: {underground} · Ieșiți: {out} · Nu au intrat încă: {unheard}',
			// The same line for a trip whose watch has closed, and the word for one of its
			// party nobody reported.
			standingsOver: 'În peșteră: {underground} · Ieșiți: {out} · Fără rapoarte: {unheard}',
			noReports: 'fără rapoarte',
			// The first choice of whom to show: everybody. It was worded "nobody" — nobody is
			// singled out — and read as nobody being shown.
			followNobody: 'toți participanții',
			followTitle: 'Cine este arătat',
			followNotInTrip: 'nu e în această tură',
			lastHeard: 'ultima veste',
			never: '—'
		}
	};

	/** A caver's place, said in words, when it is not a point on this model. */
	function placeInWords(position, labels) {
		if (!position) return labels.unreported;
		switch (position.kind) {
		case 'depth':
			return labels.depthOnly.replace('{d}', String(Math.round(position.depthM)));
		case 'withheld': return labels.withheld;
		case 'otherModel': return labels.otherModel;
		case 'unreported': return labels.unreported;
		default: return null;          // 'station' — it is drawn, not described
		}
	}

	function el(tag, cls, parent, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text !== undefined) n.textContent = text;
		if (parent) parent.appendChild(n);
		return n;
	}

	function hhmm(ms) {
		if (!isFinite(ms)) return '—';
		var d = new Date(ms);
		return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
	}

	// The day and month of an instant, for beside an hour that would otherwise name no
	// day. In the reader's zone, as the hour beside it is.
	function dayOf(ms) {
		var d = new Date(ms);
		return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
	}

	// Whether a replay window runs past a local midnight. A camp trip is measured over
	// two or three days, and on one of those an hour alone on the clock says nothing
	// about which day the party was where it is drawn — a camp's second morning read as
	// its first. Local, because where midnight falls is the reader's zone.
	function crossesMidnight(win) {
		return Boolean(win) && new Date(win.from).toDateString() !== new Date(win.to).toDateString();
	}

	/**
	 * A Retry-After header as milliseconds from now, or 0 where it says nothing usable.
	 *
	 * The header is either a number of seconds or an HTTP date; a site's proxy sends one
	 * when the installation behind it is being restarted or has asked for a pause, and
	 * it is the one thing that knows how long. Unreadable is 0 — no wait asked for —
	 * rather than a guess, and a date already past is 0 as well.
	 */
	function retryAfterMs(value) {
		if (!value) return 0;
		var text = String(value).trim();
		if (/^\d+$/.test(text)) return Number(text) * 1000;
		var when = Date.parse(text);
		if (isNaN(when)) return 0;
		return Math.max(0, when - Date.now());
	}

	/**
	 * A trip's day, as the club wrote it.
	 *
	 * <b>A date-only value is formatted from its own parts and never through Date.</b> A trip
	 * date is a calendar day and carries no hour; `new Date('2026-09-05')` is UTC midnight, and
	 * `getDate()` reads it in the reader's zone — so every member reading the article from
	 * anywhere west of Greenwich saw the row, the replay strip and the party's dates a day
	 * early. A club's article is read by its members abroad.
	 *
	 * A value that does carry a time is a real instant and still goes through Date, where the
	 * reader's own zone is the right one to show it in.
	 */
	function dayMonth(iso) {
		if (!iso) return '';
		var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
		if (parts) return parts[3] + '.' + parts[2] + '.' + parts[1];
		var d = new Date(iso);
		if (isNaN(d.getTime())) return String(iso);
		return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
	}

	/**
	 * The built-in source: three same-origin addresses, one per question.
	 *
	 * Same-origin deliberately. The share token is the whole of the caller's claim to
	 * a published trip, so it belongs on the server that proxies these rather than in
	 * the source of a page anyone can read — and the browser then needs no permission
	 * from the SilexGIS installation to make the call at all.
	 */
	function proxySource(spec) {
		var base = String(spec.base || '').replace(/\/+$/, '') + '/';
		var slots = spec.slots || [];
		// Which link answered a list address last. One number for the source rather than one
		// per address: the addresses are all about the same cave and a token that answers one
		// answers the others, so what is worth remembering is which publication is alive.
		var remembered = 0;
		// How long the archive is left alone after every link has refused it, and until when.
		var archiveQuietFor = 0;
		var archiveQuietUntil = 0;
		// null until the first answer says which shape this installation speaks.
		var hasListRoute = (spec.listRoute === undefined) ? null : Boolean(spec.listRoute);
		// The row each link last answered with, where the links are read one by one.
		var lastRowOf = {};

		function get(path) {
			var controller = (typeof window.AbortController === 'function') ? new window.AbortController() : null;
			var timer = window.setTimeout(function () { if (controller) controller.abort(); }, spec.timeoutMs || 15000);
			return window.fetch(base + path, {
				credentials: 'same-origin',
				signal: controller ? controller.signal : undefined
			}).then(function (r) {
				if (!r.ok) {
					// The status travels with the failure, because a 404 and everything else
					// mean different things to the caller: a 404 is a fact about what is
					// there — this link has lapsed, this route does not exist — and the rest
					// say nothing about that at all, only that this read got no answer.
					var failure = new Error('HTTP ' + r.status + ' for ' + path);
					failure.status = r.status;
					// A 503 or a 429 may say when to come back, and the retry listens — how
					// closely depends on who is speaking, so the failure carries that as well.
					// This site's proxy refuses in JSON, under a `code` beginning
					// "silex_trips_", and the wait it names is the installation's own, passed
					// on. A 503 from anything else on the site is not the proxy's word:
					// WordPress in maintenance mode answers every address that way, with an
					// HTML page and "Retry-After: 600", for an update that takes seconds.
					if (r.status === 503 || r.status === 429) {
						var wait = retryAfterMs(r.headers.get('retry-after'));
						if (wait > 0) {
							failure.retryAfterMs = wait;
							return r.json().then(function (body) {
								return Boolean(body) && typeof body.code === 'string' &&
									body.code.indexOf('silex_trips_') === 0;
							}, function () {
								return false;
							}).then(function (own) {
								failure.saidByProxy = own;
								throw failure;
							});
						}
					}
					throw failure;
				}
				return r.json();
			}).finally(function () { window.clearTimeout(timer); });
		}

		/**
		 * One published link's own trip, shaped as a row of the list.
		 *
		 * The installation's list route answers with rows of exactly this shape for every
		 * trip of the cave being followed. Where a page holds a link per trip instead —
		 * an older installation, or one that has not been given the list route — each
		 * link is read on its own and shaped into the same row here, so that everything
		 * above this function sees one shape and one shape only.
		 */
		function rowOf(envelope, slot) {
			return {
				tripLogId: envelope.tripLogId || null,
				slot: slot,
				title: envelope.title,
				tripDate: envelope.tripDate,
				tripDateEnd: envelope.tripDateEnd,
				state: envelope.state,
				armedAt: envelope.armedAt,
				closedAt: envelope.closedAt,
				positionsWithheld: envelope.positionsWithheld,
				teams: envelope.teams || [],
				participants: envelope.participants || []
			};
		}

		/**
		 * The first published link the installation answers a list address for.
		 *
		 * <b>Why every link is tried rather than the first one.</b> The list addresses answer
		 * about the token's whole *cave* — every trip of it being followed now, and every
		 * finished one still inside its window — not about the single trip the link was minted
		 * for. So any live link for that cave gives the same complete answer, and a trip
		 * published tomorrow appears in it with nothing on this page changed.
		 *
		 * What used to rest on one link was reaching those addresses at all: only the first slot
		 * was asked, so if that one publication had lapsed, been revoked, or belonged to a trip
		 * somebody deleted, the whole cave's list went with it — and the page fell back to
		 * reading each link on its own, which shows only the trips whose own link still works.
		 * A page holding four publications of one cave holds four ways to ask one question; it
		 * should need only one of them to work.
		 *
		 * Rejects with the 404 when every link answered one — the condition the caller's
		 * fallback is about — and with the failure itself as soon as one read fails for any
		 * other reason, since that is a failure of the read and not of the link.
		 */
		function firstAnswer(suffix) {
			// Begun at whichever link answered last rather than always at the first.
			// Otherwise a page whose first publication has lapsed pays for it on every poll —
			// thirty seconds apart, for as long as the page is open — asking a link already
			// known not to answer before reaching the one that does. Round-robin rather than
			// a fixed jump, so a link that recovers is still reached.
			var start = remembered < slots.length ? remembered : 0;
			var lastErr = null;

			function step(taken) {
				if (taken >= slots.length) {
					return Promise.reject(lastErr || new Error('no published link answered ' + suffix));
				}
				var index = (start + taken) % slots.length;
				var slot = slots[index];
				return get('trips/' + encodeURIComponent(slot) + suffix).then(function (answer) {
					remembered = index;
					return { slot: slot, answer: answer };
				}, function (err) {
					// Only a 404 is this link's own failure — lapsed, revoked, or a route the
					// installation does not have — and only that moves on to the next link.
					// A 503 from the proxy, a limiter's 429, a lost connection, a timeout:
					// none of these says anything about the link, and the next link would be
					// asked the same question of the same installation that has just not
					// answered it. Those are a failure of this read, handed back as one so
					// that the caller retries it later, rather than turned into one refused
					// request per link and then into a different answer altogether.
					if (!err || err.status !== 404) return Promise.reject(err);
					lastErr = err;
					return step(taken + 1);
				});
			}

			return step(0);
		}

		return {
			/**
			 * Every trip of this cave being followed, with its party.
			 *
			 * Asked of the installation's own list first, and if it has no such route,
			 * of each link the page holds. Which of the two is in use is discovered
			 * rather than configured: an installation gains the list route by being
			 * updated, and a page that had to be edited to notice would go on reading
			 * four links for as long as nobody remembered to. The answer is remembered,
			 * so the fallback costs one refused request per page and not one per poll.
			 */
			live: function () {
				if (!slots.length) return Promise.resolve({ trips: [], more: false });

				function perLink() {
					// A link per trip. Each is read on its own and one that has lapsed is
					// dropped rather than failing the others: a page carrying four links
					// is four independent publications, and three of them working is
					// three of them working.
					//
					// Lapsed is a 404 and nothing else. A link refused any other way — the
					// installation restarting, a limiter's minute, a timeout — has said
					// nothing about its trip, and leaving that trip out of a list that
					// otherwise answered told the reader watching it that it was no longer
					// published. So a refused link keeps the row it last answered with, and
					// the read says of itself that part of it was refused — `refused`, the
					// failure, and `unread`, the links — so that the caller shows what there
					// is, concludes nothing from what is missing, and asks again.
					//
					// Failing the whole read for one refused link, which this did for a
					// while, was the same fault turned round: a read that never succeeds
					// leaves no last answer to stand on, so one link refused for an
					// afternoon was a page with no trip on it at all, the party underground
					// on the link beside it included.
					var refused = null;
					var unread = [];
					var answered = 0;
					return Promise.all(slots.map(function (slot) {
						return get('trips/' + encodeURIComponent(slot)).then(function (e) {
							answered++;
							lastRowOf[slot] = rowOf(e, slot);
							return lastRowOf[slot];
						}, function (err) {
							console.warn('SilexCaveTrips: the link "' + slot + '" could not be read:', err);
							if (err && err.status === 404) {
								delete lastRowOf[slot];
								return null;
							}
							refused = refused || err || new Error('the link "' + slot + '" was not answered');
							unread.push(slot);
							return lastRowOf[slot] || null;
						});
					})).then(function (rows) {
						// An empty list is an answer only if something answered. With
						// every link refused this would otherwise resolve successfully
						// with nothing in it, which reads as "no trip of this cave is
						// being followed" — a statement about the club assembled out of a
						// network fault, and the caller has no way to tell the two apart
						// once the promise has kept. Rejected with the refusal itself where
						// there was one, since that is what may say when to come back.
						if (answered === 0 && slots.length > 0) {
							throw refused || new Error('no published link could be read');
						}
						var read = { trips: rows.filter(Boolean), more: false };
						if (refused) {
							read.refused = refused;
							read.unread = unread;
						}
						return read;
					});
				}

				if (hasListRoute === false) return perLink();

				return firstAnswer('/live').then(function (found) {
					hasListRoute = true;
					// Tagged with the slot that actually answered, not with the first one:
					// the row's slot is what a later track read asks through, and naming a
					// link that did not answer would send that read to the one link already
					// known not to work.
					(found.answer.trips || []).forEach(function (t) {
						if (!t.slot) t.slot = found.slot;
					});
					return found.answer;
				}, function (err) {
					// Only a 404 through every link says the list address is not there,
					// which is not the ordinary case: the site's own proxy answers it
					// however old the installation behind it is, precisely so that a
					// reader's console does not collect a failed request on every visit.
					// This is the fallback for a page configured to talk to something else.
					//
					// Anything else — the proxy passing on that the installation did not
					// answer, a limiter, a lost connection — says nothing about whether the
					// list exists, and is a failure of this read, rejected so that it is
					// retried as one. It used to fall back too, and one refused answer
					// during an installation restart put the page on the links alone for
					// the rest of its life, where a trip in no slot of the page is never
					// seen and every poll costs one request per link. The proxy answers a
					// total failure as a 503 rather than as an empty list for the same
					// reason; an older proxy's empty 200 is still taken as the answer it
					// claims to be, since nothing distinguishes it from one.
					if (!err || err.status !== 404) throw err;
					if (hasListRoute === null) {
						console.info('SilexCaveTrips: no list of the trips being followed; ' +
							'reading each published link instead');
					}
					hasListRoute = false;
					return perLink();
				});
			},

			/** The cave's finished trips, as summaries. */
			past: function () {
				if (!slots.length) return Promise.resolve({ trips: [], more: false });
				// Refused through every link a moment ago — see below. The same answer
				// again, without the asking.
				if (Date.now() < archiveQuietUntil) return Promise.resolve({ trips: [], more: false });
				return firstAnswer('/past').then(function (found) {
					archiveQuietFor = 0;
					(found.answer.trips || []).forEach(function (t) { t.slot = found.slot; });
					return found.answer;
				}, function (err) {
					// A refused read is a failure of this read and rejects, so that the
					// whole read is retried; it is not an empty archive.
					if (!err || err.status !== 404) throw err;
					// The archive is one question about one cave, and a page whose every
					// link has lapsed has no archive to show — said as an empty list rather
					// than a rejection, because the caller distinguishes "nothing
					// published" from "nothing answered" using the followed list, which has
					// already been asked by the time this resolves.
					//
					// And it is then left alone for a while, a minute at first and doubling
					// to an hour. Every link refusing is a state that lasts — an installation
					// with no archive route, a page whose publications have all lapsed — and
					// asking again on every poll was one request per link per poll, each of
					// which the site's proxy may put to the installation once per link it
					// holds: a reader's every poll paid for in refused reads of somebody
					// else's server, for an answer that had not changed. A link renewed
					// meanwhile is found when the wait runs out, or at once by a reload.
					archiveQuietFor = archiveQuietFor ? Math.min(archiveQuietFor * 2, 3600000) : 60000;
					archiveQuietUntil = Date.now() + archiveQuietFor;
					return { trips: [], more: false };
				});
			},

			/**
			 * One finished trip, played back.
			 *
			 * `once` asks through one link and no other: for a caller that will put the
			 * same question again shortly, about a trip that may well not be there. What
			 * the track route says of a trip is about the cave, whichever of its links
			 * asks, and the link that answered a list a moment ago is known to be alive —
			 * so walking the rest on a refusal learns nothing. It cost one request per
			 * link every ten seconds for the minute a watched trip is waited for, each of
			 * which a site's proxy may put to the installation once per link it holds:
			 * from one reader, the installation's whole allowance for that minute. Only
			 * where the installation has the list route; a page reading each link by
			 * itself has no such link to name, and walks as before.
			 */
			track: function (tripLogId, slot, once) {
				var suffix = '/past/' + encodeURIComponent(tripLogId);
				if (once && hasListRoute === true && slots.length) {
					return get('trips/' + encodeURIComponent(slots[remembered < slots.length ? remembered : 0]) + suffix);
				}
				// The row's own link first, since that is the one the installation answered
				// the archive through; the others after it, so a link that lapsed between the
				// list arriving and the reader pressing a row does not cost them the replay.
				if (slot) {
					return get('trips/' + encodeURIComponent(slot) + suffix).then(null, function (err) {
						// Only when that link has lapsed; a refused read is the read's own
						// failure, and the other links would be refused the same way.
						if (!err || err.status !== 404) throw err;
						return firstAnswer(suffix).then(function (found) { return found.answer; });
					});
				}
				return firstAnswer(suffix).then(function (found) { return found.answer; });
			}
		};
	}

	/**
	 * A source that reads the cave's finished trips from a file written out ahead of time.
	 *
	 * The installation behind a club's page is one small server, and an article about an
	 * expedition is read for years after the expedition's server has been moved, upgraded
	 * or switched off. The file is everything the page shows of finished trips — the list
	 * and each trip's track, as the installation's published routes answered them on the
	 * day it was written — so the replays, the day chips and the figures need nothing else.
	 *
	 * `mode` says how the file and the installation share the work:
	 *
	 *   'first'    (the default) the file answers at once for what it holds. The
	 *              installation is asked as well — for whoever is underground now, and for
	 *              trips finished since the file was written — and where it does not
	 *              answer, the page is the file's and says nothing of a failure.
	 *   'only'     nothing but the file is ever asked. For a page with no installation.
	 *   'fallback' the installation first, as on a page without a file; the file where a
	 *              read of the installation fails.
	 *
	 * Nobody is underground in a file: it lists no trip as being followed.
	 *
	 * The file is `{ format: 'silexgis-trips-export/1', past: { trips, more }, tracks: {
	 * <tripLogId>: track } }`, the rows and tracks exactly as the published routes send
	 * them. `tools/export-trips.py` writes it.
	 */
	function exportSource(inner, spec, onFresh, onReach) {
		var mode = inner ? (spec.mode || 'first') : 'only';
		var reading = null;
		var knownToFile = {};
		var freshRows = null;       // the installation's last answer about the archive
		var asked = false;
		var written = spec.writtenAt || null;  // when the file being drawn from was written

		// Whether the installation answered the last read, for a page that says so when it did not.
		function reached(answering) {
			if (typeof onReach === 'function') onReach(answering, written);
		}

		function fetchFile(url) {
			return window.fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function (r) {
				if (!r.ok) {
					var failure = new Error('HTTP ' + r.status + ' for ' + url);
					failure.status = r.status;
					throw failure;
				}
				return r.json();
			});
		}

		function file() {
			if (!reading) {
				// The site's own copy first, where the page was handed one; the file the page
				// names in its configuration where that copy cannot be read.
				reading = fetchFile(spec.url).catch(function (err) {
					if (!spec.fallbackUrl || spec.fallbackUrl === spec.url) throw err;
					return fetchFile(spec.fallbackUrl);
				}).then(function (doc) {
					if (doc && doc.generatedAt) written = doc.generatedAt;
					var past = (doc && doc.past) || {};
					var out = { trips: (past.trips || []).slice(), more: Boolean(past.more), tracks: (doc && doc.tracks) || {} };
					out.trips.forEach(function (row) { knownToFile[row.tripLogId] = { note: campNote(row) }; });
					return out;
				});
				// A file that could not be read is asked for again by the next call, not
				// remembered as absent for the life of the page.
				reading.catch(function () { reading = null; });
			}
			return reading;
		}

		// What a row's camp says to its readers, as one string: the one thing on a list
		// row that whoever keeps the camp rewrites after the file was written.
		function campNote(row) {
			return (row && row.expedition && row.expedition.note) || '';
		}

		function notThere(what) {
			var failure = new Error('HTTP 404 for ' + what);
			failure.status = 404;
			return failure;
		}

		function merged(doc, rows) {
			if (!rows) return { trips: doc.trips, more: doc.more };
			var seen = {};
			var out = rows.map(function (row) { seen[row.tripLogId] = true; return row; });
			doc.trips.forEach(function (row) { if (!seen[row.tripLogId]) out.push(row); });
			return { trips: out, more: doc.more };
		}

		return {
			live: function () {
				if (mode === 'only') return Promise.resolve({ trips: [], more: false });
				if (mode === 'fallback') return inner.live();
				return inner.live().then(function (answer) { reached(true); return answer; }, function (err) {
					console.warn('SilexCaveTrips: the installation did not answer; the page is its export file\'s:', err);
					reached(false);
					return { trips: [], more: false };
				});
			},
			past: function () {
				if (mode === 'only') return file().then(function (doc) { return merged(doc, null); });
				if (mode === 'fallback') {
					return inner.past().catch(function (err) {
						return file().then(function (doc) { return merged(doc, null); }, function () { throw err; });
					});
				}
				// The file at once; the installation in its own time, and the lists read
				// again when it has named a trip the file does not hold.
				if (!asked || freshRows) {
					asked = true;
					inner.past().then(function (answer) {
						var rows = (answer && answer.trips) || [];
						// News is a trip the file does not hold, or a camp saying something
						// other than the file has it saying: either is drawn now and not at
						// the next reading.
						var news = !freshRows && rows.some(function (row) {
							var had = knownToFile[row.tripLogId];
							return !had || had.note !== campNote(row);
						});
						freshRows = rows;
						reached(true);
						if (news && typeof onFresh === 'function') onFresh();
					}, function () { reached(false); /* the file's list stands */ });
				}
				return file().then(function (doc) { return merged(doc, freshRows); }, function (err) {
					// No file: the page is the installation's alone, as if it had named none.
					return inner.past().catch(function () { throw err; });
				});
			},
			track: function (id, slot, quiet) {
				if (mode === 'fallback') {
					return inner.track(id, slot, quiet).catch(function (err) {
						return file().then(function (doc) {
							if (doc.tracks[id]) return doc.tracks[id];
							throw err;
						}, function () { throw err; });
					});
				}
				return file().then(function (doc) {
					if (doc.tracks[id]) return doc.tracks[id];
					if (mode === 'only') throw notThere(spec.url + '#' + id);
					return inner.track(id, slot, quiet);
				}, function (err) {
					if (mode === 'only') throw err;
					return inner.track(id, slot, quiet);
				});
			}
		};
	}

	// The module's sentences for a page whose viewer is set to English.
	var LABELS_EN = {
		title: 'Trips in the cave',
		totals: '{trips} trips',
		totalPeople: '{people} people',
		headcount: '{n} people',
		allTrips: 'All trips',
		allTripsHelp: 'Every trip on one clock: each party is shown for as long as it was in the cave.',
		live: 'under way',
		recent: 'just ended',
		past: 'finished',
		noRoad: 'route cannot be drawn on this survey',
		nothingToPlay: 'no recorded routes',
		more: 'there are older trips as well',
		button: 'Trips',
		switchAside: 'Trip list',
		switchInViewer: 'Trips on the model',
		switchLeft: 'Trips left of the model',
		switchCamera: 'Camera follows the selection',
		foldList: 'Hide the trip list',
		unfoldList: 'Show the trip list',
		party: 'Party',
		backToNow: 'Stop',
		paused: 'Animation paused.',
		fullscreenModel: 'Model on the whole screen',
		fullscreenAll: 'Whole panel on the whole screen',
		fullscreenLeave: 'Leave full screen',
		nobodyIn: 'nobody underground',
		play: 'Play',
		pause: 'Pause',
		stepBack: 'Previous report',
		stepForward: 'Next report',
		speed: 'Speed',
		replayOf: 'Replay:',
		loading: 'Loading the trips…',
		offline: 'The trips could not be loaded.',
		cacheNote: 'The SilexGIS installation is not answering: the trips are shown from the copy this site keeps ({when}).',
		cacheNoteUndated: 'The SilexGIS installation is not answering: the trips are shown from the copy this site keeps.',
		noTrips: 'No published trip for this cave.',
		gone: 'The trip being followed is no longer published.',
		preparing: 'The watch on this trip has ended; its replay is being prepared.',
		replayRetry: 'The replay could not be loaded; trying again.',
		loadingReplay: 'loading…',
		unlisted: 'The trip this address names is not published on this page.',
		unopened: 'The replay this address names could not be loaded.',
		scrub: 'Moment of the replay',
		withheld: 'position not shown',
		otherModel: 'reported on another survey',
		unreported: 'no position reported',
		atEntrance: 'at the entrance',
		depthOnly: 'at {d} m, no point on the survey',
		out: 'out',
		underground: 'in the cave',
		notStarted: 'not in yet',
		unteamed: 'no team',
		nth: 'No. {n} of the party',
		first: 'First of the party',
		standings: 'In the cave: {underground} · Out: {out} · Not in yet: {unheard}',
		standingsOver: 'In the cave: {underground} · Out: {out} · No reports: {unheard}',
		noReports: 'no reports',
		followNobody: 'everybody',
		followTitle: 'Who is shown',
		followNotInTrip: 'not on this trip',
		lastHeard: 'last heard',
		never: '—'
	};

	function attach(embed, config) {
		var fold = window.SilexGisTrips;
		if (!fold) {
			console.warn('SilexCaveTrips: the SilexGIS trips bundle is not loaded; trips are not shown');
			return null;
		}

		var cfg = Object.assign({}, DEFAULTS, config || {});
		// Every nested object is merged rather than replaced: a page that sets one
		// label, or one poll interval, must not silently lose the rest of that group.
		['list', 'poll', 'replay', 'trails', 'labels', 'cavers'].forEach(function (k) {
			cfg[k] = Object.assign({}, DEFAULTS[k], (config || {})[k] || {});
		});
		// A page whose viewer speaks English says these sentences in English too; a label
		// the page set itself still outranks both.
		if (/^en\b/i.test(String(embed.config.language || ''))) {
			cfg.labels = Object.assign({}, DEFAULTS.labels, LABELS_EN, (config || {}).labels || {});
		}
		var L = cfg.labels;

		var source = cfg.source;
		// A page on a site running the WordPress plugin names only its slots: the plugin tells
		// every page where its own proxy answers (`SilexCaveEmbedSite.tripsBase`).
		var siteTrips = (window.SilexCaveEmbedSite || {}).tripsBase;
		if (source && !source.base && typeof source.live !== 'function' && siteTrips) {
			source = Object.assign({}, source, { base: siteTrips });
		}
		if (source && source.base) source = proxySource(source);
		if ((!source || typeof source.live !== 'function') && cfg.export && cfg.export.url) {
			// A page fed from a file alone has no installation to ask.
			source = null;
			cfg.export = Object.assign({}, cfg.export, { mode: 'only' });
		}
		// The site's own copy of this cave's finished trips, where the site keeps one (the plugin's
		// trips-bundle.php writes it from the installation every few minutes): newer than any file
		// a page names, which stays the copy of last resort.
		var site = window.SilexCaveEmbedSite || {};
		var group = cfg.source && cfg.source.slots && cfg.source.slots.length
			? String(cfg.source.slots[0]).replace(/-[0-9]+$/, '') : null;
		var kept = group && site.tripBundles ? site.tripBundles[group] : null;
		if (kept && kept.url && source && typeof source.live === 'function') {
			cfg.export = Object.assign({}, cfg.export || {}, {
				url: kept.url, fallbackUrl: cfg.export && cfg.export.url, writtenAt: kept.writtenAt || null
			});
		}
		// Said in the list, where the site's settings ask for it, while the installation does not
		// answer and the page is drawn from that copy; taken away at the first answer.
		var cacheNote = null;
		function noteReach(answering, writtenAt) {
			var was = cacheNote;
			if (answering || site.cacheNotice === false) cacheNote = null;
			else {
				var when = writtenAt ? new Date(writtenAt) : null;
				cacheNote = when && isFinite(when.getTime())
					? L.cacheNote.replace('{when}', when.toLocaleString(/^en\b/i.test(String(embed.config.language || '')) ? 'en-GB' : 'ro-RO',
						{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: cfg.timeZone || undefined }))
					: L.cacheNoteUndated;
			}
			if (was !== cacheNote && !destroyed && typeof render === 'function') render();
		}
		if (cfg.export && cfg.export.url) {
			source = exportSource(source, cfg.export, function () {
				// The installation named a trip the file does not hold: read the lists again.
				if (!destroyed) loadAll();
			}, noteReach);
		}
		if (!source || typeof source.live !== 'function') {
			console.warn('SilexCaveTrips: no usable trips source configured');
			return null;
		}

		var viewer = embed.viewer;
		var host = document.getElementById(embed.config.container);

		// ---- state --------------------------------------------------------------
		//
		// `slots` is one entry per published link the page holds. `trips` is the list a
		// reader picks from: every slot's own trip, live or finished, plus every other
		// finished trip of the same cave that the archive offers.

		var trips = [];
		var partyOfRow = {};        // tripLogId (or slot key) -> the row carrying the party
		var more = false;
		var selected = null;        // { kind:'live'|'past', slot, tripLogId }
		var track = null;           // the past track being replayed
		var span = null;            // { from, to } epoch ms
		var moments = [];
		var at = 0;
		var playing = false;
		var speed = cfg.replay.defaultSpeed;
		var speedChosen = false;    // the reader picked a speed; it is theirs from then on
		var follow = null;          // { kind:'caver'|'team', id }
		var scrubbing = false;
		var loadedOnce = false;
		var lastFollowed = null;    // the last answer about who is being followed
		var lastArchive = null;     // and the last about the cave's history
		var lastReadFailed = false;
		var retryIn = 0;
		var waitAsked = 0;          // the longest wait the site's proxy asked for on a failed read
		var waitHinted = 0;         // and the longest anything else did
		var nextReadMs = 0;         // how long the next read was scheduled for
		var nextReadAt = 0;         // and when that is; 0 where none is armed
		var archiveFailing = false; // the archive's last read was refused
		var archiveRetryIn = 0;     // the ladder it climbs while it alone is refused
		var archiveDueAt = 0;       // and when it is next asked
		var linkFailing = false;    // some link's own read was refused on the last read of the party
		var dueWhileHidden = false; // a read came due on a page nobody was looking at
		var leaving = null;         // the chosen trip, where the followed list has let go of it
		var waiting = null;         // and since when its replay has been refused: { key, since }
		var choice = null;          // the trip somebody chose, as { key }: see choose()
		var stray = null;           // what the list says of an address that could not be opened, while it stands
		var colorOf = {};
		var trailIds = [];
		var pollTimer = null;
		var tickTimer = null;
		var destroyed = false;

		var api = {};

		// What a module beside this one is told: 'trips' when the list is drawn again,
		// 'moment' whenever a party is drawn — the one underground, or a replay at its
		// instant — and 'nothing' when nobody is. A listener that throws costs itself.
		var listeners = {};
		function emit(name, detail) {
			(listeners[name] || []).forEach(function (fn) {
				try { fn(detail); } catch (e) { console.warn('SilexCaveTrips: a listener for "' + name + '" failed:', e); }
			});
		}

		// Every track this page has read, by trip. A finished trip's track is the same
		// answer each time, so the figures and the day chips read each once.
		var trackCache = {};
		// What a module beside this one adds to the open trip's details: each is called with
		// the element to put its control in, the row, and whoever is followed.
		var extraActions = [];
		// Whether the view flies to whoever is followed as they move: the reader's switch.
		var cameraFollows = cfg.replay.camera === true;
		// Whether the replay on screen starts again at its end: true only of one the page
		// opened by itself, and only until the reader chooses anything. `loopWait` is the
		// instant it starts again, while it stands at its end.
		var looping = false;
		var loopWait = 0;
		// The line over the model saying what instant a replay has reached and who is
		// underground then, and what it last said.
		var overlayEl = null;
		var overlaySaid = '';

		// A place the reader asks to be shown — from the article, from the place list — is
		// a choice of theirs like any other. The component's own flights go by the entry
		// that was there before, so that keeping the view on somebody is not one.
		var focusOfEmbed = embed.focus;
		embed.focus = function () {
			looping = false;
			return focusOfEmbed.apply(embed, arguments);
		};
		// A trip, every trip or a person chosen from the list is looked at on the drawing: on a
		// telephone the list is under the model, a screen away from it, and the page goes to
		// the drawing; on a desk, where the two share a row, nothing moves. A list inside the
		// model is already in front of the drawing.
		function showDrawing() {
			if (typeof embed.reveal === 'function') embed.reveal(null);
		}
		// A place picked in the page's list stops a replay that is playing, and says so; a
		// place named in the article only ends the replay's starting again, as it always did.
		if (typeof embed.onPlace === 'function') embed.onPlace(function () { pauseForReader(); });

		/**
		 * The reader went somewhere on their own — a row of the log, a place in the list: a
		 * replay that was playing stops there and stays stopped, and the play button says so
		 * for a moment, with a line over the model, so that the stop reads as the page's doing
		 * and not as a fault. Answers whether anything was playing.
		 */
		var pausedTimer = null;
		function pauseForReader() {
			looping = false;
			if (!playing && !loopWait) return false;
			loopWait = 0;
			stopClock();
			saidPaused();
			return true;
		}

		/** The play button's pulse and the line over the model, for a replay the reader stopped. */
		function saidPaused() {
			var button = barEl ? barEl.querySelector('[data-play]') : null;
			if (button) {
				button.classList.remove('is_pulse');
				void button.offsetWidth;      // so that the same class starts its animation again
				button.classList.add('is_pulse');
				window.setTimeout(function () { button.classList.remove('is_pulse'); }, 1400);
			}
			embed.say(L.paused);
			window.clearTimeout(pausedTimer);
			pausedTimer = window.setTimeout(function () {
				if (!destroyed && !playing) embed.say(null);
			}, 2500);
		}

		/**
		 * Whatever view the page opens in, again — the whole cave, as the page set it out — when
		 * another trip, or every trip at once, is put on the model: a view left on the corner of
		 * the cave the last trip ended in is the wrong place to start the next one from.
		 */
		function viewForNewSelection(row) {
			var before = selected ? String(selected.tripLogId) : null;
			if (row && before === String(row.tripLogId)) return;
			if (typeof embed.setView === 'function') embed.setView((embed.config && embed.config.view) || 'VIEW_ELEVATION_N');
		}

		function unnamed(n) {
			if (String(n) === '1') return L.first;
			return L.nth.replace('{n}', n);
		}

		// A colour per person, taken in order and never reassigned while the page is
		// open: a colour that moved between people would be worse than none.
		function colorFor(caverId) {
			if (!colorOf[caverId]) {
				var used = Object.keys(colorOf).length;
				colorOf[caverId] = cfg.colors[used % cfg.colors.length];
			}
			return colorOf[caverId];
		}

		// ---- the surfaces -------------------------------------------------------

		var block = host.closest ? host.closest('.cave_embed') : null;
		// Named element, or one of our own.
		//
		// Made here rather than asked of the page, because a container in the post content
		// is the one thing this whole architecture exists to avoid: the block editor
		// strips and rewrites what it does not recognise, and a list that disappeared the
		// next time somebody fixed a typo would be indistinguishable from a broken
		// feature. A page may still name its own element where it wants the list
		// somewhere particular.
		var asideEl = null;
		var asideIsOurs = false;
		if (typeof cfg.list.aside === 'string' && cfg.list.aside) {
			asideEl = document.getElementById(cfg.list.aside);
			if (!asideEl) {
				console.warn('SilexCaveTrips: no element #' + cfg.list.aside + ' for the trips list');
			}
		} else if (cfg.list.aside) {
			asideEl = document.createElement('div');
			asideEl.id = embed.config.container + '_trips';
			asideIsOurs = true;
			// Inside the block, under the place list, so it travels with the model it is
			// about and takes the same column.
			if (block) block.appendChild(asideEl);
			else host.parentNode.insertBefore(asideEl, host.nextSibling);
		}
		var panelEl = null;         // the list inside the model
		var buttonEl = null;
		var barEl = null;           // the replay bar
		var showAside = true;
		var showInViewer = true;
		var panelOpen = false;
		// The list beside the model folded down to its title, by the button on that title.
		// A reader's choice about this page's furniture, so it is kept as the switches are.
		var FOLD_KEY = 'silexCaveTrips.' + embed.config.container + '.folded';
		var asideFolded = false;
		try { asideFolded = window.localStorage.getItem(FOLD_KEY) === '1'; } catch (e) { /* not kept */ }

		if (asideEl) asideEl.classList.add('cave_trips');

		function buildInViewer() {
			if (!cfg.list.inViewer) return;
			buttonEl = el('button', 'cave_trips_button', host);
			buttonEl.type = 'button';
			buttonEl.textContent = L.button;
			buttonEl.setAttribute('aria-expanded', 'false');
			buttonEl.addEventListener('click', function () {
				panelOpen = !panelOpen;
				panelEl.classList.toggle('is_open', panelOpen);
				buttonEl.classList.toggle('is_open', panelOpen);
				buttonEl.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
				if (panelOpen) placeInViewer();
			});
			panelEl = el('div', 'cave_trips cave_trips--in_viewer', host);
			placeInViewer();

			// The toolbar is not there when this runs and will not be for some seconds:
			// it is built after the survey lands and after the viewer's own language
			// catalogue has been fetched, and it is thrown away and built again every
			// time the box changes width — which is what the reader's two layout switches
			// do. So the button is placed again whenever the model's children change,
			// rather than once at a moment when there is nothing to measure. Without this
			// the button keeps the position it was born with and the bar, which sits
			// above it and catches the pointer across its whole width, swallows every
			// press.
			var watcher = null;
			if (typeof window.MutationObserver === 'function') {
				watcher = new window.MutationObserver(function () { placeInViewer(); });
				watcher.observe(host, { childList: true });
			}
			window.addEventListener('resize', placeInViewer);
			embed.onDestroy(function () {
				window.removeEventListener('resize', placeInViewer);
				if (watcher) watcher.disconnect();
			});
		}

		/**
		 * Puts the button below the toolbar rather than at a guessed distance from the top.
		 *
		 * Everything else over the model belongs to the viewer and is drawn into the canvas,
		 * so none of it can be measured: the depth legend down the right-hand edge, the two
		 * dials in the bottom-right corner, the round controls down the left. What is left
		 * free is the strip under the toolbar — and the toolbar is ours and is a real
		 * element, so its height can be read instead of assumed. It wraps to two and three
		 * rows as the model narrows, which is exactly the case a fixed offset gets wrong.
		 */
		function placeInViewer() {
			if (!buttonEl) return;
			var bar = host.querySelector('.cv-toolbar');
			var box = host.getBoundingClientRect();
			// With the bar laid out in its strip above the model there is nothing along the
			// model's top edge to stand clear of.
			var outside = block ? block.querySelector(':scope > .cave_embed_toolbar .cv-toolbar') : null;
			var below = outside ? 8 : 48;

			if (bar) {
				var b = bar.getBoundingClientRect();
				// Measured from where the bar actually ends rather than from how tall it
				// is: the bar can be placed against either edge of the model, and a page
				// that put it at the bottom would otherwise have this button underneath
				// it — which is not a layout fault but a button that cannot be pressed,
				// because the bar goes on catching the pointer over its whole width.
				var atTop = (b.top - box.top) < box.height / 2;
				below = atTop ? (b.bottom - box.top + 10) : 10;
			}

			// The viewer's own row of tabs lies along the model's top edge on a narrow screen,
			// from one side to the other, and takes the pointer over the whole of it. With
			// the toolbar over the model the button was below both; with the toolbar in its
			// strip above the model the row of tabs is what there is to stand clear of.
			var tabs = host.querySelector('.cv-tab-box');
			if (tabs) {
				var tb = tabs.getBoundingClientRect();
				var across = tb.width > box.width * 0.8;
				if (across && tb.height > 0 && (tb.top - box.top) < box.height / 2) {
					below = Math.max(below, tb.bottom - box.top + 8);
				}
			}

			buttonEl.style.top = Math.round(below) + 'px';

			if (panelEl) {
				var top = below + 38;
				panelEl.style.top = Math.round(top) + 'px';
				// It reaches to the bottom of the model, less a margin.
				//
				// It used to stop short of the viewer's own dials in the bottom corner, on
				// the reasoning that a panel must not cover them. That was the wrong trade:
				// it left the list 188px tall on a real page, which is three rows of six,
				// and the rest scrolled out of sight — a reader pressing a trip they could
				// not see reads as items that cannot be clicked. The dials say which way
				// the model is being looked at, which is not what somebody choosing a trip
				// is looking for, and the panel is something they opened and can close.
				panelEl.style.maxHeight = Math.max(140, Math.round(box.height - top - 12)) + 'px';
			}
		}

		function buildBar() {
			// Under the model rather than over it: a replay is read while looking at the
			// cave, and a control strip laid over the drawing covers the one thing it is
			// there to talk about.
			barEl = el('div', 'cave_trips_bar', null);
			if (block) block.appendChild(barEl); else host.parentNode.insertBefore(barEl, host.nextSibling);
			barEl.hidden = true;
		}

		buildInViewer();
		buildBar();

		// The reader's two choices, in the row the component already owns, because a
		// second row of checkboxes elsewhere would not read as being about this model.
		if (typeof embed.addSwitch === 'function') {
			if (asideEl) {
				embed.addSwitch('trips.aside', L.switchAside, cfg.list.asideOpen !== false, function (on) {
					showAside = on;
					asideEl.hidden = !on;
				});
			}
			// Only for the list this module made itself: an element the page named is
			// wherever the page put it.
			if (asideEl && asideIsOurs && block) {
				var leftBox = embed.addSwitch('trips.left', L.switchLeft, cfg.list.left === true, function (on) {
					block.classList.toggle('cave_embed--trips_left', on);
				});
				// Offered only where it does something: see the stylesheet.
				if (leftBox && leftBox.parentNode) leftBox.parentNode.classList.add('cave_switch--wide_only');
			}
			embed.addSwitch('trips.camera', L.switchCamera, cfg.replay.camera === true, function (on) {
				cameraFollows = on;
				lastFollowStation = null;
			});
			if (cfg.list.inViewer) {
				embed.addSwitch('trips.inViewer', L.switchInViewer, cfg.list.inViewerOpen !== false, function (on) {
					showInViewer = on;
					if (buttonEl) buttonEl.hidden = !on;
					if (!on && panelEl) {
						panelOpen = false;
						panelEl.classList.remove('is_open');
						if (buttonEl) buttonEl.classList.remove('is_open');
					}
				});
			}
		}

		// ---- loading ------------------------------------------------------------

		/**
		 * What a failed read said about when to ask again, kept for waitAfterFailure().
		 *
		 * Believed according to who said it. The site's own proxy passes on what the
		 * installation behind it asked for, the one thing that knows how long, and that is
		 * taken as said, within reason: at least a second, so a header reading next to
		 * nothing is not a page hammering the site, and at most ten minutes, so one written
		 * in hours does not take the page off the air for the afternoon. From anything else
		 * it is a hint, and no more than a minute of it is listened to.
		 */
		function noteFailure(err) {
			var named = err && err.retryAfterMs > 0 ? err.retryAfterMs : 0;
			if (!named) return;
			if (err.saidByProxy) waitAsked = Math.max(waitAsked, Math.min(Math.max(named, 1000), 600000));
			else waitHinted = Math.max(waitHinted, Math.min(named, 60000));
		}

		/**
		 * One read of both lists. `followedOnly` is the scheduled read that goes without
		 * the archive, because the archive is waiting out a refusal of its own — see
		 * schedulePoll(). Every other caller reads both.
		 */
		function loadAll(followedOnly) {
			if (destroyed) return Promise.resolve();
			dueWhileHidden = false;
			waitAsked = 0;
			waitHinted = 0;
			var askArchive = followedOnly !== true;

			var followed = source.live().then(null, function (err) {
				console.warn('SilexCaveTrips: the trips being followed could not be read:', err);
				noteFailure(err);
				return null;
			});

			// The archive is one question about one cave, whichever link asks it, so it is
			// asked once however many links the page holds. A read it sits out has no
			// answer from it, exactly as a refused one has none, and the last real answer
			// stands.
			var archive = !askArchive ? Promise.resolve(null) : source.past().then(null, function (err) {
				console.warn('SilexCaveTrips: the archive could not be read:', err);
				noteFailure(err);
				return null;
			});

			return Promise.all([followed, archive]).then(function (both) {
				if (destroyed) return;
				// Whether the archive being refused is news, or the same trouble as on the
				// read before.
				var archiveNews = askArchive && !both[1] && !archiveFailing;
				if (askArchive) archiveFailing = !both[1];
				if (!both[0] && !both[1]) {
					// Both answers failed. This is not "there is nothing published" and
					// must never be shown as it: the difference is between a statement
					// about the club and a statement about the network, and only one of
					// them is this page's to make.
					//
					// And it is retried. Without this a single refused request at the
					// moment the page opened would leave the list empty for as long as
					// the reader kept it open, because nothing else asks again — the
					// poll below is only scheduled once something is known.
					embed.say(L.offline);
					loadedOnce = true;
					lastReadFailed = true;
					// The list first, then the party back into it: render() builds the
					// list again, the party's own box included, and with nothing drawn
					// after it every wholly refused read emptied the party list beside a
					// model still showing where each of them was.
					render();
					redraw();
					scheduleRetry();
					return;
				}
				// One half failing is a failure too, and is retried as one. It used to be
				// taken as an answer: the half that came back was shown and the ordinary
				// poll was scheduled — which was armed only while a row was live, and no
				// row is live when the followed list was never read. So a page opened
				// during a minute of the installation's downtime, with the archive answering
				// from the proxy's longer cache, showed history only, said nothing, and
				// never asked about the party underground again until somebody reloaded.
				// Whatever did answer is still shown; the note and the retry are about the
				// half that did not.
				//
				// So is a followed list that answered in part: a page reading each link by
				// itself, one of whose links was refused. The source has carried that
				// link's last row — see perLink() — and what it says of the rest is shown.
				var partly = Boolean(both[0] && both[0].refused);
				if (partly) noteFailure(both[0].refused);
				var linkNews = partly && !linkFailing;
				if (both[0]) linkFailing = partly;
				// Whether the party on screen is read through one of the links refused. A
				// replay is not: its track is in hand.
				var mineUnread = partly && Boolean(selected) && selected.kind !== 'past' &&
					(both[0].unread || []).indexOf(selected.slot) >= 0;
				var halfFailed = !both[0] || !both[1] || partly;
				loadedOnce = true;
				lastReadFailed = halfFailed;
				// Said every time the party's own read fails — the whole of it, or the one
				// link the trip on screen is read through — because what stands on the
				// model is then older than it looks. Said once where it is only the archive,
				// or a link of some other trip, and not again for as long as that lasts: the
				// party is being read all the while, and a note over it on every retry of
				// the other half said otherwise.
				if (!both[0] || mineUnread || archiveNews || linkNews) embed.say(L.offline);
				rebuild(both[0], both[1]);
				render();
				namesSoon();
				// What the page's own address asks for is opened as soon as the trip it
				// names is listed, ahead of any default. A whole answer that does not list
				// it means the trip is not on this page, and the reader is told so; what
				// the page then opens by itself stands ready rather than playing, because
				// another trip setting off under a link to this one reads as this one.
				//
				// Listed, with its track refused a moment ago, it is asked for again when
				// its own ladder says and not on every read — see addressRefused(). On the
				// reads between, the page is the page it would have been without the
				// address, except that what it opens by itself is any trip but that one.
				var named = rowAsked();
				var unanswered = Boolean(asked && !named && !halfFailed);
				if (unanswered) addressNamesNothing();
				var opening = named && addressIsDue() ? honourAddress() : null;
				// Whatever is on screen is drawn afresh, this read's answer being newer than
				// the drawing — also where the address's trip is being read for meanwhile,
				// since what was on screen stays there until that is in hand. With nothing
				// on screen and nothing being opened, what the page opens by itself.
				if (selected) redraw();
				else if (!opening) openDefault(unanswered || Boolean(named), named ? named.tripLogId : null, unanswered);
				autolinkCavers();

				// When to ask again goes by what failed.
				//
				// The party's own read failing, or the replay of a trip being handed over,
				// puts the whole page on the ladder. The archive failing alone does not. It
				// used to, and a refusal of the one route that only changes when a trip
				// closes then held a party underground at four live intervals between
				// reads. So the page keeps its pace, and the archive climbs a ladder of its
				// own and sits out the reads that come before it is due.
				//
				// One link refused among several that answered is on the ladder as well, but
				// never slower than the page's own pace: the trips that did answer are being
				// read by the same read, and are owed theirs.
				function schedule(trackFailed) {
					if (destroyed) return;
					if (!both[0] || trackFailed) { scheduleRetry(); return; }
					if (both[1]) {
						archiveRetryIn = 0;
						archiveDueAt = 0;
					} else if (askArchive) {
						archiveRetryIn = nextRung(archiveRetryIn);
						archiveDueAt = Date.now() + waitAfterFailure(archiveRetryIn);
					}
					if (partly) { scheduleRetry(true); return; }
					retryIn = 0;
					schedulePoll();
				}

				// The trip the address names is being read for, and the next read is not held
				// back for the answer. Refused, its track is asked for again on a ladder of
				// its own, which a read is brought forward for; the lists keep their pace.
				// They used to go on the retry ladder with it, and an address whose track
				// went on being refused then had a party underground read every two minutes
				// where it is owed every thirty seconds.
				if (opening) {
					opening.then(addressAnswered, function (e) {
						console.warn('SilexCaveTrips: the trip the address names could not be opened:', e);
					});
				}

				// The chosen trip has left the followed list, and what it has become is asked
				// before the next read is timed, since the answer is part of this one. Not
				// where the address or the reader has chosen something else meanwhile.
				if (!leaving || !leaving.asks || leaving.selection !== selected) {
					schedule(false);
					return;
				}
				return handOver(leaving.selection, !halfFailed).then(schedule, function (e) {
					// Whatever went wrong in the handing over costs the handover, not the
					// page's next read.
					console.warn('SilexCaveTrips: the chosen trip could not be handed over:', e);
					schedule(false);
				});
			});
		}

		// A row's identity in the list: the trip's own identifier wherever there is one.
		function keyOf(row) { return row.tripLogId || ('slot:' + row.slot); }

		// The parties of the finished trips are in their tracks. Read once the list is
		// drawn, and the list drawn again with the names when they are all in hand; asked
		// for again only when a trip has appeared whose track has not been read.
		function namesSoon() {
			if (cfg.list.names === false || typeof api.tracks !== 'function') return;
			var unread = trips.some(function (row) {
				return !row.followed && row.playable && row.tripLogId && !trackCache[row.tripLogId];
			});
			if (!unread) return;
			api.tracks().then(function () {
				if (destroyed) return;
				render();
				redraw(true);
			}, function () { /* the rows stay as they are, without names */ });
		}

		// A party underground first, then a watch that has just closed, then history; the
		// newest first within each.
		var RANK = { live: 0, recent: 1, past: 2 };

		function sortTrips() {
			trips.sort(function (a, b) {
				if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind];
				return String(b.tripDate || '').localeCompare(String(a.tripDate || ''));
			});
		}

		/**
		 * The list a reader picks from.
		 *
		 * A slot whose own trip is being followed is a live row; a slot whose trip has
		 * closed is a past row, and so is every trip the archive offers. The archive and
		 * the slots overlap by design — a trip finishes and moves from one to the other —
		 * so rows are keyed by the trip's own identifier and the live reading wins, being
		 * the one that can still change.
		 */
		/**
		 * The list a reader picks from.
		 *
		 * Two sources answer about overlapping sets of trips and that is the normal
		 * course of events rather than a fault: a trip is followed, then it closes and
		 * goes on being readable for a while, and only afterwards does it become
		 * history. So a trip can be in both answers at once, and rows are keyed by the
		 * trip's own identifier — never by its title, which two trips of one cave may
		 * share and which is the one thing about a trip that can be edited.
		 */
		function rebuild(followed, archive) {
			var byId = {};
			var order = [];
			// The parties as the read before this one left them, for the one case further
			// down where the chosen trip's party has to outlive the list it arrived in.
			var before = partyOfRow;
			partyOfRow = {};
			// Recomputed from what this read actually returned, never left over from the
			// last one: an archive that answered a moment ago and failed now must not go
			// on asserting that there is more.
			more = false;

			function put(row) {
				var key = keyOf(row);
				if (!byId[key]) { byId[key] = row; order.push(key); return; }
				// The followed reading wins: it is the one that can still change, and it
				// is the one carrying the party.
				if (row.followed) byId[key] = Object.assign({}, byId[key], row);
			}

			// A read that failed is not an answer, and the last real one stands until
			// another arrives. Dropping the live trips out of the list because one request
			// was refused would tell the reader the party had stopped being followed —
			// which is a statement about the cave made out of a network fault. What a
			// failed read does change is the note over the model, which says so.
			var answered = Boolean(followed && followed.trips);
			if (answered) lastFollowed = followed;
			if (archive && archive.trips) lastArchive = archive;
			followed = followed || lastFollowed;
			archive = archive || lastArchive;

			if (followed && followed.trips) {
				// Both lists are bounded, and by different numbers — a row of the
				// followed list carries a whole party while an archive row carries a
				// headcount, so it is the smaller bound. Either saying there is more
				// means there is more.
				if (followed.more === true) more = true;
				followed.trips.forEach(function (t) {
					var key = t.tripLogId || ('slot:' + t.slot);
					partyOfRow[key] = t;
					put({
						followed: true,
						// "Being followed" and "still underground" are different things:
						// a watch closed an hour ago is still readable and is no longer a
						// party in the cave. A page that showed the second as the first
						// would be the one false statement this feature can make.
						kind: t.state === 'armed' ? 'live' : 'recent',
						slot: t.slot,
						tripLogId: t.tripLogId || null,
						title: t.title,
						tripDate: t.tripDate,
						tripDateEnd: t.tripDateEnd,
						// Which expedition the trip belongs to, where the installation says so.
						// A journal page is about one expedition's trips, and on a cave that has
						// had several it is the fact that tells two seasons' rows apart — the
						// titles alone are "E1".."E20" twice over.
						expedition: t.expedition || null,
						participantCount: (t.participants || []).length,
						playable: true,
						state: t.state,
						// When the watch was armed and closed: what tells a party just out
						// from a trip written up long after it.
						armedAt: t.armedAt || null,
						closedAt: t.closedAt || null
					});
				});
			}

			if (archive && archive.trips) {
				archive.trips.forEach(function (t) {
					put({
						followed: false,
						kind: 'past',
						slot: t.slot,
						tripLogId: t.tripLogId,
						title: t.title,
						tripDate: t.tripDate,
						tripDateEnd: t.tripDateEnd,
						expedition: t.expedition || null,
						participantCount: t.participantCount,
						playable: t.playable !== false,
						state: 'closed'
					});
				});
				// A bit, never a count: how many times a club has been into one cave is
				// itself something the archive declines to say.
				if (archive.more === true) more = true;
			}

			// The chosen trip, where the followed list has let go of it.
			//
			// A trip leaves the followed list at the instant it becomes history, two days
			// after its watch closed, and the installation's two lists never both carry it.
			// But a page reads them through caches of different ages, the archive's much
			// the older, so what that instant ordinarily looks like from here is a trip in
			// neither list: the followed list fresh and without it, the archive not yet
			// with it. Absence from both therefore says nothing by itself. It used to be
			// read as the trip having been withdrawn — the reader was told it was no longer
			// published, the party came off the model, and some minutes later the same trip
			// came back as a finished row nobody had chosen — and the same sentence was
			// said when the archive half of the read had simply failed.
			//
			// So the trip stays chosen and stays as it last stood, its row in the list and
			// its party on the model, and what has become of it is decided by the one
			// question that can decide it: its track. That is handOver(), which loadAll()
			// calls when this is set. Where the followed read did not answer at all,
			// nothing is asked and the last real answer stands, as everywhere else.
			leaving = null;
			if (selected && selected.kind !== 'past') {
				var mine = order.map(function (k) { return byId[k]; })
					.filter(function (t) { return sameTrip(t, selected); })[0];
				if (!mine || !mine.followed) {
					var key = keyOf(selected);
					if (before[key]) partyOfRow[key] = before[key];
					// As a watch that has closed, whatever it was: a row left reading "în
					// desfășurare" would be saying a party is underground on the strength of
					// a list that has just stopped saying so.
					if (!mine) put(Object.assign({}, selected.row, { followed: true, kind: 'recent', held: true }));
					leaving = { selection: selected, asks: answered };
				}
			}
			if (!leaving || (waiting && waiting.key !== keyOf(selected))) waiting = null;

			// A trip handed over as a replay before the archive's cache had caught up with
			// it keeps the row made for it until the archive lists it itself; put() leaves
			// this one out from then on.
			if (selected && selected.kind === 'past' && selected.row && selected.row.handed) {
				put(selected.row);
			}

			trips = order.map(function (k) { return byId[k]; });
			sortTrips();

			if (selected) {
				var still = trips.filter(function (t) { return sameTrip(t, selected); })[0];
				// Still there. It may have changed which of its two lives it is in — a watch
				// closes and the row goes from "being followed" to "just closed" — and that
				// is the ordinary course of events, not a fault.
				//
				// A finished trip being replayed that no list carries any longer is left
				// exactly as it is. It is already in hand: its whole track was fetched, the
				// replay reads that rather than the list, and taking it away underneath
				// somebody watching it would be a worse answer than letting it finish.
				if (still) selected.row = still;
			}
		}

		/**
		 * Asks what has become of the chosen trip now that the followed list has let go of
		 * it, by asking for its track. Resolves true where that read failed and is to be
		 * retried, false otherwise.
		 *
		 * <b>Answered</b>, it is history: handed over as the replay it now is — the strip
		 * naming it, stood at its end, where the party was last seen, and not playing,
		 * because the reader was watching a present that has just become the past, not
		 * asking for a performance of it. Whoever was being followed still is. The track
		 * that answered is the one shown, so the party is not taken off the model for the
		 * length of a second read, and a second read cannot fail where the first did not.
		 *
		 * <b>Refused as not there</b> — a 404 through every link — it is neither followed nor
		 * history, and that has two readings the page cannot tell apart on the day: the
		 * proxy has not caught up with a watch that has just become history, which lasts
		 * seconds, or the publication was withdrawn. So the selection is held, the reader
		 * is told the watch has closed and its replay is on its way, and the question is
		 * put again on the reads that follow. Only when it has been refused for
		 * `poll.handoverMs`, and on a read both halves of which answered, is the trip let
		 * go of and said to be no longer published.
		 *
		 * <b>Anything else</b> is a failure of the read and says nothing about the trip: it
		 * stays as it is, the reader is told the replay is being tried again, and the page
		 * goes on the retry ladder. This is also where a refused track used to end the
		 * handover outright: nothing was left chosen, the model went blank until the next
		 * poll, and that poll then opened the trip as if it had just been picked, playing
		 * it from its first minute.
		 */
		function handOver(chosen, wholeRead) {
			var row = chosen.row;
			// Through one link — see track() — since the question is put again every few
			// seconds for as long as the answer is "not there".
			var reading = chosen.tripLogId
				? source.track(chosen.tripLogId, row.slot || chosen.slot, true)
				// A row with no identifier names no track to ask for, so it can only be
				// waited for on the lists.
				: Promise.reject(Object.assign(new Error('no track without a trip identifier'), { status: 404 }));

			return reading.then(function (t) {
				if (destroyed || selected !== chosen) return false;
				var past = row;
				if (row.kind !== 'past') {
					// The archive does not list it yet, so the row is made here from the
					// one it had; `handed` is what keeps it listed until the archive's own
					// row replaces it.
					past = {
						followed: false,
						kind: 'past',
						handed: true,
						slot: row.slot,
						tripLogId: row.tripLogId,
						title: row.title,
						tripDate: row.tripDate,
						tripDateEnd: row.tripDateEnd,
						expedition: row.expedition || null,
						participantCount: row.participantCount,
						playable: true,
						state: 'closed'
					};
					trips = trips.map(function (one) { return one === row ? past : one; });
					sortTrips();
				}
				delete partyOfRow[keyOf(chosen)];
				waiting = null;
				selectTrip(past, { play: false, moment: Date.now(), track: t });
				return false;
			}, function (err) {
				if (destroyed || selected !== chosen) return false;
				if (!err || err.status !== 404) {
					console.warn('SilexCaveTrips: the replay of the trip being handed over could not be read:', err);
					noteFailure(err);
					embed.say(L.replayRetry);
					return true;
				}
				if (!waiting) {
					waiting = { key: keyOf(chosen), since: Date.now() };
					embed.say(L.preparing);
					// The list first, then the party into it; the row now says why it is
					// standing still.
					render();
					redraw();
				} else if (wholeRead && Date.now() - waiting.since >= cfg.poll.handoverMs) {
					letGo(chosen);
				}
				return false;
			});
		}

		/**
		 * Gone altogether: its link was revoked, or it lapsed. The party drawn from it
		 * stands behind nothing now, so it comes off the model and the reader is told why
		 * rather than watching it vanish; whatever else the page holds is opened in its
		 * place.
		 */
		function letGo(chosen) {
			embed.say(L.gone);
			waiting = null;
			selected = null;
			// Whoever was being followed was followed in this trip. A follow is a place in
			// a party, and the same number is somebody else in the trip opened below — a
			// trip the reader chose nobody in, which used to be drawn with one marker and
			// the rest of its party missing from the model.
			follow = null;
			lastFollowStation = null;
			delete partyOfRow[keyOf(chosen)];
			trips = trips.filter(function (t) { return !(t.held && sameTrip(t, chosen)); });
			drawNothing();
			clearTrails();
			stopClock();
			render();
			// Under the sentence just said: where what is opened is a replay, the reading
			// of it said "loading" in that sentence's place and then cleared the note, so
			// the reader was told why the party had gone for no time at all.
			openDefault(false, null, true);
		}

		/**
		 * Asks again after a failure, backing off but never giving up.
		 *
		 * Backing off because a site that is down is down for everybody and a page open in
		 * twenty tabs should not be twenty requests a second at it; never giving up
		 * because the ordinary case is a moment's trouble on a telephone changing masts,
		 * and the reader has no way to ask the page to try again.
		 *
		 * `withinPace` is the failure of a part: the rest of the same read answered, so the
		 * retry is never later than the read those trips are owed anyway.
		 */
		function scheduleRetry(withinPace) {
			window.clearTimeout(pollTimer);
			if (destroyed) return;
			retryIn = nextRung(retryIn);
			nextReadMs = waitAfterFailure(retryIn);
			if (withinPace) {
				var owed = pace();
				if (owed > 0 && owed < nextReadMs) nextReadMs = owed;
			}
			nextReadAt = Date.now() + nextReadMs;
			pollTimer = window.setTimeout(function () { readIfSeen(); }, nextReadMs);
		}

		// One rung up the ladder a failure climbs: five seconds, then doubling, to four live
		// intervals at most.
		function nextRung(rung) {
			return rung ? Math.min(rung * 2, cfg.poll.liveMs * 4) : 5000;
		}

		/**
		 * How long to wait after a failed read whose ladder stands at `rung`.
		 *
		 * The proxy's own word on when to come back is taken in place of the ladder — see
		 * noteFailure() for why, and for its bounds. Anybody else's is taken where it is
		 * longer than the ladder and never where it is shorter. WordPress in maintenance
		 * mode says ten minutes about an update that takes seconds, and obeying that to the
		 * letter left a party underground unread for those ten minutes; an answer that says
		 * "one second" for as long as it is broken was asked every second by every open
		 * tab, with no backing off at all. A wait that says nothing usable — zero, a date
		 * already past, anything unreadable — never gets this far, and the ladder goes on
		 * climbing underneath whichever is used.
		 */
		function waitAfterFailure(rung) {
			if (waitAsked > 0) return waitAsked;
			if (waitHinted > 0) return Math.max(rung, waitHinted);
			return rung;
		}

		// The page's own pace. A party still underground is asked about at the live pace.
		// With nobody underground the page still asks, at the idle pace: a party that arms
		// later in the day, and a closed watch crossing from the followed list into the
		// archive, both happen while a page is open, and neither was seen until a reload
		// when polling stopped as soon as no row was live.
		function pace() {
			var anyLive = trips.some(function (t) { return t.kind === 'live'; });
			return anyLive ? cfg.poll.liveMs : cfg.poll.idleMs;
		}

		function schedulePoll() {
			window.clearTimeout(pollTimer);
			if (destroyed) return;
			var wait = pace();
			// A chosen trip whose replay is being waited for is looked at again sooner than
			// either pace, for as long as it is waited for: the idle pace is five minutes,
			// and the proxy needs seconds.
			if (waiting && Date.now() - waiting.since < cfg.poll.handoverMs) {
				wait = wait > 0 ? Math.min(wait, cfg.poll.handoverEveryMs) : cfg.poll.handoverEveryMs;
			}
			// The trip the page's address names, where its track has been refused, is asked
			// for again when its own ladder says, and the read is brought forward for it —
			// by a second at the least, as for the archive below. Only while the trip is
			// listed and not being read for at this moment, which is when that read will
			// ask for it: brought forward for a trip it then could not ask for, the page
			// would be reading every second.
			if (asked && asked.dueAt && !asked.opening && rowAsked()) {
				var until = Math.max(1000, asked.dueAt - Date.now());
				wait = wait > 0 ? Math.min(wait, until) : until;
			}
			// The archive, while it alone is being refused, is asked again when its own
			// ladder says. A read that comes due before then goes without it; where the
			// archive is due first, the read is brought forward for it — by a second at
			// the least, so that a moment already past does not disarm the page.
			var withArchive = true;
			if (archiveDueAt) {
				var left = Math.max(1000, archiveDueAt - Date.now());
				if (wait > 0 && wait < left) withArchive = false;
				else wait = left;
			}
			if (!(wait > 0)) { nextReadAt = 0; return; }
			nextReadMs = wait;
			nextReadAt = Date.now() + wait;
			pollTimer = window.setTimeout(function () { readIfSeen(!withArchive); }, wait);
		}

		/**
		 * The read of the address's trip has answered; `again` where it was refused and is
		 * to be asked for again. The read already armed is then brought forward to when its
		 * ladder says, where that is the sooner, and otherwise left exactly where it is.
		 *
		 * Brought forward and never re-armed from now: the track is read beside the lists,
		 * not ahead of them, and one that takes its quarter of a minute to be refused must
		 * not hold back the party's own read by as long at every try.
		 */
		function addressAnswered(again) {
			if (!again || destroyed || !asked || !asked.dueAt) return;
			var wait = Math.max(1000, asked.dueAt - Date.now());
			if (nextReadAt && Date.now() + wait >= nextReadAt) return;
			window.clearTimeout(pollTimer);
			nextReadMs = wait;
			nextReadAt = Date.now() + wait;
			// Without the archive where that is waiting out a refusal of its own.
			var withArchive = !(archiveDueAt && nextReadAt < archiveDueAt);
			pollTimer = window.setTimeout(function () { readIfSeen(!withArchive); }, wait);
		}

		/**
		 * The read a timer came due for — unless nobody is looking.
		 *
		 * Nothing is refreshed for a page nobody is looking at, a retry no more than a
		 * poll. But a read that came due is owed, not dropped. The interval used to be
		 * armed afresh each time it ran out on a hidden tab, so a reader returning to a tab
		 * left open since the morning waited out what was left of five more minutes in
		 * front of a page hours old, with nothing on it to say so. It is remembered
		 * instead, and made the moment the page is seen again. A tab hidden for less than
		 * its pace has its timer still running and is read when that fires.
		 */
		function readIfSeen(followedOnly) {
			if (destroyed) return;
			if (document.visibilityState === 'hidden') { dueWhileHidden = true; return; }
			loadAll(followedOnly);
		}

		function onSeen() {
			if (destroyed || !dueWhileHidden || document.visibilityState === 'hidden') return;
			loadAll();
		}

		document.addEventListener('visibilitychange', onSeen);

		// ---- choosing a trip ----------------------------------------------------

		/**
		 * Whether the reader has asked their system for less motion.
		 *
		 * A replay slides markers five times a second and, with somebody followed, flies
		 * the camera after them. One that starts by itself — the page's default with nobody
		 * underground, or an address saying `play` — is motion nobody in front of this page
		 * asked for, so for such a reader it stands ready with its play button instead. A
		 * row they press and a link in the prose they follow are their own asking, and play
		 * as they do for anybody. Asked each time rather than once: the setting can change
		 * while the page is open.
		 */
		function prefersStill() {
			return Boolean(window.matchMedia) && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		}

		/**
		 * What the page opens by itself: a trip being followed, or else the newest finished
		 * one, played. `still` opens that finished one standing at its start instead.
		 *
		 * `except` is a trip not to open: the one the page's address names, whose track has
		 * just been refused and would be again. `underNote` is for where the page has just
		 * told the reader why it is opening something by itself: that sentence is left over
		 * the model while what is opened is read and after — see selectTrip().
		 *
		 * Nobody has chosen what this opens, so it is not written into the address.
		 */
		function openDefault(still, except, underNote) {
			var open = trips.filter(function (t) { return !except || t.tripLogId !== except; });
			var followed = open.filter(function (t) { return t.followed; })[0];
			if (followed) { selectTrip(followed); return; }
			var playable = open.filter(function (t) { return t.playable; });
			// Every finished trip on one clock, where the page opens that way and there is
			// more than one to put on it.
			if (cfg.replay.openWith === 'all' && cfg.list.all !== false && !except && playable.length > 1) {
				selectAll({ play: !(still || prefersStill()), underNote: underNote, loop: !(still || prefersStill()) });
				return;
			}
			if (playable[0]) selectTrip(playable[0], { play: !(still || prefersStill()), underNote: underNote });
		}

		// ---- over the model -------------------------------------------------------

		function clearOverlay() {
			overlaySaid = '';
			if (overlayEl) { overlayEl.hidden = true; overlayEl.innerHTML = ''; }
		}

		// The instant and who is underground at it, team by team. Said from the same
		// envelope the markers are drawn from, so the two cannot disagree; drawn again
		// only when it would say something else, since it is asked for five times a second.
		function drawOverlay(envelope, cavers) {
			if (cfg.replay.overlay === false || !span) { clearOverlay(); return; }
			var when = dayOf(at) + '.' + new Date(at).getFullYear() + ' ' + hhmm(at);
			var teams = {};
			var order = [];
			(cavers || []).forEach(function (c) {
				var entry = participantOf(envelope, c);
				if (!entry || !entry.in || entry.out) return;
				var key = c.teamTitle || '';
				if (!teams[key]) { teams[key] = []; order.push(key); }
				teams[key].push(c.name);
			});
			var most = Math.max(1, Number(cfg.replay.overlayTeams) || 6);
			var lines = order.slice(0, most).map(function (key) { return [key, teams[key].join(', ')]; });
			var more = order.length - lines.length;
			var said = when + '|' + lines.map(function (l) { return l.join(':'); }).join('|') + '|' + more;
			if (said === overlaySaid && overlayEl && !overlayEl.hidden) return;
			overlaySaid = said;
			if (!overlayEl) {
				overlayEl = el('div', 'cave_replay_overlay', host);
				overlayEl.dataset.overlay = '1';
				// The party list says the same to whoever is read the page aloud.
				overlayEl.setAttribute('aria-hidden', 'true');
			}
			overlayEl.hidden = false;
			overlayEl.innerHTML = '';
			el('div', 'cave_replay_overlay_when', overlayEl, when);
			if (!lines.length) el('div', 'cave_replay_overlay_none', overlayEl, L.nobodyIn);
			lines.forEach(function (l) {
				var row = el('div', 'cave_replay_overlay_team', overlayEl);
				if (l[0]) el('b', null, row, l[0] + ': ');
				row.appendChild(document.createTextNode(l[1]));
			});
			if (more > 0) el('div', 'cave_replay_overlay_more', overlayEl, '+' + more);
		}

		/** Draw whatever is chosen, in whichever of its two lives it is now in. */
		function redraw(isScrub) {
			if (!selected) { drawNothing(); return; }
			if (selected.kind === 'past') drawPast(isScrub);
			else drawFollowed();
		}

		function selectTrip(row, options) {
			var opts = options || {};
			looping = false;
			loopWait = 0;
			stopClock();
			clearTrails();
			if (!row) return Promise.resolve();
			viewForNewSelection(row);

			if (row.followed) {
				selected = { kind: 'followed', slot: row.slot, tripLogId: row.tripLogId, row: row };
				track = null;
				span = null;
				moments = [];
				render();
				drawFollowed();
				return Promise.resolve();
			}

			selected = { kind: 'past', slot: row.slot, tripLogId: row.tripLogId, row: row, all: row.all === true };
			// <b>The old replay goes before the new one is asked for, not after it arrives.</b>
			// Leaving `track` in place while the fetch was in flight meant every later read of
			// it — a seek, a poll's redraw, the play button — drew the *previous* trip: the strip
			// said "Reluare: E0" and E0's party moved on the model while the list marked the new
			// trip as current. One twelve-second upstream timeout was enough to produce it, and
			// nothing on the screen disagreed with itself visibly enough to notice.
			track = null;
			span = null;
			moments = [];

			function landed(t) {
				track = t;
				// From the party's first report to its last, and not from when the watch was
				// armed to when it was closed. For a trip followed as it happened the two are
				// nearly the same. For one written up afterwards from its paper log the watch
				// was armed and closed in the same minute, weeks after the trip: the slider ran
				// from the trip to that minute, and the trip was its first hundredth.
				span = replayWindow(t);
				moments = fold.pastReportMoments(t);
				if (span && !speedChosen) speed = speedFor(span);
				if (!opts.underNote) embed.say(null);
				if (!span) {
					// Published, followed and closed with nothing recorded but entries and
					// exits. Said rather than shown as an empty player.
					render();
					drawNothing();
					return;
				}
				var start = span.from;
				if (opts.moment !== undefined && opts.moment !== null && isFinite(opts.moment)) {
					start = Math.min(span.to, Math.max(span.from, opts.moment));
				} else if (follow) {
					var placed = fold.firstPlacedMoment(t, follow);
					if (placed !== null) start = Math.min(span.to, Math.max(span.from, placed));
				}
				at = start;
				// No roads for every trip at once: a road is routed across the survey report by
				// report, and three weeks of everybody's would be both slow and unreadable.
				if (!selected.all) buildTrails();
				render();
				drawPast();
				if (opts.play !== false) startClock();
			}

			// A track already in hand — the one a handover was decided on — is shown as it
			// is: nothing is asked for a second time, and the model goes from the party as
			// last seen to the replay with no empty moment between them.
			if (opts.track) {
				landed(opts.track);
				return Promise.resolve();
			}

			render();
			drawNothing();
			// The note over the model is one line. Where the page is opening this trip by
			// itself and has just told the reader why — the trip their address names is not
			// on this page, the one they were watching is no longer published — "loading"
			// is not said in that sentence's place, nor the note cleared when the track
			// lands: said and cleared within one read, the sentence was on screen for no
			// time at all whenever what was opened in its place was a replay.
			if (!opts.underNote) embed.say(L.loading);
			return source.track(row.tripLogId, row.slot).then(function (t) {
				if (t && row.tripLogId) trackCache[row.tripLogId] = t;
				if (destroyed || !selected || selected.tripLogId !== row.tripLogId) return;
				landed(t);
			}, function (err) {
				console.warn('SilexCaveTrips: the trip could not be read:', err);
				// Only if this is still the trip being waited for. A reader who pressed another
				// row while this one was failing has already been given that one, and clearing
				// the selection here would take it away from them because of an answer about a
				// trip they are no longer looking at.
				if (destroyed || !selected || selected.tripLogId !== row.tripLogId) {
					return;
				}
				// Nothing chosen, rather than a trip with nothing behind it: the list marking a
				// row as current while the model and the strip are empty is a page disagreeing
				// with itself, and the reader cannot tell which half is right.
				selected = null;
				// Nor anybody followed. A follow is a place in this trip's party, and left
				// standing it was applied to whichever trip the page opened next, where the
				// same number is somebody else: that party was drawn with one marker.
				follow = null;
				lastFollowStation = null;
				render();
				drawNothing();
				// Whoever asked on the reader's behalf — the page's own address — says what
				// there is to say itself, since it is going to ask again.
				if (opts.failed) opts.failed(err);
				else embed.say(L.offline);
			});
		}

		// The stretch a replay runs over: the watch's own, as the fold reads it — unless the
		// watch plainly was not the trip's. A watch armed after the party's first report, or
		// closed more than six hours after its last, was opened to write the trip up, and
		// then the reports' own stretch is the trip.
		function replayWindow(t) {
			var own = reportsWindow(t);
			var watch = fold.pastReplayWindow(t);
			if (!own || !watch) return own || watch;
			var armed = Date.parse(t.armedAt || '');
			var closed = Date.parse(t.closedAt || '');
			var writtenUp = (isFinite(armed) && armed > own.from) || !isFinite(closed) || closed - own.to > 6 * 3600000;
			return writtenUp ? own : watch;
		}

		// The stretch a track's own reports cover, or null where it has none.
		function reportsWindow(t) {
			var from = Infinity, to = -Infinity;
			(t.participants || []).forEach(function (p) {
				(p.track || []).forEach(function (fix) {
					var when = Date.parse(fix.recordedAt);
					if (!isFinite(when)) return;
					if (when < from) from = when;
					if (when > to) to = when;
				});
			});
			if (!isFinite(from) || !isFinite(to)) return null;
			// One moment is still something to stand at.
			return { from: from, to: to > from ? to : from + 60000 };
		}

		/**
		 * Every finished trip as one track, so that the fold that plays one trip plays them
		 * all on one clock: each trip is a team of it, named by the trip's title, and each
		 * member of each party a member of it under a number of their own.
		 *
		 * Somebody on five trips is five members, one after the other — which is what they
		 * were: at any instant at most one of them is underground, and only that one is drawn.
		 */
		function mergedTrack(entries) {
			var participants = [];
			var teams = [];
			var n = 0;
			var days = [];
			entries.slice().sort(function (a, b) {
				return String(a.row.tripDate || '').localeCompare(String(b.row.tripDate || ''));
			}).forEach(function (entry) {
				var t = entry.track;
				teams.push({ id: String(t.tripLogId), title: t.title });
				if (t.tripDate) days.push(t.tripDate);
				if (t.tripDateEnd) days.push(t.tripDateEnd);
				(t.participants || []).forEach(function (p) {
					n += 1;
					participants.push({
						ordinal: n,
						label: p.label,
						track: (p.track || []).map(function (fix) {
							return Object.assign({}, fix, { teamId: String(t.tripLogId) });
						})
					});
				});
			});
			days.sort();
			var some = entries.length ? entries[0].track : {};
			return {
				tripLogId: ALL_ROW.tripLogId, title: L.allTrips, expedition: some.expedition || null,
				tripDate: days[0] || null, tripDateEnd: days.length ? days[days.length - 1] : null,
				armedAt: null, closedAt: null,
				positionsWithheld: entries.some(function (e) { return e.track.positionsWithheld; }),
				trackTruncated: entries.some(function (e) { return e.track.trackTruncated; }),
				model: some.model || null, teams: teams, participants: participants, pictures: []
			};
		}

		// Every finished trip at once. Nobody chose a trip, so nothing is written into the
		// page's address: there is no one trip for an address to name.
		function selectAll(options) {
			var opts = options || {};
			var again = opts.loop === true && cfg.replay.loop !== false;
			viewForNewSelection(ALL_ROW);
			stopClock();
			clearTrails();
			selected = { kind: 'past', slot: null, tripLogId: ALL_ROW.tripLogId, row: ALL_ROW, all: true };
			track = null;
			span = null;
			moments = [];
			choice = null;
			render();
			drawNothing();
			if (!opts.underNote) embed.say(L.loading);
			return api.tracks().then(function (answer) {
				if (destroyed || !selected || !selected.all) return;
				if (!opts.underNote) embed.say(null);
				return selectTrip(ALL_ROW, {
					track: mergedTrack(answer.tracks),
					play: opts.play !== undefined ? opts.play : !prefersStill(),
					underNote: opts.underNote
				}).then(function (answered) {
					// Said after the trip is on the model: putting a trip there ends any
					// loop before it, this one's own start included.
					if (selected && selected.all) looping = again;
					return answered;
				});
			});
		}

		/**
		 * Somebody has chosen what is on screen: the reader, by pressing a row, following a
		 * link, putting a hand on the replay or on whom the view keeps up with — or an
		 * address, which is a choice somebody made before sending it.
		 *
		 * It is what the page's own address is written from. What the page opens by itself
		 * is nobody's choice and is left out of the address: the replay that plays when
		 * nobody is underground used to be written there within two seconds, so a reader who
		 * copied the address to share the article shared an instant of a replay with `play`
		 * on it. `row` is the trip chosen; none is the present chosen with nothing in it.
		 */
		function choose(row) {
			// Whatever the reader chose, the replay is theirs now and ends where it ends.
			looping = false;
			choice = { key: row ? keyOf(row) : null };
			// A trip is waited for while it is the one chosen. Choosing another ends the
			// waiting, which is otherwise only looked at on the next read — and until then
			// every drawing of the list went on saying a replay was being prepared.
			if (waiting && waiting.key !== choice.key) waiting = null;
			// And a choice of anything but the trip the address names comes before the
			// address, where that is still being asked for: something stands on the model
			// meanwhile, and a reader who put a hand on it — started it, wound it, followed
			// one of its party — would otherwise have it taken away minutes later by an
			// address they had already answered for themselves.
			if (asked && asked.tripLogId !== (row ? row.tripLogId : null)) asked = null;
			settleStray();
		}

		// The line saying the address could not be opened — it names a trip that is not
		// here, or one whose replay could not be read — goes when the address it was about
		// is no longer the one that stands. The list first, then the party back into it.
		function settleStray() {
			if (!stray) return;
			stray = null;
			render();
			redraw();
		}

		function backToNow() {
			// Whatever is being followed now — a party still underground first, then one
			// that has just come out, because the second is still the present tense.
			var now = trips.filter(function (t) { return t.kind === 'live'; })[0]
				|| trips.filter(function (t) { return t.followed; })[0];
			follow = null;
			asked = null;
			choose(now || null);
			if (now) selectTrip(now);
			else { stopClock(); clearTrails(); selected = null; track = null; render(); drawNothing(); }
		}

		// ---- the clock ----------------------------------------------------------

		// The slowest listed speed that plays this window through in about the time the
		// page aims for; the fastest listed where none does.
		function speedFor(window_) {
			var aim = Number(cfg.replay.aimSeconds);
			var listed = cfg.replay.speeds.slice().sort(function (a, b) { return a - b; });
			if (!(aim > 0) || !listed.length) return cfg.replay.defaultSpeed;
			var seconds = (window_.to - window_.from) / 1000;
			for (var i = 0; i < listed.length; i++) {
				if (seconds / listed[i] <= aim) return listed[i];
			}
			return listed[listed.length - 1];
		}

		function startClock() {
			if (!span) return;
			playing = true;
			loopWait = 0;
			// Playing from the end starts again rather than sitting still.
			if (at >= span.to) at = span.from;
			window.clearInterval(tickTimer);
			tickTimer = window.setInterval(tick, cfg.replay.tickMs);
			renderBar();
		}

		function stopClock() {
			playing = false;
			window.clearInterval(tickTimer);
			tickTimer = null;
			renderBar();
		}

		function tick() {
			if (!span || scrubbing) return;
			// Standing at its end before it starts again.
			if (loopWait) {
				if (!looping) { loopWait = 0; stopClock(); return; }
				if (Date.now() < loopWait) return;
				loopWait = 0;
				at = span.from;
				drawPast(true);
				renderBar();
				return;
			}
			var step = cfg.replay.tickMs * speed;
			var next = at + step;
			// Over a stretch with nothing reported in it: see `skipQuietSeconds`.
			var quiet = Number(cfg.replay.skipQuietSeconds) * 1000 * speed;
			if (quiet > 0) {
				var report = fold.momentAfter(moments, at);
				if (report !== null && report - at > quiet) next = report - quiet;
			}
			at = Math.min(span.to, next);
			drawPast();
			renderBar();
			// The end is the end: a replay that wrapped round would show a party
			// starting again, which did not happen. The one the page opened by itself is
			// the exception, and says so by standing at its end first: it is there to be
			// watched by whoever has not chosen anything yet, and a still model is not that.
			if (at >= span.to) {
				if (looping) loopWait = Date.now() + Math.max(0, Number(cfg.replay.loopHoldMs) || 0) + 1;
				else stopClock();
			}
		}

		function seek(value, isScrub) {
			if (!span) return;
			at = Math.min(span.to, Math.max(span.from, value));
			// Any hand on the scrubber stops the clock: a player that ran on under the
			// reader's finger would fight them for the position. And makes the replay the
			// reader's own, whoever opened it.
			if (isScrub) { choose(selected); stopClock(); }
			drawPast(isScrub);
			renderBar();
		}

		// Scrubbing asks for thirty positions a second, and each is where the party was
		// rather than somewhere to set off towards, so a marker is placed rather than
		// sent. Playing keeps the slide, which is what makes a replay read as movement.
		function moveDuration(isScrub) {
			return isScrub ? 0 : cfg.replay.moveMs;
		}

		// ---- drawing ------------------------------------------------------------

		function partyOf(envelope) {
			return fold.publicTrackedCavers(envelope, unnamed);
		}

		/**
		 * The names of the places the party is at, by station, or null where nothing
		 * names them.
		 *
		 * The installation ships the places a cave declares — `model.places`, each a
		 * station with the name people use for it — on the envelope, so a marker and a
		 * party row can say "Aven foot" where the fold says
		 * "p8.christmas_aven.2". Where the page's own hand list of places
		 * names the same station, the page's wording wins: it is the club's wording for
		 * its own article. An envelope declaring no places names nothing, whatever the
		 * page's list says, which is exactly what this page did before the installation
		 * shipped them.
		 *
		 * The envelope has to carry a model for this to read. A replay's track does. A row
		 * of the installation's list of the trips being followed does not, by that list's
		 * design — so a party being followed is named nothing, and the replay of the same
		 * trip is.
		 */
		function placeNames(envelope) {
			var declared = envelope && envelope.model && envelope.model.places;
			if (!declared || !declared.length) return null;
			var names = {};
			declared.forEach(function (p) {
				if (p && p.station && p.label) names[p.station] = p.label;
			});
			(embed.config.places || []).forEach(function (p) {
				if (p && p.station && p.label && names[p.station] !== undefined) names[p.station] = p.label;
			});
			return names;
		}

		function placeNameOf(c, names) {
			if (!names || !c.position || c.position.kind !== 'station') return null;
			return names[c.position.station] || null;
		}

		function toTeams(cavers, isScrub, names, envelope) {
			return cavers.map(function (c) {
				var station = c.position && c.position.kind === 'station' ? c.position.station : null;
				// Out of the cave is not a place in it. The last place somebody was reported
				// stays with them after they have come out, and drawn there they stood at the
				// bottom of the cave to the end of a replay, listed as out. They are listed,
				// with that word; they are not on the drawing.
				var entry = participantOf(envelope, c);
				if (entry && entry.out) station = null;
				// In, and nowhere reported yet: at the entrance.
				else if (!station && entry && entry.in && entranceStation() &&
					(!c.position || (c.position.kind !== 'otherModel' && c.position.kind !== 'withheld'))) {
					station = entranceStation();
				}
				// Following one of the party draws that one alone: the others are still
				// listed and still said to be where they are, they are simply not on the
				// drawing that is now about somebody in particular.
				if (follow && !isFollowed(c)) station = null;
				return {
					id: 'caver-' + c.caverId,
					label: c.name,
					sublabel: sublabelFor(c, names),
					color: colorFor(c.caverId),
					station: station,
					duration: moveDuration(isScrub),
					payload: { ordinal: c.caverId }
				};
			});
		}

		// The page's own place of depth 0, where it has one and the page has not said no.
		function entranceStation() {
			if (cfg.entrance === false) return null;
			var places = embed.config.places || [];
			for (var i = 0; i < places.length; i++) {
				if (places[i] && places[i].depth === 0 && places[i].station) return places[i].station;
			}
			return null;
		}

		function isFollowed(caver) {
			if (!follow) return true;
			if (follow.kind === 'caver') return String(caver.caverId) === String(follow.id);
			return (caver.teamId === null ? null : caver.teamId) === follow.id;
		}

		function sublabelFor(c, names) {
			var bits = [];
			// The place first, where the cave names it: "Aven foot · Team 2 · 10:40".
			var place = placeNameOf(c, names);
			if (place) bits.push(place);
			if (c.teamTitle) bits.push(c.teamTitle);
			var when = c.positionAt || c.lastRecordedAt;
			if (when) bits.push(hhmm(Date.parse(when)));
			return bits.join(' · ') || undefined;
		}

		function drawFollowed() {
			var key = selected.tripLogId || ('slot:' + selected.slot);
			var row = partyOfRow[key];
			if (!row) { drawNothing(); return; }
			// The row is already the three things the party fold asks for: who is on the
			// trip, what the teams are called, and whether positions are being withheld.
			var cavers = partyOf(row);
			embed.setTeams(toTeams(cavers, false, placeNames(row), row));
			clearOverlay();
			renderParty(cavers, row);
			emit('moment', { kind: 'followed', at: null, track: null, envelope: row, cavers: cavers,
				follow: follow, isFollowed: isFollowed, colorFor: colorFor, playing: false });
		}

		function drawPast(isScrub) {
			if (!track || !span) return;
			var envelope = fold.pastEnvelopeAt(track, at);
			var cavers = partyOf(envelope);
			embed.setTeams(toTeams(cavers, isScrub, placeNames(envelope), envelope));
			updateTrails();
			renderParty(cavers, envelope);
			drawOverlay(envelope, cavers);
			keepCamera(cavers);
			emit('moment', { kind: 'past', at: at, track: track, envelope: envelope, cavers: cavers,
				follow: follow, isFollowed: isFollowed, colorFor: colorFor, playing: playing, scrub: Boolean(isScrub),
				all: Boolean(selected && selected.all) });
		}

		function drawNothing() {
			embed.setTeams([]);
			clearOverlay();
			renderParty([], null);
			emit('nothing', {});
		}

		// Keeping the view on whoever is being followed. Only when the place they are at
		// has actually changed, because flying the camera on every tick of a replay would
		// make the model unreadable.
		var lastFollowStation = null;

		function keepCamera(cavers) {
			if (!follow || !cameraFollows) { lastFollowStation = null; return; }
			var station = fold.followedStation(cavers, follow);
			if (!station || station === lastFollowStation) return;
			lastFollowStation = station;
			focusOfEmbed.call(embed, station, { highlight: true, popup: false });
		}

		// ---- the roads they took ------------------------------------------------

		function clearTrails() {
			if (!viewer.removeTrail) return;
			trailIds.forEach(function (t) { viewer.removeTrail(t.id); });
			trailIds = [];
			lastFollowStation = null;
		}

		/**
		 * One trail per member of the party, built once when a track is loaded.
		 *
		 * Built once and then only revealed, because routing a trail across the survey
		 * is a minimum-distance search per pair of reported places — cheap once, absurd
		 * on every tick of a replay. What the clock changes afterwards is how much of it
		 * is drawn.
		 */
		function buildTrails() {
			clearTrails();
			if (!cfg.trails.enabled || !viewer.addTrail || !track) return;

			(track.participants || []).forEach(function (p) {
				var refs = [];
				var times = [];
				var elsewhere = 0;
				(p.track || []).forEach(function (fix) {
					var place = fold.publicPlaceReported(fix);
					if (!place) return;
					// Measured against a survey that is not the one on screen. A station
					// path is a name inside one survey, so the same name in this one may
					// be a different place or no place at all — and a road drawn from the
					// reports that happen to resolve would be a confident statement about
					// a route nobody took. Counted and said, never partly drawn.
					if (place.kind === 'otherModel') { elsewhere++; return; }
					// A depth is a place and is not a point on the drawing, so there is
					// no road to draw through it; it is still said beside the person.
					if (place.kind !== 'station') return;
					// A party who stayed put reported the same place twice; the road does
					// not double back on itself for that.
					if (refs.length && refs[refs.length - 1] === place.station) return;
					refs.push(place.station);
					times.push(Date.parse(fix.recordedAt));
				});
				if (elsewhere > 0) {
					// Nothing is drawn for this person rather than a shortened road.
					console.info('SilexCaveTrips: participant ' + p.ordinal + ' has ' + elsewhere +
						' report(s) measured on another survey; no road is drawn for them');
					return;
				}
				if (refs.length < 2) return;

				var id = 'trail-' + p.ordinal;
				var info = viewer.addTrail(id, refs, {
					color: colorFor(String(p.ordinal)),
					width: cfg.trails.width,
					progress: 0
				});
				if (!info) return;
				trailIds.push({ id: id, ordinal: String(p.ordinal), info: info, times: times });
				if (info.gaps && info.gaps.length) {
					// Drawn straight and dashed by the viewer, and said here: the survey
					// does not join those two places, so that stretch of the line is not a
					// passage anybody walked.
					console.info('SilexCaveTrips: ' + info.gaps.length + ' stretch(es) of the road for ' +
						'participant ' + p.ordinal + ' are not joined by the survey and are drawn dashed');
				}
			});
		}

		function updateTrails() {
			trailIds.forEach(function (t) {
				var shownTo = 0;
				// How far along the road they had got by now: the last reported place
				// whose hour has passed.
				for (var i = 0; i < t.times.length; i++) {
					if (t.times[i] > at) break;
					var point = t.info.points[i];
					if (point && point.atLength !== null) shownTo = point.atLength;
				}
				var fraction = t.info.lengthM > 0 ? shownTo / t.info.lengthM : 0;
				var hidden = follow && !followedOrdinal(t.ordinal);
				viewer.updateTrail(t.id, null, { visible: !hidden });
				viewer.setTrailProgress(t.id, fraction);
			});
		}

		function followedOrdinal(ordinal) {
			if (!follow) return true;
			if (follow.kind === 'caver') return String(follow.id) === String(ordinal);
			// A team is followed through its members, which the party fold knows and a
			// trail does not; the track's own participants carry a team per report rather
			// than one for the trip, so a trail is shown for a followed team's members.
			if (!track) return true;
			var p = (track.participants || []).filter(function (x) { return String(x.ordinal) === String(ordinal); })[0];
			if (!p) return false;
			return (p.track || []).some(function (fix) { return fix.teamId === follow.id; });
		}

		// ---- rendering ----------------------------------------------------------

		function render() {
			[asideEl, panelEl].forEach(function (target) {
				if (!target) return;
				target.innerHTML = '';
				renderList(target);
			});
			renderBar();
			emit('trips', { trips: trips.slice(), selected: selected, loaded: loadedOnce });
		}

		// A trip's days, short: "20.09", "20-25.09" within a month, "29.09-4.10" across two.
		// The day as it is said and the month in two figures; no year, which the article
		// and the expedition's name already give.
		function shortDays(row) {
			var part = function (iso) {
				var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
				return m ? { day: String(Number(m[3])), month: m[2] } : null;
			};
			var from = part(row.tripDate), to = part(row.tripDateEnd);
			if (!from) return '';
			if (!to || (to.day === from.day && to.month === from.month)) return from.day + '.' + from.month;
			if (to.month === from.month) return from.day + '-' + to.day + '.' + to.month;
			return from.day + '.' + from.month + '-' + to.day + '.' + to.month;
		}

		// Who was on a trip, by the names the installation publishes: from its track where
		// that has been read, from its party where it is being followed. Null while neither
		// is in hand, which is not the same as nobody.
		function namesOf(row) {
			var source = row.tripLogId && trackCache[row.tripLogId] ? trackCache[row.tripLogId] : partyOfRow[keyOf(row)];
			if (!source || !source.participants) return null;
			return source.participants.map(function (p) { return p.label || unnamed(p.ordinal); });
		}

		// How many different people the page's trips name between them, or null until every
		// trip's party is known: a count that grew as the tracks arrived would be read as
		// the number at each of its stages.
		function peopleCount() {
			var seen = {};
			var whole = true;
			trips.forEach(function (row) {
				var source = row.tripLogId && trackCache[row.tripLogId] ? trackCache[row.tripLogId] : partyOfRow[keyOf(row)];
				if (!source || !source.participants) { if (row.followed || row.playable) whole = false; return; }
				source.participants.forEach(function (p) { if (p.label) seen[nameKey(p.label)] = true; });
			});
			return whole ? Object.keys(seen).length : null;
		}

		// The row that stands for every trip at once, played on one clock.
		var ALL_ROW = { all: true, kind: 'past', tripLogId: '*', followed: false, playable: true };

		function renderList(target) {
			var head = el('div', 'cave_trips_title', target, L.title);
			// How many trips, and how many people between them, small beside the title.
			if (trips.length) {
				var people = peopleCount();
				el('span', 'cave_trips_total', head, L.totals.replace('{trips}', String(trips.length)) +
					(people ? ' · ' + L.totalPeople.replace('{people}', String(people)) : ''));
			}
			// Folding is offered on the list beside the model only: the one inside the model
			// is opened and closed by its own button.
			if (target === asideEl) {
				var folder = el('button', 'cave_trips_fold', head, asideFolded ? '▸' : '▾');
				folder.type = 'button';
				folder.title = asideFolded ? L.unfoldList : L.foldList;
				folder.setAttribute('aria-label', folder.title);
				folder.setAttribute('aria-expanded', asideFolded ? 'false' : 'true');
				folder.addEventListener('click', function () {
					asideFolded = !asideFolded;
					try { window.localStorage.setItem(FOLD_KEY, asideFolded ? '1' : '0'); } catch (e) { /* not kept */ }
					render();
					redraw(true);
				});
				target.classList.toggle('is_folded', asideFolded);
				if (asideFolded) return;
			}
			// The page's address could not be opened. Said in the list for as long as that
			// address stands, since the note over the model is gone in seconds.
			if (stray) el('div', 'cave_trips_notice', target, stray);
			if (cacheNote) el('div', 'cave_trips_notice cave_trips_cache', target, cacheNote);
			if (!trips.length) {
				// "Nothing published" and "not read yet" are different answers, and the
				// first is a statement about the club that must not be made while the
				// second is true.
				el('div', 'cave_trips_empty', target,
					lastReadFailed ? L.offline : (loadedOnce ? L.noTrips : L.loading));
				return;
			}
			var ul = el('ul', 'cave_trips_list', target);

			// Every finished trip on one clock, offered where there is more than one to put on it.
			var playable = trips.filter(function (t) { return !t.followed && t.playable; });
			if (cfg.list.all !== false && playable.length > 1) {
				var allLi = el('li', 'cave_trip cave_trip--all', ul);
				var allOpen = Boolean(selected && selected.all);
				if (allOpen) allLi.classList.add('is_current');
				var allRow = el('div', 'cave_trip_row', allLi);
				var allLink = el('a', 'cave_trip_link', allRow, L.allTrips);
				allLink.href = '#' + embed.config.container;
				var first = playable[playable.length - 1], last = playable[0];
				el('span', 'cave_trip_when', allRow, shortDays({ tripDate: first.tripDate, tripDateEnd: last.tripDateEnd || last.tripDate }));
				allLink.addEventListener('click', function (e) {
					e.preventDefault();
					follow = null;
					asked = null;
					selectAll({ play: true });
					showDrawing();
				});
				if (allOpen) {
					var allDetails = el('div', 'cave_trip_details', allLi);
					el('div', 'cave_trip_facts', allDetails, L.allTripsHelp);
					var allParty = el('div', 'cave_trips_party', allDetails);
					allParty.dataset.party = '1';
				}
			}

			trips.forEach(function (row) {
				var li = el('li', 'cave_trip', ul);
				var open = Boolean(selected && !selected.all && sameTrip(row, selected));
				if (open) li.classList.add('is_current');
				li.classList.add('cave_trip--' + row.kind);
				if (row.tripLogId) li.dataset.trip = String(row.tripLogId);
				// How the trip stands is written out only in the open trip's details; every
				// row still carries it, for whoever hovers and for whatever reads the list.
				var standing = row.kind === 'live' ? L.live : (row.kind === 'recent' && justEnded(row) ? L.recent : L.past);
				li.dataset.state = standing;

				// One line a trip: what it is called, who was on it, and its days, small.
				var line = el('div', 'cave_trip_row', li);
				var a = el('a', 'cave_trip_link', line, row.title || '—');
				a.href = '#' + embed.config.container;
				a.title = standing;
				var names = namesOf(row);
				if (names && names.length) el('span', 'cave_trip_people', line, names.join(', '));
				el('span', 'cave_trip_when', line, shortDays(row));

				// The chosen trip, once the followed list has let go of it and its replay has
				// been asked for and is not there yet: said on its row for as long as that
				// lasts, since the note over the model is gone in seconds. On its own row, by
				// the trip that is waited for and not by whichever is chosen: a reader who
				// pressed the party underground meanwhile had that row, marked as under way,
				// say its watch had ended.
				if (waiting && keyOf(row) === waiting.key) el('span', 'cave_trip_note', li, L.preparing);

				if (!row.followed && !row.playable) {
					li.classList.add('is_unplayable');
					a.setAttribute('aria-disabled', 'true');
					el('span', 'cave_trip_note', li, L.nothingToPlay);
					a.addEventListener('click', function (e) { e.preventDefault(); });
					return;
				}

				a.addEventListener('click', function (e) {
					e.preventDefault();
					follow = null;
					asked = null;
					choose(row);
					selectTrip(row);
					showDrawing();
					// The panel stays open. It used to close itself on the reasoning that
					// a reader who has chosen a trip wants to see the model rather than
					// the list — which is wrong twice over: choosing is the one moment a
					// reader is most likely to choose again, and a list that vanishes
					// under the press that used it reads as the press having broken
					// something. It is closed by the button that opened it, and by
					// nothing else.
				});

				if (!open) return;
				// What is said of the open trip, under its own row and nowhere else: how it
				// stands, its camp, its days in full, how many were on it — the line a row
				// used to carry under every trip — and then its party.
				var details = el('div', 'cave_trip_details', li);
				var facts = el('div', 'cave_trip_facts', details);
				el('span', 'cave_trip_state', facts, standing);
				var days = dayMonth(row.tripDate);
				if (days && row.tripDateEnd && row.tripDateEnd !== row.tripDate) days += ' – ' + dayMonth(row.tripDateEnd);
				if (days) el('span', 'cave_trip_days', facts, days);
				if (row.expedition && row.expedition.name) el('span', 'cave_trip_expedition', facts, row.expedition.name);
				if (row.participantCount) el('span', 'cave_trip_count', facts, L.headcount.replace('{n}', String(row.participantCount)));

				// What can be done with it from here: play it, and read its log.
				var acts = el('div', 'cave_trip_actions', details);
				if (selected.kind === 'past') {
					var play = el('button', 'cave_trip_action', acts, playing ? '❚❚ ' + L.pause : '\u25B6\uFE0E ' + L.play);
					play.type = 'button';
					play.dataset.detailsPlay = '1';
					play.disabled = !span;
					play.addEventListener('click', function () {
						choose(selected);
						if (playing) stopClock(); else startClock();
						render();
						redraw(true);
					});
				}
				extraActions.forEach(function (make) {
					try { make(acts, row, follow); } catch (e) { console.warn('SilexCaveTrips: a trip action failed:', e); }
				});

				var party = el('div', 'cave_trips_party', details);
				party.dataset.party = '1';
			});
			if (more) el('div', 'cave_trips_more', target, L.more);
		}

		/**
		 * Whether a watch that has closed closed on a trip that had only just ended.
		 *
		 * A closed watch is followed for a while yet, and the row said "just ended" for as
		 * long as it was. That is true of a party that came out this evening. It is not
		 * true of a trip typed up from its paper log a fortnight later, whose watch was
		 * opened and closed in the same minute: its row said "just ended" of a trip three
		 * weeks old. So the word is kept for a trip whose last day is no more than two days
		 * behind the moment its watch closed; any other closed trip is simply over.
		 */
		function justEnded(row) {
			var closed = Date.parse(row.closedAt || '');
			var lastDay = Date.parse(String(row.tripDateEnd || row.tripDate || '') + 'T23:59:59Z');
			if (!isFinite(closed) || !isFinite(lastDay)) return true;
			return closed - lastDay <= 2 * 86400000;
		}

		// By identifier wherever there is one. A title is not an identity — two trips of
		// one cave may be called the same thing, and a title is the one thing about a trip
		// somebody can edit afterwards.
		function sameTrip(row, sel) {
			if (row.tripLogId && sel.tripLogId) return row.tripLogId === sel.tripLogId;
			return row.slot === sel.slot;
		}

		// The word for each of the three standings the envelope distinguishes, as the
		// fold reads them. "Neither in nor out" is a standing of its own: somebody nobody
		// has reported yet arrives with both flags false, and a list that folded that into
		// "not underground" would show a party that has not set off as one already out.
		var STANDING_LABEL = { underground: 'underground', out: 'out', unheard: 'notStarted' };

		// `over` is a trip whose watch has closed: somebody nobody reported on such a trip
		// is not "not in yet" — nothing more will be said of them — and is said to be
		// without reports instead.
		function standingWord(participant, over) {
			if (!fold.standingOf || !participant) return null;
			var standing = fold.standingOf(participant);
			if (over && standing === 'unheard') return { standing: standing, word: L.noReports };
			return { standing: standing, word: L[STANDING_LABEL[standing]] || standing };
		}

		// The envelope's own entry for one of the party, which carries the flags the
		// standing is read from; the fold's tracked caver carries the drawing's needs.
		function participantOf(envelope, c) {
			var list = (envelope && envelope.participants) || [];
			for (var i = 0; i < list.length; i++) {
				if (String(list[i].ordinal) === String(c.caverId)) return list[i];
			}
			return null;
		}

		// The key the link engine files a name under, so that a name is matched here the
		// way it is matched there. The second spelling is only for an engine too old to
		// export its own, and is kept deliberately equal to that one: matching by a
		// different key is how one person becomes two, or two become one, in silence.
		function nameKey(raw) {
			if (window.SilexCaveAutolink && window.SilexCaveAutolink.nameKey) {
				return window.SilexCaveAutolink.nameKey(raw);
			}
			return String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
				.toLowerCase().replace(/\s+/g, ' ').trim();
		}

		/**
		 * The open trip's title, where it needs saying beside whoever is followed: when the
		 * page knows that person to be on another of its trips as well.
		 *
		 * One person is usually on several of an expedition's trips, and a link in the prose
		 * that names them and no trip follows them in whichever trip is open — which need
		 * not be the trip the paragraph was about. Their row then says which trip this party
		 * is, where the list's mark on the current row may be a screen away. Known only of
		 * the trips whose party the page holds, the ones being followed: an archive row is a
		 * headcount until its track is read. Nobody is matched by the wording generated for
		 * a member the installation does not name.
		 */
		function tripBesideFollowed(cavers, envelope) {
			if (!follow || follow.kind !== 'caver' || !selected || !envelope || !envelope.title) return null;
			var who = cavers.filter(function (c) { return String(c.caverId) === String(follow.id); })[0];
			if (!who || !who.name || who.name === unnamed(who.caverId)) return null;
			var wanted = nameKey(who.name);
			var elsewhere = trips.some(function (row) {
				if (sameTrip(row, selected)) return false;
				var party = partyOfRow[keyOf(row)];
				return Boolean(party) && partyOf(party).some(function (c) {
					return c.name && c.name !== unnamed(c.caverId) && nameKey(c.name) === wanted;
				});
			});
			return elsewhere ? envelope.title : null;
		}

		/**
		 * Who is on the trip and where.
		 *
		 * Every member appears, whatever is known about them: drawn on the model, or
		 * said in words to be somewhere this page cannot draw. A party list that quietly
		 * left out whoever could not be placed would read as a smaller party.
		 */
		function renderParty(cavers, envelope) {
			var names = placeNames(envelope);
			// A trip being followed whose watch has closed. A replay is never this: at an
			// instant of it, somebody not yet in is exactly that.
			var over = Boolean(envelope) && envelope.state === 'closed' && (!selected || selected.kind !== 'past');
			// With every trip on one clock the party is everybody who was ever on one of
			// them; listed are those underground at this instant.
			if (selected && selected.all && envelope) {
				cavers = cavers.filter(function (c) {
					var entry = participantOf(envelope, c);
					return Boolean(entry) && entry.in && !entry.out;
				});
			}
			var ofTrip = tripBesideFollowed(cavers, envelope);
			[asideEl, panelEl].forEach(function (target) {
				if (!target) return;
				var box = target.querySelector('[data-party]');
				if (!box) return;
				box.innerHTML = '';
				if (!cavers.length) return;
				if (!(selected && selected.all)) el('div', 'cave_party_title', box, L.party);
				// The three standings summed up — underground, out, not yet in — from the
				// fold's own count of the flags, so that this line and the word beside
				// each name cannot disagree with each other or with the application's page.
				if (fold.partyStandings && envelope && envelope.participants && !(selected && selected.all)) {
					var counts = fold.partyStandings(envelope.participants);
					var line = el('div', 'cave_party_standings', box, (over ? L.standingsOver : L.standings)
						.replace('{underground}', String(counts.underground))
						.replace('{out}', String(counts.out))
						.replace('{unheard}', String(counts.unheard)));
					line.dataset.standings = '1';
				}
				var ul = el('ul', 'cave_party_list', box);
				cavers.forEach(function (c) {
					var li = el('li', 'cave_party_member', ul);
					var dot = el('span', 'cave_party_dot', li);
					dot.style.background = colorFor(c.caverId);
					var a = el('a', 'cave_party_name', li, c.name);
					a.href = '#' + embed.config.container;
					if (follow && follow.kind === 'caver' && String(follow.id) === String(c.caverId)) {
						li.classList.add('is_followed');
						// Which trip they are being followed in, for somebody on several.
						if (ofTrip) el('span', 'cave_party_trip', li, ofTrip);
					}
					// The name of the place they are at, where the cave declares one.
					var place = placeNameOf(c, names);
					if (place) el('span', 'cave_party_place', li, place);
					var words = placeInWords(c.position, L);
					// Gone in and not yet reported anywhere: drawn at the entrance, and said to
					// be there rather than to have no position.
					var entry = participantOf(envelope, c);
					if (words === L.unreported && entry && entry.in && !entry.out && entranceStation()) words = L.atEntrance;
					// Somebody out has no place in the cave to be without.
					if (words === L.unreported && entry && entry.out) words = null;
					if (words) el('span', 'cave_party_where', li, words);
					// Where they stand, in a word, for everybody: a colour alone would say
					// it to nobody reading on a phone in the sun, or to a screen reader.
					var standing = standingWord(participantOf(envelope, c), over);
					if (standing) {
						el('span', 'cave_party_standing cave_party_standing--' + standing.standing, li, standing.word);
					}
					a.addEventListener('click', function (e) {
						e.preventDefault();
						setFollow(follow && follow.kind === 'caver' && String(follow.id) === String(c.caverId)
							? null : { kind: 'caver', id: String(c.caverId) });
						showDrawing();
					});
				});
				if (envelope && envelope.positionsWithheld) {
					el('div', 'cave_party_note', box, L.withheld);
				}
			});
		}

		function setFollow(next) {
			follow = next;
			lastFollowStation = null;
			// Whom the view keeps up with is the reader's choice about the trip that is open.
			if (selected) choose(selected);
			// <b>The list first, then the party into it.</b> render() empties the panel and
			// the aside and builds the list again, the party's own box included — so drawing
			// the party before it wiped what had just been drawn, and choosing somebody to
			// follow left a panel with nobody in it at all, the person just chosen included.
			// Every other caller already does it in this order; this one did not, and each
			// half is right on its own, which is why it took a browser to see.
			render();
			redraw(true);
		}

		function renderBar() {
			if (!barEl) return;
			var isPast = selected && selected.kind === 'past';
			barEl.hidden = !isPast;
			if (!isPast) {
				// The flag goes with the markup it describes. Left set over an emptied strip,
				// the next replay skipped the build and then wrote into controls that were no
				// longer there — a TypeError inside selectTrip's success handler, so the strip
				// was unhidden and empty, nothing was drawn, and the second replay never
				// started. The sequence a reader performs: pick a replay, press "back to now",
				// pick a replay.
				barEl.innerHTML = '';
				delete barEl.dataset.built;
				noteAddress();
				return;
			}

			// Rebuilding the whole strip on every tick would take the reader's finger off
			// the scrubber, so the parts that change are updated in place.
			if (!barEl.dataset.built) {
				barEl.innerHTML = '';
				barEl.dataset.built = '1';

				var says = el('div', 'cave_replay_says', barEl);
				says.dataset.says = '1';

				var controls = el('div', 'cave_replay_controls', barEl);

				// Each control is named in words as well as drawn. A glyph is read out as the
				// glyph, and a title alone is not a name everywhere; the scrubber's value is
				// an instant in milliseconds, which read out is thirteen digits — so it is
				// given the clock beside it to say instead, below.
				var back = el('button', 'cave_replay_step', controls, '‹');
				back.type = 'button'; back.title = L.stepBack;
				back.setAttribute('aria-label', L.stepBack);
				back.addEventListener('click', function () {
					var m = fold.momentBefore(moments, at);
					if (m !== null) seek(m, true);
				});

				var play = el('button', 'cave_replay_play', controls, '');
				play.type = 'button';
				play.dataset.play = '1';
				play.addEventListener('click', function () {
					// A hand on the play button makes the replay the reader's own.
					choose(selected);
					playing ? stopClock() : startClock();
				});

				var fwd = el('button', 'cave_replay_step', controls, '›');
				fwd.type = 'button'; fwd.title = L.stepForward;
				fwd.setAttribute('aria-label', L.stepForward);
				fwd.addEventListener('click', function () {
					var m = fold.momentAfter(moments, at);
					if (m !== null) seek(m, true);
				});

				var range = el('input', 'cave_replay_range', controls);
				range.type = 'range';
				range.dataset.range = '1';
				range.setAttribute('aria-label', L.scrub);
				range.addEventListener('pointerdown', function () { scrubbing = true; });
				['pointerup', 'pointercancel', 'blur'].forEach(function (evt) {
					range.addEventListener(evt, function () { scrubbing = false; });
				});
				range.addEventListener('input', function () { seek(Number(range.value), true); });

				var clock = el('span', 'cave_replay_clock', controls, '');
				clock.dataset.clock = '1';

				var sel = el('select', 'cave_replay_speed', controls);
				sel.title = L.speed;
				sel.setAttribute('aria-label', L.speed);
				sel.dataset.speed = '1';
				cfg.replay.speeds.forEach(function (s) {
					var o = el('option', null, sel, '×' + s);
					o.value = String(s);
				});
				sel.value = String(speed);
				sel.addEventListener('change', function () {
					speed = Number(sel.value);
					speedChosen = true;
				});

				// Whom the view keeps up with: nobody, a team, or one of the party. The
				// party list offers the people one at a time; a team can only be chosen
				// here, or from a link in the prose. Filled from the track below, and
				// filled again when the track changes, because a reader going from one
				// replay straight to the next keeps the strip and its controls.
				var who = el('select', 'cave_replay_follow', controls);
				who.title = L.followTitle;
				who.dataset.follow = '1';
				who.addEventListener('change', function () { setFollow(followFromValue(who.value)); });

				var now = el('button', 'cave_replay_now', controls, L.backToNow);
				now.type = 'button';
				now.addEventListener('click', backToNow);

				// The screen, for the model with this strip under it or for the whole block.
				// Neither is a choice of what is on the model, so neither ends a replay the
				// page is still running by itself.
				if (cfg.replay.fullscreen !== false && typeof embed.fullscreen === 'function') {
					[['model', '⛶', L.fullscreenModel], ['all', '▣', L.fullscreenAll]].forEach(function (spec) {
						var b = el('button', 'cave_replay_fs', controls, spec[1]);
						b.type = 'button';
						b.dataset.fs = spec[0];
						b.title = spec[2];
						b.setAttribute('aria-label', spec[2]);
						b.setAttribute('aria-pressed', 'false');
						b.addEventListener('click', function () { embed.fullscreen(spec[0]); });
					});
				}
			}

			// Which of the two the screen is in, if either: the button that took it is the
			// one that gives it back.
			[].forEach.call(barEl.querySelectorAll('[data-fs]'), function (b) {
				var on = embed.fullscreenMode === b.dataset.fs;
				var name = on ? L.fullscreenLeave : (b.dataset.fs === 'model' ? L.fullscreenModel : L.fullscreenAll);
				b.classList.toggle('is_on', on);
				b.setAttribute('aria-pressed', on ? 'true' : 'false');
				b.title = name;
				b.setAttribute('aria-label', name);
			});

			var saysEl = barEl.querySelector('[data-says]');
			var name = track ? track.title : (selected.row && selected.row.title) || '';
			// The date belongs in the statement, not only in the list it was chosen from:
			// the clock beside the scrubber shows an hour, and an hour with no day beside a
			// drawing of a cave reads as today. A trip over several days names both ends,
			// since its start alone under a clock reading the second day is the wrong day;
			// within one day nothing changes.
			var dated = track || selected.row || {};
			var day = dayMonth(dated.tripDate);
			if (day && dated.tripDateEnd && dated.tripDateEnd !== dated.tripDate) {
				day += ' – ' + dayMonth(dated.tripDateEnd);
			}
			if (day) name += ' · ' + day;
			var followed = track ? fold.followedName(track, follow, { unteamed: L.unteamed, unnamed: unnamed }) : null;
			// Permanent and not optional: the same drawing shows a party underground now
			// and a party from years ago, and a reader has to be told which.
			//
			// Null-guarded like the three controls below it, not because it is expected to be
			// missing but because writing into a strip that is not there threw inside
			// selectTrip's success handler, which took the drawing and the clock with it. One
			// unbuilt control should cost that control, not the replay.
			if (saysEl) {
				saysEl.textContent = L.replayOf + ' ' + name + (followed ? ' — ' + followed : '');
			}

			// The speed a replay opened at is worked out from its length, so the chooser
			// built for the last replay may be showing the last one's.
			var speedEl = barEl.querySelector('[data-speed]');
			if (speedEl && speedEl.value !== String(speed)) speedEl.value = String(speed);

			[asideEl, panelEl].forEach(function (target) {
				var inDetails = target ? target.querySelector('[data-details-play]') : null;
				if (inDetails) {
					inDetails.textContent = playing ? '❚❚ ' + L.pause : '\u25B6\uFE0E ' + L.play;
					inDetails.disabled = !span;
				}
			});

			var playEl = barEl.querySelector('[data-play]');
			// The text form of the triangle (U+FE0E): without it a telephone draws the emoji —
			// a white triangle on a tile of its own — which takes no colour from the button.
			if (playEl) playEl.textContent = playing ? '❚❚' : '\u25B6\uFE0E';
			if (playEl) playEl.title = playing ? L.pause : L.play;
			if (playEl) playEl.setAttribute('aria-label', playing ? L.pause : L.play);

			var rangeEl = barEl.querySelector('[data-range]');
			if (rangeEl && span) {
				rangeEl.min = String(span.from);
				rangeEl.max = String(span.to);
				rangeEl.step = String(Math.max(1, Math.round((span.to - span.from) / 1000)));
				if (!scrubbing) rangeEl.value = String(at);
				rangeEl.disabled = false;
			} else if (rangeEl) {
				rangeEl.disabled = true;
			}

			var clockEl = barEl.querySelector('[data-clock]');
			// Past a midnight the clock carries the day as well ("06.09 09:00"); within one
			// day it stays an hour alone.
			//
			// "Nothing recorded" is said of a track that has arrived with no window, and not
			// of one still on its way: for the seconds a slow read takes, the strip told the
			// reader that the trip they had just chosen had no recorded routes, and then
			// played it.
			var clock = span ? (crossesMidnight(span) ? dayOf(at) + ' ' + hhmm(at) : hhmm(at))
				: (track ? L.nothingToPlay : L.loadingReplay);
			if (clockEl) clockEl.textContent = clock;
			// What the scrubber is at, said as the reader sees it.
			if (rangeEl) rangeEl.setAttribute('aria-valuetext', clock);

			var whoEl = barEl.querySelector('[data-follow]');
			if (whoEl) {
				var forTrip = track ? String(track.tripLogId) : '';
				if (whoEl.dataset.trip !== forTrip) {
					fillFollowOptions(whoEl);
					whoEl.dataset.trip = forTrip;
				}
				syncFollowOption(whoEl);
			}

			noteAddress();
		}

		// ---- the follow chooser -------------------------------------------------
		//
		// The chooser spells a follow the way the application's own strip does — "none",
		// "team:<id>", "caver:<ordinal>" — so that the two read alike to anybody who has
		// used both.

		function followValue(f) {
			if (!f) return 'none';
			if (f.kind === 'caver') return 'caver:' + f.id;
			return 'team:' + (f.id === null ? '' : f.id);
		}

		function followFromValue(value) {
			var text = String(value || '');
			if (text === 'none' || text.indexOf(':') < 0) return null;
			var kind = text.slice(0, text.indexOf(':'));
			var id = text.slice(text.indexOf(':') + 1);
			if (kind === 'team') return { kind: 'team', id: id === '' ? null : id };
			if (kind === 'caver') return { kind: 'caver', id: id };
			return null;
		}

		function fillFollowOptions(sel) {
			sel.innerHTML = '';
			var none = el('option', null, sel, L.followNobody);
			none.value = 'none';
			if (!track) return;
			(track.teams || []).forEach(function (team) {
				var o = el('option', null, sel, team.title || L.unteamed);
				o.value = 'team:' + team.id;
			});
			(track.participants || []).forEach(function (p) {
				var o = el('option', null, sel, p.label || unnamed(p.ordinal));
				o.value = 'caver:' + p.ordinal;
			});
		}

		/**
		 * Shows the follow in the chooser. A follow the track does not list — a link in
		 * the prose naming a team of another trip, or the party's un-teamed members — is
		 * added for as long as it is the follow, named where the fold can name it, rather
		 * than shown as "nimeni" over a view that is keeping up with somebody.
		 */
		function syncFollowOption(sel) {
			var value = followValue(follow);
			var listed = false;
			for (var i = sel.options.length - 1; i >= 0; i--) {
				if (sel.options[i].dataset.stray) sel.remove(i);
				else if (sel.options[i].value === value) listed = true;
			}
			if (!listed) {
				var name = track ? fold.followedName(track, follow, { unteamed: L.unteamed, unnamed: unnamed }) : null;
				var o = el('option', null, sel, name || L.followNotInTrip);
				o.value = value;
				o.dataset.stray = '1';
			}
			sel.value = value;
		}

		// ---- the page's own address ---------------------------------------------
		//
		// The replay on screen is written into the page's own address — which trip, whom
		// the view keeps up with, the instant on the clock and whether it is running — in
		// the words the application's published page reads from its query string (`past`,
		// `team`, `caver`, `at`; `play` is this page's own, as it is on its links), so that
		// a reader can copy the address bar into a message and the next reader opens the
		// same moment of the same trip. The application writes no instant, so that its
		// address is never a number nobody chose; here the clock is written, because an
		// article's reader who winds to the moment a paragraph describes and copies the
		// address means that moment. In the fragment and not the query string: the query
		// string of a WordPress page belongs to WordPress, and a page cache answers
		// "?past=" as a different page.
		//
		// Written with replaceState and never as a history entry — a replay advances five
		// times a second, and a back button that had to wind through every tick would be
		// one that no longer leaves the page — and at most once a second, since browsers
		// refuse an address rewritten faster than that.
		//
		// <b>The fragment is the whole page's, not this component's.</b> A theme's anchors,
		// a comment's, a lightbox's "#gallery-3" and whatever the next plugin keeps there
		// all live in it. So three rules, each of which this file has broken once. Only a
		// replay somebody chose is written — see choose(). A fragment that is not empty and
		// does not already name a replay is somebody else's and is never written over, even
		// with a replay on screen: it used to be replaced within a second, and a reader
		// could not keep a photograph's own link in the address while a replay ran. And
		// where a fragment naming a replay carries other parameters too, only this
		// component's own are rewritten; the rest are carried exactly as they stand, where
		// passing the whole of it through a parser spelled them again and dropped
		// parameters that merely shared a name with one of these.

		var ADDRESS_PLAY = 'play';
		// The parameters that are this component's, in the fold's own words for them.
		var ADDRESS_OWN = (fold.PAST_LINK_PARAMS || ['past', 'team', 'caver', 'at']).concat([ADDRESS_PLAY]);
		var addressTimer = null;
		// The fragment as this component last wrote it.
		var written = null;
		// What the address asks for: read when the page opens, and again when the reader
		// follows another address while it is open. Kept until the trip it names has been
		// opened, or a whole answer shows it is not on this page, or its replay has gone on
		// being refused for `poll.addressMs`, or the reader chooses something themselves —
		// whichever comes first. While its replay is being refused it also carries since
		// when (`since`), the ladder it climbs (`retryIn`) and when it is next asked for
		// (`dueAt`).
		var asked = readAddress();

		function fragment() {
			return String(window.location.hash || '').replace(/^#/, '');
		}

		function readAddress() {
			if (!fold.readPastLink) return null;
			var raw = fragment();
			// A plain anchor — "#example_model" — is not a question.
			if (raw.indexOf('=') < 0) return null;
			var params = new URLSearchParams(raw);
			var link = fold.readPastLink(params);
			if (!link) return null;
			return { tripLogId: link.tripLogId, follow: link.follow, at: link.at, play: params.get(ADDRESS_PLAY) };
		}

		// The row the address names, where the page lists it.
		function rowAsked() {
			if (!asked) return null;
			var id = asked.tripLogId;
			return trips.filter(function (t) { return t.tripLogId === id; })[0] || null;
		}

		// Whether the trip the address names is to be asked for now: always, until its
		// track has been refused, and from then on when its own ladder says.
		function addressIsDue() {
			return Boolean(asked) && !(asked.dueAt && Date.now() < asked.dueAt);
		}

		/**
		 * Opens what the address asks for, once the trip it names is listed.
		 *
		 * Answers null where the trip is not listed, and otherwise a promise of whether the
		 * trip's track was refused and is to be asked for again.
		 *
		 * <b>The address is kept until the trip has actually opened.</b> It used to be let
		 * go of before the track was asked for. One refused read then left nothing chosen,
		 * so the address was wiped off the bar a second later and a reload opened the
		 * article's default; nothing asked again; and the next poll opened another trip
		 * with the address's follow still set — the party underground, drawn with one
		 * marker, because a place in one party is somebody else in the next. Now a refused
		 * read keeps the address, tells the reader the replay is being tried again, follows
		 * nobody meanwhile, and is repeated — see addressRefused(). A track that is not
		 * there at all — a 404 through every link, for a trip the list still names — is the
		 * trip not being on this page.
		 *
		 * <b>And what is on screen is kept until the trip is in hand.</b> A row pressed is
		 * shown as chosen at once, with its track on its way, and so is the address a
		 * reader arrives by, when there is nothing on screen to keep. But an address
		 * followed while the page is open, and every later try at one that was refused,
		 * finds something there: the party underground, or a replay the reader chose. That
		 * stays as it is while the track is read, and is replaced when the track has
		 * arrived — never taken off first, which for a track that goes on being refused was
		 * a party off the model for as long as the reader left the page alone.
		 */
		function honourAddress() {
			if (!asked) return null;
			var wanted = asked;
			// Its track is already being read: a second read arriving meanwhile waits on
			// the same answer.
			if (wanted.opening) return wanted.opening;
			var row = rowAsked();
			if (!row) return null;
			var moment = momentOf(wanted.at);
			var said = playFromWord(wanted.play);
			// The rule a link in the prose follows: a trip named on its own is watched, a
			// moment named is looked at, and the address may say either way. But an
			// address starts nothing for a reader who asked for less motion.
			var play = (said === null ? moment === null : said) && !prefersStill();

			// Another moment of the replay already open — a second link into the same trip,
			// followed with the page open. Gone to in place: the track is in hand, and
			// asking for it again would blank the model for the length of a read.
			if (selected && selected.kind === 'past' && track && selected.tripLogId === wanted.tripLogId) {
				asked = null;
				setFollow(wanted.follow);
				if (moment !== null) seek(moment, true);
				if (play) startClock(); else stopClock();
				return Promise.resolve(false);
			}

			var refused = null;
			function unread(err) { refused = err || new Error('the track was not read'); }
			var reading;
			if (!selected || row.followed) {
				// Nothing on screen to keep, or a trip being followed, which has no track
				// to wait for.
				follow = wanted.follow;
				lastFollowStation = null;
				choose(row);
				reading = selectTrip(row, { moment: moment, play: play, failed: unread });
			} else {
				// Said of the reader's own asking, and not of the tries the page makes by
				// itself afterwards.
				if (!wanted.since) embed.say(L.loading);
				reading = source.track(row.tripLogId, row.slot).then(function (t) {
					if (destroyed || asked !== wanted) return;
					// The row as the list has it now: a read may have come and gone since.
					var listed = rowAsked() || row;
					follow = wanted.follow;
					lastFollowStation = null;
					choose(listed);
					selectTrip(listed, { moment: moment, play: play, track: t });
				}, function (err) {
					console.warn('SilexCaveTrips: the trip the address names could not be read:', err);
					unread(err);
				});
			}

			wanted.opening = reading.then(function () {
				wanted.opening = null;
				// The reader has chosen something else meanwhile, or followed another address.
				if (destroyed || asked !== wanted) return false;
				if (!refused) { asked = null; return false; }
				if (refused.status === 404) {
					addressNamesNothing();
					// Any trip but the one just found not to be there.
					if (!selected) openDefault(true, wanted.tripLogId, true);
					return false;
				}
				return addressRefused(wanted, refused);
			});
			return wanted.opening;
		}

		/**
		 * The track of the trip the address names was refused, other than as not there: a
		 * failure of that read, which says nothing about the trip. Answers whether it is to
		 * be asked for again.
		 *
		 * It is: on a ladder of its own, five seconds and then doubling, which
		 * schedulePoll() brings a read forward for, until it has been refused for
		 * `poll.addressMs`. The reader is told once that the replay is being tried again.
		 * Meanwhile the page is the page it would have been without the address — what was
		 * on screen stays, and with nothing on screen whatever the page opens by itself is
		 * opened, standing ready, any trip but this one — with nobody followed, and the
		 * lists read at their own pace. When the time is up the reader is told the replay
		 * could not be loaded, over the model and in the list, and the address is let go
		 * of: left in the bar as it was brought, as one naming a trip that is not here is.
		 *
		 * <b>This used to be one rule: nothing else is opened, and the whole page goes on
		 * the retry ladder until the track answers.</b> A track that went on being refused —
		 * an upstream read timing out every time, a fault on that one trip — was then a
		 * page with nothing chosen for as long as it lasted: a party underground never
		 * drawn and its list two minutes old, the same two notes over an empty model at
		 * every retry, and no end to it short of the reader pressing a row, which nothing
		 * on the page told them to do.
		 */
		function addressRefused(wanted, refused) {
			noteFailure(refused);
			if (!wanted.since) wanted.since = Date.now();
			var note = L.replayRetry;
			var over = Date.now() - wanted.since >= cfg.poll.addressMs;
			if (over) {
				console.warn('SilexCaveTrips: the replay of the trip "' + wanted.tripLogId +
					'" the address names went on being refused, and is no longer asked for');
				asked = null;
				choice = null;
				stray = L.unopened;
				note = L.unopened;
			} else {
				wanted.retryIn = nextRung(wanted.retryIn);
				wanted.dueAt = Date.now() + waitAfterFailure(wanted.retryIn);
				// Once, where something stands on the model meanwhile: a note over a party
				// that is being read all the while, at every try, said otherwise.
				if (wanted.told && selected) note = null;
				wanted.told = true;
			}
			if (note) embed.say(note);
			if (over) {
				// The list first, then the party back into it.
				render();
				redraw();
			}
			if (!selected) openDefault(true, wanted.tripLogId, Boolean(note));
			return !over;
		}

		/**
		 * The address names a trip that is not on this page, and a whole answer has shown
		 * it. The reader is told, over the model and in the list. It used to be a line in
		 * the console: another trip played in its place, correctly labelled and unexplained,
		 * and the address was rewritten to that trip.
		 *
		 * The address itself is left as the reader brought it, since nothing on screen is
		 * anybody's choice now, until they choose something.
		 */
		function addressNamesNothing() {
			console.warn('SilexCaveTrips: no published trip "' + asked.tripLogId +
				'" on this page for the address to open');
			asked = null;
			choice = null;
			stray = L.unlisted;
			embed.say(L.unlisted);
			// The list first, then the party back into it.
			render();
			redraw();
		}

		/**
		 * The address changed under an open page: the reader followed a link to another
		 * moment of this article, or pasted one over the address. The browser loads nothing
		 * for that, so nothing would read it. Honoured as on arrival. It used to be ignored,
		 * and a second later written over with whatever replay was already on screen.
		 */
		function onAddress() {
			if (destroyed) return;
			// The address that could not be opened no longer stands, whatever stands in its
			// place: the line about it goes before the new fragment is looked at. It used
			// to go only for another replay's address, so a reader who went on to a plain
			// anchor had the list still saying their address named a trip that is not here.
			settleStray();
			// Back at what this component wrote itself — a lightbox closing, or the reader
			// going back to it — asks nothing new.
			if (fragment() === written) return;
			var link = readAddress();
			// Somebody else's fragment asks nothing of this component, and is theirs.
			if (!link) return;
			asked = link;
			// The first answer has not arrived; it honours whatever is asked by then.
			if (!loadedOnce) return;
			var opening = honourAddress();
			if (opening) {
				opening.then(addressAnswered, function (e) {
					console.warn('SilexCaveTrips: the trip the address names could not be opened:', e);
				});
				return;
			}
			// Not listed. After a whole answer that is the trip not being on this page; with
			// half of the last read refused it is not known yet, and the next read decides.
			if (!lastReadFailed) addressNamesNothing();
		}

		window.addEventListener('hashchange', onAddress);

		function noteAddress() {
			if (addressTimer || destroyed) return;
			addressTimer = window.setTimeout(writeAddress, 1000);
		}

		/** The pieces of a fragment that are not this component's, exactly as they stand. */
		function othersIn(raw) {
			var kept = raw.split('&').filter(function (piece) {
				var name = piece.split('=')[0];
				try { name = decodeURIComponent(name.replace(/\+/g, ' ')); } catch (e) { /* not ours, whatever it is */ }
				return ADDRESS_OWN.indexOf(name) < 0;
			});
			// Separators with nothing between them are nothing to carry.
			return kept.join('') === '' ? [] : kept;
		}

		function writeAddress() {
			addressTimer = null;
			if (destroyed || !fold.writePastLink) return;
			// Not before what the address asks for has been opened: the first drawing of
			// the page, before the list arrived, must not wipe the question off it — nor a
			// refused read of its track, which is asked for again.
			if (asked) return;
			// Nor while a chosen track is still on its way: the address would be cleared
			// for the seconds the read takes and written again when it lands.
			if (selected && selected.kind === 'past' && !track) return;
			// Nor until somebody has chosen something. What the page opened by itself is
			// not written, and an address it could not open is left as it was brought.
			if (!choice) return;
			var raw = fragment();
			// Somebody else's fragment — a plain anchor, another script's parameters — is
			// left byte for byte, whatever is on screen.
			if (raw && !readAddress()) return;
			var replay = selected && selected.kind === 'past' && !selected.all && selected.tripLogId && track
				&& choice.key === keyOf(selected) ? selected : null;
			var own = '';
			if (replay) {
				var params = fold.writePastLink('', replay.tripLogId, follow);
				if (span) {
					params.set('at', new Date(at).toISOString());
					if (playing) params.set(ADDRESS_PLAY, '1');
				}
				own = params.toString();
			}
			var next = othersIn(raw).concat(own ? [own] : []).join('&');
			if (next === raw) return;
			try {
				window.history.replaceState(window.history.state, '',
					window.location.pathname + window.location.search + (next ? '#' + next : ''));
				written = next;
			} catch (e) {
				// A document that may not rewrite its address — opened from a file, or in
				// a sandboxed frame — keeps the one it has; the address is a convenience.
			}
		}

		// ---- the party's names, found in the prose ------------------------------
		//
		// The fourth source of automatic links, and the only one that is about people
		// rather than places. It drives the same engine the place sources drive, with its
		// own vocabulary and its own attributes, so the anchors it produces are the ones
		// an editor would have typed by hand and the handler below is what binds them.

		/** Names already offered to the engine, so a poll does not link the page again. */
		var caverNamesLinked = false;

		function autolinkCavers() {
			var opts = cfg.cavers;
			if (!opts || !opts.autolink || caverNamesLinked) return;
			if (!window.SilexCaveAutolink) {
				console.warn('SilexCaveTrips: caver autolink requested but text-autolink.js is not loaded');
				return;
			}

			// Read from the envelope a followed trip arrived as, not from the summary row
			// beside it: a row carries a headcount and an envelope carries the party. Which
			// also bounds what this can do — an archive row's party is not known until its
			// track is read, so the names it offers are the names of the trips being
			// followed. That is where a reader of a journal page is: the article is about a
			// party that is underground now, or has just come out.
			// Gathered by the name the engine will key on, before any entry is built.
			//
			// <b>Because one person is usually on several of an expedition's trips.</b> That is
			// the page's whole case, and one entry per (trip, member) cannot express it: the
			// engine keys its vocabulary by name, so the second entry for a name either made it
			// ambiguous and dropped it — a leader whose place in the party differs between trips
			// got no link at all, silently — or, where their place happened to be the same,
			// overwrote the first and left the name pointing at whichever trip was listed last.
			// A paragraph about one trip then carried a link that followed somebody on another.
			var key = nameKey;

			var byName = {};
			trips.forEach(function (row) {
				if (!row.tripLogId) return;             // a slot-only row names no trip to link to
				var envelope = partyOfRow[row.tripLogId] || partyOfRow['slot:' + row.slot];
				if (!envelope) return;
				(partyOf(envelope) || []).forEach(function (c) {
					// The generated wording for somebody the installation does not name —
					// "Speologul 3" — is not a name anybody writes in an article, and
					// matching it would link a heading or a caption instead of a person.
					if (!c.name || c.name === unnamed(c.caverId)) return;
					if (String(c.name).length < opts.minLength) return;
					var k = key(c.name);
					if (!byName[k]) byName[k] = { name: c.name, seen: [] };
					byName[k].seen.push({ caverId: String(c.caverId), tripLogId: row.tripLogId });
				});
			});

			var entries = [];
			var dropped = [];
			Object.keys(byName).forEach(function (k) {
				var found = byName[k];
				var ids = {};
				found.seen.forEach(function (one) { ids[one.caverId] = true; });
				var whoever = Object.keys(ids);

				if (found.seen.length === 1) {
					// One trip: the link says which person and which trip, as before.
					entries.push({
						station: found.seen[0].caverId,
						names: [found.name],
						attrs: { 'data-silexgis-trip': found.seen[0].tripLogId }
					});
					return;
				}

				if (whoever.length === 1) {
					// The same person on several trips: the link names them and no trip, so it
					// follows them in whichever trip the reader has open. Naming one trip would
					// be picking a trip on the article's behalf; naming none is the honest
					// reading of a name that belongs to all of them.
					entries.push({ station: whoever[0], names: [found.name] });
					// Says what the link will do, not only what was decided: whoever reads this
					// console is deciding whether the article's links behave as they meant.
					console.info('SilexCaveTrips: "' + found.name + '" is on ' + found.seen.length +
						' of the trips being followed, so their name is linked to the person and ' +
						'to no trip — it follows them in whichever trip is open');
					return;
				}

				// One name, several places in the party — two people who share a name, or one
				// person the installation numbers differently on different trips. Nothing here
				// can tell those apart, and either way there is no one person to link to. Said
				// out loud rather than dropped in silence, which is what happened before.
				dropped.push(found.name);
			});

			if (dropped.length) {
				console.info('SilexCaveTrips: not linked, because one name covers more than one ' +
					'member of the party across the trips being followed: ' + dropped.join(', '));
			}

			if (!entries.length) return;

			var report = null;
			try {
				report = window.SilexCaveAutolink.run({
					root: embed.config.autolink && embed.config.autolink.root ? embed.config.autolink.root : null,
					entries: entries,
					dataAttr: 'data-silexgis-caver',
					linkClass: opts.linkClass,
					limitPerName: opts.limitPerName,
					limitPerBlock: opts.limitPerBlock,
					minLength: opts.minLength,
					// No depth source here: a person is not at a depth, and handing this one
					// the depth index would have it linking "-815 m" as if it were somebody.
					depths: null
				});
			} catch (e) {
				console.warn('SilexCaveTrips: the party could not be linked in the prose:', e);
				return;
			}

			// The engine's own refusals too. It drops a name it finds pointing two ways, and a
			// name dropped in silence is indistinguishable from a name the article never wrote —
			// which is the difference between "nothing to link" and "something I could not".
			if (report && report.ambiguous && report.ambiguous.length) {
				console.info('SilexCaveTrips: the link engine found these names pointing more ' +
					'than one way and left them alone: ' + report.ambiguous.join(', '));
			}

			// Once per page: the party is polled every half minute and the names do not
			// change with it, so linking again would only find the anchors it made last
			// time. A trip published while the page is open is a page reload away.
			caverNamesLinked = true;
			// The anchors are new, so whatever binds links has to be told they exist.
			if (typeof embed.bindLinks === 'function') embed.bindLinks();
		}

		// ---- links in the prose -------------------------------------------------
		//
		// The same vocabulary the SilexGIS embed understands, so an editor writes one
		// kind of link whichever viewer the article carries. Most specific first: a link
		// carrying both a trip and a caver is about the caver, with the trip as context.

		/** An instant a link or the address names, or null where it names none readable. */
		function momentOf(value) {
			if (value === null || value === undefined || value === '') return null;
			var ms = Date.parse(String(value));
			return isNaN(ms) ? null : ms;
		}

		/**
		 * Whether a link wants the replay running, or null for "you decide".
		 *
		 * An attribute with no value is the HTML way of saying yes, so `data-silexgis-play`
		 * on its own means play; the words for no are spelled out because an author who
		 * writes one of them means it, and a truthiness test would read "false" as yes.
		 */
		function playFromWord(value) {
			if (value === null || value === undefined) return null;
			return !(/^(0|no|false|off)$/i).test(String(value).trim());
		}

		embed.onLink(function (spec) {
			// An empty team is the party's un-teamed members, so absence is tested by
			// identity with null rather than by truthiness.
			if (spec.trip === null && spec.caver === null && spec.team === null
					&& spec.moment === null && spec.play === null) {
				return false;
			}

			// A link the reader follows is the reader's choice, over anything the address
			// asked for on arrival.
			asked = null;

			var moment = momentOf(spec.moment);
			var wantsPlay = playFromWord(spec.play);

			var wants = null;
			if (spec.caver) wants = { kind: 'caver', id: String(spec.caver) };
			else if (spec.team !== null) wants = { kind: 'team', id: spec.team === '' ? null : spec.team };

			// `unopened` is the trip the link named not having opened — its track refused, or
			// the reader on to something else by the time it answered. Nobody is followed
			// then: the link's follow is a place in that trip's party and no other's.
			function afterwards(unopened) {
				if (wants && !unopened) {
					setFollow(wants);
					// A link is the reader asking to be shown somebody: the view goes to where
					// they are, this once, whether or not it is set to keep after them.
					if (!cameraFollows && selected) {
						var shownNow = selected.kind === 'past'
							? (track && span ? partyOf(fold.pastEnvelopeAt(track, at)) : [])
							: partyOf(partyOfRow[keyOf(selected)] || {});
						var where = fold.followedStation(shownNow, wants);
						// The module's own flight on behalf of the link, which may just have
						// started its replay: not the reader's press elsewhere that pauses one.
						if (where) focusOfEmbed.call(embed, where, { highlight: true, popup: false });
					}
				}
				// A place named alongside is still a place: the trip is the context it is
				// to be looked at in.
				if (spec.station || spec.survey || (spec.selection && !spec.caver && !spec.team)) {
					focusOfEmbed.call(embed, spec.station || spec.survey || spec.selection, { highlight: true, popup: true });
				}
			}

			if (spec.trip === 'live') {
				backToNow();
				afterwards();
				return true;
			}

			if (spec.trip) {
				var row = trips.filter(function (t) { return t.tripLogId === spec.trip; })[0];
				if (!row) {
					// Not guessed at: a trip this page does not hold is a link that names
					// something else, and pretending otherwise would play the wrong trip.
					console.warn('SilexCaveTrips: no published trip "' + spec.trip + '" on this page');
					embed.say(L.offline);
					return true;
				}
				follow = wants;
				// Left to the link where it says, and otherwise the rule that was already
				// here: a trip named on its own is an invitation to watch it, and a moment
				// named is a place in time to look at, which a replay starting itself would
				// carry the reader away from.
				var play = wantsPlay === null ? moment === null : wantsPlay;
				choose(row);
				selectTrip(row, { moment: moment, play: play }).then(function () {
					afterwards(!selected || !sameTrip(row, selected));
				});
				return true;
			}

			// No trip named: the follow, the moment and the clock are about whatever is open.
			if (wants) setFollow(wants);
			if (moment !== null && selected && selected.kind === 'past') seek(moment, true);
			if (wantsPlay !== null && span) {
				// Seeking stops the clock, so starting it is done after the seek rather than
				// before — a link that names both a moment and "play" means watch on from
				// there, and doing these the other way round would stop what it just started.
				choose(selected);
				if (wantsPlay) startClock(); else stopClock();
			}
			afterwards();
			return true;
		});

		// ---- taking it down -----------------------------------------------------

		if (typeof embed.onFullscreen === 'function') embed.onFullscreen(function () { renderBar(); });

		embed.onDestroy(function () {
			destroyed = true;
			embed.focus = focusOfEmbed;
			if (overlayEl) overlayEl.remove();
			window.clearTimeout(pollTimer);
			document.removeEventListener('visibilitychange', onSeen);
			window.removeEventListener('hashchange', onAddress);
			window.clearTimeout(addressTimer);
			window.clearInterval(tickTimer);
			if (buttonEl) buttonEl.remove();
			if (panelEl) panelEl.remove();
			if (barEl) barEl.remove();
			if (asideEl) {
				if (asideIsOurs) asideEl.remove();
				else { asideEl.innerHTML = ''; asideEl.hidden = false; }
			}
		});

		// ---- go -----------------------------------------------------------------

		api.reload = function () { return loadAll(); };
		// A page that selects a trip for its reader has chosen it, as a row pressed has.
		api.select = function (row, options) {
			asked = null;
			if (row) choose(row);
			return selectTrip(row, options);
		};
		api.backToNow = backToNow;
		api.setFollow = setFollow;
		api.seek = seek;
		api.play = function () { if (selected) choose(selected); startClock(); };
		api.pause = function () { stopClock(); };
		// A replay stopped because the reader went somewhere, saying so (see pauseForReader).
		api.pauseForReader = function () { return pauseForReader(); };
		api.saidPaused = function () { saidPaused(); };
		api.on = function (name, fn) {
			if (typeof fn === 'function') (listeners[name] = listeners[name] || []).push(fn);
			return api;
		};
		api.labels = L;
		api.fold = fold;
		/** Adds a control to the open trip's details: `make(element, row, follow)`. */
		api.addTripAction = function (make) { if (typeof make === 'function') extraActions.push(make); };
		api.selectAll = selectAll;
		api.entranceStation = entranceStation;
		/** A followed trip's envelope — its party as the list sent it — or null for any other row. */
		api.envelopeOf = function (row) { return (row && partyOfRow[keyOf(row)]) || null; };
		api.unnamed = unnamed;
		api.nameKey = nameKey;

		/**
		 * The track of every finished trip on the page that has one, each read once.
		 *
		 * One at a time and not all at once: through the site's proxy each is a read of the
		 * installation unless somebody asked within the minute, and a page's worth of
		 * readers each asking for thirty tracks in one burst is what a limiter is for. A
		 * read refused with "come back later" ends the run where it stands — what was read
		 * is handed over, marked incomplete, and the next call carries on from there.
		 * Resolves `{ tracks: [{ row, track }], complete }`, in the list's own order.
		 */
		var readingTracks = null;
		api.tracks = function () {
			if (readingTracks) return readingTracks;
			var rows = trips.filter(function (r) { return !r.followed && r.playable && r.tripLogId; });
			var complete = true;
			var i = 0;
			function next() {
				while (i < rows.length && trackCache[rows[i].tripLogId]) i++;
				if (i >= rows.length || destroyed) return Promise.resolve();
				var row = rows[i++];
				return source.track(row.tripLogId, row.slot).then(function (t) {
					if (t) trackCache[row.tripLogId] = t;
				}, function (err) {
					complete = false;
					// A limiter or a proxy that is not answering: asking for the rest now
					// would be asking for the same refusal again, once a trip.
					if (err && (err.status === 429 || err.status === 503)) i = rows.length;
				}).then(function () {
					// No pause between tracks read out of a file: there is nobody to spare.
					var gap = cfg.poll.tracksEveryMs !== undefined ? cfg.poll.tracksEveryMs : (cfg.export ? 0 : 150);
					return gap > 0 ? new Promise(function (resolve) { window.setTimeout(resolve, gap); }) : null;
				}).then(next);
			}
			readingTracks = next().then(function () {
				readingTracks = null;
				return {
					tracks: rows.filter(function (r) { return trackCache[r.tripLogId]; })
						.map(function (r) { return { row: r, track: trackCache[r.tripLogId] }; }),
					complete: complete
				};
			});
			return readingTracks;
		};

		// The module that draws the day chips, the figures, the maps and the photographs
		// of a replay: brought in only for a page that asks for one of them, and from
		// beside this file unless the page has loaded it itself.
		if (cfg.days || cfg.stats || cfg.maps || cfg.photos) {
			var startJournal = function () {
				if (destroyed || !window.SilexCaveJournal) return;
				try { api.journal = window.SilexCaveJournal.attach(embed, api, cfg); }
				catch (e) { console.warn('SilexCaveTrips: the journal module could not start:', e); }
			};
			if (window.SilexCaveJournal) {
				startJournal();
			} else if (/cave-trips\.js(\?|$)/.test(HERE)) {
				var tag = document.createElement('script');
				tag.src = HERE.replace(/cave-trips\.js(\?.*)?$/, 'cave-journal.js?ver=' + encodeURIComponent(JOURNAL_STAMP));
				tag.async = true;
				tag.onload = startJournal;
				tag.onerror = function () { console.warn('SilexCaveTrips: cave-journal.js could not be loaded'); };
				document.head.appendChild(tag);
			} else {
				console.warn('SilexCaveTrips: the page asks for day chips, figures or maps, and cave-journal.js is not loaded');
			}
		}
		api.state = function () {
			return { trips: trips.slice(), selected: selected, at: at, span: span, playing: playing, follow: follow,
				nextReadMs: nextReadMs, loaded: loadedOnce, speed: speed, looping: looping };
		};

		// The model has to be in before anybody can be drawn on it, but the list can be
		// read long before that, so the reading starts now and the drawing waits. The
		// empty frame is drawn first so that the panel says it is working rather than
		// staying blank for however long the first answer takes.
		render();
		loadAll();

		return api;
	}

	window.SilexCaveTrips = { attach: attach, proxySource: proxySource, exportSource: exportSource };
})(window, document);
