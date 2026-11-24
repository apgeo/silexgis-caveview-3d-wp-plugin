/* ==========================================================================
 * SilexCaveEmbed — a cave model on a page, driven entirely by configuration.
 *
 * Everything that makes it about one particular cave — which survey, which places,
 * where the photographs live — is passed in, so a second page is a config object
 * rather than a copy of the code.
 *
 * It is written against the SilexGIS fork of CaveView 2.9.0, and uses the API
 * that fork adds rather than reaching into the viewer's internals:
 *
 *   focusStation()    fly to a named place              — the place list, prose links
 *   setStationMedia() photographs held for a station    — shown on hover, or on tap
 *   mediaOpen         a thumbnail in that strip was hit — handed to the page lightbox
 *   addLiveMarker()   a marker the page maintains       — where a team is, later
 *
 * Usage:
 *
 *   const cave = SilexCaveEmbed.create({
 *     container: 'example_model',
 *     home:      '/caveview/',                 // the viewer build (the plugin passes its own)
 *     surveyDirectory: '/surveys/',
 *     survey:    'P8_Master.3d',
 *     places:    [ { label: 'Aven foot', station: 'p8.christmas_aven.2', depth: 52 } ],
 *     placeList: 'example_places',
 *     pictures:  { root: '/pictures/', thumbnails: '/pictures/thumbnails/',
 *                  byStation: { 'p8.christmas_aven.2': ['aven-foot.jpg'] } }
 *   });
 *
 *   cave.focus('p8.christmas_aven.2');
 *   cave.setTeams([ { id: 'a', label: 'Team 1', station: '…', color: '#ffcc00' } ]);
 *
 * Nothing here assumes jQuery, WordPress, or this cave.
 * ========================================================================== */
(function (window, document) {
	'use strict';

	// Every embed on the page, so links can name one and so a second create() on the
	// same container returns what is already there rather than stacking a second viewer.
	var REGISTRY = { first: null, byId: {} };

	var DEFAULTS = {
		// The viewer build: its stylesheet, its workers and its language catalogues are under
		// it. Empty here; the WordPress plugin tells every page the build it ships
		// (`SilexCaveEmbedSite.home`), and a page elsewhere names its own.
		home: '',
		surveyDirectory: '',
		// NOT derived from `home`: a viewer build carries no terrain. Empty is the viewer's own
		// default, and a cave with no terrain never asks for it.
		terrainDirectory: '',
		view: 'VIEW_ELEVATION_N',
		shadingMode: 'SHADING_DEPTH',
		// The viewer otherwise takes the browser's locale, which leaves an English
		// shading chooser sitting in an otherwise Romanian interface. The catalogue is
		// `<home>lib/lang-<code>.json`; a code with no file there falls back to English.
		// The WordPress plugin tells every page the site's choice (`SilexCaveEmbedSite.language`).
		language: 'en',
		// The line under the model saying what drew it. `false` leaves it out.
		credit: true,
		/**
		 * How large the survey's own writing is drawn — the names of its stations and the
		 * comments on them — as a part of the size the viewer draws them at: 1 is the
		 * viewer's own, 0.6 a little over half. A survey names every station by its whole
		 * path, and at the viewer's size a busy passage is a wall of text over the lines
		 * it is supposed to name.
		 */
		labelScale: 1,
		/**
		 * Members of the viewer's theme to set, in the viewer's own shape
		 * (`{ background: 'white', stations: { default: { text: 'black' } } }`). Whatever
		 * is not named stays the viewer's.
		 */
		theme: null,
		/**
		 * The party's markers. `names`: where several stand at one station the viewer
		 * draws one marker for them, and it is labelled with their names one under the
		 * other — up to `maxNames` of them, then how many more — instead of with how
		 * many they are.
		 *
		 * `plate`: what a marker's label is written on. 'contrast' (the default) is a dark
		 * plate, nearly opaque, with white writing: a name is written first in its marker's
		 * own colour, which is a bright one, and bright on dark is read over a black model
		 * and over a white one alike — over a dark background the plate is a shade lighter
		 * than it, so that it has an edge. 'viewer' leaves the viewer its own choice, a pale
		 * plate over a dark background. A page that names `liveMarkers` in `theme` has said
		 * what it wants and is not overruled.
		 */
		markers: { names: true, maxNames: 10, plate: 'contrast' },
		placeListTitle: { ro: 'Locuri din aven', en: 'Places in the shaft' },
		// The place list's link to a station's photographs: the page's own words where it gives
		// them (a string, or one per language), the component's own in the page's language else.
		pictureLinkText: null,
		/**
		 * Replace the viewer's own station popup — which prints the raw station name and
		 * its full coordinates over the place itself — with a small label carrying the
		 * name people use for it and its depth, set off to one side.
		 *
		 * Only for places reached from a link or the list. Clicking a station in the
		 * model still gets the viewer's own popup, which is the one that belongs there:
		 * it is the tool for reading coordinates off the survey.
		 */
		placeLabel: true,

		/**
		 * Whether following a link also frames the survey section the place sits in.
		 * Framing it is what closes the camera in, so turning this off leaves the reader
		 * centred on the station at whatever distance they were already at.
		 */
		frameSection: true,

		/**
		 * A slow turn once the model has settled, so the cave reads as a solid shape
		 * rather than a flat drawing. It stops the moment the reader does anything —
		 * touching the model, following a link, starting the tour — and does not come
		 * back, because a view drifting under someone trying to look at something is
		 * worse than no movement at all. Honours prefers-reduced-motion.
		 *
		 * `rate` is the viewer's own `autoRotateSpeed`: from -1 to 1, the sign being the
		 * direction, where 1 is a whole turn in about five and a half seconds at sixty
		 * frames a second and the viewer's own default, 0.18, one in thirty. A page that
		 * names no rate gets that default.
		 */
		autoRotate: { enabled: false, rate: 0.3, delay: 1200 },

		/**
		 * A scripted fly-through: an array of { caption, delay, view } steps, where view is
		 * a bag of viewer properties applied when the step begins and delay is how many
		 * seconds it lasts. Null means this page has no tour.
		 *
		 * The shape is the one the hand-written presentation page already used, so its
		 * 48 steps transfer verbatim.
		 */
		tour: null,

		/**
		 * Turning place names written in ordinary prose into links that drive the model.
		 * Off by supplying autolink: false; otherwise these are the defaults, and a page
		 * overrides only what it cares about.
		 */
		autolink: {
			enabled: true,
			root: '.entry-content, .post-content, article, main',
			names: true,           // the named places in this config (see namesFrom)
			namesFrom: 'landmarks',// 'landmarks' = only places marked as such; 'all' = every place
			comments: true,        // plus whatever the surveyors named in the survey itself
			aliases: true,         // plus the editable station -> names table
			depths: true,          // plus "-815 m" and the like
			depthTolerance: 8,     // metres a written depth may be off by
			limitPerName: 2,
			limitPerBlock: 1,
			minLength: 4
		},
		labels: {
			wide: 'Model pe toată lățimea',
			list: 'Listă puncte',
			loading: 'Modelul 3D se încarcă…',
			notHere: 'Locul nu există în topografia încărcată.',
			// `{link}` is where the application's name goes, as a link to its sources.
			credit: 'Această vizualizare a fost generată folosind {link}.',
			tabModel: 'Model 3D',
			// The place list's link to a station's photographs, and how many there are.
			pictures: 'poze',
			pictureOne: '{n} fotografie',
			pictureMany: '{n} fotografii',
			// The small choice of language at the end of the row of switches.
			language: 'Limba paginii',
			// A page drawing its cave from a data set that could not be read.
			noData: 'Datele peșterii nu au putut fi citite.'
		}
	};

	// The component's own sentences for a page whose `language` is English. The viewer's
	// toolbar already follows `language`; a Romanian line under an English model would
	// read as something left behind. A label the page sets itself outranks both.
	var LABELS_EN = {
		wide: 'Full-width model',
		list: 'Place list',
		loading: 'The 3D model is loading…',
		notHere: 'This place is not in the loaded survey.',
		credit: 'This visualisation was generated with {link}.',
		tabModel: '3D model',
		pictures: 'photos',
		pictureOne: '{n} photograph',
		pictureMany: '{n} photographs',
		language: 'Page language',
		noData: 'The cave\'s data could not be read.'
	};

	/** Where a reader's own choice of language is kept, for every model on the site. */
	var LANGUAGE_KEY = 'silexCaveEmbed.language';

	function chosenLanguage() {
		try { return window.localStorage.getItem(LANGUAGE_KEY); } catch (e) { return null; }
	}

	/**
	 * A text the page gives in more than one language — `{ ro: '…', en: '…' }` — in the one
	 * shown; a plain string is the same in every language. The first one given stands in for a
	 * language the page did not write it in.
	 */
	function inLanguage(text, language) {
		if (!text || typeof text !== 'object') return text;
		var short = String(language || '').slice(0, 2).toLowerCase();
		if (text[short] !== undefined) return text[short];
		var keys = Object.keys(text);
		return keys.length ? text[keys[0]] : '';
	}

	/** Where the application that draws this lives. */
	var CREDIT_URL = 'https://github.com/apgeo/silexgis';

	/**
	 * Which of the viewer's own controls the toolbar offers, at three sizes.
	 *
	 * The same three sets, for the same reasons, as the SilexGIS application uses: the four
	 * elevations are a compass and half a compass is not a control, so they go together or
	 * not at all; the plan view is the way back from wherever a gesture has turned the
	 * model, which matters most where every gesture turns it; and the splay toggle and the
	 * two projections are the first to go, being a close reading done at a desk and a
	 * change to how the same view is drawn rather than to what is shown.
	 *
	 * Widths measured on this viewer: the fifteen come to 539px for a mouse, the twelve to
	 * 638px under a finger, and the five fit a 338px phone.
	 */
	/**
	 * Every control the viewer's toolbar offers. All of them, always: the bar wraps
	 * rather than losing controls, and below 900px the stylesheet shrinks the buttons
	 * instead. `toolbar.buttons` in the config still overrides the set for a page that
	 * wants fewer.
	 */
	var BUTTONS = {
		full: ['stations', 'stationLabels', 'splays', 'walls', 'scraps', 'entrances',
			'viewPlan', 'viewNorth', 'viewEast', 'viewSouth', 'viewWest',
			'cameraPerspective', 'cameraOrthographic', 'shadingMode', 'fullscreen']
	};

	// ---- lists that scroll, said to be lists that scroll ----------------------------
	//
	// A list in a box of fixed height looks like a short list. On a desk its scrollbar
	// says otherwise; on a telephone the scrollbar is drawn only while a finger is moving
	// it, and a reader is shown six trips with nothing to say there are twenty-seven more.
	// So every box here that scrolls is marked with what it has beyond its edges —
	// `has_above`, `has_below` — and the stylesheet draws a small arrow at that edge.
	//
	// One watcher for the page, not one per box: the boxes are made and made again by the
	// modules that draw into them (the log's table at every narrowing), and a listener on
	// a box that has been replaced marks nothing. A scroll does not bubble, but it is
	// heard on the way down.
	var SCROLLERS = '.cave_places_list, .cave_trips_list, .cave_trips--in_viewer, ' +
		'.cave_embed--trips_left > .cave_trips, .cave_log_scroll, .cave_embed_pane.cave_stats';

	function markScroller(box) {
		var room = box.scrollHeight - box.clientHeight;
		var scrolls = room > 6 && /auto|scroll/.test(window.getComputedStyle(box).overflowY);
		box.classList.toggle('cave_scroll_hint', scrolls);
		box.classList.toggle('has_above', scrolls && box.scrollTop > 4);
		box.classList.toggle('has_below', scrolls && box.scrollTop < room - 4);
	}

	function markScrollers() {
		[].forEach.call(document.querySelectorAll(SCROLLERS), markScroller);
	}

	(function watchScrollers() {
		if (window.SilexCaveScrollHints) return;
		window.SilexCaveScrollHints = { refresh: markScrollers };
		var due = null;
		function soon() {
			if (due !== null) return;
			due = window.setTimeout(function () { due = null; markScrollers(); }, 250);
		}
		document.addEventListener('scroll', function (event) {
			var box = event.target;
			if (box && box.nodeType === 1 && box.matches && box.matches(SCROLLERS)) markScroller(box);
		}, true);
		window.addEventListener('resize', soon);
		window.addEventListener('load', soon);
		// What a box holds changes without anybody scrolling it: a list is read, a table is
		// narrowed, a panel is opened. Only that something changed is taken from the
		// record; the marking itself is done once, a moment later, for all of them.
		if (typeof window.MutationObserver === 'function') {
			var start = function () { new window.MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); soon(); };
			if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
		}
	})();

	function el(tag, cls, parent, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text !== undefined) n.textContent = text;
		if (parent) parent.appendChild(n);
		return n;
	}

	/**
	 * One photograph of a station, whichever way it was given: a file name under the page's
	 * `pictures.root` (its thumbnail under `pictures.thumbnails`, named `tn_` and the file's
	 * name), or an entry that says its own addresses — `{ url, thumb, caption }` — which is
	 * how a cave's data set gives them, each at the address it is kept at.
	 */
	function pictureOf(entry, pictures) {
		if (entry && typeof entry === 'object') {
			var url = String(entry.url || entry.thumb || '');
			return { url: url, thumb: String(entry.thumb || url), caption: entry.caption ? String(entry.caption) : '' };
		}
		var name = String(entry);
		return {
			url: (pictures.root || '') + encodeURIComponent(name),
			thumb: pictures.thumbnails ? pictures.thumbnails + encodeURIComponent('tn_' + name) : (pictures.root || '') + encodeURIComponent(name),
			caption: name.replace(/\.[a-z0-9]+$/i, '')
		};
	}

	/** Pictures for one station, in the shape the viewer's media strip takes. */
	function mediaFor(names, pictures) {
		return names.map(function (entry) {
			var p = pictureOf(entry, pictures);
			return { url: p.url, thumbnailUrl: p.thumb, caption: p.caption };
		});
	}

	// The size the viewer writes a station's name at where its theme says nothing, in the
	// pixels of the screen — and the smallest a page's scale may take it to, in the pixels
	// of the page. The viewer's sizes are the screen's, so on a telephone of two or three
	// device pixels to the page's one its own 18 is already six or nine of the page's;
	// six tenths of that is not writing. Below the floor the scale stops, and on a screen
	// dense enough that the viewer's own size is under it, the viewer's own size stands.
	var VIEWER_LABEL_PX = 18;
	var SMALLEST_LABEL_CSS_PX = 7;

	/**
	 * The theme a page's settings come to, or null where they ask for nothing.
	 *
	 * The size of the survey's writing is a member of the theme, per kind of station, and
	 * is read when the viewer is built — so it is said here, where it works with every
	 * build of the viewer, and again as a property on a build that can change it while
	 * running (see setLabelScale).
	 */
	function themeOf(cfg) {
		var theme = cfg.theme ? JSON.parse(JSON.stringify(cfg.theme)) : null;
		var markers = Object.assign({}, DEFAULTS.markers, cfg.markers || {});
		if (markers.plate !== 'viewer' && !(theme && theme.liveMarkers)) {
			theme = theme || {};
			theme.liveMarkers = {
				labelBackground: isDark(theme.background === undefined ? 'black' : theme.background) ? '#2a323d' : '#141414',
				labelText: '#ffffff',
				labelBackgroundOpacity: 0.9
			};
		}
		var size = labelSizeFor(cfg.labelScale);
		if (size !== null) {
			theme = theme || {};
			theme.stations = theme.stations || {};
			['default', 'junctions', 'linked'].forEach(function (kind) {
				theme.stations[kind] = theme.stations[kind] || {};
				if (theme.stations[kind].fontsize === undefined) theme.stations[kind].fontsize = size;
			});
		}
		return theme;
	}

	// Whether a colour, as a theme names one, is a dark one. The browser is asked what the
	// name means, since a theme may say 'black', '#102030' or 0x106f8d alike; a colour
	// nobody can read is taken for dark, which is what the viewer's own background is.
	function isDark(colour) {
		try {
			var text = typeof colour === 'number' ? '#' + ('000000' + colour.toString(16)).slice(-6) : String(colour);
			var probe = document.createElement('canvas').getContext('2d');
			probe.fillStyle = '#000000';
			probe.fillStyle = text;
			var hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(probe.fillStyle);
			if (!hex) return true;
			var lum = (0.2126 * parseInt(hex[1], 16) + 0.7152 * parseInt(hex[2], 16) + 0.0722 * parseInt(hex[3], 16)) / 255;
			return lum < 0.5;
		} catch (e) {
			return true;
		}
	}

	// The size a scale comes to on this screen, in the screen's pixels, or null where the
	// scale asks for the viewer's own.
	function labelSizeFor(scale) {
		var n = Number(scale);
		if (!(n > 0) || n === 1) return null;
		var wanted = Math.round(VIEWER_LABEL_PX * n);
		if (n > 1) return wanted;
		var floor = Math.min(VIEWER_LABEL_PX, Math.round(SMALLEST_LABEL_CSS_PX * (window.devicePixelRatio || 1)));
		return Math.max(wanted, floor);
	}

	/**
	 * The address of a data set's directory, ending in a slash, or null where the page names
	 * none. `data.url` is the directory, or its `cave.json`; `data.group` is a name the site
	 * keeps a set under, whose address the site prints (`SilexCaveEmbedSite.datasets`).
	 */
	function dataBaseOf(data, site) {
		if (!data) return null;
		var url = null;
		if (typeof data === 'string') url = data;
		else if (data.url) url = String(data.url);
		else if (data.group && site && site.datasets && site.datasets[data.group] && site.datasets[data.group].base) {
			url = String(site.datasets[data.group].base);
		}
		if (!url) return null;
		if (/\.json(\?.*)?$/i.test(url)) return url.replace(/[^\/]*$/, '');
		return /\/$/.test(url) ? url : url + '/';
	}

	/** A data set's `cave.json`, or null where it cannot be read or is not one. */
	function readCave(base) {
		if (typeof window.fetch !== 'function') return Promise.resolve(null);
		// Asked again on every visit, and answered by the browser's own copy while the file is
		// unchanged: the set is rewritten when the installation changes, not on a schedule.
		return window.fetch(base + 'cave.json', { credentials: 'same-origin', cache: 'no-cache' })
			.then(function (r) { return r.ok ? r.json() : null; })
			.then(function (doc) {
				if (!doc || typeof doc !== 'object') return null;
				if (doc.format && !/^silexgis-cave\/1\b/.test(String(doc.format))) {
					console.warn('SilexCaveEmbed: ' + base + 'cave.json is in a form this page does not read (' + doc.format + ')');
					return null;
				}
				return doc;
			})
			.catch(function (e) {
				console.warn('SilexCaveEmbed: the cave\'s data at ' + base + ' could not be read:', e);
				return null;
			});
	}

	function create(config) {
		var cfg = {};
		Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
		// What the site says for every model on it — the plugin prints it before this file,
		// from its settings screen — comes under what the page itself says and over what
		// the component would do by itself.
		var site = window.SilexCaveEmbedSite || {};
		if (typeof site.home === 'string' && site.home) cfg.home = site.home;
		if (Number(site.labelScale) > 0) cfg.labelScale = Number(site.labelScale);
		if (typeof site.language === 'string' && site.language) cfg.language = site.language;
		Object.keys(config || {}).forEach(function (k) { cfg[k] = config[k]; });
		// The languages a reader may choose between, and the one they chose, which comes over
		// what the page and the site say: it is the reader's page they are reading.
		cfg.languages = Array.isArray(cfg.languages) && cfg.languages.length ? cfg.languages
			: (Array.isArray(site.languages) && site.languages.length ? site.languages : ['ro', 'en']);
		var mine = chosenLanguage();
		if (mine && cfg.languages.indexOf(mine) >= 0) cfg.language = mine;
		// labels is the one nested object a page may partially override; merge it deeply
		// so a partial override cannot silently erase the captions it did not mention.
		cfg.labels = Object.assign({}, DEFAULTS.labels,
			/^en\b/i.test(String(cfg.language || '')) ? LABELS_EN : {},
			(config || {}).labels || {});

		// Where the cave itself comes from: the page's own words (survey, places, pictures),
		// or a data set — a directory holding `cave.json` (the survey file, the places, the
		// photographs at stations), `trips.json` (the trips and their tracks) and the files
		// both name. A set is named by its address (`data: { url }`, any page, WordPress or
		// not) or by the name the site keeps it under (`data: { group }`, whose address the
		// plugin prints: its own copy of what an installation publishes, or a set imported
		// from an archive). What the page says itself comes over what the set says.
		var dataBase = dataBaseOf(cfg.data, site);
		var surveyFromData = Boolean(dataBase) && !(config && config.survey);
		if (surveyFromData) cfg.surveyDirectory = dataBase;
		// A set the site serves from the installation as it is asked, keeping no copy, has no
		// trips file: its trips are asked of the installation alone.
		var setHasTrips = !(cfg.data && cfg.data.group && site.datasets && site.datasets[cfg.data.group]
			&& site.datasets[cfg.data.group].trips === false);
		if (dataBase && setHasTrips && cfg.trips && !(cfg.trips.export && cfg.trips.export.url)) {
			cfg.trips = Object.assign({}, cfg.trips, {
				export: Object.assign({}, cfg.trips.export || {}, { url: dataBase + 'trips.json' })
			});
		}

		var host = document.getElementById(cfg.container);
		if (!host) throw new Error('SilexCaveEmbed: no element #' + cfg.container);
		if (host.dataset.silexEmbed) {
			console.warn('SilexCaveEmbed: #' + cfg.container + ' already holds an embed; returning it');
			return host.silexEmbedApi || null;
		}
		host.dataset.silexEmbed = '1';
		if (!REGISTRY.first) REGISTRY.first = cfg.container;
		REGISTRY.byId[cfg.container] = null;   // replaced with the api once it exists
		if (!window.CV2) throw new Error('SilexCaveEmbed: the CaveView bundle is not loaded');

		// The viewer's own stylesheet, which is a dependency of the viewer rather than of
		// the page, so the component brings it rather than leaving each host to remember.
		//
		// Without it `.cv-container` is not positioned and the toolbar, which places
		// itself absolutely inside that container, lands outside the model entirely — and
		// none of the toolbar's own styling applies either.
		(function () {
			var href = cfg.home + 'css/caveview.css';
			if (document.querySelector('link[href="' + href + '"]')) return;
			var link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			(document.head || document.documentElement).appendChild(link);
		})();

		var viewerOptions = {
			home: cfg.home,
			surveyDirectory: cfg.surveyDirectory,
			terrainDirectory: cfg.terrainDirectory,
			view: window.CV2[cfg.view],
			shadingMode: window.CV2[cfg.shadingMode],
			language: cfg.language
		};
		var theme = themeOf(cfg);
		if (theme) viewerOptions.theme = theme;
		var viewer = new window.CV2.CaveViewer(cfg.container, viewerOptions);

		// Several of the party at one station are one marker, and the viewer labels it
		// with how many they are unless it is told what to say. Who they are is what a
		// reader wants of it: their names, one under the other.
		var markerNames = Object.assign({}, DEFAULTS.markers, cfg.markers || {});
		if (markerNames.names !== false && typeof viewer.setLiveMarkerClusterLabel === 'function') {
			viewer.setLiveMarkerClusterLabel(function (members) {
				var names = (members || []).map(function (m) {
					var label = Array.isArray(m.label) ? m.label[0] : m.label;
					return label === undefined || label === null ? '' : String(label);
				}).filter(function (name) { return name !== ''; });
				// Nobody named: the viewer's own count stands.
				if (!names.length) return null;
				var most = Math.max(2, Number(markerNames.maxNames) || 10);
				if (names.length > most) {
					var kept = names.slice(0, most - 1);
					kept.push('+' + (names.length - kept.length));
					return kept;
				}
				return names;
			});
		}

		var ui = new window.CV2.CaveViewUI(viewer);
		// From a data set the survey's name is in the set, and is asked for once it is read.
		if (!surveyFromData) ui.loadCaveList([cfg.survey]);

		/**
		 * Whether a survey is in the viewer yet, and a way to tell the reader when it
		 * is not.
		 *
		 * The model is several megabytes and the page is readable long before it lands,
		 * so a link followed in the first seconds finds a viewer with nothing in it. In
		 * silence that reads as a broken link; it is only a slow one.
		 */
		var loaded = false;
		var sayTimer = null;
		var pendingFocus = null;   // the last focus asked for before the survey landed
		var pendingTeams = null;   // the last party asked for before the survey landed

		// Resolved the first time a survey lands, so a module loaded beside this one can
		// wait for the model without adding a `newCave` listener of its own — one that
		// registers after the event has fired waits for ever.
		var readyResolve = null;
		var ready = new Promise(function (resolve) { readyResolve = resolve; });

		viewer.addEventListener('newCave', function () {
			loaded = true;
			say(null);
			if (readyResolve) { readyResolve(api); readyResolve = null; }
			try {
				var auto = api.autolink();
				if (auto && auto.linked) {
					console.info('SilexCaveEmbed: ' + auto.linked + ' automatic link(s) in the text'
						+ (auto.ambiguous.length ? '; ambiguous names skipped: ' + auto.ambiguous.join(', ') : ''));
				}
			} catch (e) { console.warn('SilexCaveEmbed: autolink failed:', e); }
			if (pendingTeams) {
				var t = pendingTeams;
				pendingTeams = null;
				api.setTeams(t);
			}
			if (pendingFocus) {
				var p = pendingFocus;
				pendingFocus = null;
				api.focus(p.ref, p.opts);
			}
		});

		// A message that stands for as long as its cause does — a data set that could not be
		// read leaves a model with nothing in it — and comes back once a passing one is gone.
		var standing = null;
		function say(message) {
			var note = host.querySelector('.cave_embed_note');
			if (!message && standing) message = standing;
			if (!message) {
				if (note) note.classList.remove('is_shown');
				return;
			}
			if (!note) note = el('div', 'cave_embed_note', host);
			note.textContent = message;
			note.classList.add('is_shown');
			window.clearTimeout(sayTimer);
			// While the model is still coming, the message stays until it arrives.
			if (loaded) sayTimer = window.setTimeout(function () { note.classList.remove('is_shown'); }, 3200);
		}

		/**
		 * The view a reader should arrive at.
		 *
		 * Applied after a survey loads rather than in the construction config, because
		 * the viewer builds its settings as its own defaults, then the config, then
		 * whatever was last stored by its "save as default" button — so the stored value
		 * wins over the config, and one press of that button by anybody would otherwise
		 * decide what every later visitor sees.
		 */
		viewer.addEventListener('newCave', function () {
			function apply() {
				try {
					setView(window.CV2[cfg.view]);
					if (cfg.stationComments !== false) viewer.stationComments = true;
					if (cfg.scraps !== false) viewer.scraps = true;
				} catch (err) {
					console.warn('SilexCaveEmbed: opening view not applied:', err);
				}
			}

			apply();
			startRotating();
			// Again, once. `scraps` is refused at this moment — it needs geometry the
			// viewer is still building as it announces the survey — and silently stays
			// off, where `stationComments` and the viewpoint take straight away. Asking
			// a second time a moment later is what makes the walls appear; the rest is
			// idempotent, so re-applying costs nothing.
			window.setTimeout(apply, 700);
		});

		// ---- the viewer's own controls, over the model --------------------------
		//
		// How many fit is the width divided by the size a pointer needs, so both axes
		// decide the set. The bar wraps rather than overflowing, and a second row of
		// finger-sized controls over a short model costs more than the controls are worth.
		var toolbar = null;

		/**
		 * Which controls the bar offers.
		 *
		 * Every one of them, and it is allowed to wrap onto a second or third row rather
		 * than having controls taken away: a reader who cannot reach a view is worse off
		 * than one who gives up a strip of model to a taller bar. The stylesheet here
		 * lets the bar use the model's whole width — the bundle otherwise caps it at
		 * half, measured at exactly 50% across six widths from 380px to 1097px — which
		 * halves how often it needs a second row at all.
		 *
		 * `toolbar.buttons` still overrides the choice for a page that wants fewer.
		 */
		function toolbarButtons() {
			if (cfg.toolbar && cfg.toolbar.buttons) return cfg.toolbar.buttons;
			return BUTTONS.full;
		}

		// A strip above the model, for the bar to be laid out in while the model is shown at
		// less than its large size: over a model 400px wide, fifteen controls in two or
		// three rows cover a third of the cave. The viewer moves the bar there and back by
		// itself (its `strip` option, from 2.9.0-slx.18; an older build ignores the option
		// and keeps the bar over the model). `toolbar.strip: false` keeps it over the model
		// at every size.
		//
		// The strip is the model's and nothing else's: exactly as wide as the model and
		// directly on top of it, with the model that much shorter, so that the two together
		// are the height the model had and the lists beside them still stand level with
		// it. It cannot be put inside the model's own element, which is the viewer's
		// drawing surface from edge to edge, so it is a child of the block set over the
		// room the model leaves at its top — placed from the model's own box each time
		// that box may have changed (placeToolbarStrip).
		var toolbarStrip = null;
		var toolbarStripHeight = 0;

		function placeToolbarStrip() {
			if (!toolbarStrip || !block) return;
			var on = toolbarStrip.classList.contains('cv-toolbar-strip-on');
			block.classList.toggle('cave_embed--toolbar_above', on);
			if (!on) {
				if (toolbarStripHeight !== 0) {
					toolbarStripHeight = 0;
					block.style.removeProperty('--cave-toolbar-height');
					relayout();
				}
				return;
			}
			// The width first: how many rows the bar takes, and so how tall the strip is,
			// follows from it.
			toolbarStrip.style.width = host.offsetWidth + 'px';
			var tall = Math.round(toolbarStrip.getBoundingClientRect().height);
			if (tall !== toolbarStripHeight) {
				toolbarStripHeight = tall;
				block.style.setProperty('--cave-toolbar-height', tall + 'px');
				// The model has just been given another height, which the viewer hears of
				// by the one signal it resizes on. Coming back here it finds the height
				// unchanged, and that is the end of it.
				relayout();
			}
			toolbarStrip.style.left = host.offsetLeft + 'px';
			toolbarStrip.style.top = (host.offsetTop - tall) + 'px';
		}
		window.addEventListener('resize', placeToolbarStrip);
		viewer.addEventListener('change', function (event) {
			if (event && event.name === 'toolbarPlacement') placeToolbarStrip();
		});

		function stripForToolbar() {
			if (!block || cfg.toolbar.strip === false) return null;
			if (!toolbarStrip) {
				toolbarStrip = el('div', 'cave_embed_toolbar', null);
				block.insertBefore(toolbarStrip, block.firstChild);
			}
			return toolbarStrip;
		}

		function buildToolbar() {
			if (!cfg.toolbar || !window.CV2.CaveViewToolbar) return;
			if (toolbar) { toolbar.dispose(); toolbar = null; }
			try {
				var options = {
					placement: cfg.toolbar.placement || 'top',
					buttons: [].slice.call(toolbarButtons())
				};
				var strip = stripForToolbar();
				if (strip) options.strip = strip;
				toolbar = new window.CV2.CaveViewToolbar(viewer, cfg.container, options);
				placeToolbarStrip();
				watchViewButtons();
			} catch (err) {
				console.warn('SilexCaveEmbed: toolbar not built:', err);
			}
		}

		if (cfg.toolbar) {
			// Built once a model is there, and rebuilt when the box changes width, because
			// which controls fit is a property of the box rather than of the page.
			// The bar takes its labels from the translation catalogue at the moment it is
			// built, and the viewer fetches that catalogue asynchronously — so a bar built
			// as soon as a model arrives is born with English labels in an otherwise
			// Romanian interface, and nothing afterwards relabels it. The viewer does
			// announce the catalogue, but on its own configuration object rather than on
			// itself, so there is no event here to wait for. Asking for the same file is
			// the honest way to wait: by the time this resolves the viewer has it too, and
			// the second request is served from cache.
			viewer.addEventListener('newCave', function () {
				var ready = cfg.language && typeof window.fetch === 'function'
					? window.fetch(cfg.home + 'lib/lang-' + cfg.language + '.json')
						.catch(function () { /* no catalogue for this language; English it is */ })
					: Promise.resolve();
				ready.then(buildToolbar);
			});
		}

		/* ---- which way the model is being looked at ------------------------------
		 *
		 * Tracked here rather than read back from the viewer, because the bundle's
		 * getter answers VIEW_PLAN whatever the view actually is — measured: set the
		 * east elevation, read it back, get 1. The setter works; only the getter lies.
		 * So the property is wrapped: assignments (ours, the toolbar's, the tour's) are
		 * recorded on the way through and the getter answers with what was last set.
		 *
		 * This is what lets a flight to a station put the view back afterwards. The
		 * viewer swings the camera on its own while framing a section, and without
		 * knowing what the reader was looking at there is nothing to restore.
		 */
		/* ---- which way the model is being looked at ------------------------------
		 *
		 * Kept here, because the viewer will not tell us. Its `view` getter answers
		 * VIEW_PLAN whatever the view actually is, and so does getView() — measured by
		 * setting each of the five views in turn and reading all five back as 1. The
		 * property is also non-configurable, so it cannot be wrapped to listen in.
		 *
		 * So: every place in this file that changes the view goes through setView(),
		 * and the only other thing that can change it — a reader pressing one of the
		 * toolbar's view buttons — is watched directly. That is the whole set, which
		 * is what makes the note reliable.
		 *
		 * It exists so a flight to a station can put the view back afterwards: the
		 * viewer swings the camera on its own while framing a section, and without
		 * knowing what the reader was looking at there is nothing to restore.
		 */
		var currentView = window.CV2[cfg.view];

		function setView(value) {
			currentView = value;
			try { viewer.view = value; }
			catch (e) { console.warn('SilexCaveEmbed: view not set:', e); }
		}

		var VIEW_BUTTONS = {
			viewPlan: 'VIEW_PLAN', viewNorth: 'VIEW_ELEVATION_N', viewEast: 'VIEW_ELEVATION_E',
			viewSouth: 'VIEW_ELEVATION_S', viewWest: 'VIEW_ELEVATION_W'
		};

		function watchViewButtons() {
			var bar = host.querySelector('.cv-toolbar');
			if (!bar) return;
			var names = toolbarButtons();
			[].forEach.call(bar.children, function (button, i) {
				var which = VIEW_BUTTONS[names[i]];
				if (!which) return;
				if (button.dataset.silexViewWatched) return;
				button.dataset.silexViewWatched = '1';
				button.addEventListener('click', function () {
					currentView = window.CV2[which];
				}, true);
			});
		}

		var api = {
			viewer: viewer,
			ui: ui,
			config: cfg,

			/**
			 * Go to a place and frame it.
			 *
			 * A reference can name either a station or a named part of the survey, and
			 * the two want different things: a station is flown to, marked and given its
			 * popup; a survey section is framed, which draws the viewer's box around its
			 * extent. Which one a reference is cannot be told by looking at it — the
			 * dotted paths are the same shape — so a station is tried first and a
			 * section only if the survey has no station by that name.
			 */
			focus: function (ref, options) {
				var opts = options || { highlight: true, popup: true };

				// keepView asks the viewer to centre the station without turning the model.
			// Added in the fork for this: focusStation() otherwise leaves the camera
			// where it is and swings it round to face the new target, which is a turn by
			// definition, so a reader who chose the north elevation arrived looking from
			// somewhere else. Older bundles ignore the option.
			if (opts && opts.keepView === undefined) opts.keepView = true;

			function missing(err) {
					return window.CV2 && typeof window.CV2.focusNamedNothing === 'function'
						? window.CV2.focusNamedNothing(err)
						: /^No (station|survey section)/.test((err && err.message) || '');
				}

				stopRotating();
				if (!loaded) {
					say(cfg.labels.loading);
					pendingFocus = { ref: ref, opts: opts };
					return Promise.resolve();
				}

				/**
				 * Close the camera on what was just framed.
				 *
				 * Flying to a station leaves the camera at whatever distance it was
				 * already at, so following a link from the text arrived at the right
				 * place looking at the whole cave. Naming the section puts the viewer's
				 * box round it, and `setPOI` is what actually moves in — the pair is
				 * what the page this component replaces used, and the only route to a
				 * zoom the viewer offers a host.
				 */
				function zoom(target) {
					try {
						// The first two components are the survey section the place is in:
						// "p8.christmas_aven.25c" -> the aven's survey section.
						var section = String(target).split('.').slice(0, 2).join('.');

						/*
						 * Naming the section is what closes the camera in, but it does so by
						 * SELECTING that section — survey.selectSection() — which replaces
						 * the station focusStation() had just selected. The reader then
						 * arrives to a box round the whole meander and no mark on the place
						 * they actually clicked.
						 *
						 * So the station is selected again afterwards. highlightStation()
						 * only sets the highlight; it starts no camera move of its own, so
						 * it cannot disturb the one now in flight. The popup is re-asserted
						 * for the same reason — selecting the section closes it.
						 */
						if (section && cfg.frameSection !== false) {
							viewer.sectionByName = section;
							viewer.setPOI = true;
						}

						var ownLabel = cfg.placeLabel !== false;
						if (viewer.highlightStation) {
							// With our own label the viewer's popup is suppressed outright,
							// rather than drawn and covered: it is rendered into the WebGL
							// scene, so nothing on the page can hide or restyle it.
							viewer.highlightStation(target, { popup: ownLabel ? false : !!(opts && opts.popup) });
						} else {
							viewer.highlight = target;   // older bundles: no popup control here
						}
						if (ownLabel) showPlaceLabel(target);
					} catch (err) {
						console.warn('SilexCaveEmbed: could not close in on "' + target + '":', err);
					}
				}

				return viewer.focusStation(ref, opts).then(function () {
					zoom(ref);
				}, function (err) {
					if (!missing(err)) {
						// A superseded camera move rejects too and must stay quiet, but a real
						// exception should at least be findable.
						console.debug('SilexCaveEmbed: focus "' + ref + '" did not complete:', err);
						return;
					}                 // superseded by a later move
					return viewer.focusSurvey(ref).then(function () {
						// A section frames itself; the box is the viewer's own.
						try { viewer.setPOI = true; } catch (e) { /* nothing to close on */ }
					}, function (err2) {
						if (missing(err2)) {
							console.warn('SilexCaveEmbed: the loaded survey has no station or ' +
								'section named "' + ref + '"');
							say(cfg.labels.notHere);
						}
					});
				});
			},

			/**
			 * Where each team is now. Call it again with the same ids to move them;
			 * ids that disappear from the list are taken off the model.
			 *
			 * This is the hook the trip journal will use — it is wired now so that
			 * adding it later is data, not code.
			 */
			setTeams: function (teams) {
				// Before the survey lands there is nothing to place anybody on, and the
				// viewer would keep the reference without drawing it. Held and replayed
				// instead, the same way a focus asked for too early is — a party arriving
				// two seconds into a twenty-megabyte download is the ordinary case, not
				// the unlucky one.
				if (!loaded) {
					pendingTeams = teams;
					return { placed: 0, unplaced: 0, absent: 0, pending: true };
				}

				var wanted = {};
				var report = { placed: 0, unplaced: 0, absent: 0, pending: false, unresolved: [] };

				(teams || []).forEach(function (t) {
					// A member with no place is not a member drawn nowhere: it is one this
					// page knows it cannot draw — withheld, measured on another survey, or
					// never reported. Their marker is taken off rather than left at a
					// station they have since left, and the caller says so in its own list.
					if (!t.station) { report.absent++; return; }

					wanted[t.id] = true;
					var opts = {
						label: t.label, sublabel: t.sublabel, color: t.color,
						payload: t.payload, duration: t.duration
					};
					var placed = viewer.moveLiveMarker(t.id, t.station, opts)
						|| viewer.addLiveMarker(t.id, t.station, opts);
					if (placed && !placed.resolved) {
						report.unplaced++;
						report.unresolved.push({ id: t.id, station: t.station });
					} else if (placed) {
						report.placed++;
					}
				});
				viewer.getLiveMarkers().forEach(function (m) {
					if (!wanted[m.id]) viewer.removeLiveMarker(m.id);
				});

				// One warning for the set rather than one per member: a survey that is the
				// wrong one for this trip fails for everybody at once, and eight identical
				// console lines say no more than one does.
				if (report.unplaced) {
					console.warn('SilexCaveEmbed: ' + report.unplaced + ' of ' +
						(report.unplaced + report.placed) + ' reported places are not in the ' +
						'loaded survey — nothing is drawn for them');
				}
				return report;
			}
		};

		/**
		 * Takes the embed down: viewer, toolbar, and everything this create() added to
		 * the page. The container is left empty and reusable.
		 */
		/* ---- the label for a place reached from a link ---------------------------
		 *
		 * Placed just right of the middle of the model, because that is where the place
		 * is: the flight makes the station the camera's target, which is the centre of
		 * the view. Offsetting it leaves the station itself, and its marker, uncovered.
		 */
		var placeLabelEl = null;

		function placeInfo(ref) {
			var place = null;
			(cfg.places || []).forEach(function (p) { if (p.station === ref) place = p; });
			if (place) {
				return {
					name: String(place.label || '').split(/\s+[-–—]\s+/)[0].trim() || ref.split('.').pop(),
					depth: (place.depth !== undefined && place.depth !== null) ? Math.round(place.depth) : null
				};
			}
			// Not a listed place: fall back to the surveyors' own comment, then the
			// bare station name, and measure the depth off the survey.
			var name = ref.split('.').pop(), depth = null;
			try {
				var tree = viewer.getSurveyTree();
				var node = tree.getByPathEx ? tree.getByPathEx(ref) : tree.getByPath(ref);
				if (node) {
					if (node.comment) name = String(node.comment).split(/\s+[-–—]\s+/)[0].trim() || name;
					var entrance = (cfg.places || []).filter(function (p) { return p.depth === 0; })[0];
					if (entrance && node.z !== undefined) {
						var en = tree.getByPathEx ? tree.getByPathEx(entrance.station) : tree.getByPath(entrance.station);
						if (en && en.z !== undefined) depth = Math.round(en.z - node.z);
					}
				}
			} catch (e) {}
			return { name: name, depth: depth };
		}

		/**
		 * How far below the entrance a station is, in metres, or null where that cannot be
		 * said: the depth the page's own list gives it, failing that the difference in
		 * height between it and the entrance in the loaded survey. Null until the survey is
		 * in, for a station the list gives no depth.
		 */
		function depthOf(ref) {
			var listed = (cfg.places || []).filter(function (p) { return p.station === ref; })[0];
			if (listed && listed.depth !== undefined && listed.depth !== null && isFinite(Number(listed.depth))) {
				return Number(listed.depth);
			}
			try {
				var entrance = (cfg.places || []).filter(function (p) { return p.depth === 0; })[0];
				if (!entrance) return null;
				var tree = viewer.getSurveyTree();
				var find = function (path) { return tree.getByPathEx ? tree.getByPathEx(path) : tree.getByPath(path); };
				var node = find(ref), top = find(entrance.station);
				if (node && top && node.z !== undefined && top.z !== undefined) return top.z - node.z;
			} catch (e) { /* no survey yet, or no such station */ }
			return null;
		}

		function showPlaceLabel(ref) {
			var info = placeInfo(ref);
			if (!placeLabelEl) placeLabelEl = el('div', 'cave_embed_place_label', host);
			placeLabelEl.innerHTML = '';
			el('span', 'cave_embed_place_name', placeLabelEl, info.name);
			if (info.depth !== null) {
				el('span', 'cave_embed_place_depth', placeLabelEl, '\u2212' + info.depth + '\u202fm');
			}
			placeLabelEl.classList.add('is_shown');
		}

		function hidePlaceLabel() {
			if (placeLabelEl) placeLabelEl.classList.remove('is_shown');
		}

		/* ---- the slow turn -------------------------------------------------------- */
		var rotateTimer = null;
		var rotateCancelled = false;

		function stopRotating() {
			rotateCancelled = true;
			if (rotateTimer !== null) { window.clearTimeout(rotateTimer); rotateTimer = null; }
			try { if (viewer.autoRotate) viewer.autoRotate = false; } catch (e) {}
		}

		/**
		 * Starts the slow turn, and keeps asking until it takes.
		 *
		 * The viewer refuses `autoRotate` while it is still building the survey's
		 * geometry — the same silent refusal that makes the opening state apply `scraps`
		 * twice — and reports no error: the flag simply stays false. Measured: set at
		 * newCave + 1.5s it never came on, while the same assignment made by hand half a
		 * minute later worked immediately.
		 *
		 * The flag does read back honestly, unlike `view`, so asking again until it
		 * sticks is both possible and the only reliable way to do this.
		 */
		function startRotating() {
			var r = cfg.autoRotate;
			if (!r || !r.enabled) return;
			if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			if (rotateTimer !== null) return;
			var tries = 0;

			function attempt() {
				rotateTimer = null;
				if (rotateCancelled) return;          // the reader has already done something
				try {
					// By the viewer's own name for it. The rate used to be written to
					// `autoRotateRate`, which no release of the viewer has: the assignment
					// made a field nothing reads, raised no error and read back as written,
					// and the model turned at the viewer's default whatever a page asked for.
					if (typeof r.rate === 'number' && isFinite(r.rate)) viewer.autoRotateSpeed = r.rate;
					viewer.autoRotate = true;
				} catch (e) {
					console.warn('SilexCaveEmbed: could not start the slow turn:', e);
					return;
				}
				tries++;
				var on = false;
				try { on = viewer.autoRotate === true; } catch (e) {}
				if (!on && tries < 12) rotateTimer = window.setTimeout(attempt, 700);
			}

			rotateTimer = window.setTimeout(attempt, r.delay || 0);
		}

		// Any intent to look at something of one's own stops it, once and for good.
		['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (evt) {
			host.addEventListener(evt, stopRotating, { passive: true });
		});

		/* ---- the scripted fly-through -------------------------------------------
		 *
		 * Each step sets some viewer properties, shows a caption and holds for its delay.
		 * Two things the hand-written version got wrong and this does not: the view the
		 * reader was looking at is put back when the tour ends or is stopped, and the
		 * timer is owned so that stopping actually stops it — there, a stop left the chain
		 * running against a viewer that had since been disposed.
		 */
		var tourTimer = null;
		var tourAt = 0;
		var tourWasLooking = null;
		var caption = null;

		function tourCaption(text) {
			if (!caption) {
				caption = el('div', 'cave_embed_caption_overlay', null);
				host.appendChild(caption);
			}
			caption.textContent = text || '';
			caption.classList.toggle('is_shown', Boolean(text));
		}

		function applyView(view) {
			if (!view) return;
			Object.keys(view).forEach(function (k) {
				if (k === 'view') { setView(view[k]); return; }
				try { viewer[k] = view[k]; }
				catch (e) { console.warn('SilexCaveEmbed: tour could not set ' + k, e); }
			});
		}

		api.tour = {
			get running() { return tourTimer !== null || tourAt > 0; },

			start: function (from) {
				stopRotating();
				hidePlaceLabel();
				var steps = cfg.tour && cfg.tour.steps;
				if (!steps || !steps.length) return false;
				if (!loaded) { say(cfg.labels.loading); return false; }
				api.tour.stop(true);
				// What the reader was looking at, to be given back afterwards.
				tourWasLooking = {};
				['view', 'shadingMode', 'stations', 'stationLabels', 'stationComments',
					'splays', 'walls', 'scraps', 'entrances', 'box', 'autoRotate'].forEach(function (k) {
					try { tourWasLooking[k] = viewer[k]; } catch (e) {}
				});
				tourAt = from || 0;
				step();
				return true;
			},

			stop: function (quiet) {
				if (tourTimer !== null) { window.clearTimeout(tourTimer); tourTimer = null; }
				tourAt = 0;
				tourCaption(null);
				if (tourWasLooking) {
					if (!quiet) applyView(tourWasLooking);
					tourWasLooking = null;
				}
				if (!quiet && cfg.tour && cfg.tour.fullscreen) {
					try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
				}
				return true;
			}
		};

		function step() {
			var steps = cfg.tour.steps;
			if (tourAt >= steps.length) { api.tour.stop(); return; }
			var s = steps[tourAt++];
			applyView(s.view);
			tourCaption(s.caption);
			tourTimer = window.setTimeout(step, Math.max(0.2, Number(s.delay) || 3) * 1000);
		}

		// Leaving fullscreen is the reader saying "enough", so treat it as a stop rather
		// than letting a tour carry on behind the page.
		function onFullscreenChange() {
			if (!document.fullscreenElement && api.tour.running) api.tour.stop(true);
		}

		document.addEventListener('fullscreenchange', onFullscreenChange);

		/* ---- reset ---------------------------------------------------------------
		 *
		 * Deliberately NOT the dispose-and-rebuild the hand-written page did: that
		 * re-ran the whole setup and stacked a second set of event handlers on every
		 * control, so after one reset the fly-through button was dead. Putting the
		 * opening state back achieves what the button is for, and cannot accumulate
		 * anything.
		 */
		/* ---- seams for modules loaded beside this one ---------------------------
		 *
		 * A second file (the trips module) needs four things this closure keeps to
		 * itself: whether the model is in, a way to say something to the reader, a way
		 * to tell the renderer the box changed shape, and somewhere to be taken down.
		 * They are exposed rather than copied, so there is one of each.
		 */
		Object.defineProperty(api, 'loaded', { get: function () { return loaded; } });
		api.ready = ready;

		/** Tell the reader something over the model. Pass null to clear it. */
		api.say = function (message) { say(message); };

		/** Metres below the entrance for a station, or null: see depthOf(). */
		api.depthOf = function (station) { return depthOf(station); };

		/**
		 * Where a station is in the loaded survey, as the viewer holds it — `{ x, y, z }` in the
		 * survey's own coordinates — or null before the survey is in and for a name it lacks.
		 * What a module that draws the party on a scanned sheet places a station by.
		 */
		api.stationXYZ = function (ref) {
			try {
				var tree = viewer.getSurveyTree();
				var node = tree.getByPathEx ? tree.getByPathEx(ref) : tree.getByPath(ref);
				if (node && isFinite(node.x) && isFinite(node.y) && isFinite(node.z)) return { x: Number(node.x), y: Number(node.y), z: Number(node.z) };
			} catch (e) { /* no survey yet, or no such station */ }
			return null;
		};

		/** The box has changed shape; the renderer only re-reads it on a window resize. */
		api.relayout = function () { relayout(); };

		var teardown = [];

		/** Run this when the embed is taken down. */
		api.onDestroy = function (fn) { if (typeof fn === 'function') teardown.push(fn); };

		/** Change the view and remember it, which plain assignment cannot do here. */
		api.setView = function (name) {
			var value = typeof name === 'string' ? window.CV2[name] : name;
			if (value === undefined) { console.warn('SilexCaveEmbed: unknown view ' + name); return false; }
			setView(value);
			return true;
		};

		api.reset = function () {
			stopRotating();
			hidePlaceLabel();
			api.tour.stop(true);
			tourCaption(null);
			try {
				setView(window.CV2[cfg.view]);
				if (cfg.shadingMode) viewer.shadingMode = window.CV2[cfg.shadingMode];
				if (cfg.stationComments !== false) viewer.stationComments = true;
				if (cfg.scraps !== false) viewer.scraps = true;
				viewer.autoRotate = false;
				viewer.setPOI = false;
			} catch (e) { console.warn('SilexCaveEmbed: reset incomplete:', e); }
			if (block) {
				[].forEach.call(block.querySelectorAll('.cave_place_link.is_current'),
					function (r) { r.classList.remove('is_current'); });
			}
			return true;
		};

		api.destroy = function () {
			teardown.forEach(function (fn) {
				try { fn(); } catch (e) { console.warn('SilexCaveEmbed: teardown failed:', e); }
			});
			teardown = [];
			stopRotating();
			// Markers and trails outlive a survey by design, so they outlive this too
			// unless they are taken off deliberately.
			try { viewer.clearLiveMarkers(); } catch (e) {}
			try { if (viewer.clearTrails) viewer.clearTrails(); } catch (e) {}
			var note = host.querySelector('.cave_embed_note');
			if (note) note.remove();
			document.removeEventListener('fullscreenchange', onFullscreenChange);
            delete REGISTRY.byId[cfg.container];
			if (REGISTRY.first === cfg.container) REGISTRY.first = null;
			if (placeLabelEl) { placeLabelEl.remove(); placeLabelEl = null; }
			try { api.tour.stop(true); } catch (e) {}
			if (caption) { caption.remove(); caption = null; }
			try { if (toolbar) { toolbar.dispose(); toolbar = null; } } catch (e) {}
			try { ui.dispose(); } catch (e) { console.warn('SilexCaveEmbed: dispose failed:', e); }
			if (block) {
				var bar = block.querySelector('.cave_embed_switches');
				if (bar) bar.remove();
				if (creditEl) { creditEl.remove(); creditEl = null; }
				if (tabBar) { tabBar.remove(); tabBar = null; }
				tabs.forEach(function (t) { if (t.pane) t.pane.remove(); });
				tabs = [];
				host.hidden = false;
				block.classList.remove('cave_embed--other_view');
				block.classList.remove('cave_embed--split');
			}
			if (hoverStrip) { hoverStrip.remove(); hoverStrip = null; }
			if (galleryHolder) { galleryHolder.remove(); galleryHolder = null; }
			delete host.dataset.silexEmbed;
			delete host.silexEmbedApi;
		};
		host.silexEmbedApi = api;
		REGISTRY.byId[cfg.container] = api;

		// ---- photographs held for a station -------------------------------------
		//
		// The viewer shows them itself, over the model, for whichever station the
		// pointer is resting on — and on a touch screen for whichever was tapped.
		function holdStationMedia() {
			if (!cfg.pictures || !cfg.pictures.byStation) return;
			var media = new Map();
			Object.keys(cfg.pictures.byStation).forEach(function (station) {
				media.set(station, mediaFor(cfg.pictures.byStation[station], cfg.pictures));
			});
			viewer.setStationMedia(media);
			// Assigned after a survey loads, never in the construction config: the
			// viewer applies its stored "save as default" settings over the config, so
			// one press of that button by anyone would otherwise pin this off for good.
			viewer.addEventListener('newCave', function () { viewer.stationLabelOver = true; });

			// A thumbnail was clicked: hand it to the page's lightbox if there is one,
			// and tell the viewer we have dealt with it so it does not also pop its own.
			viewer.addEventListener('mediaOpen', function (event) {
				if (!window.SilexLightbox || !event.entry) return;
				event.handled = window.SilexLightbox.open(event.entry.url, event.entry.caption);
			});
		}
		if (!dataBase) holdStationMedia();

		/**
		 * Opens a station's photographs as a gallery.
		 *
		 * The lightbox groups anchors by their rel attribute, so the set is written into a
		 * hidden holder and the first one clicked — the same path the markup-driven
		 * galleries take, which is what makes prev/next work across the station's pictures
		 * rather than opening one picture alone.
		 */
		var galleryHolder = null;

		/**
		 * The strip of a station's photographs, over the model, while the pointer rests
		 * on that station in the list.
		 *
		 * The viewer shows such a strip for a station the pointer finds on the model
		 * itself; this is the same affordance reached from the list, which is how the
		 * page this component replaces worked. It deliberately does not move the camera —
		 * running the eye down a list should not fly the model about — so it is drawn
		 * here rather than asked of the viewer, whose own strip comes with a camera move.
		 */
		var hoverStrip = null;
		var hoverTimer = null;

		function showHoverPictures(names) {
			if (!names || !names.length) return;
			if (!hoverStrip) hoverStrip = el('div', 'cave_hover_pictures', host);
			window.clearTimeout(hoverTimer);
			hoverStrip.innerHTML = '';
			names.slice(0, 8).forEach(function (entry) {
				var p = pictureOf(entry, cfg.pictures);
				var img = el('img', 'cave_hover_picture', hoverStrip);
				img.src = p.thumb;
				img.alt = p.caption;
				img.loading = 'lazy';
			});
			hoverStrip.classList.add('is_shown');
		}

		function hideHoverPictures() {
			if (!hoverStrip) return;
			// A moment's grace, so crossing a gap between two rows does not flicker.
			hoverTimer = window.setTimeout(function () {
				hoverStrip.classList.remove('is_shown');
			}, 400);
		}

		/**
		 * Whether an address is one a browser fetches — http or https once resolved
		 * against this page, which is what an address beginning with a slash is.
		 *
		 * `pictures.root` is written by whoever configures the page, and where that is a
		 * box in the editor it is whatever was typed there. Opened in a tab unexamined, a
		 * root beginning "javascript:" would be run rather than fetched. Resolved by the
		 * browser's own parser rather than matched by eye, because that is the reading the
		 * new tab would give it: leading spaces and tabs inside the scheme included.
		 */
		function fetchable(address) {
			try {
				var protocol = new window.URL(address, window.location.href).protocol;
				return protocol === 'http:' || protocol === 'https:';
			} catch (e) {
				return false;
			}
		}

		function openGallery(station, names) {
			if (!names || !names.length) return;
			if (!window.FOOBOX) {
				// No lightbox on this page: a dead link is worse than a plain image tab.
				var direct = pictureOf(names[0], cfg.pictures).url;
				if (!fetchable(direct)) {
					console.warn('SilexCaveEmbed: no lightbox loaded, and the pictures\' address is not ' +
						'one to open in a tab; nothing opened');
					return;
				}
				console.warn('SilexCaveEmbed: no lightbox loaded; opening the picture directly');
				window.open(direct, '_blank', 'noopener');
				return;
			}
			if (!galleryHolder) {
				galleryHolder = el('div', 'cave_gallery_holder', document.body);
				galleryHolder.style.display = 'none';
			}
			var rel = cfg.container + '_station_' + station.replace(/[^\w]/g, '_');
			galleryHolder.innerHTML = '';
			names.forEach(function (entry) {
				var p = pictureOf(entry, cfg.pictures);
				var a = el('a', 'foobox', galleryHolder, p.caption);
				a.href = p.url;
				a.setAttribute('rel', rel);
				a.setAttribute('data-caption', p.caption);
			});
			window.FOOBOX.init();
			galleryHolder.firstChild.click();
		}

		// ---- the place list -----------------------------------------------------
		function buildPlaceList() {
		if (cfg.placeList && cfg.places) {
			var list = document.getElementById(cfg.placeList);
			if (list) {
				list.classList.add('cave_places');
				if (cfg.placeListTitle) el('div', 'cave_places_title', list, inLanguage(cfg.placeListTitle, cfg.language));
				var ul = el('ul', 'cave_places_list', list);
				cfg.places.forEach(function (place) {
					var li = el('li', 'cave_place', ul);
					var a = el('a', 'cave_place_link', li, place.label);
					a.href = '#' + cfg.container;
					a.title = place.label;      // the list clamps long names to two lines
					a.setAttribute('data-selection', place.station);
					if (place.landmark) li.classList.add('cave_place--landmark');

					// A measured depth where there is one; otherwise whatever the survey
					// table said, which is free text ("446 - 515 (527 ? )") and shown as-is
					// rather than pretended into a number.
					if (place.depth !== undefined) el('span', 'cave_place_depth', li, '−' + place.depth + ' m');
					else if (place.note) el('span', 'cave_place_depth', li, place.note);

					// A station that has photographs gets the same "poze" link the full cave
					// page offers, opening them as a gallery rather than making the reader
					// find the station on the model and hover it.
					var shots = cfg.pictures && cfg.pictures.byStation
						? cfg.pictures.byStation[place.station] : null;

					if (shots && shots.length
							&& !(window.matchMedia && window.matchMedia('(hover: none)').matches)) {
						// Resting on the row shows the station's pictures over the model,
						// without moving the camera.
						li.addEventListener('mouseenter', function () { showHoverPictures(shots); });
						li.addEventListener('mouseleave', hideHoverPictures);
					}

					if (shots && shots.length) {
						var pics = el('a', 'cave_place_pics', li, inLanguage(cfg.pictureLinkText, cfg.language) || cfg.labels.pictures);
						pics.href = '#' + cfg.container;
						pics.title = (shots.length === 1 ? cfg.labels.pictureOne : cfg.labels.pictureMany).replace('{n}', String(shots.length));
						pics.addEventListener('click', function (e) {
							e.preventDefault();
							e.stopPropagation();       // not also a request to fly there
							openGallery(place.station, shots);
						});
					}
					a.addEventListener('click', function (e) {
						e.preventDefault();
						[].forEach.call(ul.querySelectorAll('.cave_place_link'), function (o) {
							o.classList.remove('is_current');
						});
						a.classList.add('is_current');
						// Told first, so that a module beside this one can act on the reader's
						// choice — stopping a replay that was playing — before the view moves.
						placeHandlers.forEach(function (fn) {
							try { fn(place.station); } catch (err) { console.warn('SilexCaveEmbed: a place handler failed:', err); }
						});
						// Shown where it can be seen, and then gone to: the view is chosen before
						// the camera moves, since a camera moving in a box that is not displayed
						// is told nothing about the box it will be seen in.
						reveal(place.station);
						api.focus(place.station, { highlight: true, popup: true });
					});
				});
			}
		}
		}
		if (!dataBase) buildPlaceList();

		// ---- the reader's two choices about the block ---------------------------
		//
		// Whether the model sits beside the article or takes the full width, and whether
		// the station list is shown at all. Both are the reader's, not the page's: a
		// narrow screen wants one thing and a wide one another, and somebody following a
		// trip report wants the model big while somebody looking up a pitch wants the
		// list. Remembered per browser, so the choice survives moving between pages.
		var block = host.closest ? host.closest('.cave_embed') : null;

		// Keyed by the embed as well as by the switch. The key used to be the switch
		// name alone, which is one setting shared by every embed and every page on the
		// site — two models on one page could not be laid out differently, and a third
		// switch would have collided with whatever a future page called its own. The old
		// key is still read when the new one has never been written, so nobody's
		// remembered layout is reset by this change.
		function storageKey(key) { return 'silexCaveEmbed.' + cfg.container + '.' + key; }

		function remember(key, value) {
			try { window.localStorage.setItem(storageKey(key), value ? '1' : '0'); }
			catch (e) { /* private browsing, or storage refused — the choice just won't stick */ }
		}

		function recall(key, fallback) {
			try {
				var v = window.localStorage.getItem(storageKey(key));
				if (v === null) v = window.localStorage.getItem('silexCaveEmbed.' + key);
				return v === null ? fallback : v === '1';
			} catch (e) { return fallback; }
		}

		/**
		 * Tells the viewer its box has changed shape.
		 *
		 * The renderer sizes its drawing surface to the container and only re-reads that
		 * on a window resize, so changing the layout from a switch leaves the model drawn
		 * at the old size — stretched or letterboxed inside the new box. Dispatching the
		 * event the viewer already listens for re-reads the container and redraws from
		 * the model it has, without going back to the network for the survey.
		 *
		 * Twice, either side of a frame: once for the layout the browser has just
		 * computed, and again after it has settled, because a CSS transition on the box
		 * means the first measurement is of a size it is still on its way to.
		 */
		function relayout() {
			var tell = function () { window.dispatchEvent(new Event('resize')); };
			window.requestAnimationFrame(tell);
			window.setTimeout(tell, 320);
		}

		var switchBar = null;

		/**
		 * Adds a choice to the row of switches, remembered per browser and per embed.
		 *
		 * Public, because a module loaded beside this one (the trips list) has choices of
		 * its own that belong in the same row: a second row of checkboxes somewhere else
		 * on the page would not read as being about this model.
		 *
		 * `apply` is called once with the remembered value before the reader touches
		 * anything, so the page opens in the state it was left in.
		 */
		api.addSwitch = function (key, label, fallback, apply) {
			if (!block || cfg.switches === false) return null;
			if (switchBar === null) {
				// Inside the block, as its first row, so the switches travel with the
				// thing they act on. Put before it they sat at the top of the article,
				// separated from the model by whatever the page had in between.
				switchBar = el('div', 'cave_embed_switches', null);
				block.insertBefore(switchBar, block.firstChild);
			}
			var wrap = el('label', 'cave_switch', switchBar);
			var box = document.createElement('input');
			box.type = 'checkbox';
			wrap.appendChild(box);
			wrap.appendChild(document.createTextNode(' ' + label));
			box.checked = recall(key, fallback);
			try { apply(box.checked); } catch (e) { console.warn('SilexCaveEmbed: switch "' + key + '":', e); }
			box.addEventListener('change', function () {
				remember(key, box.checked);
				try { apply(box.checked); } catch (e) { console.warn('SilexCaveEmbed: switch "' + key + '":', e); }
				relayout();
			});
			return box;
		};

		function buildSwitches() {
			if (!block || cfg.switches === false) return;

			api.addSwitch('wide', cfg.labels.wide, false, function (on) {
				block.classList.toggle('cave_embed--wide', on);
			});
			api.addSwitch('list', cfg.labels.list, true, function (on) {
				block.classList.toggle('cave_embed--nolist', !on);
			});

			// The page's language, small, at the end of the row: a press keeps the reader's
			// choice for every model on the site and opens the page again in it, since the
			// viewer itself is made in one language and cannot change it while it runs.
			if (cfg.languageSelector !== false && cfg.languages.length > 1 && switchBar) {
				var langs = el('span', 'cave_lang', switchBar);
				langs.setAttribute('role', 'group');
				langs.setAttribute('aria-label', cfg.labels.language);
				langs.title = cfg.labels.language;
				cfg.languages.forEach(function (code) {
					var b = el('button', 'cave_lang_choice', langs, String(code).toUpperCase());
					b.type = 'button';
					b.dataset.lang = code;
					b.lang = code;
					var current = String(cfg.language || '').slice(0, 2).toLowerCase() === String(code).toLowerCase();
					b.setAttribute('aria-pressed', current ? 'true' : 'false');
					if (current) b.classList.add('is_current');
					b.addEventListener('click', function () {
						if (current) return;
						try { window.localStorage.setItem(LANGUAGE_KEY, code); } catch (e) { /* not kept: this visit only */ }
						window.location.reload();
					});
				});
			}
		}

		buildSwitches();

		// ---- the line under the model ---------------------------------------------
		//
		// One small line saying what drew the model, with the application's name as a
		// link to where it lives. Made here rather than asked of the page, for the reason
		// the trips list is: markup in post content is what the block editor rewrites.
		var creditEl = null;
		(function () {
			if (!block || cfg.credit === false) return;
			creditEl = el('div', 'cave_embed_credit', block);
			var parts = String(cfg.labels.credit || '').split('{link}');
			creditEl.appendChild(document.createTextNode(parts[0] + (parts.length > 1 ? '' : ' ')));
			var a = el('a', null, creditEl, 'SilexGIS');
			a.href = CREDIT_URL;
			a.target = '_blank';
			a.rel = 'noopener';
			if (parts.length > 1) creditEl.appendChild(document.createTextNode(parts.slice(1).join('')));
		})();

		// ---- other views in the model's place --------------------------------------
		//
		// The model is one way of looking at the cave. A module loaded beside this one may
		// have another — a scanned map with the party on it, the figures of an expedition —
		// and it belongs in the same box, under the same switches and beside the same place
		// list, chosen by a tab. The row of tabs exists only once somebody adds one: a page
		// with the model alone looks as it always did.
		//
		// A view that is not shown is not drawn into: the model's box is taken out of the
		// layout while another view has its place, and told its box changed when it comes
		// back, since the renderer reads its size only then.
		var tabBar = null;
		var tabs = [];              // { key, button, pane, pairs, shows }
		var tabNow = 'model';
		var tabHandlers = [];
		// The one view, if any, that is shown beside another rather than in its place.
		var splitKey = null;
		// What that view stands beside: the model, or a view added as one that may have it
		// beside it (a scanned map). The last of them shown, so that the beside view's own
		// tab brings back the pair the reader was looking at.
		var splitWith = 'model';

		function tabOf(key) { return tabs.filter(function (t) { return t.key === key; })[0] || null; }

		function canPair(key) {
			if (key === 'model') return true;
			var t = tabOf(key);
			return Boolean(t && t.pairs);
		}

		function showTab(key) {
			if (!tabOf(key)) key = 'model';
			tabNow = key;
			// A view set to stand beside the model shares the row with it, and does whichever
			// of the two tabs is pressed: with that view switched on, the model's own tab is the
			// pair, not the model alone. Pressed back from a third view, the model's tab used to
			// bring the model alone, and the view the reader had asked to keep beside it was gone.
			// A view that may have it beside it (the map) makes the same pair with it.
			var hasSplit = splitKey !== null && Boolean(tabOf(splitKey));
			if (hasSplit && key !== splitKey && canPair(key)) splitWith = key;
			if (!tabOf(splitWith)) splitWith = 'model';
			var pair = hasSplit && (key === splitKey || canPair(key));
			var companion = pair ? splitWith : null;
			tabs.forEach(function (t) {
				var on = t.key === key || (pair && (t.key === companion || t.key === splitKey));
				t.button.classList.toggle('is_current', on);
				t.button.setAttribute('aria-selected', on ? 'true' : 'false');
				t.button.tabIndex = t.key === key ? 0 : -1;
				if (t.pane) {
					t.pane.hidden = !on;
					t.pane.classList.toggle('cave_embed_pane--beside', pair && t.key === splitKey);
				}
			});
			// The view beside stands after what it is beside, which is where the row puts the
			// smaller share: moved only when it is somewhere else, since moving a box that
			// scrolls takes it back to its top.
			if (pair) {
				var beside = tabOf(splitKey).pane;
				var after = companion === 'model' ? host : tabOf(companion).pane;
				if (beside && after && after.parentNode && after.nextSibling !== beside) {
					after.parentNode.insertBefore(beside, after.nextSibling);
				}
			}
			host.hidden = !(key === 'model' || (pair && companion === 'model'));
			if (block) {
				block.classList.toggle('cave_embed--other_view', host.hidden);
				block.classList.toggle('cave_embed--split', pair);
				block.classList.toggle('cave_embed--split_view', pair && companion !== 'model');
			}
			// The toolbar's strip is the model's: it goes with the model, and comes back with it
			// placed from the model's box as it is now.
			if (toolbarStrip) {
				toolbarStrip.hidden = host.hidden;
				if (!host.hidden) placeToolbarStrip();
			}
			if (!host.hidden) relayout();
			tabHandlers.forEach(function (fn) {
				try { fn(key); } catch (e) { console.warn('SilexCaveEmbed: tab "' + key + '":', e); }
			});
		}

		function tabButton(key, label) {
			var b = el('button', 'cave_embed_tab', tabBar, label);
			b.type = 'button';
			b.setAttribute('role', 'tab');
			b.dataset.tab = key;
			b.addEventListener('click', function () { showTab(key); });
			return b;
		}

		/**
		 * Adds a view beside the model and returns the element to draw it into, or null
		 * where the page has no block to put it in. Adding a key twice returns the first.
		 *
		 * `options.pairs`: the view set to stand beside another (setSplit) may stand beside
		 * this one as it does beside the model. `options.shows(station)`: whether this view,
		 * while it is open, can show the reader a place — a station, or with no station the
		 * party of a replay; a place asked for while a view that cannot is open is shown on
		 * the model instead (see reveal).
		 */
		api.addTab = function (key, label, options) {
			if (!block) return null;
			var had = tabOf(key);
			if (had) return had.pane;
			if (tabBar === null) {
				tabBar = el('div', 'cave_embed_tabs', null);
				tabBar.setAttribute('role', 'tablist');
				// Under the switches and above the row the list and the model share.
				var first = block.querySelector('.cave_embed_places') || host;
				block.insertBefore(tabBar, first);
				tabs.push({ key: 'model', button: tabButton('model', cfg.labels.tabModel), pane: null, pairs: true, shows: null });
			}
			var pane = el('div', 'cave_embed_pane', null);
			pane.dataset.pane = key;
			pane.hidden = true;
			block.insertBefore(pane, host.nextSibling);
			tabs.push({
				key: key, button: tabButton(key, label), pane: pane,
				pairs: Boolean(options && options.pairs),
				shows: options && typeof options.shows === 'function' ? options.shows : null
			});
			showTab(tabNow);
			return pane;
		};

		/**
		 * Whether a view stands beside the model when its tab is chosen, instead of in the
		 * model's place: one view at most. The model keeps the larger share of the row, and
		 * below the width where the block stacks the two are one under the other. It stands
		 * beside a view added with `pairs` in the same way.
		 */
		api.setSplit = function (key, on) {
			if (on) splitKey = key;
			else if (splitKey === key) splitKey = null;
			showTab(tabNow);
		};

		/** Whether a view is on the screen now: the one whose tab is chosen, or the one beside it. */
		api.isShown = function (key) {
			if (key === 'model') return !host.hidden;
			var t = tabOf(key);
			return Boolean(t && t.pane && !t.pane.hidden);
		};

		/** Shows one of the views; a key nobody added shows the model. */
		api.showTab = function (key) { showTab(key); };

		// ---- bringing the drawing to the reader ---------------------------------------
		//
		// A place chosen in the list, a link in the prose, a trip chosen from the list: each
		// asks to be seen on the drawing. On a desk the drawing stands beside what was pressed
		// and nothing has to move. On a telephone the block is stacked — the list under the
		// model, the article around both — and what was pressed is often a screen away from
		// the drawing, so the page is scrolled to it, once the view it is shown in has been
		// chosen and laid out.
		//
		// The view first. A place asked for while the figures or the log has the model's place
		// used to be flown to behind them: the camera moved for nobody, the scroll went to a
		// box that was not displayed and did nothing, and to the reader the link did nothing
		// at all. Now it is shown on the model, or on a view that is open and says it can show
		// it (the map, for a station it can place).
		function reveal(station) {
			if (host.hidden) {
				var able = tabs.some(function (t) {
					return t.pane && !t.pane.hidden && t.shows && t.shows(station || null);
				});
				if (!able) showTab('model');
			}
			bringIntoView();
		}

		// How much of the top of the window something fixed covers — a theme's header that
		// stays put while the page scrolls under it — so that a scroll to the drawing does not
		// leave its top behind that header.
		function coveredAtTop() {
			var cover = 0;
			try {
				var hits = document.elementsFromPoint ? document.elementsFromPoint((window.innerWidth || 0) / 2, 2) : [];
				hits.forEach(function (n) {
					if (block && block.contains(n)) return;
					var p = window.getComputedStyle(n).position;
					if (p === 'fixed' || p === 'sticky') cover = Math.max(cover, n.getBoundingClientRect().bottom);
				});
			} catch (e) { /* an older browser: no cover is assumed */ }
			return Math.max(0, Math.min(cover, (window.innerHeight || 0) / 3));
		}

		var revealFrame = 0;
		function bringIntoView() {
			if (!window.requestAnimationFrame) return;
			window.cancelAnimationFrame(revealFrame);
			// Two frames: the first lays out the view just chosen, the second measures it.
			revealFrame = window.requestAnimationFrame(function () {
				revealFrame = window.requestAnimationFrame(function () {
					revealFrame = 0;
					var shown = !host.hidden ? host : null;
					if (!shown) {
						var open = tabs.filter(function (t) { return t.pane && !t.pane.hidden; })[0];
						shown = open ? open.pane : null;
					}
					if (!shown) return;
					var r = shown.getBoundingClientRect();
					if (!r.height) return;
					var top = r.top;
					// The toolbar's strip stands over the model and is part of what is looked at.
					if (shown === host && toolbarStrip && !toolbarStrip.hidden) {
						var s = toolbarStrip.getBoundingClientRect();
						if (s.height) top = Math.min(top, s.top);
					}
					var cover = coveredAtTop();
					var view = (window.innerHeight || document.documentElement.clientHeight || 0) - cover;
					var height = r.bottom - top;
					var seen = Math.min(r.bottom, cover + view) - Math.max(top, cover);
					// Most of it on the screen already — a desk, where the list and the model
					// share a row — and nothing moves.
					if (seen >= Math.min(height, view) * 0.75) return;
					var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
					var y = (window.pageYOffset || document.documentElement.scrollTop || 0) + top - cover - 8;
					try {
						window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: still ? 'auto' : 'smooth' });
					} catch (e) {
						window.scrollTo(0, Math.max(0, Math.round(y)));
					}
				});
			});
		}
		api.reveal = reveal;
		api.bringIntoView = bringIntoView;

		/** A station's photographs as the page holds them: `[{ url, thumb, caption }]`. */
		api.stationPictures = function (station) {
			var held = cfg.pictures && cfg.pictures.byStation ? cfg.pictures.byStation[station] : null;
			return (held || []).map(function (entry) { return pictureOf(entry, cfg.pictures); });
		};

		// ---- the whole screen -------------------------------------------------------
		//
		// Two ways of taking the screen, both of the block and not of the model alone:
		// 'model' is the model with whatever a module keeps under it to drive it — the
		// replay's strip — and nothing else; 'all' is the block as it stands, its lists,
		// tabs and panels with it, laid out to the screen. The block is what the browser
		// is asked to show, because only what is inside the element shown is drawn: a
		// model on the whole screen with its replay left behind on the page is a film
		// with no way to stop it.
		//
		// Where the browser has no way to give an element the screen (a telephone's
		// Safari), the block is fixed over the page instead, which is the same thing
		// under the browser's own bars.
		var fsMode = null;
		var fsPseudo = false;
		var fsHandlers = [];
		// The height the page itself gave the block (the shortcode's height="…" is written
		// on the element), kept while the whole-panel mode writes its own over it.
		var fsHeightWas = null;

		function fsElement() {
			return document.fullscreenElement || document.webkitFullscreenElement || null;
		}

		function fsFit() {
			if (!block) return;
			if (fsMode !== 'all') {
				if (fsHeightWas !== null) {
					if (fsHeightWas) block.style.setProperty('--cave-embed-height', fsHeightWas);
					else block.style.removeProperty('--cave-embed-height');
					fsHeightWas = null;
				}
				return;
			}
			if (fsHeightWas === null) fsHeightWas = block.style.getPropertyValue('--cave-embed-height') || '';
			// The row of the model and its lists takes what the rows above and below it
			// leave of the screen.
			var taken = 0;
			// (Not the toolbar's strip: it stands in the top of the model's own share.)
			['.cave_embed_switches', '.cave_embed_tabs', '.cave_trips_bar', '.cave_embed_credit'].forEach(function (sel) {
				var part = block.querySelector(':scope > ' + sel);
				if (part && !part.hidden && part.offsetParent !== null) taken += part.getBoundingClientRect().height + 8;
			});
			// The block's own padding, top and bottom, and the last row's gap: without them the
			// block was a few pixels taller than the screen and scrolled by that much.
			var room = Math.max(240, Math.floor(window.innerHeight - taken - 34));
			block.style.setProperty('--cave-embed-height', room + 'px');
		}

		function fsApply(mode, pseudo) {
			fsMode = mode;
			fsPseudo = Boolean(mode) && Boolean(pseudo);
			if (block) {
				block.classList.toggle('cave_embed--fs', Boolean(mode));
				block.classList.toggle('cave_embed--fs_model', mode === 'model');
				block.classList.toggle('cave_embed--fs_all', mode === 'all');
				block.classList.toggle('cave_embed--fs_pseudo', fsPseudo);
			}
			document.documentElement.classList.toggle('cave_embed_fs_lock', fsPseudo);
			fsFit();
			relayout();
			// Once more when the screen has settled: the browser's own animation into
			// fullscreen is over a little after the event that announces it.
			window.setTimeout(function () { fsFit(); relayout(); }, 420);
			fsHandlers.forEach(function (fn) {
				try { fn(fsMode); } catch (e) { console.warn('SilexCaveEmbed: fullscreen:', e); }
			});
		}

		function onFsChange() {
			if (fsPseudo) return;
			// Left by the reader's Escape, or taken by something else: the block is the
			// page's again.
			if (fsMode && fsElement() !== block) fsApply(null, false);
		}
		document.addEventListener('fullscreenchange', onFsChange);
		document.addEventListener('webkitfullscreenchange', onFsChange);

		function onFsKey(ev) {
			if (fsPseudo && (ev.key === 'Escape' || ev.key === 'Esc')) api.fullscreen(null);
		}
		document.addEventListener('keydown', onFsKey);
		window.addEventListener('resize', function () { if (fsMode === 'all') fsFit(); });

		/**
		 * Gives the block the whole screen — 'model' or 'all' — or, with nothing, gives
		 * it back. Asking for the mode it is in gives it back too, so one button is both.
		 */
		api.fullscreen = function (mode) {
			if (!block) return null;
			var want = mode === 'model' || mode === 'all' ? mode : null;
			if (want === fsMode) want = null;
			if (!want) {
				var was = fsPseudo;
				if (!was && fsElement() === block) {
					var leave = document.exitFullscreen || document.webkitExitFullscreen;
					if (leave) { try { leave.call(document); } catch (e) { /* already out */ } }
				}
				fsApply(null, false);
				return null;
			}
			// From one mode straight to the other the screen is already the block's.
			if (fsMode && (fsPseudo || fsElement() === block)) { fsApply(want, fsPseudo); return want; }
			var ask = block.requestFullscreen || block.webkitRequestFullscreen;
			if (!ask) { fsApply(want, true); return want; }
			fsApply(want, false);
			try {
				var asked = ask.call(block);
				if (asked && typeof asked.catch === 'function') {
					// Refused — not from a press, or not allowed in this frame: over the
					// page instead, which needs nobody's leave.
					asked.catch(function () { if (fsMode === want) fsApply(want, true); });
				}
			} catch (e) {
				fsApply(want, true);
			}
			return want;
		};

		/** Told 'model', 'all' or null each time the block takes or gives back the screen. */
		api.onFullscreen = function (fn) { if (typeof fn === 'function') fsHandlers.push(fn); };

		Object.defineProperty(api, 'fullscreenMode', { get: function () { return fsMode; } });

		/**
		 * How large the survey's own writing is drawn, changed while the model is up
		 * where the viewer can do that; false where it cannot, and the size is then the
		 * one the page was built with.
		 */
		api.setLabelScale = function (scale) {
			var n = Number(scale);
			if (!(n > 0) || !('stationLabelScale' in viewer)) return false;
			// The viewer multiplies whatever size it was built with, which is already the
			// page's scale where the page gave one: asked for relative to the viewer's own.
			var built = labelSizeFor(cfg.labelScale) || VIEWER_LABEL_PX;
			var size = labelSizeFor(n) || VIEWER_LABEL_PX;
			viewer.stationLabelScale = size / built;
			return true;
		};

		/** Told the key of the view each time one is shown. */
		api.onTab = function (fn) { if (typeof fn === 'function') tabHandlers.push(fn); };

		Object.defineProperty(api, 'tab', { get: function () { return tabNow; } });

		// ---- links in the prose -------------------------------------------------
		//
		// Anchors carry the station in a data attribute rather than an onclick or a
		// javascript: href, both of which WordPress strips from post content.
		// The two spellings an author may use, and they mean the same thing.
		//
		// `data-selection` is this page's own, and `data-silexgis-*` is the vocabulary the
		// SilexGIS published-trip embed already understands. Accepting both means an
		// editor writes one kind of link whichever viewer the article ends up carrying,
		// which is the whole reason for taking the longer spelling on as well.
		var LINK_SELECTOR = [
			'a.cv_goto[data-selection]',
			'a.cv_goto[data-trip]', 'a.cv_goto[data-caver]', 'a.cv_goto[data-team]',
			'a[data-silexgis-station]', 'a[data-silexgis-survey]', 'a[data-silexgis-caver]',
			'a[data-silexgis-team]', 'a[data-silexgis-trip]', 'a[data-silexgis-moment]',
			'a[data-silexgis-play]'
		].join(', ');

		// An empty value is a value: `data-silexgis-team=""` names the members of the
		// party who are on no team, which is not the same as naming no team at all. So
		// presence is tested rather than truthiness, and null means the attribute is
		// absent.
		function attr(a, name) {
			if (a.hasAttribute('data-silexgis-' + name)) return a.getAttribute('data-silexgis-' + name);
			if (a.hasAttribute('data-' + name)) return a.getAttribute('data-' + name);
			return null;
		}

		/** What a link in the prose is asking for. */
		function linkSpec(a) {
			var station = attr(a, 'station');
			var survey = attr(a, 'survey');
			return {
				element: a,
				// `data-selection` names a station or a section and cannot be told which
				// by looking; the explicit attributes say which they are.
				selection: a.getAttribute('data-selection') || station || survey || null,
				station: station,
				survey: survey,
				caver: attr(a, 'caver'),
				team: attr(a, 'team'),
				trip: attr(a, 'trip'),
				moment: attr(a, 'moment'),
				// Whether following this link should start the replay running, left null
				// where the link says nothing so that whoever handles it keeps deciding
				// for itself. Present so an article can write "watch the descent" beside
				// "where they were at 10:05" and have the two behave differently — the
				// first is an invitation to sit and watch, the second a place in time to
				// look at, and a replay that started itself under the second would carry
				// the reader away from what they asked to see.
				play: attr(a, 'play'),
				view: a.getAttribute('data-view')
			};
		}

		// Handlers registered by modules loaded beside this one, tried in order. The first
		// to return true has dealt with the link. Registered rather than hard-coded so
		// that a page without the trips module behaves exactly as it did before it existed.
		var linkHandlers = [];

		api.onLink = function (fn) { if (typeof fn === 'function') linkHandlers.push(fn); };

		// Handlers told when the reader picks a place in the page's list of places.
		var placeHandlers = [];
		api.onPlace = function (fn) { if (typeof fn === 'function') placeHandlers.push(fn); };

		api.followLink = function (spec) {
			for (var i = 0; i < linkHandlers.length; i++) {
				try {
					if (linkHandlers[i](spec) === true) return true;
				} catch (e) {
					console.warn('SilexCaveEmbed: a link handler failed:', e);
				}
			}
			if (!spec.selection) return false;
			api.focus(spec.selection, { highlight: true, popup: true });
			return true;
		};

		function bindProseLinks() {
			var n = 0;
			[].forEach.call(document.querySelectorAll(LINK_SELECTOR), function (a) {
				// A link may name which model it drives; on a page with two, one embed must
				// not answer for the other. Unnamed links belong to the first embed created,
				// which is what a single-model page has.
				var wants = a.getAttribute('data-scene') || a.getAttribute('data-silexgis-target');
				if (wants && wants !== cfg.container) return;
				if (!wants && REGISTRY.first && REGISTRY.first !== cfg.container) return;
				if (a.dataset.silexBound) return;
				a.dataset.silexBound = '1';
				n++;
				a.addEventListener('click', function (e) {
					var spec = linkSpec(a);
					// A link nothing can act on is left as the ordinary link it is, rather
					// than being swallowed into doing nothing visible.
					//
					// A link may be about the replay alone: `data-silexgis-play` by itself
					// ("start the replay"), a moment by itself ("where they were at 10:05"),
					// or an empty team, which names the members of the party on no team.
					// Those are tested by presence, an empty value being a value. They used
					// to fall through here untaken, so the click went to the link's own href
					// and nothing on the model moved. They are taken only where a module that
					// handles links is loaded, since nothing in this file acts on them.
					var aboutReplay = spec.team !== null || spec.moment !== null || spec.play !== null;
					if (!spec.selection && !spec.trip && !spec.caver
							&& !(aboutReplay && linkHandlers.length)) {
						return;
					}
					e.preventDefault();
					reveal(spec.selection || null);
					// data-view lets a link say how to look at the place as well as where
					// it is — "see this in plan" — which the presentation page's links use.
					if (spec.view) {
						if (window.CV2[spec.view] !== undefined) {
							setView(window.CV2[spec.view]);
						} else {
							console.warn('SilexCaveEmbed: unknown view "' + spec.view + '"');
						}
					}
					api.followLink(spec);
				});
			});
			return n;
		}
		bindProseLinks();
		api.bindLinks = bindProseLinks;

		/* The links should not wait for 21 MB of survey.
		 *
		 * Two of the three sources are already in hand when this file runs: the named
		 * places in the page's own config, and the alias table the admin screen prints
		 * onto the page. Only the surveyors' station comments, and the depths measured
		 * from the survey, need the download. So the text is linked twice — now, with
		 * what is known, and again when the survey lands. The engine skips text it has
		 * already linked, so the second pass only adds what the first could not know.
		 */
		function earlyAutolink() {
			if (loaded) return;                 // survey beat us to it; the other pass covers it
			try { api.autolink(); } catch (e) { console.warn('SilexCaveEmbed: early autolink failed:', e); }
		}
		// From a data set the places are not known until it is read (see below).
		if (!dataBase) window.setTimeout(earlyAutolink, 0);

		/* ---- automatic links in the prose ---------------------------------------
		 *
		 * Runs once the survey is in, because the surveyors' own station comments are
		 * one of the sources and they arrive with it. Anchors this produces are the
		 * same anchors a person would have typed, so binding them is the same call.
		 */
		api.autolink = function (extra) {
			var opts = cfg.autolink;
			if (!opts || opts.enabled === false) return null;
			if (!window.SilexCaveAutolink) {
				console.warn('SilexCaveEmbed: autolink requested but text-autolink.js is not loaded');
				return null;
			}
			Object.keys(extra || {}).forEach(function (k) { opts[k] = extra[k]; });

			// Switches set in the WordPress admin win over the page's config: the person
			// turning a source off there is doing it precisely because the page said yes.
			var sw = window.SilexCaveAutolinkSwitches;
			if (sw) {
				if (sw.enabled === false) return null;
				['comments', 'aliases', 'depths'].forEach(function (k) {
					if (sw[k] !== undefined) opts[k] = Boolean(sw[k]);
				});
			}

			// A label like "Upper entrance - 0m" names a place and then says
			// how deep it is; only the first half is the name.
			function nameOf(label) {
				return String(label || '').split(/\s+[-–—]\s+/)[0].replace(/\s*\(.*?\)\s*$/, '').trim();
			}

			var entries = [], depthIndex = [];

			// Resolving a station path: the tree offers two lookups and only one of them
			// copes with station names that themselves contain dots, so try that first.
			var tree = null;
			try { tree = viewer.getSurveyTree(); } catch (e) {}
			function node(path) {
				if (!tree) return null;
				try { if (tree.getByPathEx) return tree.getByPathEx(path); } catch (e) {}
				try { return tree.getByPath(path); } catch (e) {}
				return null;
			}

			// The entrance, so depths read the way the text writes them: metres below it.
			var entranceZ;
			var entrancePlace = (cfg.places || []).filter(function (p) { return p.depth === 0; })[0];
			if (entrancePlace) {
				var en = node(entrancePlace.station);
				if (en && en.z !== undefined) entranceZ = en.z;
			}

			(cfg.places || []).forEach(function (place) {
				if (!place.station) return;
				if (place.depth !== undefined && place.depth !== null) {
					depthIndex.push({ station: place.station, depth: Number(place.depth), label: place.label });
				} else if (entranceZ !== undefined) {
					// Most places carry a free-text note ("601/0 - 619") rather than a depth,
					// which is unusable as a number — but the survey knows where the station
					// is, so the depth can simply be measured. Without this the depth index
					// is only the handful of named landmarks and a written "-815 m" finds
					// nothing to point at.
					var n = node(place.station);
					if (n && n.z !== undefined) {
						depthIndex.push({ station: place.station, depth: Math.round(entranceZ - n.z), label: place.label });
					}
				}
				if (opts.names === false) return;
				if (opts.namesFrom === 'landmarks' && !place.landmark) return;
				var name = nameOf(place.label);
				if (name) entries.push({ station: place.station, names: [name], depth: place.depth, label: name });
			});

			// The survey's own comments: free, and correct for whatever survey is loaded.
			if (opts.comments !== false && loaded && tree) {
				try {
					var pathOf = function (n) {
						var parts = [], c = n;
						while (c && c.parent) { parts.unshift(String(c.name)); c = c.parent; }
						return parts.join('.');
					};
					var got = window.SilexCaveAutolink.fromSurvey(tree, { pathOf: pathOf, entranceZ: entranceZ });
					got.entries.forEach(function (e) {
						var already = entries.filter(function (x) { return x.station === e.station; })[0];
						if (already) {
							e.names.forEach(function (n) {
								if (already.names.indexOf(n) === -1) already.names.push(n);
							});
						} else entries.push(e);
					});
					if (entranceZ !== undefined) {
						got.depthIndex.forEach(function (d) {
							if (!depthIndex.some(function (x) { return x.station === d.station; })) depthIndex.push(d);
						});
					}
				} catch (e) {
					console.warn('SilexCaveEmbed: could not read station comments for autolink:', e);
				}
			}

			// The editable table, from the WordPress admin or anywhere else that sets it.
			if (opts.aliases !== false) {
				var rows = (opts.entries || []).slice();
				var store = window.SilexCaveAliases;
				if (store) {
					var mine = store[cfg.survey] || store[cfg.container] || store['*'] || null;
					if (Array.isArray(mine)) rows = rows.concat(mine);
					else if (Array.isArray(store)) rows = rows.concat(store);
				}
				window.SilexCaveAutolink.merge(entries, rows);

				// A depth given in the alias table is also a fact about where that station
				// is, so it belongs in the index that answers "-815 m" — otherwise the row
				// names the place but the number beside it still finds nothing.
				entries.forEach(function (e) {
					if (e.depth === undefined || e.depth === null) return;
					if (depthIndex.some(function (d) { return d.station === e.station; })) return;
					depthIndex.push({ station: e.station, depth: Number(e.depth), label: e.label });
				});
			}

			var result = window.SilexCaveAutolink.run({
				root: opts.root,
				entries: entries,
				minLength: opts.minLength,
				limitPerName: opts.limitPerName,
				limitPerBlock: opts.limitPerBlock,
				depths: opts.depths === false ? null
					: { enabled: true, index: depthIndex, tolerance: opts.depthTolerance },
				title: function (entry) {
					return entry.depth !== undefined && entry.depth !== null
						? entry.label + ' (−' + entry.depth + ' m)' : entry.label;
				}
			});
			result.bound = bindProseLinks();
			return result;
		};

		/* ---- the cave from a data set ---------------------------------------------
		 *
		 * What the set says is taken where the page said nothing of its own: the survey, its
		 * places, its photographs. Addresses in the set are the set's — relative to its
		 * directory — and an address that is not one a browser fetches is left out, since a
		 * photograph's address ends up as a link a reader opens.
		 */
		function adoptCave(doc) {
			var resolve = function (path) {
				if (!path) return null;
				path = String(path);
				// An address with a scheme of its own, or from the site's root, is taken as it is
				// and kept only if a browser fetches it; any other is the set's own.
				var url = /^[a-z][a-z0-9+.-]*:/i.test(path) || path.charAt(0) === '/' ? path : dataBase + path;
				return fetchable(url) ? url : null;
			};
			if (surveyFromData && doc.survey && doc.survey.file && /^[^?#]+\.(lox|3d|plt)$/i.test(String(doc.survey.file))) {
				cfg.survey = String(doc.survey.file);
			}
			if (!(config && config.places) && Array.isArray(doc.places)) {
				cfg.places = doc.places.filter(function (p) { return p && p.station && p.label; }).map(function (p) {
					var place = { label: String(p.label), station: String(p.station) };
					if (p.depth !== undefined && p.depth !== null && isFinite(Number(p.depth))) place.depth = Number(p.depth);
					if (p.note) place.note = String(p.note);
					if (p.landmark) place.landmark = true;
					return place;
				});
			}
			if (!(config && config.pictures) && Array.isArray(doc.pictures) && doc.pictures.length) {
				var byStation = {};
				doc.pictures.forEach(function (p) {
					if (!p || !p.station) return;
					var url = resolve(p.file || p.url);
					if (!url) return;
					(byStation[p.station] = byStation[p.station] || []).push({
						url: url, thumb: resolve(p.thumbnail || p.thumb) || url, caption: p.caption ? String(p.caption) : ''
					});
				});
				cfg.pictures = { root: '', thumbnails: '', byStation: byStation };
			}
		}

		var dataGone = false;
		teardown.push(function () { dataGone = true; });
		var dataReady = dataBase ? readCave(dataBase).then(function (doc) {
			if (dataGone) return null;
			if (doc) adoptCave(doc);
			if (surveyFromData) {
				if (cfg.survey) ui.loadCaveList([cfg.survey]);
				else { standing = cfg.labels.noData; say(standing); }
			}
			holdStationMedia();
			buildPlaceList();
			earlyAutolink();
			return doc;
		}) : Promise.resolve(null);
		/** Settled once the data set, where there is one, has been read and taken in. */
		api.dataReady = dataReady;

		/* ---- the cave's trips, if this page has any ------------------------------
		 *
		 * A separate file, so a page that shows a cave and no trips loads none of it and
		 * this one stays readable. It is given the api rather than the closure: every
		 * seam above exists because that module needed it, and nothing else reaches in.
		 */
		if (cfg.trips) {
			if (window.SilexCaveTrips) {
				try {
					api.trips = window.SilexCaveTrips.attach(api, cfg.trips);
				} catch (err) {
					console.warn('SilexCaveEmbed: the trips module failed to start:', err);
				}
			} else {
				console.warn('SilexCaveEmbed: trips are configured but cave-trips.js is not loaded');
			}
		}

		return api;
	}

	window.SilexCaveEmbed = {
		create: create,
		/** An embed by its container id, or the first one made. */
		get: function (id) { return id ? REGISTRY.byId[id] : REGISTRY.byId[REGISTRY.first]; },
		instances: REGISTRY.byId
	};
})(window, document);
