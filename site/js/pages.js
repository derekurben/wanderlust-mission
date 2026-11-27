/* Wanderlust Mission: the Mission numbers and the hut rankings.
   Data: js/huts.js (every hut on the list), js/rankings.js (scores), and the logbooks via window.WMApp. */
(function () {
  'use strict';
  var A = window.WMApp, R = window.WM_RANKINGS || { scale: 10, categories: [], huts: {} };
  var HUTS = A.HUTS, LOGS = A.LOGS, fmt = A.fmt, esc = A.esc, svg = A.svg;
  var $ = function (id) { return document.getElementById(id); };
  var TOTAL = A.meta.total, DONE = A.meta.visited;
  var RED = '#DA291C', INK = '#1B242C', GRANITE = '#5C6770', LINE = '#DCE1E5', SCREE = '#9AA6AE';
  var CANTON = { VS: 'Valais', GR: 'Graubünden', BE: 'Bern', UR: 'Uri', TI: 'Ticino', GL: 'Glarus', SG: 'St. Gallen', OW: 'Obwalden', SZ: 'Schwyz', VD: 'Vaud', AI: 'Appenzell Innerrhoden', NW: 'Nidwalden', FR: 'Fribourg', LU: 'Lucerne' };
  var visited = HUTS.filter(function (h) { return h.log; }).sort(function (a, b) { return a.no - b.no; });
  var day = function (iso) { var p = A.parts(iso); return p.d + ' ' + A.MON[p.m] + ' ' + p.y; };
  var time = function (iso) { var p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };

  // =====================================================================
  // Mission: the numbers so far, and when the last hut might fall
  // =====================================================================
  function pace() {
    var now = Date.now(), first = time(visited[0].date), yearMs = 365.25 * 86400000;
    var all = visited.length / Math.max(0.5, (now - first) / yearMs);
    var recent = visited.filter(function (h) { return time(h.date) >= now - yearMs; }).length;
    var left = TOTAL - visited.length;
    return { now: now, first: first, all: all, recent: recent, left: left,
      endAll: now + (left / all) * yearMs, endRecent: recent ? now + (left / recent) * yearMs : null };
  }
  function mission() {
    var km = 0, gain = 0, days = 0, trips = 0, longest = null, steepest = null;
    LOGS.forEach(function (l) {
      if (!l.huts.length) return;
      trips++; km += l.km || 0; gain += l.gain || 0; days += l.dates.length;
      if (l.km && (!longest || l.km > longest.km)) longest = l;
      if (l.gain && (!steepest || l.gain > steepest.gain)) steepest = l;
    });
    var left = TOTAL - DONE, P = pace();
    var high = visited.slice().sort(function (a, b) { return b.ele - a.ele; })[0];
    var cantons = {}; visited.forEach(function (h) { cantons[h.c] = 1; });
    var yAll = new Date(P.endAll).getUTCFullYear(), yRec = P.endRecent ? new Date(P.endRecent).getUTCFullYear() : null;
    return '<div class="sheet" style="padding-top:34px"><h1>' + DONE + ' huts down, ' + left + ' to go</h1>' +
      '<p class="lede">Every one of the ' + TOTAL + ' Swiss Alpine Club huts, touched in person. No deadline.</p>' +
      '<div class="actions"><button type="button" class="btn" data-do="replay"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M6 4.5v11l9-5.5z" fill="currentColor"/></svg>Replay the mission</button>' +
      '<button type="button" class="btn is-quiet" data-do="rankings">Hut rankings</button></div>' +
      '<dl class="stats"><div><dt>Trips logged</dt><dd>' + trips + '</dd></div><div><dt>Days out</dt><dd>' + days + '</dd></div>' +
      '<div><dt>On foot</dt><dd>' + fmt(km) + '<small>km</small></dd></div><div><dt>Climbed</dt><dd>' + fmt(gain) + '<small>m</small></dd></div></dl>' +
      '<p class="note" style="margin-top:14px">That climbing is ' + fmt(gain / 8849, 1) + ' times the height of Everest from sea level.</p>' +

      '<section class="block"><h2>When the last hut falls</h2>' +
      '<p class="note">' + (yRec ? 'At the pace of the last twelve months, ' + P.recent + ' huts a year, the last one falls in <b>' + yRec + '</b>. ' : '') +
      'At the pace since the first hut, ' + fmt(P.all, 1) + ' a year, it falls in <b>' + yAll + '</b>.</p><div class="chart" id="m-proj"></div></section>' +

      '<section class="block"><h2>Records so far</h2><ul class="huts is-facts">' +
      '<li><b>Highest hut</b><span>' + esc(high.n) + ', ' + fmt(high.ele) + ' m</span></li>' +
      (longest ? '<li><b>Longest trip</b><span>' + esc(longest.title) + ', ' + fmt(longest.km, 1) + ' km</span></li>' : '') +
      (steepest ? '<li><b>Most climbing</b><span>' + esc(steepest.title) + ', ' + fmt(steepest.gain) + ' m</span></li>' : '') +
      '<li><b>Cantons</b><span>' + Object.keys(cantons).length + ' of ' + Object.keys(byCanton()).length + ' with huts on the list</span></li></ul></section>' +

      '<section class="block"><h2>Hut by hut, year by year</h2><div class="chart" id="m-years"></div></section>' +
      '<section class="block"><h2>By canton</h2><p class="note">Huts reached, out of those on my list in each canton.</p><div class="bars" id="m-cantons"></div></section>' +
      '<section class="block"><h2>By season</h2><div class="chart" id="m-seasons"></div></section>' +
      '<section class="block"><h2>The height ladder</h2><p class="note">Every hut on the list by altitude. Red marks are the ones I have reached.</p><div class="chart" id="m-ladder"></div></section>' +
      '<section class="block"><h2>Against the whole mission</h2><p class="note">The full list was estimated at about 750 km on foot and 125,000 m of climbing.</p><div class="bars">' +
      '<div><p><span>Huts</span><b>' + DONE + ' of ' + TOTAL + '</b></p><i style="--v:' + (DONE / TOTAL * 100).toFixed(1) + '%"></i></div>' +
      '<div><p><span>Distance</span><b>' + fmt(km) + ' of 750 km</b></p><i style="--v:' + Math.min(100, km / 750 * 100).toFixed(1) + '%"></i></div>' +
      '<div><p><span>Climbing</span><b>' + fmt(gain) + ' of 125,000 m</b></p><i style="--v:' + Math.min(100, gain / 125000 * 100).toFixed(1) + '%"></i></div></div></section></div>';
  }
  function byCanton() {
    var c = {};
    HUTS.forEach(function (h) { var o = c[h.c] || (c[h.c] = { all: 0, done: 0 }); o.all++; if (h.log) o.done++; });
    return c;
  }
  function tipOn(node, html) {
    node.addEventListener('pointerenter', function (e) { A.showTip(html, e.clientX, e.clientY - 4); });
    node.addEventListener('pointermove', function (e) { A.showTip(html, e.clientX, e.clientY - 4); });
    node.addEventListener('pointerleave', A.hideTip);
  }
  // a small column chart: one red bar per label, value written on top
  function columns(host, rows, unit) {
    var W = 400, H = 150, m = { t: 22, r: 4, b: 26, l: 4 }, max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': rows.map(function (r) { return r.k + ': ' + r.v + ' ' + unit; }).join(', ') });
    var bw = Math.min(64, (W - m.l - m.r) / rows.length - 14), gap = (W - m.l - m.r - bw * rows.length) / rows.length;
    s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: LINE, 'stroke-width': 1 }));
    rows.forEach(function (r, i) {
      var x = m.l + gap / 2 + i * (bw + gap), h = (r.v / max) * (H - m.t - m.b), y = H - m.b - h;
      if (r.v > 0) {
        var rr = Math.min(4, h), bar = svg('path', { d: 'M' + x + ' ' + (H - m.b) + 'V' + (y + rr) + 'q0 -' + rr + ' ' + rr + ' -' + rr + 'h' + (bw - 2 * rr) + 'q' + rr + ' 0 ' + rr + ' ' + rr + 'V' + (H - m.b) + 'Z', fill: RED });
        s.appendChild(bar); tipOn(bar, '<b>' + r.k + '</b><br>' + r.v + ' ' + unit + (r.note ? '<br>' + r.note : ''));
      }
      s.appendChild(svg('text', { x: x + bw / 2, y: y - 6, 'text-anchor': 'middle', 'class': 'hutlabel' }, String(r.v)));
      s.appendChild(svg('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, r.k));
    });
    host.appendChild(s);
  }
  function missionWire(root) {
    root.querySelectorAll('[data-do]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.dataset.do;
        if (d === 'replay') A.startReplay(); else openPage(d);
      });
    });
    // by year
    var years = {}, y0 = +visited[0].date.slice(0, 4), y1 = new Date().getFullYear(), y;
    for (y = y0; y <= y1; y++) years[y] = 0;
    visited.forEach(function (h) { years[+h.date.slice(0, 4)]++; });
    columns($('m-years'), Object.keys(years).map(function (k) { return { k: k, v: years[k] }; }), 'huts');
    // by season
    var S = [{ k: 'Winter', v: 0, note: 'December to February' }, { k: 'Spring', v: 0, note: 'March to May' }, { k: 'Summer', v: 0, note: 'June to August' }, { k: 'Autumn', v: 0, note: 'September to November' }];
    visited.forEach(function (h) { var mo = +h.date.slice(5, 7); S[mo === 12 || mo <= 2 ? 0 : mo <= 5 ? 1 : mo <= 8 ? 2 : 3].v++; });
    columns($('m-seasons'), S, 'huts');
    // by canton
    var C = byCanton(), host = $('m-cantons');
    Object.keys(C).sort(function (a, b) { return C[b].done - C[a].done || C[b].all - C[a].all; }).forEach(function (k) {
      var d = document.createElement('div');
      d.innerHTML = '<p><span>' + (CANTON[k] || k) + '</span><b>' + C[k].done + ' of ' + C[k].all + '</b></p><i style="--v:' + (C[k].done / C[k].all * 100).toFixed(1) + '%"></i>';
      host.appendChild(d);
    });
    ladder($('m-ladder'));
    projection($('m-proj'));
  }
  function ladder(host) {
    var W = 400, H = 96, m = { l: 6, r: 6 }, lo = 1400, hi = 3900;
    var X = function (e) { return m.l + ((e - lo) / (hi - lo)) * (W - m.l - m.r); };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'All huts by altitude from 1,400 to 3,900 metres, with the ' + DONE + ' reached marked' });
    for (var e = 1500; e <= 3500; e += 500) {
      s.appendChild(svg('line', { x1: X(e), x2: X(e), y1: 26, y2: 70, stroke: LINE, 'stroke-width': 1 }));
      s.appendChild(svg('text', { x: X(e), y: 88, 'text-anchor': 'middle' }, fmt(e) + ' m'));
    }
    HUTS.forEach(function (h) { if (!h.log) s.appendChild(svg('line', { x1: X(h.ele), x2: X(h.ele), y1: 38, y2: 62, stroke: SCREE, 'stroke-width': 1.2 })); });
    visited.forEach(function (h) {
      var t = svg('line', { x1: X(h.ele), x2: X(h.ele), y1: 30, y2: 70, stroke: RED, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      s.appendChild(t);
      var hit = svg('rect', { x: X(h.ele) - 5, y: 26, width: 10, height: 48, fill: 'transparent' });
      s.appendChild(hit); tipOn(hit, '<b>' + esc(h.n) + '</b><br>' + fmt(h.ele) + ' m');
    });
    var top = visited.slice().sort(function (a, b) { return b.ele - a.ele; })[0];
    s.appendChild(svg('text', { x: X(top.ele), y: 20, 'text-anchor': 'middle', 'class': 'hutlabel' }, top.n + ', ' + fmt(top.ele) + ' m'));
    host.appendChild(s);
  }
  function projection(host) {
    var P = pace(), W = 400, H = 190, m = { t: 14, r: 44, b: 26, l: 34 };
    var end = Math.max(P.endAll, P.endRecent || 0), t0 = Date.UTC(new Date(P.first).getUTCFullYear(), 0, 1), t1 = Date.UTC(new Date(end).getUTCFullYear() + 1, 0, 1);
    var X = function (t) { return m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r); }, Y = function (n) { return H - m.b - (n / TOTAL) * (H - m.t - m.b); };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Huts reached over time, with two projections to ' + TOTAL });
    [0, 50, 100, TOTAL].forEach(function (n) {
      s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: Y(n), y2: Y(n), stroke: n === TOTAL ? GRANITE : LINE, 'stroke-width': 1, 'stroke-dasharray': n === TOTAL ? '3 3' : '' }));
      s.appendChild(svg('text', { x: m.l - 6, y: Y(n) + 4, 'text-anchor': 'end' }, String(n)));
    });
    var yA = new Date(t0).getUTCFullYear(), yB = new Date(t1).getUTCFullYear(), stepY = Math.max(1, Math.ceil((yB - yA) / 5));
    for (var y = yA; y < yB; y += stepY) s.appendChild(svg('text', { x: X(Date.UTC(y, 0, 1)), y: H - 8, 'text-anchor': y === yA ? 'start' : 'middle' }, String(y)));
    var lines = [[P.endAll, 'since the start']];
    if (P.endRecent) lines.push([P.endRecent, 'last 12 months']);
    lines.forEach(function (ln, i) {
      s.appendChild(svg('line', { x1: X(P.now), y1: Y(visited.length), x2: X(ln[0]), y2: Y(TOTAL), stroke: i ? RED : GRANITE, 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }));
      var dot = svg('circle', { cx: X(ln[0]), cy: Y(TOTAL), r: 4.5, fill: '#fff', stroke: i ? RED : GRANITE, 'stroke-width': 2 });
      s.appendChild(dot);
      s.appendChild(svg('text', { x: X(ln[0]), y: Y(TOTAL) + (i ? 17 : -9), 'text-anchor': X(ln[0]) > W - 70 ? 'end' : 'middle', 'class': 'hutlabel' }, String(new Date(ln[0]).getUTCFullYear())));
      tipOn(dot, '<b>' + new Date(ln[0]).getUTCFullYear() + '</b><br>At the pace of ' + (i ? 'the last twelve months' : 'the whole mission so far'));
    });
    var d = 'M' + X(time(visited[0].date)).toFixed(1) + ' ' + Y(0).toFixed(1);
    visited.forEach(function (h, i) { d += 'H' + X(time(h.date)).toFixed(1) + 'V' + Y(i + 1).toFixed(1); });
    d += 'H' + X(P.now).toFixed(1);
    s.appendChild(svg('path', { d: d, fill: 'none', stroke: RED, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    s.appendChild(svg('circle', { cx: X(P.now), cy: Y(visited.length), r: 5, fill: RED, stroke: '#fff', 'stroke-width': 2 }));
    s.appendChild(svg('text', { x: X(P.now) + 9, y: Y(visited.length) + 13, 'class': 'hutlabel' }, visited.length + ' today'));
    host.appendChild(s);
  }

  // =====================================================================
  // The rankings page: one full-width sheet
  // =====================================================================
  var pageName = null;
  function openPage(name) {
    A.closeGallery(true);
    pageName = name;
    $('page-in').innerHTML = rankings();
    wireRankings();
    $('page').hidden = false; $('page').scrollTop = 0;
    $('nav-rankings').setAttribute('aria-pressed', String(name === 'rankings'));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    $('page-in').focus({ preventScroll: true });
  }
  function closePage(keepHash) {
    if ($('page').hidden) return;
    $('page').hidden = true; pageName = null;
    $('nav-rankings').removeAttribute('aria-pressed');
    if (!keepHash && /^#rankings$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }

  // ---------- hut rankings ----------
  var sortBy = 'overall';
  function scoreOf(h) {
    var r = R.huts[h.n] || {}, sum = 0, n = 0;
    R.categories.forEach(function (c) { var v = r[c.id]; if (typeof v === 'number') { sum += v; n++; } });
    return { r: r, overall: n ? sum / n : null, rated: n };
  }
  function rankings() {
    var rows = visited.map(function (h) { var s = scoreOf(h); s.h = h; return s; });
    var any = rows.some(function (r) { return r.rated; });
    var val = function (r) { var v = sortBy === 'overall' ? r.overall : r.r[sortBy]; return typeof v === 'number' ? v : -1; };
    rows.sort(function (a, b) { return val(b) - val(a) || a.h.no - b.h.no; });
    var cell = function (v) {
      if (v === 'none') return '<td class="rk-s is-none"><span>Not staffed</span></td>';
      if (typeof v !== 'number') return '<td class="rk-s is-empty"><span aria-label="Not rated yet">–</span></td>';
      return '<td class="rk-s"><b>' + fmt(v, v % 1 ? 1 : 0) + '</b><i style="--v:' + (v / R.scale * 100).toFixed(0) + '%"></i></td>';
    };
    var h = '<h1>Hut rankings</h1><p class="lede">Every hut I have reached, scored out of ' + R.scale + ' on ' + R.categories.length + ' things. The overall score is the average of the ones I could judge.</p>';
    if (!any) h += '<p class="rk-empty">No scores yet. The huts are listed in the order I reached them, and the table fills in as I rate each one.</p>';
    h += '<div class="rk-wrap"><table class="rk"><thead><tr><th class="rk-n" scope="col">Rank</th><th scope="col" class="rk-h">Hut</th>';
    R.categories.forEach(function (c) {
      h += '<th scope="col" aria-sort="' + (sortBy === c.id ? 'descending' : 'none') + '"><button type="button" data-sort="' + c.id + '" title="' + esc(c.note || '') + '">' + esc(c.label) + '</button></th>';
    });
    h += '<th scope="col" aria-sort="' + (sortBy === 'overall' ? 'descending' : 'none') + '"><button type="button" data-sort="overall">Overall</button></th></tr></thead><tbody>';
    var rank = 0;
    rows.forEach(function (r) {
      var has = val(r) >= 0; if (has) rank++;
      h += '<tr><td class="rk-n">' + (has ? rank : '') + '</td><th scope="row" class="rk-h"><button type="button" data-log="' + r.h.log + '">' + esc(r.h.n) + '</button>' +
        '<span>' + (CANTON[r.h.c] || r.h.c) + ', ' + fmt(r.h.ele) + ' m, ' + day(r.h.date) + '</span>' + (r.r.note ? '<em>' + esc(r.r.note) + '</em>' : '') + '</th>';
      R.categories.forEach(function (c) { h += cell(r.r[c.id]).replace('<td class="rk-s', '<td data-label="' + esc(c.label) + '" class="rk-s'); });
      h += (r.overall == null ? '<td data-label="Overall" class="rk-s rk-o is-empty"><span>Not rated yet</span></td>' : '<td data-label="Overall" class="rk-s rk-o"><b>' + fmt(r.overall, 1) + '</b><i style="--v:' + (r.overall / R.scale * 100).toFixed(0) + '%"></i></td>') + '</tr>';
    });
    h += '</tbody></table></div><div class="rk-key"><h2>What each score means</h2><dl>' + R.categories.map(function (c) { return '<div><dt>' + esc(c.label) + '</dt><dd>' + esc(c.note || '') + '</dd></div>'; }).join('') + '</dl></div>';
    return h;
  }
  function wireRankings() {
    $('page-in').onclick = function (e) {
      var s = e.target.closest('[data-sort]'), l = e.target.closest('[data-log]');
      if (s) { sortBy = s.dataset.sort; var y = $('page').scrollTop; $('page-in').innerHTML = rankings(); $('page').scrollTop = y; }
      else if (l) { closePage(true); A.openLog(l.dataset.log); }
    };
  }

  // ---------- wiring ----------
  $('nav-rankings').addEventListener('click', function () { if (pageName === 'rankings') closePage(); else openPage('rankings'); });
  ['nav-logbook', 'nav-mission', 'nav-about', 'nav-photos', 'brand'].forEach(function (id) { $(id).addEventListener('click', function () { closePage(id === 'nav-photos'); }, true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('page').hidden && $('lightbox').hidden) closePage(); });
  window.addEventListener('hashchange', function () {
    var id = location.hash.replace('#', '');
    if (id === 'rankings') openPage(id); else closePage(true);
  });
  if (/^#rankings$/.test(location.hash)) openPage(location.hash.slice(1));

  window.WMPages = { mission: mission, missionWire: missionWire, openPage: openPage, closePage: closePage };
})();
