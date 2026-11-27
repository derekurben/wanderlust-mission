/* Wanderlust Mission: one search box for huts, logbook text and summits.
   Everything is searched in the browser from data already loaded: js/huts.js, js/stories.js, js/peaks.js. */
(function () {
  'use strict';
  var A = window.WMApp, STORIES = window.WM_STORIES || {}, PEAKS = window.WM_PEAKS || [];
  var $ = function (id) { return document.getElementById(id); }, esc = A.esc, fmt = A.fmt;
  var box = $('search'), input = $('q'), out = $('search-out'), toggle = $('search-toggle');
  // compare without case or accents, so "hutte" finds "Hütte" and "kronten" finds "Krönten"
  var fold = function (s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss'); };
  // for names: punctuation counts as a space, so "monte rosa" finds "Monte-Rosa-Hütte"
  var name = function (s) { return fold(s).replace(/[^a-z0-9]+/g, ' ').trim(); };
  var CANTON = { VS: 'Valais', GR: 'Graubünden', BE: 'Bern', UR: 'Uri', TI: 'Ticino', GL: 'Glarus', SG: 'St. Gallen', OW: 'Obwalden', SZ: 'Schwyz', VD: 'Vaud', AI: 'Appenzell Innerrhoden' };

  var huts = A.HUTS.map(function (h, i) { return { i: i, h: h, key: name(h.n + ' ' + h.p + ' ' + (CANTON[h.c] || '') + ' ' + h.c) }; });
  var peaks = PEAKS.map(function (p) { return { p: p, key: name(p[0]) }; });
  var logs = A.LOGS.map(function (l) { return { l: l, key: name(l.title + ' ' + (l.sub || '')) }; });
  var texts = [];
  A.LOGS.forEach(function (l) {
    (STORIES[l.id] || []).forEach(function (it, i) {
      var t = it.html ? it.html.replace(/<[^>]+>/g, ' ') : it.cap || '';
      t = t.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
      if (t.length > 2) texts.push({ l: l, i: i, f: it.f, t: t, key: fold(t) });
    });
  });

  var picks = [], at = -1;
  function mark(text, q) { // show the words around the match, with the match itself marked
    var k = fold(text), p = (' ' + k).indexOf(' ' + q); if (p < 0) p = k.indexOf(q);
    if (p < 0) return esc(text.slice(0, 110));
    var a = Math.max(0, p - 46), b = Math.min(text.length, p + q.length + 64);
    while (a > 0 && text[a - 1] !== ' ') a--;
    return (a ? '… ' : '') + esc(text.slice(a, p)) + '<mark>' + esc(text.slice(p, p + q.length)) + '</mark>' + esc(text.slice(p + q.length, b)) + (b < text.length ? ' …' : '');
  }
  function run() {
    var q = fold(input.value.trim()), qn = name(input.value);
    picks = []; at = -1;
    if (q.length < 2) { out.hidden = true; out.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); return; }
    var rank = function (key) { var p = key.indexOf(qn); return !qn || p < 0 ? -1 : (p === 0 ? 0 : key[p - 1] === ' ' ? 1 : 2); };
    // in running text a short word must start a word, or "ice" would find "nice" and "choice"
    var inText = function (key) { var p = (' ' + key).indexOf(' ' + q); return p >= 0 ? 0 : (q.length >= 4 && key.indexOf(q) >= 0 ? 1 : -1); };
    var H = huts.map(function (x) { return { x: x, r: rank(x.key) }; }).filter(function (o) { return o.r >= 0; })
      .sort(function (a, b) { return a.r - b.r || (b.x.h.log ? 1 : 0) - (a.x.h.log ? 1 : 0) || a.x.h.n.localeCompare(b.x.h.n); }).slice(0, 6);
    var L = logs.filter(function (x) { return qn && x.key.indexOf(qn) >= 0; }).slice(0, 4);
    var T = texts.map(function (x) { return { x: x, r: inText(x.key) }; }).filter(function (o) { return o.r >= 0; }).sort(function (a, b) { return a.r - b.r; }).slice(0, 6).map(function (o) { return o.x; });
    var P = peaks.map(function (x) { return { x: x, r: rank(x.key) }; }).filter(function (o) { return o.r >= 0; }).sort(function (a, b) { return a.r - b.r || b.x.p[1] - a.x.p[1]; }).slice(0, 5);
    var h = '', n = 0;
    var row = function (title, sub, go) { picks.push(go); return '<li role="option" id="sr-' + n + '" data-n="' + (n++) + '"><b>' + title + '</b><span>' + sub + '</span></li>'; };
    if (H.length) {
      h += '<li class="search-h" role="presentation">Huts</li>';
      H.forEach(function (o) {
        var x = o.x.h;
        h += row(esc(x.n), fmt(x.ele) + ' m, ' + esc(x.p) + ', ' + (CANTON[x.c] || x.c) + (x.log ? '. Hut ' + x.no + ', visited' : '. Not visited yet'),
          x.log ? function () { A.openLog(x.log); } : function () { A.focusHut(o.x.i); });
      });
    }
    if (L.length) {
      h += '<li class="search-h" role="presentation">Logbooks</li>';
      L.forEach(function (x) { h += row(esc(x.l.title), A.dateRange(x.l.dates) + (x.l.km ? ', ' + fmt(x.l.km, 1) + ' km' : ''), function () { A.openLog(x.l.id); }); });
    }
    if (T.length) {
      h += '<li class="search-h" role="presentation">In the logbook text</li>';
      T.forEach(function (x) { h += row(mark(x.t, q), esc(x.l.title) + (x.f != null && x.l.km ? ', ' + fmt(x.f * x.l.km, 1) + ' km in' : ''), function () { A.openLogAt(x.l.id, x.i); }); });
    }
    if (P.length) {
      h += '<li class="search-h" role="presentation">Summits</li>';
      P.forEach(function (o) { var p = o.x.p; h += row(esc(p[0]), fmt(p[1]) + ' m. Show on the map', function () { A.showPeak(p); }); });
    }
    if (!n) h = '<li class="search-none" role="presentation">Nothing found for “' + esc(input.value.trim()) + '”. Try a hut, a place, a summit or a word from a logbook.</li>';
    out.innerHTML = h; out.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function choose(n) {
    var go = picks[n];
    if (!go) return;
    close(true);
    go();
  }
  function close(clear) {
    out.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    if (clear) { input.value = ''; out.innerHTML = ''; picks = []; }
    box.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false');
    input.blur();
  }
  function move(d) {
    if (!picks.length) return;
    at = (at + d + picks.length) % picks.length;
    out.querySelectorAll('li[data-n]').forEach(function (li) { var on = +li.dataset.n === at; li.classList.toggle('is-on', on); if (on) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); } });
  }
  input.addEventListener('input', run);
  input.addEventListener('focus', function () { if (input.value.trim().length >= 2) run(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(at < 0 ? 0 : at); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(true); }
  });
  out.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the box focused while choosing
  out.addEventListener('click', function (e) { var li = e.target.closest('li[data-n]'); if (li) choose(+li.dataset.n); });
  document.addEventListener('click', function (e) { if (!box.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) { out.hidden = true; if (!input.value) box.classList.remove('is-open'); } });
  toggle.addEventListener('click', function () { // phones: the box drops down under the top bar
    var open = !box.classList.contains('is-open');
    box.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus(); else close(false);
  });
  document.addEventListener('keydown', function (e) { // "/" jumps to the search box
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); box.classList.add('is-open'); input.focus(); }
  });
})();
