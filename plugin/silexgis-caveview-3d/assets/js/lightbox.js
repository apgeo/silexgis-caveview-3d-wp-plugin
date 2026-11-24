/* ------------------------------------------------------------------------------
 * Overlay pictures for the cave's places and the viewer's hover thumbnails.
 *
 * Two entry points: SilexLightbox.open(url, caption) for a single picture the viewer
 * hands over, and FOOBOX.init() for markup-driven galleries — an
 * <a class="foobox" href="full.jpg"> whose rel attribute names the group the picture
 * belongs to. The FOOBOX name and markup are those of the FooBox lightbox plugin, so a
 * page written for that plugin keeps working with this file instead; no FooBox code is
 * used.
 *
 * A page may open a picture without anyone clicking a visible link — by triggering a
 * click on an anchor inside a hidden container. jQuery's .trigger('click') deliberately
 * does not fire native listeners on an anchor — it would otherwise follow the link — so
 * the handlers here are bound through jQuery when it is present, which is what makes a
 * programmatic open work at all.
 * ---------------------------------------------------------------------------- */
(function (window, document) {
	'use strict';

	var BOUND = 'sxlbBound';          // marks an anchor whose handler is already on
	var group = [];                   // anchors of the group being shown
	var index = 0;
	var root = null;                  // overlay element, built on first open
	var els = {};
	var lastFocus = null;
	var closeTimer = null;   // pending display:none from a close; open() must cancel it

	var CSS = [
		'.sxlb-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;',
		'flex-direction:column;background:rgba(12,12,14,.94);',
		'opacity:0;transition:opacity .18s ease;',
		'-webkit-user-select:none;user-select:none;touch-action:pan-y}',
		'.sxlb-overlay.sxlb-on{opacity:1}',
		'.sxlb-bar{flex:0 0 auto;display:flex;align-items:center;gap:.75rem;',
		'padding:.5rem .75rem;color:#e8e8ea;font:14px/1.4 system-ui,sans-serif}',
		'.sxlb-count{opacity:.75;font-variant-numeric:tabular-nums}',
		'.sxlb-caption{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;',
		'white-space:nowrap;opacity:.9}',
		'.sxlb-stage{flex:1 1 auto;position:relative;display:flex;align-items:center;',
		'justify-content:center;min-height:0;padding:0 .5rem .75rem}',
		'.sxlb-img{max-width:100%;max-height:100%;object-fit:contain;display:block;',
		'border-radius:3px;box-shadow:0 6px 28px rgba(0,0,0,.5)}',
		'.sxlb-img.sxlb-loading{opacity:.25}',
		'.sxlb-msg{color:#e8e8ea;font:15px/1.5 system-ui,sans-serif;text-align:center;padding:2rem}',
		// Controls are sized for a fingertip; they are the same size on a mouse, which
		// costs nothing and spares a second set of rules.
		'.sxlb-btn{appearance:none;-webkit-appearance:none;border:0;cursor:pointer;',
		'background:rgba(255,255,255,.12);color:#fff;border-radius:999px;',
		'min-width:44px;min-height:44px;font-size:20px;line-height:1;display:flex;',
		'align-items:center;justify-content:center;padding:0;flex:0 0 auto;',
		'transition:background .15s ease}',
		'.sxlb-btn:hover,.sxlb-btn:focus-visible{background:rgba(255,255,255,.28)}',
		'.sxlb-btn:focus-visible{outline:2px solid #8ab4f8;outline-offset:2px}',
		'.sxlb-btn[disabled]{opacity:.3;cursor:default;pointer-events:none}',
		'.sxlb-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:2}',
		'.sxlb-prev{left:.5rem}.sxlb-next{right:.5rem}',
		'@media (max-width:640px){.sxlb-stage{padding:0 0 .5rem}',
		'.sxlb-nav{top:auto;bottom:.5rem;transform:none}',
		'.sxlb-caption{font-size:13px}}',
		'@media (prefers-reduced-motion:reduce){.sxlb-overlay{transition:none}}',
	].join('');

	function style() {
		if (document.getElementById('sxlb-style')) return;
		var s = document.createElement('style');
		s.id = 'sxlb-style';
		s.textContent = CSS;
		(document.head || document.documentElement).appendChild(s);
	}

	function el(tag, cls, parent, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text) n.textContent = text;
		if (parent) parent.appendChild(n);
		return n;
	}

	function build() {
		if (root) return;
		style();
		root = el('div', 'sxlb-overlay');
		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-modal', 'true');
		root.setAttribute('aria-label', 'Fotografie');

		var bar = el('div', 'sxlb-bar', root);
		els.count = el('span', 'sxlb-count', bar);
		els.caption = el('span', 'sxlb-caption', bar);
		els.close = el('button', 'sxlb-btn sxlb-close', bar, '✕');
		els.close.setAttribute('aria-label', 'Închide');

		els.stage = el('div', 'sxlb-stage', root);
		els.prev = el('button', 'sxlb-btn sxlb-nav sxlb-prev', els.stage, '‹');
		els.prev.setAttribute('aria-label', 'Imaginea anterioară');
		els.next = el('button', 'sxlb-btn sxlb-nav sxlb-next', els.stage, '›');
		els.next.setAttribute('aria-label', 'Imaginea următoare');
		els.img = el('img', 'sxlb-img', els.stage);
		els.img.alt = '';

		els.close.addEventListener('click', close);
		els.prev.addEventListener('click', function () { step(-1); });
		els.next.addEventListener('click', function () { step(1); });

		// A click on the backdrop closes; a click on the picture or a control does not.
		root.addEventListener('click', function (e) {
			if (e.target === root || e.target === els.stage) close();
		});

		var x0 = null, y0 = null;
		els.stage.addEventListener('touchstart', function (e) {
			if (e.touches.length !== 1) { x0 = null; return; }
			x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
		}, { passive: true });
		els.stage.addEventListener('touchend', function (e) {
			if (x0 === null || !e.changedTouches.length) return;
			var dx = e.changedTouches[0].clientX - x0;
			var dy = e.changedTouches[0].clientY - y0;
			x0 = null;
			if (Math.abs(dx) < 45) return;
			// Horizontal intent only, so a vertical flick never changes the picture.
			if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
			step(dx < 0 ? 1 : -1);
		}, { passive: true });

		document.body.appendChild(root);
	}

	function label(a) {
		var img = a.querySelector('img');
		var t = a.getAttribute('data-caption') || a.getAttribute('title') || '';
		if (!t) {
			if (img) t = img.getAttribute('alt') || img.getAttribute('title') || '';
		}
		if (t) return t;
		// Fall back to the file name, which is what the pictures are actually named by.
		try {
			var path = decodeURIComponent(a.href.split('?')[0].split('#')[0]);
			return path.substring(path.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
		} catch (e) { return ''; }
	}

	function show() {
		var a = group[index];
		if (!a) return;
		els.img.classList.add('sxlb-loading');
		els.img.src = a.href;
		els.img.alt = label(a);
		els.caption.textContent = label(a);
		els.count.textContent = group.length > 1 ? (index + 1) + ' / ' + group.length : '';
		var many = group.length > 1;
		els.prev.style.display = els.next.style.display = many ? '' : 'none';
		els.prev.disabled = !many;
		els.next.disabled = !many;

		els.img.onload = function () { els.img.classList.remove('sxlb-loading'); };
		els.img.onerror = function () {
			els.img.classList.remove('sxlb-loading');
			els.caption.textContent = 'Imaginea nu a putut fi încărcată.';
		};

		// Warm the neighbours so stepping through a point's pictures is immediate.
		if (many) {
			[group[(index + 1) % group.length], group[(index - 1 + group.length) % group.length]]
				.forEach(function (n) { if (n) { var p = new Image(); p.src = n.href; } });
		}
	}

	function step(d) {
		if (group.length < 2) return;
		index = (index + d + group.length) % group.length;
		show();
	}

	function onKey(e) {
		if (e.key === 'Escape') { close(); }
		else if (e.key === 'ArrowLeft') { step(-1); }
		else if (e.key === 'ArrowRight') { step(1); }
		else if (e.key === 'Tab') { e.preventDefault(); els.close.focus(); }
		else return;
		e.stopPropagation();
	}

	/** Every anchor sharing this one's rel group, in document order. */
	function groupOf(a) {
		var rel = a.getAttribute('rel');
		if (!rel) return [a];
		var all = [].slice.call(document.querySelectorAll('a.foobox[href]'));
		var mates = all.filter(function (o) { return o.getAttribute('rel') === rel; });
		return mates.length ? mates : [a];
	}

	function open(a) {
		build();
		// Reopening within the close animation used to race the pending display:none
		// and leave an invisible overlay holding the keyboard and the scroll lock.
		window.clearTimeout(closeTimer);
		group = groupOf(a);
		index = Math.max(0, group.indexOf(a));
		lastFocus = document.activeElement;
		show();
		root.style.display = 'flex';
		// Next frame, so the opacity transition has a starting value to run from.
		window.requestAnimationFrame(function () { root.classList.add('sxlb-on'); });
		document.addEventListener('keydown', onKey, true);
		document.documentElement.style.overflow = 'hidden';
		els.close.focus();
	}

	function close() {
		if (!root) return;
		root.classList.remove('sxlb-on');
		document.removeEventListener('keydown', onKey, true);
		document.documentElement.style.overflow = '';
		els.img.removeAttribute('src');
		closeTimer = window.setTimeout(function () { if (root) root.style.display = 'none'; }, 180);
		if (lastFocus) { try { lastFocus.focus(); } catch (e) {} }
		lastFocus = null;
	}

	function handler(e) {
		if (e) { if (e.preventDefault) e.preventDefault(); }
		open(this);
		return false;
	}

	/**
	 * Binds every a.foobox not already bound. Called again each time the page builds
	 * more picture links, exactly as the plugin's own init was, and binding twice is
	 * harmless because each anchor is marked once.
	 */
	function init() {
		var anchors = document.querySelectorAll('a.foobox[href]');
		var jq = window.jQuery;
		for (var i = 0; i < anchors.length; i++) {
			var a = anchors[i];
			if (a.dataset[BOUND]) continue;
			a.dataset[BOUND] = '1';
			// jQuery when available: the page opens some of these with $(a).click(),
			// which reaches jQuery handlers only.
			if (jq) jq(a).on('click.sxlb', handler);
			else a.addEventListener('click', handler);
		}
		return anchors.length;
	}

	window.FOOBOX = window.FOOBOX || { init: init, open: open, close: close };

	/**
	 * Opening one picture that no anchor on the page points at.
	 *
	 * The 3D viewer holds its own strip of photographs for whichever station the
	 * pointer is on, and hands back the one that was clicked rather than an element.
	 * A detached anchor is built for it so it travels the same path as every other
	 * picture here — same keys, same close, same focus handling — and so that a group
	 * of one shows no prev/next.
	 */
	window.SilexLightbox = window.SilexLightbox || {
		open: function (url, caption) {
			if (!url) return false;
			var a = document.createElement('a');
			a.href = url;
			if (caption) a.setAttribute('data-caption', caption);
			open(a);
			return true;
		},
		close: close
	};
})(window, document);


