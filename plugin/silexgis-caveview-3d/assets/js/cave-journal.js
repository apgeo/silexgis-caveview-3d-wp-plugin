/* ==========================================================================
 * SilexCaveJournal — what an expedition's journal page shows beside the model.
 *
 * The trips module puts a cave's published trips on the model. An article that is
 * the journal of a whole expedition wants four more things of the same data, and
 * they are here so that a page which is not a journal loads none of them:
 *
 *   days    under each day's heading in the article, a chip per trip that was in
 *           the cave that day, with its party. Pressing one goes to the model,
 *           opens that trip at that day and plays it.
 *   stats   the expedition's figures, per caver and per club: days and hours in
 *           the cave, metres gone down and come up, the depth reached. As a view
 *           in the model's place, and as a panel anywhere in the article.
 *   maps    scanned maps — a plan, a profile — with the party drawn on them at
 *           the stations the map has points for, as a view in the model's place
 *           that plays with the same replay strip.
 *   photos  the photographs of a place, shown over the drawing when a replay
 *           reaches it, and the photographs hung on a moment of a trip.
 *
 * Three rules it keeps, which are the trips module's own:
 *
 *   1. Nothing here asks the installation anything. Every figure is worked out
 *      in the reader's browser from the tracks the trips module has already read
 *      (`trips.tracks()`), so a page fed from an export file draws all of this
 *      with no installation behind it at all.
 *
 *   2. It folds nothing itself. Whether somebody was underground after a report
 *      is the `in`/`out` the published track carries on that report, and where a
 *      party is at an instant is the trips module's own drawing, handed over
 *      with each 'moment'.
 *
 *   3. A person is the name the installation publishes for them, and nothing
 *      else: a published track identifies people by a place in one party, which
 *      means nothing across trips. Somebody published without a name is counted
 *      in the trip they are on and in no person's figures, and the panel says
 *      how many reports that left out.
 *
 * Needs: cave-embed.js and cave-trips.js. Loaded by cave-trips.js for a page
 * whose `trips` configuration has a `days`, `stats`, `maps` or `photos` section.
 * ========================================================================== */
(function (window, document) {
	'use strict';

	var LABELS = {
		ro: {
			dayTrips: 'Ture în această zi',
			dayOpen: 'Arată tura pe model, din această zi',
			statsTab: 'Statistici',
			statsTitle: 'Statistici',
			statsHide: 'Ascunde statisticile',
			statsShow: 'Arată statisticile',
			statsLoading: 'Se calculează din turele publicate…',
			statsPartial: 'Unele ture nu au putut fi citite; cifrele sunt parțiale.',
			statsEmpty: 'Nicio tură încheiată din care să se poată calcula.',
			statsHow: 'Calculat din rapoartele publicate ale turelor: timpul dintre intrare și ieșire, și diferențele de cotă dintre rapoarte consecutive.',
			statsNotice: 'Statisticile sunt orientative și deocamdată conțin câteva lipsuri în date (ce urmează să fie completate) – de aici apar micile erori în valorile calculate.',
			statsUnnamed: 'Rapoarte ale unor participanți publicați fără nume, necuprinse: {n}.',
			viewCavers: 'Toți speologii',
			viewCaver: 'Speolog',
			viewClubs: 'Toate cluburile',
			viewClub: 'Club',
			pick: 'alege…',
			noClub: 'fără club',
			days: 'Zile în peșteră',
			hours: 'Ore în peșteră',
			vertical: 'Denivelare parcursă',
			down: 'Coborâre',
			up: 'Urcare',
			depth: 'Adâncime atinsă',
			tripsCount: 'Ture',
			members: 'Speologi',
			hoursPerDay: 'Ore în peșteră pe zile',
			depthOverTime: 'Adâncimea în timp',
			perMember: 'Pe speologi',
			totals: '{cavers} speologi · {trips} ture · {hours} în peșteră · adâncime maximă {depth}',
			club: 'Club',
			unitH: 'h',
			unitM: 'm',
			unitDays: 'zile',
			unitDay: 'zi',
			mapsTab: 'Hartă 2D',
			mapSheet: 'Hartă',
			mapZoomIn: 'Mărește',
			mapZoomOut: 'Micșorează',
			mapFit: 'Toată harta',
			mapOffSheet: 'Fără punct pe această hartă: {names}',
			mapNoSheets: 'Nicio hartă nu are încă puncte definite.',
			photosAt: 'Fotografii',
			photoOf: 'fotografie',
			logTab: 'Jurnal',
			logTitle: 'Jurnalul turelor',
			logSplit: 'Jurnal alături',
			logOfTrip: 'Jurnalul turei',
			logAllTrips: 'toate turele',
			logAllPeople: 'toți participanții',
			logCount: 'Înregistrări: {n}',
			logWhen: 'Data și ora',
			logTrip: 'Tură',
			logWho: 'Participant',
			logDepth: 'Cotă',
			logPlace: 'Loc',
			logState: 'Stare',
			logDetails: 'Detalii',
			logIn: 'intrare',
			logOut: 'ieșire',
			logLoading: 'Se încarcă jurnalul…',
			logEmpty: 'Nicio înregistrare.',
			logOpen: 'Arată acest moment pe model',
			// The small button beside the count that shows the narrowed columns in full.
			logFit: 'Arată coloanele întregi',
			logFitBack: 'Coloane înguste',
			// Said under the sheet where a person's place on it is worked out from the points
			// the sheet does have, rather than pinned.
			mapEstimated: 'Pozițiile fără punct pe hartă sunt calculate din punctele hărții.',
			months: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august',
				'septembrie', 'octombrie', 'noiembrie', 'decembrie']
		},
		en: {
			dayTrips: 'Trips on this day',
			dayOpen: 'Show the trip on the model, from this day',
			statsTab: 'Statistics',
			statsTitle: 'Statistics',
			statsHide: 'Hide the statistics',
			statsShow: 'Show the statistics',
			statsLoading: 'Working it out from the published trips…',
			statsPartial: 'Some trips could not be read; the figures are partial.',
			statsEmpty: 'No finished trip to work anything out from.',
			statsHow: 'Worked out from the trips\' published reports: the time between going in and coming out, and the differences in depth between consecutive reports.',
			statsNotice: 'These figures are indicative: the data still has a few gaps, to be filled in, which is where the small errors in the computed values come from.',
			statsUnnamed: 'Reports of participants published without a name, not included: {n}.',
			viewCavers: 'All cavers',
			viewCaver: 'Caver',
			viewClubs: 'All clubs',
			viewClub: 'Club',
			pick: 'choose…',
			noClub: 'no club',
			days: 'Days in the cave',
			hours: 'Hours in the cave',
			vertical: 'Vertical distance covered',
			down: 'Descent',
			up: 'Ascent',
			depth: 'Depth reached',
			tripsCount: 'Trips',
			members: 'Cavers',
			hoursPerDay: 'Hours in the cave by day',
			depthOverTime: 'Depth over time',
			perMember: 'By caver',
			totals: '{cavers} cavers · {trips} trips · {hours} in the cave · greatest depth {depth}',
			club: 'Club',
			unitH: 'h',
			unitM: 'm',
			unitDays: 'days',
			unitDay: 'day',
			mapsTab: '2D map',
			mapSheet: 'Map',
			mapZoomIn: 'Zoom in',
			mapZoomOut: 'Zoom out',
			mapFit: 'Whole map',
			mapOffSheet: 'No point on this map: {names}',
			mapNoSheets: 'No map has points defined yet.',
			photosAt: 'Photographs',
			photoOf: 'photograph',
			logTab: 'Log',
			logTitle: 'Trip log',
			logSplit: 'Log alongside',
			logOfTrip: 'This trip\'s log',
			logAllTrips: 'all trips',
			logAllPeople: 'everybody',
			logCount: 'Records: {n}',
			logWhen: 'Date and time',
			logTrip: 'Trip',
			logWho: 'Participant',
			logDepth: 'Depth',
			logPlace: 'Place',
			logState: 'State',
			logDetails: 'Details',
			logIn: 'went in',
			logOut: 'came out',
			logLoading: 'Loading the log…',
			logEmpty: 'No record.',
			logOpen: 'Show this moment on the model',
			logFit: 'Show the columns in full',
			logFitBack: 'Narrow columns',
			mapEstimated: 'Places with no point on the map are worked out from the map\'s points.',
			months: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
				'september', 'october', 'november', 'december']
		}
	};

	function el(tag, cls, parent, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text !== undefined && text !== null) n.textContent = text;
		if (parent) parent.appendChild(n);
		return n;
	}

	var SVG = 'http://www.w3.org/2000/svg';
	function svg(tag, attrs, parent) {
		var n = document.createElementNS(SVG, tag);
		Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
		if (parent) parent.appendChild(n);
		return n;
	}

	function plain(text) {
		return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	}

	// ---------------------------------------------------------------------------
	// The figures. Pure: tracks in, numbers out, so that a check can hold them to
	// a party whose hours are known.
	// ---------------------------------------------------------------------------

	/**
	 * Calendar days in one zone, without a library: the day an instant falls on, and
	 * the instant its day ends.
	 */
	function calendar(timeZone) {
		var fmt;
		try {
			fmt = new Intl.DateTimeFormat('en-GB', {
				timeZone: timeZone || undefined, hourCycle: 'h23',
				year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
			});
		} catch (e) {
			fmt = new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23',
				year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
		}
		function parts(ms) {
			var out = {};
			fmt.formatToParts(new Date(ms)).forEach(function (p) { out[p.type] = p.value; });
			return out;
		}
		return {
			dayOf: function (ms) { var p = parts(ms); return p.year + '-' + p.month + '-' + p.day; },
			// The first instant of the day after the one `ms` falls on. Read off the wall
			// clock, so an hour gained or lost to a change of clocks in between is an hour
			// out for that one night.
			endOfDay: function (ms) {
				var p = parts(ms);
				var gone = (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 + (ms % 1000);
				return ms + (86400000 - gone);
			},
			// The first instant of a calendar day written 'YYYY-MM-DD', found from noon UTC
			// of that date by walking back to where the day begins in this zone.
			startOf: function (day) {
				var noon = Date.parse(day + 'T12:00:00Z');
				if (!isFinite(noon)) return NaN;
				var p = parts(noon);
				var gone = (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000;
				var start = noon - gone;
				// Noon UTC is the next or the previous day in zones far from Greenwich.
				var said = this.dayOf(start);
				if (said < day) start += 86400000;
				else if (said > day) start -= 86400000;
				return start;
			}
		};
	}

	/**
	 * Everything the panel shows, from every track the page holds.
	 *
	 * `tracks` is `[{ row, track }]`. `options`: `nameKey(name)`, `depthOf(station)` for a
	 * report that names a station and no depth, `clubs` as `{ club: [names] }` — read only
	 * for a person the tracks carry no club for, since an installation may publish each
	 * person's clubs beside their name (`clubs` on a participant), which then decides,
	 * `timeZone`, and `maxSilenceHours` — a person whose last report of one trip left
	 * them underground and whose next report is on another trip is taken to have stayed
	 * down in between (a party handed over underground), unless the two are further
	 * apart than this, in which case nothing is counted for the gap.
	 */
	function compute(tracks, options) {
		var opts = options || {};
		var keyOf = opts.nameKey || plain;
		var cal = calendar(opts.timeZone);
		var maxGap = (opts.maxSilenceHours > 0 ? opts.maxSilenceHours : 36) * 3600000;
		var people = {};
		var unnamedReports = 0;
		var tripIds = {};

		var clubOf = {};
		Object.keys(opts.clubs || {}).forEach(function (club) {
			(opts.clubs[club] || []).forEach(function (name) { clubOf[keyOf(name)] = club; });
		});

		tracks.forEach(function (entry) {
			var track = entry.track;
			if (!track || !track.participants) return;
			tripIds[track.tripLogId] = true;
			track.participants.forEach(function (p) {
				var fixes = p.track || [];
				if (!p.label) { unnamedReports += fixes.length; return; }
				var key = keyOf(p.label);
				// The club the installation publishes beside the name, where it does (the first, by
				// name, of somebody in several); the page's own list where it does not.
				var published = Array.isArray(p.clubs) && p.clubs.length ? String(p.clubs[0]) : null;
				var person = people[key] || (people[key] = {
					key: key, name: p.label, club: published || clubOf[key] || null, fixes: [], trips: {}
				});
				if (published) person.club = published;
				fixes.forEach(function (f, i) {
					var t = Date.parse(f.recordedAt);
					if (!isFinite(t)) return;
					person.trips[track.tripLogId] = { id: track.tripLogId, title: track.title, ordinal: p.ordinal };
					var depth = null;
					if (f.out) depth = 0;
					else if (f.depthM !== null && f.depthM !== undefined) depth = Math.abs(Number(f.depthM));
					else if (f.stationName && opts.depthOf) depth = opts.depthOf(f.stationName);
					// Going in is a report with no place: the entrance.
					else if (!f.stationName && f.in && (i === 0 || fixes[i - 1].out) && !f.positionOnOtherModel) depth = 0;
					person.fixes.push({ t: t, under: Boolean(f.in) && !f.out, depth: (depth === null || !isFinite(depth)) ? null : depth,
						trip: track.tripLogId });
				});
			});
		});

		var list = Object.keys(people).map(function (key) {
			var person = people[key];
			person.fixes.sort(function (a, b) { return a.t - b.t; });
			// Handed over underground: one trip's log ends for them where another's finds
			// them still down, within a couple of minutes. The end of the first log is then
			// not a way out of the cave — counted as one, it would be a climb to the surface
			// and no descent back, and a gap in a stay that had none.
			person.fixes = person.fixes.filter(function (f, i, all) {
				if (f.under || f.depth !== 0) return true;
				return !all.some(function (other) {
					return other.trip !== f.trip && other.under && other.depth !== 0 && other.depth !== null
						&& Math.abs(other.t - f.t) <= 120000;
				});
			});
			var ms = 0, down = 0, up = 0, deepest = 0;
			var byDay = {};
			var stays = [];
			var profile = [];       // [{ t, depth }] with a null depth where the line breaks
			var last = null;        // the last report with a depth, while underground
			person.fixes.forEach(function (f, i) {
				var next = person.fixes[i + 1];
				if (f.depth !== null) {
					if (f.depth > deepest) deepest = f.depth;
					if (last !== null) {
						if (f.depth > last) down += f.depth - last;
						else up += last - f.depth;
					}
					last = f.depth;
					profile.push({ t: f.t, depth: f.depth });
				}
				if (!f.under) {
					last = null;
					profile.push({ t: f.t, depth: null });
					return;
				}
				if (!next) return;
				var gap = next.t - f.t;
				// On another trip and long after: not a stay anybody reported.
				if (next.trip !== f.trip && gap > maxGap) {
					last = null;
					profile.push({ t: f.t, depth: null });
					return;
				}
				ms += gap;
				if (stays.length && stays[stays.length - 1].to === f.t) stays[stays.length - 1].to = next.t;
				else stays.push({ from: f.t, to: next.t });
				var a = f.t;
				while (a < next.t) {
					var end = Math.min(next.t, cal.endOfDay(a));
					var day = cal.dayOf(a);
					byDay[day] = (byDay[day] || 0) + (end - a);
					a = end;
				}
			});
			return {
				key: person.key, name: person.name, club: person.club,
				trips: Object.keys(person.trips).map(function (id) { return person.trips[id]; }),
				hours: ms / 3600000, days: Object.keys(byDay).length,
				down: down, up: up, vertical: down + up, depth: deepest,
				byDay: byDay, stays: stays, profile: profile
			};
		}).sort(function (a, b) { return a.name.localeCompare(b.name); });

		var clubs = {};
		list.forEach(function (person) {
			var name = person.club || '';
			// A key of its own for whoever has no club named, so that it can be chosen.
			var club = clubs[name] || (clubs[name] = { key: name || '\u2014', name: name, members: [], hours: 0, days: 0,
				down: 0, up: 0, vertical: 0, depth: 0, byDay: {}, trips: {} });
			club.members.push(person);
			club.hours += person.hours;
			// A club's days are its people's days added together, as its hours are.
			club.days += person.days;
			club.down += person.down;
			club.up += person.up;
			club.vertical += person.vertical;
			if (person.depth > club.depth) club.depth = person.depth;
			Object.keys(person.byDay).forEach(function (day) { club.byDay[day] = (club.byDay[day] || 0) + person.byDay[day]; });
			person.trips.forEach(function (t) { club.trips[t.id] = t; });
		});
		var clubList = Object.keys(clubs).map(function (name) {
			var c = clubs[name];
			c.trips = Object.keys(c.trips).map(function (id) { return c.trips[id]; });
			return c;
		}).sort(function (a, b) {
			// Whoever has no club named goes last, whatever the alphabet says of an empty name.
			if (!a.name !== !b.name) return a.name ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return {
			people: list, clubs: clubList, unnamedReports: unnamedReports,
			trips: Object.keys(tripIds).length,
			hours: list.reduce(function (sum, p) { return sum + p.hours; }, 0),
			depth: list.reduce(function (max, p) { return Math.max(max, p.depth); }, 0)
		};
	}

	/**
	 * The days a heading names: `{ from, to }` as 'YYYY-MM-DD', or null where it names none.
	 *
	 * "Luni, 5 octombrie" is one day; "Luni, 14 septembrie – Joi, 17 septembrie" is four.
	 * A heading that writes no year takes `year`. Months are matched without diacritics
	 * and by their first three letters as well, in whichever of the given lists has them.
	 */
	function daysNamed(text, year, monthLists) {
		var words = plain(text);
		var found = [];
		var re = /(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/g;
		var m;
		while ((m = re.exec(words)) !== null) {
			var month = -1;
			for (var l = 0; l < monthLists.length && month < 0; l++) {
				for (var i = 0; i < 12; i++) {
					var name = plain(monthLists[l][i]);
					if (m[2] === name || (m[2].length >= 3 && name.indexOf(m[2]) === 0)) { month = i; break; }
				}
			}
			var day = Number(m[1]);
			if (month < 0 || day < 1 || day > 31) continue;
			var y = m[3] ? Number(m[3]) : year;
			if (!y) continue;
			found.push(y + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
		}
		if (!found.length) return null;
		found.sort();
		return { from: found[0], to: found[found.length - 1] };
	}

	// ---------------------------------------------------------------------------

	function attach(embed, trips, cfg) {
		var lang = /^en\b/i.test(String(embed.config.language || '')) ? 'en' : 'ro';
		var L = Object.assign({}, LABELS[lang], (cfg && cfg.journalLabels) || {});
		var host = document.getElementById(embed.config.container);
		var block = host && host.closest ? host.closest('.cave_embed') : null;
		var zone = cfg.timeZone || null;
		var cal = calendar(zone);
		var destroyed = false;
		var api = {};

		var number = (function () {
			var one, whole;
			try {
				one = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
				whole = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
			} catch (e) { /* the plain spelling below */ }
			return {
				one: function (x) { return one ? one.format(x) : String(Math.round(x * 10) / 10); },
				whole: function (x) { return whole ? whole.format(x) : String(Math.round(x)); }
			};
		})();
		function hoursText(h) { return number.one(h) + ' ' + L.unitH; }
		function metresText(m) { return number.whole(m) + ' ' + L.unitM; }
		function daysText(d) { return number.whole(d) + ' ' + (d === 1 ? L.unitDay : L.unitDays); }
		function shortDay(day) { return day.slice(8, 10) + '.' + day.slice(5, 7); }
		function clock(ms) {
			try {
				return new Intl.DateTimeFormat(lang, { timeZone: zone || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
			} catch (e) { return ''; }
		}

		// ---- what the page holds ------------------------------------------------

		var rows = [];
		var held = [];              // [{ row, track }]
		var complete = false;
		var reading = false;
		var readKey = '';
		var figures = null;
		var retryTimer = null;

		function depthOf(station) {
			if (typeof embed.depthOf !== 'function') return null;
			try {
				var depth = embed.depthOf(station);
				return depth !== null && depth !== undefined && isFinite(depth) ? Math.abs(depth) : null;
			} catch (e) { return null; }
		}

		function trackOf(row) {
			for (var i = 0; i < held.length; i++) {
				if (held[i].row.tripLogId === row.tripLogId) return held[i].track;
			}
			return null;
		}

		function recompute() {
			figures = compute(held, {
				nameKey: trips.nameKey, depthOf: depthOf, timeZone: zone,
				clubs: cfg.stats && cfg.stats.clubs, maxSilenceHours: cfg.stats && cfg.stats.maxSilenceHours
			});
		}

		function readTracks() {
			var wanted = rows.filter(function (r) { return !r.followed && r.playable && r.tripLogId; })
				.map(function (r) { return r.tripLogId; }).join(',');
			if (reading || (wanted === readKey && complete)) return;
			reading = true;
			trips.tracks().then(function (answer) {
				reading = false;
				if (destroyed) return;
				held = answer.tracks;
				complete = answer.complete;
				readKey = wanted;
				recompute();
				drawDays();
				linkDays();
				drawStats();
				drawLog();
				if (maps) buildMap();
				window.clearTimeout(retryTimer);
				// What a limiter kept back is asked for again, at a pace it will not mind.
				if (!complete) retryTimer = window.setTimeout(readTracks, 60000);
			}, function () { reading = false; });
		}

		// ---- a chip per trip, under each day's heading -----------------------------

		var days = cfg.days ? Object.assign({ auto: true, headings: 'h2', root: null, year: null }, cfg.days === true ? {} : cfg.days) : null;
		var dayBoxes = [];          // { element, from, to }

		function proseRoot() {
			var sel = (days && days.root) || (embed.config.autolink && embed.config.autolink.root) || '.entry-content';
			return document.querySelector(sel) || document.body;
		}

		function yearOfTrips() {
			var dated = rows.filter(function (r) { return r.tripDate; })[0];
			return dated ? Number(String(dated.tripDate).slice(0, 4)) : null;
		}

		/** The boxes the chips go in: the ones the page wrote, and one under every heading that names a day. */
		function findDayBoxes() {
			if (!days) return;
			var known = dayBoxes.map(function (b) { return b.element; });
			// Written by the page (the shortcode), wherever it put them.
			[].forEach.call(document.querySelectorAll('.cave_day_trips[data-day]'), function (box) {
				if (known.indexOf(box) >= 0) return;
				var forModel = box.getAttribute('data-for');
				if (forModel && forModel !== embed.config.container) return;
				var from = box.getAttribute('data-day');
				if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return;
				var to = box.getAttribute('data-day-to');
				dayBoxes.push({ element: box, from: from, to: /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : from });
				known.push(box);
			});
			if (!days.auto) return;
			var year = days.year || yearOfTrips();
			if (!year) return;
			[].forEach.call(proseRoot().querySelectorAll(days.headings), function (heading) {
				if (heading.dataset.silexDay) return;
				if (heading.closest && heading.closest('.cave_embed')) return;
				var named = daysNamed(heading.textContent, year, [L.months, LABELS.ro.months, LABELS.en.months]);
				if (!named) return;
				heading.dataset.silexDay = named.from;
				// A box the page put right under this heading already is this heading's.
				var after = heading.nextElementSibling;
				if (after && after.classList && after.classList.contains('cave_day_trips')) return;
				var box = el('div', 'cave_day_trips', null);
				box.setAttribute('data-day', named.from);
				box.setAttribute('data-day-to', named.to);
				heading.parentNode.insertBefore(box, heading.nextSibling);
				dayBoxes.push({ element: box, from: named.from, to: named.to });
			});
		}

		/** The moments of a trip that fall inside a stretch of days, and its party. */
		function inDays(row, from, to) {
			var start = cal.startOf(from);
			var end = cal.endOfDay(cal.startOf(to) + 1000);
			var track = trackOf(row);
			if (track) {
				var first = null;
				var names = [];
				(track.participants || []).forEach(function (p) {
					var here = false;
					(p.track || []).forEach(function (f, i, all) {
						var t = Date.parse(f.recordedAt);
						var next = all[i + 1] ? Date.parse(all[i + 1].recordedAt) : t;
						// A report inside the stretch, or a stay underground that spans it.
						var touches = (t >= start && t < end) || (f.in && !f.out && t < start && next > start);
						if (!touches) return;
						here = true;
						var moment = Math.max(t, start);
						if (first === null || moment < first) first = moment;
					});
					if (here) names.push(p.label || trips.unnamed(p.ordinal));
				});
				return first === null ? null : { first: first, names: names };
			}
			// No track in hand: the trip's own dates say whether it belongs to the day.
			var began = String(row.tripDate || '');
			var ended = String(row.tripDateEnd || row.tripDate || '');
			if (!began || began > to || ended < from) return null;
			var envelope = typeof trips.envelopeOf === 'function' ? trips.envelopeOf(row) : null;
			var party = ((envelope && envelope.participants) || []).map(function (p) { return p.label || trips.unnamed(p.ordinal); });
			return { first: began >= from ? null : start, names: party, fromDates: true };
		}

		function drawDays() {
			if (!days) return;
			findDayBoxes();
			dayBoxes.forEach(function (box) {
				var chips = [];
				rows.forEach(function (row) {
					if (!row.followed && !row.playable) return;
					var hit = inDays(row, box.from, box.to);
					if (hit) chips.push({ row: row, hit: hit });
				});
				chips.sort(function (a, b) {
					var x = a.hit.first === null ? 0 : a.hit.first, y = b.hit.first === null ? 0 : b.hit.first;
					return x - y || String(a.row.title).localeCompare(String(b.row.title), undefined, { numeric: true });
				});
				var e = box.element;
				e.innerHTML = '';
				e.hidden = !chips.length;
				e.setAttribute('data-no-autolink', '1');
				if (!chips.length) return;
				e.setAttribute('role', 'group');
				e.setAttribute('aria-label', L.dayTrips);
				chips.forEach(function (chip) {
					var a = el('a', 'cave_day_trip', e);
					a.href = '#' + embed.config.container;
					a.title = L.dayOpen;
					a.dataset.trip = String(chip.row.tripLogId || '');
					if (chip.row.followed) a.classList.add('cave_day_trip--followed');
					el('span', 'cave_day_trip_title', a, chip.row.title || '—');
					if (chip.hit.names.length) el('span', 'cave_day_trip_party', a, chip.hit.names.join(', '));
					a.addEventListener('click', function (ev) {
						ev.preventDefault();
						openTrip(chip.row, chip.hit.first);
					});
				});
			});
		}

		/** To the model, with this trip open — at a moment, and playing, where it is a replay. */
		function openTrip(row, moment, follow, stay, extra) {
			// A view that takes the model's place gives it back; the log standing beside the
			// model has taken nothing, and stays where the reader has it.
			if (!stay && typeof embed.showTab === 'function' && !shownView('model') && !mapShown()) embed.showTab('model');
			var target = block || host;
			if (!stay && target && target.scrollIntoView) {
				var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
			}
			var options = Object.assign({ play: !row.followed }, extra || {});
			if (moment !== null && moment !== undefined) options.moment = moment;
			var opened = trips.select(row, options);
			if (follow && opened && opened.then) opened.then(function () { trips.setFollow(follow); });
			return opened;
		}

		// ---- the party's names in a day's paragraphs ---------------------------------
		//
		// The trips module links a name in the prose to the person on the trips being
		// followed. An expedition's journal is read after it: every trip is finished, most
		// people were on several, and a name alone says neither which trip nor when. The
		// article says it instead — a paragraph stands under the heading of its day. So a
		// name written under a day's heading is linked to that person on the trip they were
		// on that day, at their first reported place of that day; and where the same
		// paragraph links a place — typed by the editor or found by the place links — and
		// the person was reported there that day, at the moment they were.
		var dayLinked = false;

		function blocksOfDay(heading) {
			var out = [];
			for (var n = heading.nextElementSibling; n; n = n.nextElementSibling) {
				if (n.dataset && n.dataset.silexDay) break;
				if (n.matches && n.matches(days.headings)) break;
				if (n.classList && (n.classList.contains('cave_day_trips') || n.classList.contains('cave_embed') || n.classList.contains('cave_stats'))) continue;
				out.push(n);
			}
			return out;
		}

		/** Each named person's reports inside a stretch of days, with the trip and their number on it. */
		function peopleOfDays(from, to) {
			var start = cal.startOf(from);
			var end = cal.endOfDay(cal.startOf(to) + 1000);
			var found = {};
			held.forEach(function (entry) {
				(entry.track.participants || []).forEach(function (p) {
					if (!p.label) return;
					var fixes = (p.track || []).map(function (f) {
						return { t: Date.parse(f.recordedAt), station: f.stationName || null,
							depth: f.depthM !== null && f.depthM !== undefined ? Math.abs(Number(f.depthM)) : null };
					}).filter(function (f) { return f.t >= start && f.t < end; });
					if (!fixes.length) return;
					var key = trips.nameKey(p.label);
					// On two trips in one day, the one with more to show of that day.
					if (found[key] && found[key].fixes.length >= fixes.length) return;
					found[key] = { name: p.label, tripLogId: String(entry.track.tripLogId), ordinal: String(p.ordinal), fixes: fixes };
				});
			});
			return found;
		}

		function momentAt(person, station) {
			var placed = person.fixes.filter(function (f) { return f.station; });
			if (station) {
				var there = placed.filter(function (f) { return f.station === station; })[0];
				if (there) return there.t;
				// Not that very station: the report nearest it in depth, within a pitch's length.
				var depth = depthOf(station);
				if (depth !== null) {
					var near = null;
					person.fixes.forEach(function (f) {
						if (f.depth === null) return;
						var off = Math.abs(f.depth - depth);
						if (off <= 15 && (near === null || off < near.off)) near = { off: off, t: f.t };
					});
					if (near) return near.t;
				}
			}
			return (placed[0] || person.fixes[0]).t;
		}

		function linkDays() {
			if (!days || days.links === false || !cfg.cavers || !cfg.cavers.autolink) return;
			if (!window.SilexCaveAutolink || !held.length) return;
			var opts = cfg.cavers;
			var made = 0;
			[].forEach.call(proseRoot().querySelectorAll(days.headings), function (heading) {
				if (!heading.dataset.silexDay) return;
				var box = dayBoxes.filter(function (b) { return b.from === heading.dataset.silexDay; })[0];
				if (!box) return;
				var people = peopleOfDays(box.from, box.to);
				var keys = Object.keys(people);
				if (!keys.length) return;
				var left = {};
				keys.forEach(function (k) { left[k] = opts.limitPerName > 0 ? opts.limitPerName : Infinity; });
				blocksOfDay(heading).forEach(function (blockEl) {
					if (!dayLinked) {
						var entries = keys.filter(function (k) { return left[k] > 0; }).map(function (k) {
							var person = people[k];
							return { station: person.ordinal, names: [person.name], attrs: {
								'data-silexgis-trip': person.tripLogId,
								'data-silexgis-moment': new Date(momentAt(person, null)).toISOString(),
								'data-silexgis-play': '0',
								'data-silex-day-link': k
							} };
						});
						if (entries.length) {
							try {
								window.SilexCaveAutolink.run({
									root: blockEl, entries: entries, dataAttr: 'data-silexgis-caver',
									linkClass: opts.linkClass || 'cave_caver_link',
									limitPerName: 1, limitPerBlock: opts.limitPerBlock, minLength: opts.minLength, depths: null
								});
							} catch (e) { console.warn('SilexCaveJournal: a day\'s names could not be linked:', e); }
						}
					}
					// The place the paragraph links nearest each name, if the person was reported there.
					var anchors = [].slice.call(blockEl.querySelectorAll('a'));
					anchors.forEach(function (a, index) {
						var key = a.getAttribute('data-silex-day-link');
						if (!key || !people[key]) return;
						if (!dayLinked) { left[key] -= 1; made += 1; }
						var best = null;
						anchors.forEach(function (other, at) {
							var station = other.getAttribute('data-selection') || other.getAttribute('data-silexgis-station');
							if (!station || other === a) return;
							var far = Math.abs(at - index);
							if (best === null || far < best.far) best = { far: far, station: station };
						});
						a.setAttribute('data-silexgis-moment', new Date(momentAt(people[key], best ? best.station : null)).toISOString());
					});
				});
			});
			dayLinked = true;
			if (made && typeof embed.bindLinks === 'function') embed.bindLinks();
		}

		// ---- the figures --------------------------------------------------------

		var stats = cfg.stats ? Object.assign({ tab: true, panel: null, open: true }, cfg.stats === true ? {} : cfg.stats) : null;
		var statsViews = [];        // { root, state }
		var HIDE_KEY = 'silexCaveJournal.' + embed.config.container + '.statsHidden';

		function statsRoots() {
			if (!stats) return;
			if (stats.tab && typeof embed.addTab === 'function' && !statsViews.some(function (v) { return v.tab; })) {
				var pane = embed.addTab('stats', L.statsTab);
				if (pane) {
					pane.classList.add('cave_stats', 'cave_stats--tab');
					statsViews.push({ root: pane, tab: true, state: { view: 'cavers', pick: null } });
				}
			}
			var known = statsViews.map(function (v) { return v.root; });
			var boxes = [].slice.call(document.querySelectorAll('.cave_stats[data-stats]')).filter(function (box) {
				var forModel = box.getAttribute('data-for');
				return !forModel || forModel === embed.config.container;
			});
			// A panel the configuration asks for and the page did not write: at the end of
			// the article, or in the element named.
			if (stats.panel && !boxes.length && !statsViews.some(function (v) { return v.made; })) {
				var made = null;
				if (stats.panel === 'end' || stats.panel === true) {
					made = el('div', 'cave_stats', null);
					var root = proseRoot();
					// Before whatever a theme or a plugin appends after the text itself.
					var tail = root.querySelector(':scope > .sharedaddy, :scope > .jp-relatedposts, :scope > .post-navigation');
					root.insertBefore(made, tail || null);
				} else {
					made = document.querySelector(stats.panel.charAt(0) === '#' || stats.panel.charAt(0) === '.' ? stats.panel : '#' + stats.panel);
					if (made) made.classList.add('cave_stats');
				}
				if (made) {
					made.setAttribute('data-stats', '1');
					boxes.push(made);
					statsViews.push({ root: made, made: true, panel: true, state: { view: 'cavers', pick: null } });
					known.push(made);
				}
			}
			boxes.forEach(function (box) {
				if (known.indexOf(box) >= 0) return;
				statsViews.push({ root: box, panel: true, state: { view: 'cavers', pick: null } });
			});
		}

		// The note a camp is published with (`expedition.note` on a trip's row), which
		// whoever keeps the camp writes in the application; failing that the page's own
		// `stats.notice`; failing that the module's sentence. Read from the list's rows and
		// not from the tracks: the rows are the installation's own once it has answered,
		// while a track may be an export file's, saying what the camp said when it was written.
		function noticeText() {
			if (stats.notice === false) return '';
			var fromCamp = '';
			rows.some(function (row) {
				if (row.expedition && row.expedition.note) { fromCamp = String(row.expedition.note); return true; }
				return false;
			});
			if (fromCamp) return fromCamp;
			return typeof stats.notice === 'string' && stats.notice ? stats.notice : L.statsNotice;
		}

		function hiddenPanels() {
			try {
				var kept = window.localStorage.getItem(HIDE_KEY);
				return kept === null ? stats.open === false : kept === '1';
			} catch (e) { return stats.open === false; }
		}

		/** Bars for one figure: a row a subject, longest first. */
		function bars(parent, title, items, format, onPick, parts) {
			var box = el('div', 'cave_stats_chart', parent);
			el('div', 'cave_stats_chart_title', box, title);
			var list = el('ol', 'cave_stats_bars', box);
			var max = items.reduce(function (m, it) { return Math.max(m, it.value); }, 0);
			items.slice().sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); }).forEach(function (it) {
				var li = el('li', 'cave_stats_bar', list);
				var name = el(onPick ? 'a' : 'span', 'cave_stats_bar_label', li, it.label);
				if (onPick) {
					name.href = '#';
					name.addEventListener('click', function (ev) { ev.preventDefault(); onPick(it); });
				}
				var rail = el('span', 'cave_stats_bar_rail', li);
				if (parts && it.parts) {
					// Two halves of one figure, side by side on one bar.
					it.parts.forEach(function (part, i) {
						var seg = el('span', 'cave_stats_bar_fill cave_stats_bar_fill--' + (i ? 'b' : 'a'), rail);
						seg.style.width = (max > 0 ? (part / max) * 100 : 0) + '%';
						seg.title = parts[i] + ': ' + format(part);
					});
				} else {
					var fill = el('span', 'cave_stats_bar_fill', rail);
					fill.style.width = (max > 0 ? (it.value / max) * 100 : 0) + '%';
				}
				el('span', 'cave_stats_bar_value', li, format(it.value));
			});
			if (parts) {
				var key = el('div', 'cave_stats_key', box);
				parts.forEach(function (label, i) {
					var k = el('span', 'cave_stats_key_item', key);
					el('span', 'cave_stats_bar_fill cave_stats_bar_fill--' + (i ? 'b' : 'a'), k);
					k.appendChild(document.createTextNode(' ' + label));
				});
			}
			return box;
		}

		function tiles(parent, items) {
			var box = el('div', 'cave_stats_tiles', parent);
			items.forEach(function (it) {
				var tile = el('div', 'cave_stats_tile', box);
				el('div', 'cave_stats_tile_value', tile, it.value);
				el('div', 'cave_stats_tile_label', tile, it.label);
			});
			return box;
		}

		/** Hours for each calendar day, as columns. */
		function columns(parent, title, byDay) {
			var daysHeld = Object.keys(byDay).sort();
			if (!daysHeld.length) return null;
			var box = el('div', 'cave_stats_chart cave_stats_chart--wide', parent);
			el('div', 'cave_stats_chart_title', box, title);
			// Every day from the first to the last, so that a day nobody was underground is
			// a gap in the row and not two columns pushed together.
			var all = [];
			var t = cal.startOf(daysHeld[0]);
			var last = daysHeld[daysHeld.length - 1];
			for (var guard = 0; guard < 400; guard++) {
				var day = cal.dayOf(t + 3600000);
				all.push(day);
				if (day >= last) break;
				t = cal.endOfDay(t + 3600000);
			}
			var max = all.reduce(function (m, d) { return Math.max(m, byDay[d] || 0); }, 0);
			var row = el('div', 'cave_stats_columns', box);
			all.forEach(function (d) {
				var hours = (byDay[d] || 0) / 3600000;
				var col = el('div', 'cave_stats_column', row);
				col.title = shortDay(d) + ': ' + hoursText(hours);
				el('span', 'cave_stats_column_value', col, hours >= 0.05 ? number.one(hours) : '');
				var bar = el('span', 'cave_stats_column_bar', col);
				bar.style.height = (max > 0 ? Math.max(hours > 0 ? 2 : 0, (byDay[d] || 0) / max * 100) : 0) + '%';
				el('span', 'cave_stats_column_day', col, shortDay(d));
			});
			return box;
		}

		/** How deep one person was, against time: the line breaks where they were out. */
		function profileChart(parent, title, person) {
			var points = person.profile;
			var withDepth = points.filter(function (p) { return p.depth !== null; });
			if (withDepth.length < 2) return null;
			var box = el('div', 'cave_stats_chart cave_stats_chart--wide', parent);
			el('div', 'cave_stats_chart_title', box, title);
			var W = 640, H = 200, padL = 46, padR = 8, padT = 8, padB = 22;
			var t0 = withDepth[0].t, t1 = withDepth[withDepth.length - 1].t;
			var deep = Math.max(1, person.depth);
			var x = function (t) { return padL + (t1 > t0 ? (t - t0) / (t1 - t0) : 0) * (W - padL - padR); };
			var y = function (d) { return padT + (d / deep) * (H - padT - padB); };
			var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'cave_stats_profile', role: 'img', 'aria-label': title }, box);
			// The surface, the deepest point, and the middle between them.
			[0, deep / 2, deep].forEach(function (d) {
				svg('line', { x1: padL, x2: W - padR, y1: y(d), y2: y(d), 'class': 'cave_stats_grid' }, chart);
				var label = svg('text', { x: padL - 6, y: y(d) + 4, 'text-anchor': 'end', 'class': 'cave_stats_axis' }, chart);
				label.textContent = (d ? '−' : '') + number.whole(d) + ' ' + L.unitM;
			});
			// A tick a day.
			var t = cal.endOfDay(t0);
			for (var guard = 0; guard < 400 && t < t1; guard++) {
				svg('line', { x1: x(t), x2: x(t), y1: padT, y2: H - padB, 'class': 'cave_stats_grid cave_stats_grid--day' }, chart);
				var tick = svg('text', { x: x(t) + 3, y: H - 6, 'class': 'cave_stats_axis' }, chart);
				tick.textContent = shortDay(cal.dayOf(t + 1000));
				t = cal.endOfDay(t + 1000);
			}
			var path = '';
			var pen = false;
			points.forEach(function (p) {
				if (p.depth === null) { pen = false; return; }
				path += (pen ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.depth).toFixed(1) + ' ';
				pen = true;
			});
			svg('path', { d: path.trim(), 'class': 'cave_stats_line' }, chart);
			withDepth.forEach(function (p) {
				svg('circle', { cx: x(p.t).toFixed(1), cy: y(p.depth).toFixed(1), r: 2, 'class': 'cave_stats_dot' }, chart);
			});
			return box;
		}

		function tripLinks(parent, subject, followName) {
			if (!subject.trips.length) return;
			var box = el('div', 'cave_stats_trips', parent);
			el('span', 'cave_stats_trips_title', box, L.tripsCount + ':');
			subject.trips.slice().sort(function (a, b) {
				return String(a.title).localeCompare(String(b.title), undefined, { numeric: true });
			}).forEach(function (t) {
				var row = rows.filter(function (r) { return r.tripLogId === t.id; })[0];
				var a = el('a', 'cave_day_trip', box);
				el('span', 'cave_day_trip_title', a, t.title || '—');
				a.href = '#' + embed.config.container;
				if (!row) { a.setAttribute('aria-disabled', 'true'); return; }
				a.addEventListener('click', function (ev) {
					ev.preventDefault();
					openTrip(row, null, followName && t.ordinal ? { kind: 'caver', id: String(t.ordinal) } : null);
				});
			});
		}

		function drawStatsInto(view) {
			var root = view.root;
			var state = view.state;
			root.innerHTML = '';
			root.setAttribute('data-no-autolink', '1');

			var head = el('div', 'cave_stats_head', root);
			el('div', 'cave_stats_title', head, L.statsTitle);
			if (view.panel) {
				var hidden = hiddenPanels();
				var toggle = el('button', 'cave_stats_toggle', head, hidden ? L.statsShow : L.statsHide);
				toggle.type = 'button';
				toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
				toggle.addEventListener('click', function () {
					try { window.localStorage.setItem(HIDE_KEY, hidden ? '0' : '1'); } catch (e) { stats.open = hidden; }
					drawStats();
				});
				root.classList.toggle('is_hidden', hidden);
				if (hidden) return;
			}

			// What the club says about these figures, above them: the camp's own note where
			// the installation publishes one, else the page's, else the module's own wording.
			// `stats.notice: false` says nothing.
			var notice = noticeText();
			if (notice) el('div', 'cave_stats_notice', root, notice).dataset.notice = '1';

			if (!figures || (!figures.people.length && !complete)) {
				el('div', 'cave_stats_note', root, L.statsLoading);
				return;
			}
			if (!figures.people.length) {
				el('div', 'cave_stats_note', root, L.statsEmpty);
				return;
			}

			el('div', 'cave_stats_totals', root, L.totals
				.replace('{cavers}', number.whole(figures.people.length))
				.replace('{trips}', number.whole(figures.trips))
				.replace('{hours}', hoursText(figures.hours))
				.replace('{depth}', '−' + metresText(figures.depth)));

			// Which figures: everybody, one person, every club, one club.
			var hasClubs = figures.clubs.some(function (c) { return c.name; });
			var chooser = el('div', 'cave_stats_views', root);
			chooser.setAttribute('role', 'group');
			function viewButton(key, label) {
				var b = el('button', 'cave_stats_view', chooser, label);
				b.type = 'button';
				b.dataset.view = key;
				b.classList.toggle('is_current', state.view === key);
				b.setAttribute('aria-pressed', state.view === key ? 'true' : 'false');
				b.addEventListener('click', function () { state.view = key; drawStatsInto(view); });
				return b;
			}
			function picker(key, label, subjects) {
				var wrap = el('label', 'cave_stats_pick', chooser);
				wrap.classList.toggle('is_current', state.view === key);
				el('span', null, wrap, label + ' ');
				var sel = el('select', null, wrap);
				sel.dataset.pick = key;
				var none = el('option', null, sel, L.pick);
				none.value = '';
				subjects.forEach(function (s) {
					var o = el('option', null, sel, s.name || L.noClub);
					o.value = s.key;
				});
				sel.value = state.view === key && state.pick !== null ? state.pick : '';
				sel.addEventListener('change', function () {
					if (sel.value === '' && sel.selectedIndex === 0) return;
					state.view = key;
					state.pick = sel.value;
					drawStatsInto(view);
				});
			}
			viewButton('cavers', L.viewCavers);
			picker('caver', L.viewCaver, figures.people);
			if (hasClubs) {
				viewButton('clubs', L.viewClubs);
				picker('club', L.viewClub, figures.clubs);
			}

			var body = el('div', 'cave_stats_body', root);
			var pickCaver = function (it) { state.view = 'caver'; state.pick = it.key; drawStatsInto(view); };
			var pickClub = function (it) { state.view = 'club'; state.pick = it.key; drawStatsInto(view); };
			function four(subjects, onPick) {
				var of = function (f, parts) {
					return subjects.map(function (s) {
						return { key: s.key, label: s.name || L.noClub, value: f(s), parts: parts ? parts(s) : null };
					});
				};
				bars(body, L.hours, of(function (s) { return s.hours; }), hoursText, onPick);
				bars(body, L.days, of(function (s) { return s.days; }), daysText, onPick);
				bars(body, L.vertical, of(function (s) { return s.vertical; }, function (s) { return [s.down, s.up]; }),
					metresText, onPick, [L.down, L.up]);
				bars(body, L.depth, of(function (s) { return s.depth; }), function (v) { return '−' + metresText(v); }, onPick);
			}
			function summary(subject, extra) {
				tiles(body, [
					{ label: L.days, value: daysText(subject.days) },
					{ label: L.hours, value: hoursText(subject.hours) },
					{ label: L.down, value: metresText(subject.down) },
					{ label: L.up, value: metresText(subject.up) },
					{ label: L.depth, value: '−' + metresText(subject.depth) },
					{ label: L.tripsCount, value: number.whole(subject.trips.length) }
				].concat(extra || []));
			}

			if (state.view === 'caver') {
				var person = figures.people.filter(function (p) { return p.key === state.pick; })[0];
				if (!person) { state.view = 'cavers'; drawStatsInto(view); return; }
				el('div', 'cave_stats_subject', body, person.name + (person.club ? ' · ' + person.club : ''));
				summary(person);
				columns(body, L.hoursPerDay, person.byDay);
				profileChart(body, L.depthOverTime, person);
				tripLinks(body, person, true);
			} else if (state.view === 'club') {
				var club = figures.clubs.filter(function (c) { return c.key === state.pick; })[0];
				if (!club) { state.view = 'clubs'; drawStatsInto(view); return; }
				el('div', 'cave_stats_subject', body, club.name || L.noClub);
				summary(club, [{ label: L.members, value: number.whole(club.members.length) }]);
				columns(body, L.hoursPerDay, club.byDay);
				el('div', 'cave_stats_section', body, L.perMember);
				four(club.members, pickCaver);
			} else if (state.view === 'clubs' && hasClubs) {
				four(figures.clubs, pickClub);
			} else {
				state.view = 'cavers';
				four(figures.people, pickCaver);
			}

			el('div', 'cave_stats_note', root, L.statsHow);
			if (figures.unnamedReports) {
				el('div', 'cave_stats_note', root, L.statsUnnamed.replace('{n}', number.whole(figures.unnamedReports)));
			}
			if (!complete) el('div', 'cave_stats_note', root, L.statsPartial);
		}

		function drawStats() {
			if (!stats) return;
			// A page with no finished trip has no figures, and is offered neither the tab nor
			// the panel until it has: a section that opens to say it is empty is one more
			// thing between a reader and the article.
			var any = Boolean(figures) && figures.people.length > 0;
			if (!any && !statsViews.length) return;
			statsRoots();
			statsViews.forEach(function (view) {
				if (view.panel) view.root.hidden = !any;
				drawStatsInto(view);
			});
		}

		// ---- scanned maps, with the party on them -----------------------------------

		var maps = cfg.maps ? Object.assign({ tab: true, sheets: [] }, cfg.maps === true ? {} : cfg.maps) : null;
		var mapPane = null;
		// Where the sheet is moved to is kept in parts of the sheet's own box, not in pixels:
		// the box is as large as fits the frame, and the frame changes size under it — a
		// telephone's address bar coming and going, the log put beside it, a line of text
		// under its bar — and a shift kept in pixels then pointed at somewhere else on the
		// sheet, which the reader saw as the map jumping sideways.
		var mapState = { sheet: 0, scale: 1, x: 0, y: 0, lit: null };

		/** Whether a view is on the screen, by the embed's word where it has one. */
		function shownView(key) {
			if (typeof embed.isShown === 'function') return embed.isShown(key);
			return embed.tab === key;
		}
		function mapShown() { return Boolean(mapPane) && shownView('maps'); }
		var mapSheets = [];
		var lastMoment = null;

		/** The sheets the page configures, then those a track's survey comes with that still have a picture. */
		function gatherSheets() {
			var out = [];
			function add(sheet) {
				var image = sheet.image || sheet.imageUrl;
				if (!image || !sheet.points || !sheet.points.length) return;
				if (out.some(function (s) { return s.image === image; })) return;
				var at = {};
				sheet.points.forEach(function (p) { if (p && p.station) at[p.station] = p; });
				out.push({ title: sheet.title || (L.mapSheet + ' ' + (out.length + 1)), image: image, points: sheet.points, at: at });
			}
			(maps.sheets || []).forEach(add);
			held.forEach(function (entry) {
				((entry.track.model && entry.track.model.rasterMaps) || []).forEach(add);
			});
			if (lastMoment && lastMoment.envelope && lastMoment.envelope.model) {
				(lastMoment.envelope.model.rasterMaps || []).forEach(add);
			}
			return out;
		}

		function buildMap() {
			if (!maps || !maps.tab || typeof embed.addTab !== 'function') return;
			var sheets = gatherSheets();
			// No tab for a page with no map to show: a view that opens empty is worse than
			// one that is not offered.
			if (!sheets.length && !mapPane) return;
			if (!mapPane) {
				// The log may stand beside the sheet as it stands beside the model; and while the
				// sheet is open a place is shown on it where it can be, and the party of a
				// replay always is (see the embed's reveal).
				mapPane = embed.addTab('maps', L.mapsTab, {
					pairs: Boolean(log && log.besideMap !== false),
					shows: function (station) {
						if (!station) return true;
						var open = mapSheets[mapState.sheet];
						return Boolean(open && positionOn(open, station));
					}
				});
				if (!mapPane) return;
				mapPane.classList.add('cave_map');
				mapPane.setAttribute('data-no-autolink', '1');
			}
			var same = sheets.length === mapSheets.length && sheets.every(function (s, i) { return s.image === mapSheets[i].image; });
			mapSheets = sheets;
			if (same && mapPane.firstChild) { drawMapParty(); return; }
			if (mapState.sheet >= sheets.length) mapState.sheet = 0;
			mapPane.innerHTML = '';
			if (!sheets.length) { el('div', 'cave_stats_note', mapPane, L.mapNoSheets); return; }

			var bar = el('div', 'cave_map_bar', mapPane);
			if (sheets.length > 1) {
				var sel = el('select', 'cave_map_sheet', bar);
				sel.setAttribute('aria-label', L.mapSheet);
				sheets.forEach(function (s, i) { var o = el('option', null, sel, s.title); o.value = String(i); });
				sel.value = String(mapState.sheet);
				sel.addEventListener('change', function () {
					mapState.sheet = Number(sel.value);
					mapState.scale = 1; mapState.x = 0; mapState.y = 0;
					mapSheets = [];
					buildMap();
				});
			} else {
				el('span', 'cave_map_name', bar, sheets[0].title);
			}
			[['+', L.mapZoomIn, 1.4], ['−', L.mapZoomOut, 1 / 1.4], ['⤢', L.mapFit, 0]].forEach(function (b) {
				var button = el('button', 'cave_map_zoom', bar, b[0]);
				button.type = 'button';
				button.title = b[1];
				button.setAttribute('aria-label', b[1]);
				button.addEventListener('click', function () {
					if (!b[2]) { mapState.scale = 1; mapState.x = 0; mapState.y = 0; }
					else {
						// The middle of what is shown stays the middle: the shift grows with the sheet.
						var was = mapState.scale;
						mapState.scale = Math.min(12, Math.max(1, mapState.scale * b[2]));
						mapState.x *= mapState.scale / was;
						mapState.y *= mapState.scale / was;
					}
					if (mapState.scale === 1) { mapState.x = 0; mapState.y = 0; }
					placeMap();
				});
			});
			el('span', 'cave_map_off', bar).dataset.off = '1';

			var frame = el('div', 'cave_map_frame', mapPane);
			var sheet = el('div', 'cave_map_sheet_box', frame);
			sheet.dataset.sheet = '1';
			var img = el('img', 'cave_map_image', sheet);
			img.alt = sheets[mapState.sheet].title;
			img.draggable = false;
			img.src = sheets[mapState.sheet].image;
			var over = svg('svg', { 'class': 'cave_map_over', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' }, sheet);
			over.dataset.over = '1';
			var marks = el('div', 'cave_map_marks', sheet);
			marks.dataset.marks = '1';

			// Dragging moves the sheet once it is larger than its frame.
			var drag = null;
			frame.addEventListener('pointerdown', function (ev) {
				if (mapState.scale <= 1) return;
				drag = { x: ev.clientX, y: ev.clientY, fx: mapState.x, fy: mapState.y,
					w: sheet.offsetWidth || 1, h: sheet.offsetHeight || 1 };
				frame.setPointerCapture(ev.pointerId);
			});
			frame.addEventListener('pointermove', function (ev) {
				if (!drag) return;
				mapState.x = drag.fx + (ev.clientX - drag.x) / drag.w;
				mapState.y = drag.fy + (ev.clientY - drag.y) / drag.h;
				placeMap();
			});
			['pointerup', 'pointercancel'].forEach(function (name) {
				frame.addEventListener(name, function () { drag = null; });
			});
			img.addEventListener('load', function () { placeMap(); drawMapParty(); });
			placeMap();
			drawMapParty();
		}

		function placeMap() {
			if (!mapPane) return;
			var sheet = mapPane.querySelector('[data-sheet]');
			if (!sheet) return;
			// The sheet's box is the picture's box exactly, since a point is a fraction of
			// the picture: as large as fits the frame, whichever way the sheet is longer.
			var frame = sheet.parentNode;
			var img = sheet.querySelector('img');
			if (img && img.naturalWidth && frame.clientWidth && frame.clientHeight) {
				var fit = Math.min(frame.clientWidth / img.naturalWidth, frame.clientHeight / img.naturalHeight);
				sheet.style.width = Math.floor(img.naturalWidth * fit) + 'px';
				sheet.style.height = Math.floor(img.naturalHeight * fit) + 'px';
			}
			// No further than leaves the sheet's edge at the frame's: a sheet dragged or sent
			// off its frame is a frame with nothing in it and no way back but the fit button.
			var reach = Math.max(0, (mapState.scale - 1) / 2);
			mapState.x = Math.max(-reach, Math.min(reach, mapState.x));
			mapState.y = Math.max(-reach, Math.min(reach, mapState.y));
			var w = parseFloat(sheet.style.width) || sheet.offsetWidth;
			var h = parseFloat(sheet.style.height) || sheet.offsetHeight;
			sheet.style.transform = 'translate(' + Math.round(mapState.x * w) + 'px,' + Math.round(mapState.y * h) + 'px) scale(' + mapState.scale + ')';
			// What is written on the sheet stays the size it is read at, however far in.
			sheet.style.setProperty('--cave-map-scale', String(mapState.scale));
		}

		/**
		 * Where a station is on a sheet: the point the sheet pins it at, or — for a station it
		 * has no point for — where the sheet's own points put it.
		 *
		 * A sheet is a drawing of the survey: a plan, or a profile projected on a vertical
		 * plane. Either way where a station lands on it is, near enough, a linear function of
		 * where it is in the survey, and the pinned points say which: four or more, not all in
		 * one plane, fix the twelve numbers of `sheet = A · [x, y, z, 1]` by least squares.
		 * The fit is kept only where it agrees with its own points to within a few hundredths
		 * of the sheet; a drawing that is not linear — an extended elevation unfolded along the
		 * passage — fails that and is drawn with its pinned stations alone, as before.
		 */
		function positionOn(sheet, station) {
			if (!station) return null;
			if (sheet.at[station]) return sheet.at[station];
			var fit = fitOf(sheet);
			if (!fit || typeof embed.stationXYZ !== 'function') return null;
			var p = embed.stationXYZ(station);
			if (!p) return null;
			var x = fit.ax[0] * p.x + fit.ax[1] * p.y + fit.ax[2] * p.z + fit.ax[3];
			var y = fit.ay[0] * p.x + fit.ay[1] * p.y + fit.ay[2] * p.z + fit.ay[3];
			if (!(x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02)) return null;
			return { x: x, y: y, station: station, estimated: true };
		}

		function fitOf(sheet) {
			if (sheet.fit !== undefined) return sheet.fit;
			if (typeof embed.stationXYZ !== 'function') return null;
			var rows = [];
			sheet.points.forEach(function (p) {
				var xyz = p && p.station ? embed.stationXYZ(p.station) : null;
				if (xyz && isFinite(p.x) && isFinite(p.y)) rows.push({ v: [xyz.x, xyz.y, xyz.z, 1], x: Number(p.x), y: Number(p.y) });
			});
			// The survey not in yet: asked again next time rather than remembered as "no fit".
			if (!rows.length) return null;
			sheet.fit = null;
			if (rows.length < 5) return null;
			var ax = leastSquares(rows, 'x'), ay = leastSquares(rows, 'y');
			if (!ax || !ay) return null;
			var err = 0;
			rows.forEach(function (r) {
				var dx = ax[0] * r.v[0] + ax[1] * r.v[1] + ax[2] * r.v[2] + ax[3] - r.x;
				var dy = ay[0] * r.v[0] + ay[1] * r.v[1] + ay[2] * r.v[2] + ay[3] - r.y;
				err += dx * dx + dy * dy;
			});
			var rms = Math.sqrt(err / rows.length);
			if (rms > 0.03) return null;
			sheet.fit = { ax: ax, ay: ay, rms: rms, points: rows.length };
			return sheet.fit;
		}

		/** The four numbers that best give `rows[i][what]` from `rows[i].v`, or null. */
		function leastSquares(rows, what) {
			// The normal equations, 4 × 4, solved by elimination with partial pivoting. The
			// survey's coordinates are taken about their mean first: metres in the hundreds of
			// thousands squared would leave the system at the edge of what a double can hold.
			var mean = [0, 0, 0];
			rows.forEach(function (r) { for (var k = 0; k < 3; k++) mean[k] += r.v[k] / rows.length; });
			var M = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
			rows.forEach(function (r) {
				var v = [r.v[0] - mean[0], r.v[1] - mean[1], r.v[2] - mean[2], 1];
				for (var i = 0; i < 4; i++) {
					for (var j = 0; j < 4; j++) M[i][j] += v[i] * v[j];
					M[i][4] += v[i] * r[what];
				}
			});
			for (var c = 0; c < 4; c++) {
				var best = c;
				for (var q = c + 1; q < 4; q++) if (Math.abs(M[q][c]) > Math.abs(M[best][c])) best = q;
				if (Math.abs(M[best][c]) < 1e-12) return null;
				var tmp = M[c]; M[c] = M[best]; M[best] = tmp;
				for (var rr = 0; rr < 4; rr++) {
					if (rr === c) continue;
					var f = M[rr][c] / M[c][c];
					for (var k2 = c; k2 < 5; k2++) M[rr][k2] -= f * M[c][k2];
				}
			}
			var a = [M[0][4] / M[0][0], M[1][4] / M[1][1], M[2][4] / M[2][2], M[3][4] / M[3][3]];
			// Back to the survey's own coordinates.
			a[3] -= a[0] * mean[0] + a[1] * mean[1] + a[2] * mean[2];
			return a;
		}

		/**
		 * Brings a station to the middle of the open sheet, a little closer, and lights it —
		 * what choosing a place on the page does on the sheet as it does on the model.
		 */
		function focusMapOn(station) {
			if (!mapPane || !mapSheets.length || !mapShown()) return;
			var sheet = mapSheets[mapState.sheet];
			var at = sheet && positionOn(sheet, station);
			if (!at) return;
			var box = mapPane.querySelector('[data-sheet]');
			if (!box) return;
			mapState.scale = Math.max(mapState.scale, 2.5);
			mapState.x = -mapState.scale * (at.x - 0.5);
			mapState.y = -mapState.scale * (at.y - 0.5);
			mapState.lit = station;
			placeMap();
			drawMapParty();
		}

		/** The party at the last moment drawn, on the sheet that is open. */
		function drawMapParty() {
			if (!mapPane || !mapSheets.length) return;
			var sheet = mapSheets[mapState.sheet];
			var over = mapPane.querySelector('[data-over]');
			var marks = mapPane.querySelector('[data-marks]');
			var off = mapPane.querySelector('[data-off]');
			if (!sheet || !over || !marks) return;
			over.innerHTML = '';
			marks.innerHTML = '';
			var px = function (p) { return (p.x * 1000).toFixed(1) + ' ' + (p.y * 1000).toFixed(1); };

			// The stations this sheet has points for, faintly, so the sheet reads as one
			// the party can be found on; the page's own named places among them by name.
			var named = {};
			(embed.config.places || []).forEach(function (p) { if (p.landmark && p.station) named[p.station] = p.label; });
			sheet.points.forEach(function (p) {
				var dot = el('span', 'cave_map_point', marks);
				dot.style.left = (p.x * 100) + '%';
				dot.style.top = (p.y * 100) + '%';
				dot.dataset.station = p.station;
				if (mapState.lit === p.station) dot.classList.add('is_lit');
				if (named[p.station] || mapState.lit === p.station) {
					dot.classList.add('cave_map_point--named');
					el('span', 'cave_map_point_label', dot, named[p.station] || p.station.split('.').pop());
				}
			});

			var missing = [];
			var estimated = false;
			// A station lit from the page that the sheet has no point for, where its fit places it.
			if (mapState.lit && !sheet.at[mapState.lit]) {
				var litAt = positionOn(sheet, mapState.lit);
				if (litAt) {
					var litDot = el('span', 'cave_map_point cave_map_point--named is_lit cave_map_point--estimated', marks);
					litDot.style.left = (litAt.x * 100) + '%';
					litDot.style.top = (litAt.y * 100) + '%';
					litDot.dataset.station = mapState.lit;
					el('span', 'cave_map_point_label', litDot, placeLabelOf(mapState.lit) || mapState.lit.split('.').pop());
				}
			}
			var m = lastMoment;
			if (m && m.cavers) {
				// The road each of them took so far, through the stations this sheet has — for those
				// in the cave at this moment only. Every road of every trip stayed drawn after its
				// party had come out, and a few trips into an expedition the sheet was a tangle in
				// which the party underground now could not be followed.
				if (m.kind === 'past' && m.track) {
					(m.track.participants || []).forEach(function (p) {
						var caver = m.cavers.filter(function (c) { return String(c.caverId) === String(p.ordinal); })[0];
						if (!caver || (m.follow && !m.isFollowed(caver))) return;
						var now = caver.position && caver.position.kind === 'station' ? caver.position.station : null;
						if (!now || isOut(m.envelope, caver)) return;
						var road = [];
						(p.track || []).forEach(function (f) {
							if (Date.parse(f.recordedAt) > m.at || !f.stationName) return;
							var at = positionOn(sheet, f.stationName);
							var last = road.length ? road[road.length - 1] : null;
							if (at && (!last || last.x !== at.x || last.y !== at.y)) road.push(at);
						});
						if (road.length > 1) {
							svg('polyline', { points: road.map(px).join(' '), 'class': 'cave_map_road',
								stroke: m.colorFor(caver.caverId), 'vector-effect': 'non-scaling-stroke' }, over);
						}
					});
				}
				m.cavers.forEach(function (c) {
					if (m.follow && !m.isFollowed(c)) return;
					var station = c.position && c.position.kind === 'station' ? c.position.station : null;
					if (!station || isOut(m.envelope, c)) return;
					var at = positionOn(sheet, station);
					if (!at) { missing.push(c.name); return; }
					if (at.estimated) estimated = true;
					var mark = el('span', 'cave_map_caver', marks);
					if (at.estimated) mark.classList.add('cave_map_caver--estimated');
					mark.style.left = (at.x * 100) + '%';
					mark.style.top = (at.y * 100) + '%';
					mark.dataset.caver = String(c.caverId);
					var dot = el('span', 'cave_map_caver_dot', mark);
					dot.style.background = m.colorFor(c.caverId);
					el('span', 'cave_map_caver_name', mark, c.name);
				});
			}
			if (off) {
				off.textContent = missing.length ? L.mapOffSheet.replace('{names}', missing.join(', ')) : (estimated ? L.mapEstimated : '');
				off.dataset.estimated = estimated ? '1' : '';
			}
		}

		// ---- photographs, at their place and at their moment ------------------------

		var photos = cfg.photos ? Object.assign({ stations: true, moments: true, holdMs: 2500, max: 6 }, cfg.photos === true ? {} : cfg.photos) : null;
		var photoStrip = null;
		var photoKey = '';
		var photoSince = 0;
		var photoTimer = null;

		function stationShots(station, envelope) {
			var out = [];
			var mine = embed.config.pictures;
			// The page's photographs as the component reads them — a file name under the
			// page's root or an entry with its own addresses, as a data set gives them.
			if (photos.stations && typeof embed.stationPictures === 'function') {
				out = out.concat(embed.stationPictures(station));
			} else if (photos.stations && mine && mine.byStation && mine.byStation[station]) {
				mine.byStation[station].forEach(function (name) {
					out.push({
						url: mine.root + encodeURIComponent(name),
						thumb: (mine.thumbnails || mine.root) + encodeURIComponent((mine.thumbnails ? 'tn_' : '') + name),
						caption: String(name).replace(/\.[a-z0-9]+$/i, '')
					});
				});
			}
			// The pictures a published survey comes with, where they still carry an address:
			// through the site's proxy they do not, in an export file they do.
			var theirs = envelope && envelope.model && envelope.model.pictures;
			(theirs || []).forEach(function (p) {
				if (p.stationName !== station || !p.thumbnailUrl) return;
				out.push({ url: p.url || p.thumbnailUrl, thumb: p.thumbnailUrl, caption: p.caption || '' });
			});
			return out;
		}

		// Somebody who has come out is not at the last place they were reported.
		function isOut(envelope, caver) {
			var list = (envelope && envelope.participants) || [];
			for (var i = 0; i < list.length; i++) {
				if (String(list[i].ordinal) === String(caver.caverId)) return Boolean(list[i].out);
			}
			return false;
		}

		function showPhotos(shots, key) {
			var into = (mapPane && mapShown() && !shownView('model')) ? mapPane : host;
			if (!shots.length) {
				// What was put up stays for a breath of the reader's own time: at three
				// hundred times life speed the party has left a place before a picture of
				// it has been seen.
				if (photoStrip && !photoTimer) {
					var left = photos.holdMs - (Date.now() - photoSince);
					photoTimer = window.setTimeout(function () {
						photoTimer = null;
						if (photoKey === '' && photoStrip) { photoStrip.remove(); photoStrip = null; }
					}, Math.max(0, left));
				}
				photoKey = '';
				return;
			}
			if (key === photoKey && photoStrip && photoStrip.parentNode === into) return;
			photoKey = key;
			photoSince = Date.now();
			window.clearTimeout(photoTimer);
			photoTimer = null;
			if (photoStrip) photoStrip.remove();
			photoStrip = el('div', 'cave_replay_photos', into);
			photoStrip.setAttribute('data-no-autolink', '1');
			shots.slice(0, photos.max).forEach(function (shot) {
				var a = el('a', 'cave_replay_photo', photoStrip);
				a.href = shot.url;
				a.title = shot.caption || L.photoOf;
				var img = el('img', null, a);
				img.src = shot.thumb;
				img.alt = shot.caption || L.photoOf;
				img.loading = 'lazy';
				if (shot.label) el('span', 'cave_replay_photo_label', a, shot.label);
				a.addEventListener('click', function (ev) {
					if (window.SilexLightbox && typeof window.SilexLightbox.open === 'function') {
						ev.preventDefault();
						window.SilexLightbox.open(shot.url, shot.caption || '');
					}
				});
			});
		}

		function drawPhotos(m) {
			if (!photos) return;
			if (!m || m.kind !== 'past') { showPhotos([], ''); return; }
			var shots = [];
			if (photos.moments && m.track && m.track.pictures && m.track.pictures.length && trips.fold.pastPicturesAt) {
				var due = [];
				try { due = trips.fold.pastPicturesAt(m.track, m.at) || []; } catch (e) { due = []; }
				due.forEach(function (p) {
					if (!p.thumbnailUrl) return;
					// The fold hands back what it knows of a picture; an export file may hold a
					// larger rendering beside the small one, found again by the small one.
					var whole = m.track.pictures.filter(function (x) { return x.thumbnailUrl === p.thumbnailUrl; })[0];
					var who = p.ordinal === null || p.ordinal === undefined ? null
						: m.cavers.filter(function (c) { return String(c.caverId) === String(p.ordinal); })[0];
					shots.push({ url: (whole && whole.url) || p.thumbnailUrl, thumb: p.thumbnailUrl,
						caption: p.caption || '', label: who ? who.name : null });
				});
			}
			var seen = {};
			m.cavers.forEach(function (c) {
				if (m.follow && !m.isFollowed(c)) return;
				var station = c.position && c.position.kind === 'station' ? c.position.station : null;
				if (!station || seen[station] || isOut(m.envelope, c)) return;
				seen[station] = true;
				stationShots(station, m.envelope).forEach(function (shot) { shots.push(shot); });
			});
			showPhotos(shots, shots.map(function (s) { return s.thumb; }).join('|'));
		}

		// ---- the log: every report of every trip, as a table ---------------------------
		//
		// What the tracks hold, one line a report: when, on which trip, who, how deep, where,
		// and — where the installation publishes them — what the party was doing and what
		// was noted. A published track carries the last two only on an installation that
		// has chosen to; without them the two columns are not drawn.
		// `split`: whether the log stands beside the model — true, false, or 'auto' for
		// "where the block is at least `splitMinWidth` wide", which is a desk and not a phone.
		// The block is as wide as the article's column, which a theme makes a good deal
		// narrower than the window: 960 is what a 1366-pixel laptop leaves it on the club's
		// site, and about the least in which the list, the model and a table of six columns
		// can stand side by side.
		var log = cfg.log ? Object.assign({ tab: true, split: 'auto', splitMinWidth: 960 }, cfg.log === true ? {} : cfg.log) : null;
		// A page that wrote a box for the log and says nothing else of it has a log: in that
		// box, and nowhere it did not ask for.
		if (!log && document.querySelector('[data-trip-log]')) log = { tab: false, split: false, splitMinWidth: 960 };
		function splitByDefault() {
			if (!log) return false;
			if (log.split === true) return true;
			if (log.split !== 'auto') return false;
			// A block not laid out yet has no width to go by; the window's is the nearest thing.
			var wide = block ? block.getBoundingClientRect().width : 0;
			return (wide || window.innerWidth || 0) >= log.splitMinWidth;
		}
		// Whether the log has been put on screen for a reader who never asked: done once.
		var logOpenedByItself = false;
		var logPane = null;
		var splitOn = false;
		var logFilter = { trip: '', person: '' };
		var logRows = [];           // every report, oldest first

		function placeLabelOf(station) {
			if (!station) return '';
			var places = embed.config.places || [];
			for (var i = 0; i < places.length; i++) {
				if (places[i].station === station) return String(places[i].label || '');
			}
			return String(station).split('.').pop();
		}

		function gatherLog() {
			logRows = [];
			held.forEach(function (entry) {
				var track = entry.track;
				(track.participants || []).forEach(function (p) {
					var name = p.label || trips.unnamed(p.ordinal);
					(p.track || []).forEach(function (f, i, all) {
						var t = Date.parse(f.recordedAt);
						if (!isFinite(t)) return;
						var state = f.activity || '';
						if (!state && f.out) state = L.logOut;
						else if (!state && f.in && !f.stationName && (i === 0 || all[i - 1].out)) state = L.logIn;
						logRows.push({
							t: t, tripId: String(track.tripLogId), trip: track.title || '', row: entry.row,
							ordinal: p.ordinal, name: name, key: p.label ? trips.nameKey(p.label) : '',
							depth: f.depthM !== null && f.depthM !== undefined ? Math.abs(Number(f.depthM)) : null,
							place: placeLabelOf(f.stationName), station: f.stationName || null, state: state, note: f.note || ''
						});
					});
				});
			});
			logRows.sort(function (a, b) { return a.t - b.t || a.trip.localeCompare(b.trip) || a.ordinal - b.ordinal; });
		}

		function logStamp(ms) {
			try {
				return new Intl.DateTimeFormat(lang, { timeZone: zone || undefined, day: '2-digit', month: '2-digit',
					hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
			} catch (e) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
		}

		// Where the log is drawn: the tab, once there is a report to list in it, and every
		// box the page wrote for it (`<div data-trip-log>`, which is what the plugin's
		// [silexgis_cave_trip_log] emits). Each has its own narrowing and its own marked row —
		// a reader who narrowed the table at the end of the article to one person has not
		// asked the one beside the model to follow.
		var logViews = [];          // { root, tab, filter, shown, now }
		// Whether the reader asked to see the narrowed columns whole: kept per browser.
		var LOG_FIT_KEY = 'silexCaveJournal.logFit';
		function logFitted() {
			try { return window.localStorage.getItem(LOG_FIT_KEY) === '1'; } catch (e) { return false; }
		}

		function logBoxes() {
			return [].slice.call(document.querySelectorAll('[data-trip-log]')).filter(function (box) {
				var forModel = box.getAttribute('data-for');
				return !forModel || forModel === embed.config.container;
			});
		}

		function logRoots() {
			logBoxes().forEach(function (box) {
				if (logViews.some(function (v) { return v.root === box; })) return;
				box.classList.add('cave_log', 'cave_log--panel');
				box.setAttribute('data-no-autolink', '1');
				logViews.push({ root: box, tab: false, filter: { trip: '', person: '' }, shown: [], now: null });
			});
			if (log.tab && typeof embed.addTab === 'function' && !logPane && held.length) {
				// No tab until there is a report to list in it.
				logPane = embed.addTab('log', L.logTab);
				if (logPane) {
					logPane.classList.add('cave_log');
					logPane.setAttribute('data-no-autolink', '1');
					logViews.push({ root: logPane, tab: true, filter: logFilter, shown: [], now: null });
					// Beside the model from the start, where it is set to stand there and the
					// reader has not gone to another view meanwhile.
					if (!logOpenedByItself && splitOn && embed.tab === 'model') {
						logOpenedByItself = true;
						embed.showTab('log');
					}
				}
			}
		}

		function drawLog() {
			if (!log) return;
			logRoots();
			if (!logViews.length) return;
			gatherLog();
			logViews.forEach(drawLogInto);
			markLog(lastMoment);
		}

		function drawLogInto(view) {
			var pane = view.root;
			var filter = view.filter;
			pane.innerHTML = '';
			view.shown = [];
			view.now = null;
			if (!view.tab) {
				// A box on the page says what it is, and is not there at all until it has
				// something to list: an empty frame at the end of an article reads as broken.
				pane.hidden = !logRows.length;
				if (!logRows.length) return;
				el('div', 'cave_log_title', pane, L.logTitle);
			}
			var bar = el('div', 'cave_log_bar', pane);

			var tripsHeld = [];
			var seenTrip = {};
			var people = [];
			var seenPerson = {};
			logRows.forEach(function (r) {
				if (!seenTrip[r.tripId]) { seenTrip[r.tripId] = true; tripsHeld.push({ id: r.tripId, title: r.trip }); }
				if (r.key && !seenPerson[r.key]) { seenPerson[r.key] = true; people.push({ key: r.key, name: r.name }); }
			});
			tripsHeld.sort(function (a, b) { return a.title.localeCompare(b.title, undefined, { numeric: true }); });
			people.sort(function (a, b) { return a.name.localeCompare(b.name); });
			// A filter set for a trip or a person the log no longer holds is no filter.
			if (filter.trip && !seenTrip[filter.trip]) filter.trip = '';
			if (filter.person && !seenPerson[filter.person]) filter.person = '';

			function chooser(kind, all, items, value) {
				var sel = el('select', 'cave_log_filter', bar);
				sel.dataset.filter = kind;
				sel.setAttribute('aria-label', kind === 'trip' ? L.logTrip : L.logWho);
				var none = el('option', null, sel, all);
				none.value = '';
				items.forEach(function (it) {
					var o = el('option', null, sel, it.label);
					o.value = it.value;
				});
				sel.value = value;
				sel.addEventListener('change', function () {
					filter[kind] = sel.value;
					drawLogInto(view);
					markLog(lastMoment);
				});
			}
			chooser('trip', L.logAllTrips, tripsHeld.map(function (t) { return { value: t.id, label: t.title }; }), filter.trip);
			chooser('person', L.logAllPeople, people.map(function (p) { return { value: p.key, label: p.name }; }), filter.person);

			var shown = logRows.filter(function (r) {
				return (!filter.trip || r.tripId === filter.trip) && (!filter.person || r.key === filter.person);
			});
			el('span', 'cave_log_count', bar, L.logCount.replace('{n}', number.whole(shown.length))).dataset.count = '1';
			// Beside the model the table is narrow: the trip, the place and what they were doing
			// are cut to part of their width, each in full under the pointer, and this shows
			// them whole again. Kept per browser.
			if (view.tab) {
				var fit = el('button', 'cave_log_fit', bar, '↔');
				fit.type = 'button';
				fit.dataset.fit = '1';
				var setFit = function (on) {
					pane.classList.toggle('cave_log--fit', on);
					fit.setAttribute('aria-pressed', on ? 'true' : 'false');
					fit.title = on ? L.logFitBack : L.logFit;
					fit.setAttribute('aria-label', fit.title);
				};
				setFit(logFitted());
				fit.addEventListener('click', function () {
					var on = !pane.classList.contains('cave_log--fit');
					try { window.localStorage.setItem(LOG_FIT_KEY, on ? '1' : '0'); } catch (e) { /* this visit only */ }
					setFit(on);
				});
			}

			if (!shown.length) {
				el('div', 'cave_stats_note', pane, complete ? L.logEmpty : L.logLoading);
				return;
			}
			var withState = logRows.some(function (r) { return r.state; });
			var withNote = logRows.some(function (r) { return r.note; });
			var scroller = el('div', 'cave_log_scroll', pane);
			var table = el('table', 'cave_log_table', scroller);
			var headRow = el('tr', null, el('thead', null, table));
			var columnClass = [null, 'cave_log_trip', null, null, 'cave_log_place'].concat(withState ? ['cave_log_state'] : [], withNote ? [null] : []);
			[L.logWhen, L.logTrip, L.logWho, L.logDepth, L.logPlace].concat(withState ? [L.logState] : [], withNote ? [L.logDetails] : [])
				.forEach(function (title, i) { el('th', columnClass[i], headRow, title); });
			// How wide the narrowed columns may be: a part of their longest text, in characters,
			// so that it holds however the table is laid out and whether or not it is on screen.
			var longest = function (pick) { return shown.reduce(function (n, r) { return Math.max(n, String(pick(r) || '').length); }, 0); };
			var part = function (n, share) { return Math.max(4, Math.ceil(n * share) + 1) + 'ch'; };
			table.style.setProperty('--cave-log-trip', part(Math.max(longest(function (r) { return r.trip; }), L.logTrip.length), 0.5));
			table.style.setProperty('--cave-log-place', part(Math.max(longest(function (r) { return r.place; }), L.logPlace.length), 0.5));
			table.style.setProperty('--cave-log-state', part(Math.max(longest(function (r) { return r.state; }), L.logState.length), 0.75));
			var body = el('tbody', null, table);
			view.shown = shown.map(function (r) {
				var tr = el('tr', 'cave_log_row', body);
				tr.title = L.logOpen;
				tr.tabIndex = 0;
				el('td', 'cave_log_when', tr, logStamp(r.t));
				el('td', 'cave_log_trip', tr, r.trip).title = r.trip;
				el('td', null, tr, r.name);
				el('td', 'cave_log_depth', tr, r.depth === null ? '' : (r.depth ? '−' : '') + number.whole(r.depth));
				el('td', 'cave_log_place', tr, r.place).title = r.place;
				if (withState) el('td', 'cave_log_state', tr, r.state).title = r.state;
				if (withNote) el('td', 'cave_log_note', tr, r.note);
				var open = function () {
					// The replay goes to the report. From the tab the reader stays where they
					// are reading, which is beside the model or a tab away from it; from a box
					// further down the article they are taken to the model, or the press
					// would seem to have done nothing.
					//
					// A row is a place and a moment to look at, not a request to play: a replay
					// that was playing stops there and says so, and one that was stopped stays
					// stopped.
					var stopped = typeof trips.pauseForReader === 'function' && trips.pauseForReader();
					picked = { tripId: r.tripId, key: r.key };
					var opened = openTrip(r.row, r.t, { kind: 'caver', id: String(r.ordinal) }, view.tab, { play: false });
					// Another trip is read before it is shown, and the line saying so takes the
					// place of the one saying the animation was paused: said again once it is in.
					if (stopped && opened && opened.then && typeof trips.saidPaused === 'function') opened.then(function () { trips.saidPaused(); });
					if (r.station) focusMapOn(r.station);
				};
				tr.addEventListener('click', open);
				tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') open(); });
				return { r: r, tr: tr };
			});
		}

		// Brings a row of the log into the part of its own table that is on show, and moves
		// nothing else. `scrollIntoView` moves every box that scrolls between the row and the
		// window, the page among them: asked five times a second by a replay, it took the
		// page back to the model as often, and a reader could not scroll away from a replay
		// that was playing.
		function keepRowInView(row) {
			var box = row.closest ? row.closest('.cave_log_scroll') : null;
			if (!box) return;
			var r = row.getBoundingClientRect();
			var b = box.getBoundingClientRect();
			var head = box.querySelector('thead');
			var top = b.top + (head ? head.getBoundingClientRect().height : 0);
			if (r.top < top) box.scrollTop -= (top - r.top) + 4;
			else if (r.bottom > b.bottom) box.scrollTop += (r.bottom - b.bottom) + 4;
		}

		// The row the reader pressed, so that the selection it causes marks that row and not
		// the trip's first.
		var picked = null;
		// What is on the model — a trip or every trip, and whom the view keeps up with — as
		// one key: a change of it is a new selection, which the log follows.
		var selectionKey = null;

		/**
		 * A trip, or one of its party, has just been put on the model: each table shows its
		 * first report — the trip's, or that person's on that trip — marked and brought into
		 * its own view. A table narrowed to another trip or another person could not show it,
		 * and goes back to every trip and everybody first.
		 */
		function followSelection(m) {
			// Not before the log holds its rows: a selection seen then would be taken as handled.
			if (!m || m.kind !== 'past' || !m.track || !logRows.length) return;
			var tripId = m.all ? null : String(m.track.tripLogId);
			var personKey = '';
			if (m.follow && m.follow.kind === 'caver') {
				var who = (m.track.participants || []).filter(function (p) { return String(p.ordinal) === String(m.follow.id); })[0];
				if (who && who.label) personKey = trips.nameKey(who.label);
			}
			var key = (tripId || '*') + '|' + personKey;
			if (key === selectionKey) return;
			selectionKey = key;
			var fromRow = picked;
			picked = null;
			var first = null;
			for (var i = 0; i < logRows.length; i++) {
				var r = logRows[i];
				if (tripId && r.tripId !== tripId) continue;
				if (personKey && r.key !== personKey) continue;
				first = r;
				break;
			}
			// The log in the model's block follows what is on the model; a table further down the
			// article keeps whatever its reader made of it.
			logViews.forEach(function (view) {
				if (!view.tab) return;
				var f = view.filter;
				if ((f.trip && tripId && f.trip !== tripId) || (f.person && f.person !== personKey)) {
					f.trip = '';
					f.person = '';
					drawLogInto(view);
				}
				[].forEach.call(view.root.querySelectorAll('.cave_log_row.is_selected'), function (tr) { tr.classList.remove('is_selected'); });
				// A row the reader pressed is the selection already: it is marked as the moment.
				if (fromRow || !first) return;
				var entry = view.shown.filter(function (e) { return e.r === first; })[0];
				if (!entry) return;
				entry.tr.classList.add('is_selected');
				keepRowInView(entry.tr);
			});
		}

		// The report a replay has reached, marked in each table; kept in view where the table
		// stands beside the model, since there it is being read against the drawing.
		function markLog(m) {
			logViews.forEach(function (view) {
				if (view.now) { view.now.classList.remove('is_now'); view.now = null; }
				if (!view.shown.length || !m || m.kind !== 'past' || !m.track) return;
				var tripId = m.all ? null : String(m.track.tripLogId);
				var found = null;
				for (var i = 0; i < view.shown.length; i++) {
					var entry = view.shown[i];
					if (entry.r.t > m.at) break;
					if (tripId === null || entry.r.tripId === tripId) found = entry;
				}
				if (!found) return;
				view.now = found.tr;
				view.now.classList.add('is_now');
				if (view.tab && block && block.classList.contains('cave_embed--split')) keepRowInView(view.now);
			});
		}

		if (log) {
			// From the open trip's details: its own log, and whoever is followed in it.
			if (typeof trips.addTripAction === 'function') {
				trips.addTripAction(function (into, row, followed) {
					if (!logPane || row.all || !row.tripLogId) return;
					var button = el('button', 'cave_trip_action', into, L.logOfTrip);
					button.type = 'button';
					button.dataset.tripLog = '1';
					button.addEventListener('click', function () {
						logFilter.trip = String(row.tripLogId);
						logFilter.person = '';
						if (followed && followed.kind === 'caver') {
							var track = trackOf(row);
							var who = track && (track.participants || []).filter(function (p) { return String(p.ordinal) === String(followed.id); })[0];
							if (who && who.label) logFilter.person = trips.nameKey(who.label);
						}
						drawLog();
						embed.showTab('log');
					});
				});
			}
			if (typeof embed.addSwitch === 'function' && typeof embed.setSplit === 'function') {
				// The switch is told its remembered value once as it is made; only a change
				// after that is the reader's.
				var splitMade = false;
				var splitBox = embed.addSwitch('journal.logSplit', L.logSplit, splitByDefault(), function (on) {
					splitOn = on;
					embed.setSplit('log', on);
					// Switched on by the reader, it is shown: a switch that changed nothing
					// until a tab was pressed would read as broken.
					if (on && logPane && splitMade) embed.showTab('log');
					// Found on as the page opens, with the log already made: shown beside
					// the model once, as drawLog() does when the log is made second.
					else if (on && logPane && !logOpenedByItself && embed.tab === 'model') {
						logOpenedByItself = true;
						embed.showTab('log');
					}
				});
				splitMade = true;
				if (splitBox && splitBox.parentNode) splitBox.parentNode.classList.add('cave_switch--wide_only');
			}
		}

		// ---- wiring -------------------------------------------------------------

		trips.on('trips', function (detail) {
			rows = detail.trips;
			drawDays();
			if (stats && !figures) drawStats();
			if (detail.loaded) readTracks();
		});
		trips.on('moment', function (m) {
			lastMoment = m;
			followSelection(m);
			markLog(m);
			if (maps) { if (!mapPane) buildMap(); else drawMapParty(); }
			drawPhotos(m);
		});
		trips.on('nothing', function () {
			lastMoment = null;
			if (mapPane) drawMapParty();
			drawPhotos(null);
		});
		if (typeof embed.onTab === 'function') {
			embed.onTab(function (key) {
				if (mapShown()) { buildMap(); placeMap(); }
				// The strip belongs over whichever drawing is being looked at.
				if (photoStrip) { photoKey = ''; drawPhotos(lastMoment); }
			});
		}
		// A place chosen on the page — from the place list, from a row of a table at the end of
		// the article — is looked for on the open sheet as well: brought to its middle and lit.
		var focusBeforeMaps = embed.focus;
		embed.focus = function (ref) {
			if (mapShown() && typeof ref === 'string') focusMapOn(ref);
			return focusBeforeMaps.apply(embed, arguments);
		};
		embed.onDestroy(function () { embed.focus = focusBeforeMaps; });

		// A link in the prose that names a station lights it on the open sheet as well.
		if (typeof embed.onLink === 'function') {
			embed.onLink(function (spec) {
				if (!mapPane || !mapShown() || !spec) return false;
				var station = spec.station || spec.selection;
				if (station && mapSheets[mapState.sheet] && positionOn(mapSheets[mapState.sheet], station)) {
					focusMapOn(station);
				}
				return false;
			});
		}
		// Depths measured off the survey are not there until the survey is.
		if (embed.ready && typeof embed.ready.then === 'function') {
			embed.ready.then(function () {
				if (destroyed || !held.length) return;
				recompute();
				drawStats();
				// The place links are made once the survey is in; the moments are settled
				// again against them, a little after, when they exist.
				window.setTimeout(function () { if (!destroyed) linkDays(); }, 1500);
			}, function () {});
		}
		embed.onDestroy(function () {
			destroyed = true;
			window.clearTimeout(retryTimer);
			window.clearTimeout(photoTimer);
			if (photoStrip) photoStrip.remove();
			dayBoxes.forEach(function (b) { b.element.innerHTML = ''; });
			statsViews.forEach(function (v) { if (v.made) v.root.remove(); else if (!v.tab) v.root.innerHTML = ''; });
		});

		window.addEventListener('resize', placeMap);
		embed.onDestroy(function () { window.removeEventListener('resize', placeMap); });

		// The list may have been read before this module arrived.
		(function () {
			var now = typeof trips.state === 'function' ? trips.state() : null;
			if (!now) return;
			rows = now.trips || [];
			drawDays();
			if (now.loaded) readTracks();
		})();
		if (maps) buildMap();
		drawStats();

		api.figures = function () { return figures; };
		api.refresh = readTracks;
		api.openTrip = openTrip;
		return api;
	}

	window.SilexCaveJournal = { attach: attach, compute: compute, daysNamed: daysNamed, calendar: calendar };
})(window, document);
