/* ==========================================================================
 * SilexCaveAutolink — turn place names written in ordinary prose into links
 * that drive the 3D model.
 *
 * A trip report says "we went down to the Upper aven" and "the sump at
 * -815 m". Until now somebody had to go back through the text by hand and wrap
 * each of those in an anchor carrying a station path. This does it at display
 * time instead, so the author writes normally and the links appear.
 *
 * It emits exactly the anchors a hand-written page would have —
 * <a class="cv_goto" data-selection="…"> — so everything downstream (the click
 * binding, the zoom, the highlight) is the code that already existed. It adds
 * data-autolink="1" so a reader's stylesheet, or a later pass, can tell which
 * links a person wrote and which this produced.
 *
 * THREE SOURCES OF NAMES, each independently switchable:
 *
 *   comments  the surveyors' own station comments, read out of the loaded
 *             survey. This is the vocabulary the cave is actually discussed
 *             in, and it costs nothing to maintain because it travels with
 *             the survey file.
 *   aliases   an explicit station -> [names] table, for spellings the survey
 *             does not carry ("U.A.", "the upper aven", "top camp").
 *             Edited in the WordPress admin, or served as JSON by anything
 *             else — the shape is deliberately portable.
 *   depths    "-815 m" and similar, matched to the nearest known station at
 *             that depth. In an exploration journal this is how most places
 *             get referred to, so it is where most of the value is.
 *
 * A fourth source lives elsewhere and drives this engine through the same
 * options: the trips module hands it the party of every published trip, so a
 * caver's name written in the prose becomes a link that selects their trip and
 * follows them through it. It is not a source of *places*, which is why it is
 * not in the list above — what it needs from this file is the matching, the
 * word boundaries and the per-block limits, and it supplies its own vocabulary
 * and its own attributes.
 *
 * WHAT IT REFUSES TO DO
 *
 * It never touches text inside an existing link, a heading that is itself a
 * link, script/style/code/pre, the model's own interface, or anything under
 * [data-no-autolink]. It links a given name a limited number of times (once
 * per paragraph, twice per page by default) because a page where every
 * occurrence of a common word is blue reads worse than one with no links at
 * all. And it is idempotent: running it again after more text arrives links
 * only what is new.
 *
 * DIACRITICS
 *
 * Romanian is written with and without them, often in the same post: Sala Mare
 * / sala mare, Fântâna / fantana, Zig-zag / zig zag. Matching is done on a version
 * of the text with diacritics stripped and whitespace collapsed, carrying an
 * index map so the ORIGINAL characters are what ends up inside the link.
 * ========================================================================== */
(function (window, document) {
	'use strict';

	var BLOCKS = 'P,LI,H1,H2,H3,H4,H5,H6,TD,TH,DD,DT,BLOCKQUOTE,FIGCAPTION';
	var NEVER  = 'A,SCRIPT,STYLE,CODE,PRE,TEXTAREA,BUTTON,SELECT,OPTION,LABEL,SVG';

	var DEFAULTS = {
		root: null,                  // Element or selector; document.body if absent
		entries: [],                 // [{ station, names:[…], depth?, label? }]
		linkClass: 'cv_goto',
		dataAttr: 'data-selection',
		skip: ['.cave_embed', '.cave_points_table', '.cave_places_list', '[data-no-autolink]'],
		limitPerName: 2,             // 0 = unlimited
		limitPerBlock: 1,            // 0 = unlimited
		minLength: 3,                // never auto-link something shorter than this
		depths: null,                // { index:[{station,depth}], tolerance, enabled }
		title: null,                 // function(entry) -> link title attribute
		mark: true
	};

	/**
	 * Lowercased, diacritic-free copy of a string, plus a map from each position
	 * in that copy back to the position it came from in the original.
	 *
	 * Needed because matching happens on the normalised text but the link has to
	 * wrap the original characters — "Fântâna Mare" must stay spelled the way
	 * the author spelled it.
	 */
	/**
	 * The name a vocabulary is keyed by: folded, undiacriticked, whitespace collapsed.
	 *
	 * Exported because a caller building entries has to group its own by the same key the
	 * engine will use. Grouping by the raw string instead leaves two spellings of one name
	 * looking like two people to the caller and one to the engine, which is how a collision
	 * becomes silent.
	 */
	function nameKey(raw) {
		return normalize(String(raw)).text.replace(/\s+/g, ' ').trim();
	}

	/** What makes two entries the same link: where it points, and everything it carries. */
	function identityOf(entry) {
		var attrs = entry.attrs || {};
		return String(entry.station) + '\u0000' + Object.keys(attrs).sort().map(function (k) {
			return k + '=' + attrs[k];
		}).join('\u0001');
	}

	function normalize(text) {
		var out = '', map = [], i, k, d;
		for (i = 0; i < text.length; i++) {
			d = text[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
			for (k = 0; k < d.length; k++) { out += d[k]; map.push(i); }
		}
		map.push(text.length);
		return { text: out, map: map };
	}

	function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

	/** A name becomes a pattern whose internal spaces match any run of whitespace,
	 *  so a name broken across a line still matches. */
	function pattern(name) {
		return name.split(/\s+/).map(escapeRe).join('\\s+');
	}

	function isWordChar(c) { return c !== undefined && /[a-z0-9]/.test(c); }

	function closest(node, sel) {
		var e = node.nodeType === 1 ? node : node.parentNode;
		while (e && e.nodeType === 1) {
			if (e.matches && e.matches(sel)) return e;
			e = e.parentNode;
		}
		return null;
	}

	/** Text nodes under root that are allowed to be rewritten. */
	function textNodes(root, skipSel) {
		var out = [];
		var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: function (n) {
				if (!n.nodeValue || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
				if (closest(n, NEVER)) return NodeFilter.FILTER_REJECT;
				if (skipSel && closest(n, skipSel)) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			}
		});
		var n;
		while ((n = walk.nextNode())) out.push(n);
		return out;
	}

	/**
	 * Rewrites one text node, wrapping each accepted match in an anchor.
	 * `find` returns [{start, end, entry}] over the ORIGINAL string, sorted and
	 * non-overlapping.
	 */
	function rewrite(node, hits, cfg) {
		var frag = document.createDocumentFragment();
		var text = node.nodeValue;
		var at = 0, i, h, a;
		for (i = 0; i < hits.length; i++) {
			h = hits[i];
			if (h.start > at) frag.appendChild(document.createTextNode(text.slice(at, h.start)));
			a = document.createElement('a');
			if (cfg.linkClass) a.className = cfg.linkClass;
			a.setAttribute(cfg.dataAttr, h.entry.station);
			a.setAttribute('href', '#');
			// Attributes an entry carries of its own, written beside the one above.
			//
			// A place needs one attribute: which station it is. A person needs two — which
			// person, and which trip they are that person on, since the same name appears in
			// several trips of one expedition and a link that named only the person would
			// follow them in whichever trip happened to be open. Rather than teach this
			// engine what a trip is, an entry may carry whatever attributes its own source
			// thinks the link needs.
			if (h.entry.attrs) {
				Object.keys(h.entry.attrs).forEach(function (k) {
					if (h.entry.attrs[k] !== null && h.entry.attrs[k] !== undefined) {
						a.setAttribute(k, String(h.entry.attrs[k]));
					}
				});
			}
			if (cfg.mark) a.setAttribute('data-autolink', '1');
			if (cfg.title) {
				var t = cfg.title(h.entry);
				if (t) a.setAttribute('title', t);
			}
			a.appendChild(document.createTextNode(text.slice(h.start, h.end)));
			frag.appendChild(a);
			at = h.end;
		}
		if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
		node.parentNode.replaceChild(frag, node);
	}

	function run(options) {
		var cfg = {};
		Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
		Object.keys(options || {}).forEach(function (k) { cfg[k] = options[k]; });

		var root = cfg.root;
		if (typeof root === 'string') root = document.querySelector(root);
		if (!root) root = document.body;
		if (!root) return { linked: 0, names: 0 };

		var skipSel = (cfg.skip || []).join(',') || null;

		/* ---- vocabulary -------------------------------------------------------
		 * One entry may answer to several names; several entries must never answer
		 * to the SAME name, because then a link would be a guess. A name claimed
		 * twice is dropped and reported rather than resolved arbitrarily. */
		var byName = {}, ambiguous = {};
		(cfg.entries || []).forEach(function (entry) {
			(entry.names || []).forEach(function (raw) {
				var n = nameKey(raw);
				if (n.length < cfg.minLength) return;
				// Two entries under one name collide unless they are the same link in every
				// respect. Comparing the station alone let a second entry with the same
				// station and *different attributes* overwrite the first silently — which on
				// a page about an expedition is one person's name linked to whichever trip
				// the caller happened to list last, the wrong statement the attributes exist
				// to prevent.
				if (byName[n] && identityOf(byName[n]) !== identityOf(entry)) {
					ambiguous[n] = true;
					return;
				}
				byName[n] = entry;
			});
		});
		Object.keys(ambiguous).forEach(function (n) { delete byName[n]; });

		// Longest first, so "Upper aven foot" wins over "Upper aven" at the same
		// position — JS alternation takes the first branch that matches.
		var names = Object.keys(byName).sort(function (a, b) { return b.length - a.length; });
		var re = names.length
			? new RegExp(names.map(pattern).join('|'), 'g')
			: null;

		/* ---- depths ----------------------------------------------------------- */
		var depthIndex = (cfg.depths && cfg.depths.enabled !== false && cfg.depths.index) || null;
		var depthTol = (cfg.depths && cfg.depths.tolerance) || 8;
		// A sign is required: "815 m" of rope is not a place, "-815 m" is.
		var depthRe = /[-‐‑‒–—−]\s?(\d{2,4})(?:[.,]\d+)?\s*m(?![a-zà-ɏ])/gi;

		function nearestAtDepth(d) {
			var best = null, bestGap = Infinity, i, gap;
			for (i = 0; i < depthIndex.length; i++) {
				gap = Math.abs(depthIndex[i].depth - d);
				if (gap < bestGap) { bestGap = gap; best = depthIndex[i]; }
			}
			return bestGap <= depthTol ? best : null;
		}

		var usedByName = {};          // key -> links already made on this page
		var usedInBlock = new Map();  // block element -> { key: count within it }
		var linked = 0;

		/** How many further links this key is still allowed, page and block together. */
		function remaining(key, block) {
			var byPage = cfg.limitPerName ? cfg.limitPerName - (usedByName[key] || 0) : Infinity;
			var counts = block ? usedInBlock.get(block) : null;
			var byBlock = cfg.limitPerBlock
				? cfg.limitPerBlock - ((counts && counts[key]) || 0) : Infinity;
			return Math.max(0, Math.min(byPage, byBlock));
		}

		function allow(key, block) {
			if (cfg.limitPerName && (usedByName[key] || 0) >= cfg.limitPerName) return false;
			if (cfg.limitPerBlock && block) {
				var counts = usedInBlock.get(block);
				if (counts && (counts[key] || 0) >= cfg.limitPerBlock) return false;
			}
			return true;
		}

		// Called only for hits that survived the overlap pass, so a name's allowance is
		// never spent on a match that was then discarded.
		function take(key, block) {
			usedByName[key] = (usedByName[key] || 0) + 1;
			if (block) {
				if (!usedInBlock.has(block)) usedInBlock.set(block, {});
				var counts = usedInBlock.get(block);
				counts[key] = (counts[key] || 0) + 1;
			}
			linked++;
		}

		textNodes(root, skipSel).forEach(function (node) {
			var original = node.nodeValue;
			var norm = normalize(original);
			var block = closest(node, BLOCKS);
			var hits = [];
			var pending = {};   // matches accepted within THIS node, not yet committed
			var m, key, entry, s, e;

			if (re) {
				re.lastIndex = 0;
				while ((m = re.exec(norm.text)) !== null) {
					s = m.index; e = s + m[0].length;
					// Whole words only. Checked here rather than with lookarounds in the
					// pattern, which Safari only learned recently.
					if (isWordChar(norm.text[s - 1]) || isWordChar(norm.text[e])) continue;
					key = m[0].replace(/\s+/g, ' ');
					entry = byName[key];
					if (!entry) continue;
					if (!allow(key, block) || (pending[key] || 0) >= remaining(key, block)) continue;
					pending[key] = (pending[key] || 0) + 1;
					hits.push({ start: norm.map[s], end: norm.map[e], entry: entry, key: key, block: block });
				}
			}

			if (depthIndex) {
				depthRe.lastIndex = 0;
				while ((m = depthRe.exec(original)) !== null) {
					s = m.index; e = s + m[0].length;
					var overlaps = hits.some(function (h) { return s < h.end && e > h.start; });
					if (overlaps) continue;
					var found = nearestAtDepth(parseInt(m[1], 10));
					if (!found) continue;
					key = 'depth:' + m[1];
					if (!allow(key, block) || (pending[key] || 0) >= remaining(key, block)) continue;
					pending[key] = (pending[key] || 0) + 1;
					hits.push({ start: s, end: e, entry: found, key: key, block: block });
				}
			}

			if (!hits.length) return;
			hits.sort(function (a, b) { return a.start - b.start; });
			// Drop anything that overlaps a hit already kept (names vs depths).
			var keep = [], last = -1;
			hits.forEach(function (h) { if (h.start >= last) { keep.push(h); last = h.end; } });
			keep.forEach(function (h) { take(h.key, h.block); });
			rewrite(node, keep, cfg);
		});

		return {
			linked: linked,
			names: names.length,
			ambiguous: Object.keys(ambiguous),
			depthsUsed: depthIndex ? depthIndex.length : 0
		};
	}

	/**
	 * Builds the vocabulary from a loaded survey: every station the surveyors
	 * commented becomes an entry named by its comment, with its depth below the
	 * entrance. Merged with an explicit alias table when one is supplied.
	 *
	 * `tree` is the viewer's survey tree; `entranceZ` the z of the station the
	 * surveyors commented as the entrance, so depths come out positive-downwards
	 * the way the text writes them.
	 */
	function fromSurvey(tree, opts) {
		opts = opts || {};
		var entries = [], index = [];
		var seen = {};
		var strip = function (s) {
			// Comments carry their own punctuation: "Big shaft - 138 m", "bivuac (2019)".
			return String(s).split(/\s+[-–]\s+/)[0].replace(/\s*\(.*?\)\s*$/, '').trim();
		};
		try {
			tree.traverse(function (node) {
				if (!node || !node.comment) return;
				var path = typeof node.getPath === 'function' ? node.getPath() : null;
				if (!path && opts.pathOf) path = opts.pathOf(node);
				if (!path) return;
				var name = strip(node.comment);
				if (!name || seen[path]) return;
				seen[path] = true;
				var depth = (opts.entranceZ !== undefined && node.z !== undefined)
					? Math.round(opts.entranceZ - node.z) : undefined;
				if (opts.names !== false) entries.push({ station: path, names: [name], depth: depth, label: name });
				if (depth !== undefined) index.push({ station: path, depth: depth, label: name });
			});
		} catch (e) {
			console.warn('SilexCaveAutolink: could not read the survey tree:', e);
		}
		return { entries: entries, depthIndex: index };
	}

	/** Merges alias rows into a vocabulary, adding names to an existing station
	 *  entry rather than creating a competing one. */
	function merge(entries, aliases) {
		var byStation = {};
		entries.forEach(function (e) { byStation[e.station] = e; });
		(aliases || []).forEach(function (row) {
			if (!row || !row.station || row.enabled === false) return;
			var names = Array.isArray(row.names) ? row.names
				: String(row.names || '').split(/\s*[|;,]\s*/);
			names = names.map(function (s) { return String(s).trim(); }).filter(Boolean);
			if (!names.length) return;
			if (byStation[row.station]) {
				names.forEach(function (n) {
					if (byStation[row.station].names.indexOf(n) === -1) byStation[row.station].names.push(n);
				});
				if (row.depth !== undefined && row.depth !== '') byStation[row.station].depth = Number(row.depth);
			} else {
				var e = { station: row.station, names: names, label: names[0] };
				if (row.depth !== undefined && row.depth !== '') e.depth = Number(row.depth);
				byStation[row.station] = e;
				entries.push(e);
			}
		});
		return entries;
	}

	window.SilexCaveAutolink = { run: run, fromSurvey: fromSurvey, merge: merge, nameKey: nameKey };
})(window, document);
