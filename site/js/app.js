/* Wanderlust Mission: interactive 3D logbook map with scroll-driven trip stories.
   Data: js/data.js (window.WM: routes, stats, weather) and js/stories.js (window.WM_STORIES: text and photos,
   each block carrying f, its position along the route from 0 to 1). No build step. */
(function () {
  'use strict';

  var WM = window.WM, STORIES = window.WM_STORIES || {};
  var LOGS = WM.logbooks.slice().sort(function (a, b) { return b.no - a.no; });
  var BY_ID = {};
  LOGS.forEach(function (l) { BY_ID[l.id] = l; });

  var RED = '#DA291C', INK = '#1B242C', GRANITE = '#5C6770', LINE = '#DCE1E5';
  var HOME = { pitch: 42, bearing: 0 };
  var SLIM = 72;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = function () { return window.matchMedia('(max-width: 900px)').matches; };

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  var fmt = function (n, d) { return Number(n).toLocaleString('en-GB', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };

  // ---------- geometry ----------
  var RAD = Math.PI / 180;
  function hav(a, b) {
    var dla = (b[1] - a[1]) * RAD, dlo = (b[0] - a[0]) * RAD;
    var s = Math.pow(Math.sin(dla / 2), 2) + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.pow(Math.sin(dlo / 2), 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(s));
  }
  function bearing(a, b) {
    var y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
    var x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  LOGS.forEach(function (l) {
    if (!l.track) return;
    var cum = [0];
    for (var i = 1; i < l.track.length; i++) cum.push(cum[i - 1] + hav(l.track[i - 1], l.track[i]));
    l.cum = cum;
    l.total = cum[cum.length - 1];
    l.huts.forEach(function (h) {
      var best = 0, bd = Infinity;
      l.track.forEach(function (p, k) { var d = hav(p, h.at); if (d < bd) { bd = d; best = k; } });
      h.idx = best;
    });
    var far = l.track[0], fd = 0;
    l.track.forEach(function (p) { var d = hav(l.track[0], p); if (d > fd) { fd = d; far = p; } });
    l.bearing = Math.round(bearing(l.track[0], far));
  });
  function pointAt(l, dist) { // metres along the stored line
    var cum = l.cum, lo = 0, hi = cum.length - 1;
    if (dist <= 0) return { p: l.track[0], i: 0 };
    if (dist >= cum[hi]) return { p: l.track[hi], i: hi };
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= dist) lo = mid; else hi = mid; }
    var t = (dist - cum[lo]) / (cum[hi] - cum[lo] || 1), a = l.track[lo], b = l.track[hi];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], i: lo };
  }

  // ---------- dates ----------
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function parts(iso) { var p = iso.split('-').map(Number); return { y: p[0], m: p[1] - 1, d: p[2], dow: new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() }; }
  function dateRange(dates) {
    var a = parts(dates[0]), b = parts(dates[dates.length - 1]);
    if (dates.length === 1) return a.d + ' ' + MON[a.m] + ' ' + a.y;
    if (a.m === b.m) return a.d + '–' + b.d + ' ' + MON[a.m] + ' ' + a.y;
    return a.d + ' ' + MON[a.m] + ' – ' + b.d + ' ' + MON[b.m] + ' ' + b.y;
  }
  function dayName(iso) { var p = parts(iso); return DOW[p.dow] + ' ' + p.d + ' ' + MON[p.m]; }

  // ---------- state ----------
  var map = null, mapReady = false;
  var active = null, hot = null, userBase = false;
  var pins = [], dot = null, hiker = null;
  var story = null; // { l, rows, items, f, T, target, cur, clockT, clockCur, mode, raf, userCam, lastWalk, fly }
  var HUTS = (window.WM_HUTS && window.WM_HUTS.huts) || [], PEAKS = window.WM_PEAKS || [];
  var lightOn = true, wx = null, peakMarks = [], pano = null, replay = null;
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var hm = function (s) { var p = String(s).split(':'); return +p[0] + (+p[1] || 0) / 60; };
  var clockText = function (h) { h = ((h % 24) + 24) % 24; var m = Math.round(h * 60); if (m >= 1440) m -= 1440; return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); };

  // =====================================================================
  // Rail, meter
  // =====================================================================
  function buildRail() {
    var list = $('rail-list');
    LOGS.forEach(function (l) {
      var sac = l.huts.some(function (h) { return h.sac; });
      var b = el('button', 'rail-item' + (sac ? '' : ' is-nonsac'));
      b.type = 'button';
      b.dataset.id = l.id;
      b.title = 'Logbook ' + l.no + ': ' + l.title;
      var meta = l.huts.length ? dateRange(l.dates) + (l.km ? ', ' + fmt(l.km, 1) + ' km' : '') : 'Start here';
      b.innerHTML = '<span class="rail-no">' + l.no + '</span><span class="rail-title">' + esc(l.title) + '</span><span class="rail-meta">' + meta + '</span>';
      b.addEventListener('mouseenter', function () { setHot(l.id, null); });
      b.addEventListener('mouseleave', function () { setHot(null); });
      b.addEventListener('focus', function () { setHot(l.id, null); });
      b.addEventListener('blur', function () { setHot(null); });
      b.addEventListener('click', function () { openLog(l.id); });
      var li = el('li'); li.appendChild(b); list.appendChild(li);
    });
    $('rail-count').textContent = LOGS.filter(function (l) { return l.huts.length; }).length + ' trips, newest first';
  }
  function buildMeter() {
    $('meter-done').textContent = WM.meta.visited;
    $('meter-total').textContent = WM.meta.total;
    var t = $('meter-ticks');
    for (var i = 0; i < WM.meta.total; i++) t.appendChild(el('i', i < WM.meta.visited ? 'on' : ''));
  }
  function setRail(open) {
    $('rail').classList.toggle('is-shut', !open);
    document.body.classList.toggle('rail-shut', !open);
    $('nav-logbook').setAttribute('aria-pressed', String(open));
  }

  // =====================================================================
  // Map
  // =====================================================================
  var SWISS = [5.14, 45.39, 11.48, 48.23];
  function wmts(layer) { return 'https://wmts.geo.admin.ch/1.0.0/' + layer + '/default/current/3857/{z}/{x}/{y}.jpeg'; }
  var TOPO = '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>';
  var DEM = { type: 'raster-dem', tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], tileSize: 512, encoding: 'terrarium', maxzoom: 14,
    attribution: '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>' };

  function style() {
    return {
      version: 8,
      sources: {
        summer: { type: 'raster', tiles: [wmts('ch.swisstopo.pixelkarte-farbe')], tileSize: 256, maxzoom: 17, bounds: SWISS, attribution: TOPO },
        winter: { type: 'raster', tiles: [wmts('ch.swisstopo.pixelkarte-farbe-winter')], tileSize: 256, maxzoom: 17, bounds: SWISS, attribution: TOPO },
        aerial: { type: 'raster', tiles: [wmts('ch.swisstopo.swissimage')], tileSize: 256, maxzoom: 19, bounds: SWISS, attribution: TOPO },
        dem: DEM,
        relief: DEM
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#E6EBEE' } },
        { id: 'relief', type: 'hillshade', source: 'relief', paint: { 'hillshade-shadow-color': '#7C8A94', 'hillshade-highlight-color': '#FFFFFF', 'hillshade-accent-color': '#9AA6AE', 'hillshade-exaggeration': 0.55 } },
        { id: 'summer', type: 'raster', source: 'summer', layout: { visibility: 'none' } },
        { id: 'winter', type: 'raster', source: 'winter', layout: { visibility: 'none' } },
        { id: 'aerial', type: 'raster', source: 'aerial' }
      ],
      terrain: { source: 'dem', exaggeration: 1.15 },
      sky: { 'sky-color': '#9CC4E4', 'horizon-color': '#F2F4F6', 'fog-color': '#FFFFFF', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 }
    };
  }

  // The map fills the window; panels sit on top of it. This is the part of the map left uncovered.
  function clearArea() {
    var W = window.innerWidth, H = window.innerHeight, open = !$('panel').hidden;
    if (document.body.classList.contains('fly-open')) return { top: 56, left: 0, right: 0, bottom: small() ? 96 : 170 };
    if (small()) return { top: 56, left: 0, right: 0, bottom: open ? ($('panel').offsetHeight || Math.round(H * 0.52)) : 110 };
    var left = $('rail').classList.contains('is-shut') ? 0 : (document.body.classList.contains('story-open') ? SLIM : 300);
    var right = open ? $('panel').offsetWidth : 0;
    return { top: 56, left: left, right: right, bottom: document.body.classList.contains('story-open') ? 150 : 0 };
  }
  function padded(extra) {
    var a = clearArea();
    return { top: a.top + extra, left: a.left + extra, right: a.right + extra, bottom: a.bottom + extra };
  }
  function goHome(ms) {
    var b = new maplibregl.LngLatBounds();
    LOGS.forEach(function (l) { l.huts.forEach(function (h) { b.extend(h.at); }); });
    if (!small()) HUTS.forEach(function (h) { b.extend(h.at); }); // on a wide screen, show the whole mission
    map.setPadding({ top: 0, left: 0, right: 0, bottom: 0 });
    var p = padded(small() ? 24 : 70);
    if (!small()) { p.left += 40; p.right += 40; p.bottom += 60; }
    p.bottom = Math.max(0, Math.min(p.bottom, window.innerHeight - p.top - 140)); // always leave room for the map itself
    map.fitBounds(b, { padding: p, pitch: HOME.pitch, bearing: HOME.bearing, duration: reduceMotion ? 0 : ms, maxZoom: 9.2 });
  }

  function initMap() {
    if (!window.maplibregl) { $('mapfail').hidden = false; return; }
    try {
      map = new maplibregl.Map({
        container: 'map', style: style(), attributionControl: false,
        center: [8.72, 46.83], zoom: 7.4, pitch: 0, bearing: 0,
        maxPitch: 78, minZoom: 6, maxBounds: [[3.5, 44.3], [13.2, 49.2]]
      });
    } catch (e) { $('mapfail').hidden = false; return; }
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('error', function () { /* a missing tile should never take the page down */ });

    map.once('style.load', function () {
      mapReady = true;
      map.addSource('routes', {
        type: 'geojson', promoteId: 'id',
        data: { type: 'FeatureCollection', features: LOGS.filter(function (l) { return l.track; }).map(function (l) {
          return { type: 'Feature', properties: { id: l.id }, geometry: { type: 'LineString', coordinates: l.track.map(function (p) { return [p[0], p[1]]; }) } };
        }) }
      });
      map.addSource('walked', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      var isHot = ['boolean', ['feature-state', 'hot'], false];
      var isDim = ['boolean', ['feature-state', 'dim'], false];
      var isAhead = ['boolean', ['feature-state', 'ahead'], false];
      var isOff = ['boolean', ['feature-state', 'off'], false];
      map.addLayer({ id: 'route-case', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-opacity': ['case', isOff, 0, isDim, 0.5, 0.95],
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, ['case', isHot, 6, 3.5], 14, ['case', isHot, 11, 7.5]] } });
      map.addLayer({ id: 'route', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['case', isAhead, '#F0A49D', RED], 'line-opacity': ['case', isOff, 0, isDim, 0.45, 1],
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, ['case', isHot, 3.5, 1.8], 14, ['case', isHot, 6.5, 4]] } });
      map.addLayer({ id: 'walked', type: 'line', source: 'walked', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': RED, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3.5, 14, 6.5] } });
      map.addLayer({ id: 'route-hit', type: 'line', source: 'routes', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 } });
      WMSky.addLayers(map, 'route-case'); // sun shading and colour wash sit on the terrain, under the routes
      addGhosts();
      addShots();

      map.on('mousemove', 'route-hit', function (e) {
        if (!e.features.length) return;
        map.getCanvas().style.cursor = 'pointer';
        setHot(e.features[0].properties.id, { x: e.originalEvent.clientX, y: e.originalEvent.clientY });
      });
      map.on('mouseleave', 'route-hit', function () { map.getCanvas().style.cursor = ''; setHot(null); });
      map.on('click', 'route-hit', function (e) { if (e.features.length && e.features[0].properties.id !== active) openLog(e.features[0].properties.id); });

      addPins();
      applyStates();
      var id = location.hash.replace('#', '');
      if (BY_ID[id]) openLog(id, true); else goHome(3200);
    });
    ['mousedown', 'wheel', 'touchstart'].forEach(function (ev) {
      map.getCanvas().addEventListener(ev, function () {
        if (story) { story.userCam = true; if (story.fly && story.fly.playing) flyPlay(false); }
        stopPano();
      }, { passive: true });
    });
    map.on('movestart', hideCard);
    map.on('zoom', function () { document.body.classList.toggle('peaks-far', map.getZoom() < 11.3); });
  }

  function addPins() {
    LOGS.slice().reverse().forEach(function (l) {
      l.huts.forEach(function (h) {
        var b = el('button', 'pin' + (h.sac ? '' : ' is-nonsac'));
        b.type = 'button';
        b.textContent = l.no;
        b.setAttribute('aria-label', 'Logbook ' + l.no + ', ' + h.name + ', ' + dateRange(l.dates));
        b.addEventListener('mouseenter', function () { setHot(l.id, b, h); });
        b.addEventListener('mouseleave', function () { setHot(null); });
        b.addEventListener('focus', function () { setHot(l.id, b, h); });
        b.addEventListener('blur', function () { setHot(null); });
        b.addEventListener('click', function (e) { e.stopPropagation(); if (l.id !== active) openLog(l.id); });
        new maplibregl.Marker({ element: b, anchor: 'center', opacity: '1', opacityWhenCovered: '1' }).setLngLat(h.at).addTo(map);
        pins.push({ id: l.id, node: b, sac: h.sac });
      });
    });
  }

  function applyStates() {
    document.querySelectorAll('.rail-item').forEach(function (n) {
      n.classList.toggle('is-active', n.dataset.id === active);
      n.classList.toggle('is-hot', n.dataset.id === hot);
    });
    pins.forEach(function (p) {
      p.node.classList.toggle('is-active', p.id === active);
      p.node.classList.toggle('is-hot', p.id === hot);
      p.node.classList.toggle('is-dim', !!active && p.id !== active);
    });
    if (!mapReady) return;
    LOGS.forEach(function (l) {
      if (!l.track) return;
      map.setFeatureState({ source: 'routes', id: l.id }, {
        hot: l.id === hot || l.id === active,
        dim: !!active && l.id !== active && l.id !== hot,
        ahead: !!story && story.l.id === l.id
      });
    });
  }

  // ---------- hover card ----------
  function setHot(id, anchor, hut) {
    if (hot === id && !anchor) return;
    hot = id;
    applyStates();
    if (id && anchor && id !== active) showCard(BY_ID[id], anchor, hut); else hideCard();
  }
  function hideCard() { $('card').hidden = true; }
  function showCard(l, anchor, hut) {
    var c = $('card');
    var stats = '';
    if (l.km) stats += '<div><b>' + fmt(l.km, 1) + ' km</b>distance</div>';
    if (l.gain) stats += '<div><b>' + fmt(l.gain) + ' m</b>climbed</div>';
    if (l.time) stats += '<div><b>' + l.time + '</b>on the move</div>';
    c.innerHTML = (l.cover ? '<img class="card-img" alt="" src="' + esc(l.cover) + '">' : '') +
      '<div class="card-body"><p class="card-kicker">Logbook ' + l.no + ', ' + dateRange(l.dates) + '</p>' +
      '<h3 class="card-title">' + esc(hut && l.huts.length > 1 ? hut.name : l.title) + '</h3>' +
      '<p class="card-sub">' + esc(hut && l.huts.length > 1 ? 'Part of ' + l.title + '. ' + l.sub : l.sub) + '</p>' +
      (stats ? '<div class="card-stats">' + stats + '</div>' : '') +
      '<p class="card-hint">Select to read the logbook</p></div>';
    var im = c.querySelector('img'); if (im) im.addEventListener('error', function () { this.remove(); });
    c.hidden = false;
    var x, y, gap = 22;
    if (anchor.getBoundingClientRect) { var r = anchor.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    else { x = anchor.x; y = anchor.y; }
    var w = c.offsetWidth, h = c.offsetHeight;
    var left = Math.min(Math.max(x - w / 2, 12), window.innerWidth - w - 12);
    var top = y - h - gap;
    if (top < 68) top = Math.min(y + gap, window.innerHeight - h - 12);
    c.style.left = left + 'px'; c.style.top = top + 'px';
  }

  // ---------- basemap ----------
  function setBase(name, byUser) {
    if (byUser) userBase = true;
    document.querySelectorAll('#basemap button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.base === name)); });
    if (!mapReady) return;
    ['summer', 'winter', 'aerial'].forEach(function (k) { map.setLayoutProperty(k, 'visibility', k === name ? 'visible' : 'none'); });
  }

  // =====================================================================
  // Panel
  // =====================================================================
  function endStory() {
    if (!story) return;
    cancelAnimationFrame(story.raf);
    story = null;
    document.body.classList.remove('story-open', 'fly-open', 'is-night');
    $('strip').hidden = true; $('clock').hidden = true; $('flycard').hidden = true;
    if (!replay) hideHud();
    stopPano();
    peakMarks.forEach(function (m) { m.remove(); }); peakMarks = [];
    if (hiker) { hiker.remove(); hiker = null; }
    if (wx) wx.stop();
    if (mapReady) {
      map.getSource('walked').setData({ type: 'FeatureCollection', features: [] });
      map.getSource('shots').setData({ type: 'FeatureCollection', features: [] });
      WMSky.reset(map);
      map.setPaintProperty('ghost', 'circle-opacity', 0.92); map.setPaintProperty('ghost', 'circle-stroke-opacity', 0.9);
    }
  }
  function openPanel(html, wide) {
    endStory();
    $('panel').classList.toggle('is-story', !!wide);
    $('panel-body').innerHTML = html;
    $('panel').hidden = false;
    document.body.classList.add('panel-open');
    $('panel-body').scrollTop = 0;
    $('panel-body').focus({ preventScroll: true });
    if (small()) setRail(false);
  }
  function closePanel() {
    endStory();
    $('panel').hidden = true;
    document.body.classList.remove('panel-open');
    $('nav-mission').removeAttribute('aria-pressed');
    $('nav-about').removeAttribute('aria-pressed');
    if (dot) { dot.remove(); dot = null; }
    if (!userBase) setBase('aerial');
    var was = active;
    active = null; applyStates();
    if (was) history.replaceState(null, '', location.pathname + location.search);
    if (mapReady) goHome(1800);
  }

  // ---------- a logbook, as a story beside the map ----------
  function openLog(id, instant) {
    var l = BY_ID[id];
    if (!l) return;
    if (replay) stopReplay(true);
    hideCard(); hideTip();
    active = id; hot = null;
    $('nav-mission').removeAttribute('aria-pressed');
    $('nav-about').removeAttribute('aria-pressed');
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);

    var sac = l.huts.filter(function (h) { return h.sac; }).length;
    var facts = l.huts.length ? ['<span>' + dateRange(l.dates) + (l.dateGuess ? ' (date to confirm)' : '') + '</span>', '<span>' + esc(l.kind) + '</span>', '<span>Canton ' + l.canton + '</span>'] : [];
    var stats = '';
    if (l.km) stats += '<div><dt>Distance</dt><dd>' + fmt(l.km, 1) + '<small>km</small></dd></div>';
    if (l.gain) stats += '<div><dt>Climbed</dt><dd>' + fmt(l.gain) + '<small>m</small></dd></div>';
    if (l.time) stats += '<div><dt>Time</dt><dd>' + l.time + '</dd></div>';
    if (l.max) stats += '<div><dt>High point</dt><dd>' + fmt(l.max) + '<small>m</small></dd></div>';

    var items = STORIES[l.id] || [];
    var rows = '', lastF = -1, n = 0;
    items.forEach(function (it) {
      var body;
      if (it.k === 'img') {
        body = '<figure class="shot' + (it.h > it.w * 1.15 ? ' is-tall' : '') + '"><img loading="lazy" decoding="async" src="' + esc(it.src) + '" width="' + it.w + '" height="' + it.h + '" alt="' + esc(it.alt || '') + '">' +
          (it.cap ? '<figcaption>' + it.cap + '</figcaption>' : '') + '</figure>';
      } else if (it.k === 'video') {
        body = '<figure class="shot is-video' + (it.ar < 1 ? ' is-tall' : '') + '"><video controls playsinline preload="none" poster="' + esc(it.poster) + '" style="aspect-ratio:' + it.ar + '">' +
          '<source src="' + esc(it.src) + '" type="video/mp4">Your browser cannot play this clip.</video></figure>';
      } else {
        body = '<div class="' + (it.k === 'h' ? 'chapter' : 'prose') + '">' + it.html + '</div>';
      }
      var tl = '';
      if (l.track && it.f != null) {
        var moved = Math.abs(it.f - lastF) > 0.004 || it.k === 'h';
        if (moved) {
          var pt = pointAt(l, it.f * l.total).p;
          tl = '<i class="node' + (it.k === 'h' ? ' is-chapter' : '') + '"></i>' +
            (Math.abs(it.f - lastF) > 0.004 ? '<span class="tl-label"><b>' + fmt(it.f * l.km, 1) + ' km</b>' + fmt(pt[2]) + ' m</span>' : '');
          lastF = it.f;
        }
      }
      rows += '<div class="row" data-i="' + (n++) + '" data-k="' + it.k + '"' + (it.f != null ? ' data-f="' + it.f + '"' : '') + '><div class="tl">' + tl + '</div><div class="rc">' + body + '</div></div>';
    });

    var html = (l.cover ? '<div class="hero"><img alt="" src="' + esc(l.cover) + '"><span class="hero-no" aria-hidden="true">' + l.no + '</span></div>' : '') +
      '<div class="sheet"><p class="kicker">Logbook ' + l.no + '</p><h1>' + esc(l.title) + '</h1><p class="lede">' + esc(l.sub) + '</p>' +
      (facts.length ? '<p class="facts">' + facts.join('') + '</p>' : '') +
      (stats ? '<dl class="stats">' + stats + '</dl>' : '') +
      (l.track ? '<p class="howto">Scroll to walk the route. The hiker on the map keeps pace with the story, and the light and weather on the mountains follow the day' + (l.window ? '' : ', at estimated times') + '.</p>' +
        '<div class="actions"><button type="button" class="btn" id="fly-go"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M6 4.5v11l9-5.5z" fill="currentColor"/></svg>Fly the route</button></div>' : '') + '</div>' +
      '<div class="story' + (l.track ? '' : ' is-plain') + '" id="story">' + rows + '</div>' +
      '<div class="sheet after" id="after">' +
      (l.weather.length ? '<section class="block"><h2>Weather on the day</h2><p class="note">Hourly conditions at the hut’s position and height, 5 am to 9 pm.</p><div id="weather"></div></section>' : '') +
      (l.huts.length ? '<section class="block"><h2>' + (l.huts.length > 1 ? 'Huts on this trip' : 'The hut') + '</h2><ul class="huts">' +
        l.huts.map(function (h) {
          return '<li><b>' + esc(h.label || h.name) + (h.sac ? '<span class="tag">SAC</span>' : '<span class="tag is-off">not a SAC hut</span>') + '</b><span>' + fmt(h.ele) + ' m</span></li>';
        }).join('') + '</ul>' +
        (l.track ? '<div class="actions" style="margin-top:14px">' + l.huts.map(function (h, k) {
          return '<button type="button" class="btn is-quiet" data-pano="' + k + '">Look around from ' + esc(h.label ? 'the high point' : h.name) + '</button>';
        }).join('') + '</div>' : '') + '<p class="note" style="margin-top:12px">' + (sac ? sac + ' of the 153 counted here.' : 'This one does not count toward the 153.') + '</p></section>' : '') +
      (l.weather.length ? '<section class="block"><p class="note">Weather is ERA5 reanalysis from <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, adjusted to the hut’s height. It is a model of the day, not a reading from a station at the hut. On the map, the sun stands where it really stood for that date, place and time. Cloud, rain, snow and wind are drawn from the same hourly record' + (l.window ? ', timed by my watch recording.' : ', at times estimated from the length of the walk.') +
        (l.eleSrc === 'dem' ? ' This route was saved without heights, so the elevations come from the terrain model.' : '') + '</p></section>' : '') +
      nextPrev(l) + '</div>';
    openPanel(html, true);
    var hi = $('panel-body').querySelector('.hero img');
    if (hi) hi.addEventListener('error', function () { this.parentNode.style.display = 'none'; });
    var act = document.querySelector('.rail-item[data-id="' + id + '"]');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    $('panel-body').querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { openLog(b.dataset.go); }); });
    if (l.weather.length) drawWeather(l);

    if (l.track) {
      document.body.classList.add('story-open');
      var its = items.filter(function (it) { return it.f != null; });
      var ck = buildClock(l, its);
      story = { l: l, rows: Array.prototype.slice.call($('story').querySelectorAll('.row[data-f]')), items: its, f: its.map(function (it) { return it.f; }),
        T: ck.T, est: ck.est, clockT: ck.T[0], clockCur: ck.T[0], skyAt: -99, skyT: 0, skyB: 0, arcDay: -1,
        target: 0, cur: 0, mode: 'overview', raf: 0, userCam: false, lastWalk: -1, now: -1, fly: null };
      $('strip').hidden = small();
      drawProfile(l);
      $('fly-go').addEventListener('click', startFly);
      $('panel-body').querySelectorAll('[data-pano]').forEach(function (b) { b.addEventListener('click', function () { startPano(l.huts[+b.dataset.pano]); }); });
    }
    if (!userBase) setBase('aerial');
    applyStates();

    if (mapReady) {
      if (l.track) {
        map.setPadding(clearArea());
        ensureHiker(l.track[0]);
        frame(l, instant);
        setShots(l); setPeaks(l);
        map.setPaintProperty('ghost', 'circle-opacity', 0.3); map.setPaintProperty('ghost', 'circle-stroke-opacity', 0.3);
        onStoryScroll();
        skyUpdate(true);
        story.raf = requestAnimationFrame(tick);
      } else goHome(1600);
    }
  }
  function nextPrev(l) {
    var i = LOGS.indexOf(l), newer = LOGS[i - 1], older = LOGS[i + 1], h = '';
    if (older) h += '<button type="button" class="btn is-quiet" data-go="' + older.id + '">Earlier: ' + esc(older.title) + '</button>';
    if (newer) h += '<button type="button" class="btn is-quiet" data-go="' + newer.id + '">Later: ' + esc(newer.title) + '</button>';
    return h ? '<div class="actions" style="margin-top:34px">' + h + '</div>' : '';
  }

  function frame(l, instant) {
    var b = new maplibregl.LngLatBounds();
    l.track.forEach(function (p) { b.extend([p[0], p[1]]); });
    map.fitBounds(b, { padding: 46, duration: instant || reduceMotion ? 0 : 2400, pitch: 58, bearing: l.bearing, maxZoom: 14.2 });
  }

  // ---------- the hiker ----------
  var HIKER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12.6" cy="4.4" r="2.2" fill="#fff"/>' +
    '<path d="M10.9 7.9c.9-.5 2-.3 2.6.5l1.7 2.4 2.3.9-.6 1.6-2.9-1.1-.9-1.2-.6 3.1 2.3 2.4 1 4.7-1.8.4-.9-4.1-2.2-2.1-2.5 5.9-1.7-.7 2.6-6.1.7-3.9-1.3.8-.8 3-1.7-.4 1-4z" fill="#fff"/>' +
    '<path d="M18.9 10.6v10.6" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>';
  function ensureHiker(p) {
    if (!hiker) hiker = new maplibregl.Marker({ element: el('div', 'hiker', HIKER), anchor: 'center', opacity: '1', opacityWhenCovered: '1' });
    hiker.setLngLat([p[0], p[1]]).addTo(map);
  }
  function ensureDot() {
    if (!dot && mapReady) dot = new maplibregl.Marker({ element: el('div', 'dot'), anchor: 'center' });
    return dot;
  }

  // Where the reading line sits in the story decides how far along the route we are, and what time of day it is.
  function onStoryScroll() {
    if (!story || story.fly) return;
    var body = $('panel-body'), box = body.getBoundingClientRect();
    var line = box.top + box.height * 0.42;
    var rows = story.rows, T = story.T, prev = null, target = null, clock = null, now = -1;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect(), c = r.top + r.height / 2, f = story.f[i];
      if (c >= line) {
        if (!prev) { target = f; clock = T[i]; }
        else { var t = Math.max(0, Math.min(1, (line - prev.c) / (c - prev.c || 1))); target = prev.f + (f - prev.f) * t; clock = T[i - 1] + (T[i] - T[i - 1]) * t; }
        now = (prev && line - prev.c < c - line) ? i - 1 : i;
        break;
      }
      prev = { c: c, f: f };
    }
    if (target == null) { target = prev ? prev.f : 0; clock = T[rows.length - 1]; now = rows.length - 1; }
    story.target = target * story.l.total;
    story.clockT = clock;
    var first = rows[0].getBoundingClientRect(), after = $('after').getBoundingClientRect();
    var mode = (first.top > line + 40 || after.top < line - 40) ? 'overview' : 'follow';
    setNow(now);
    if (mode !== story.mode) {
      story.mode = mode; story.userCam = false; stopPano();
      if (!mapReady) return;
      if (mode === 'overview') frame(story.l);
      else {
        var p = pointAt(story.l, story.target).p;
        map.easeTo({ center: [p[0], p[1]], zoom: Math.max(13.4, Math.min(14.3, map.getZoom() + 1.4)), pitch: 62, bearing: story.l.bearing, duration: reduceMotion ? 0 : 1500 });
      }
    } else if (mode === 'follow') { story.userCam = false; stopPano(); } // scrolling hands the camera back to the story
  }
  function setNow(now) {
    var s = story;
    if (now === s.now) return;
    if (s.rows[s.now]) s.rows[s.now].classList.remove('is-now');
    if (s.rows[now]) s.rows[now].classList.add('is-now');
    s.now = now;
    if (mapReady && s.shotOf) {
      var g = s.shotOf[now];
      if (g !== s.shotOn) {
        if (s.shotOn != null) map.setFeatureState({ source: 'shots', id: s.shotOn }, { on: false });
        if (g != null) map.setFeatureState({ source: 'shots', id: g }, { on: true });
        s.shotOn = g;
      }
    }
  }
  function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }
  function tick(now) {
    if (!story) return;
    var s = story, l = s.l;
    var dt = Math.min(250, now - (s.t || now)); s.t = now;
    if (s.fly) flyStep(dt);
    var gap = s.target - s.cur;
    if (Math.abs(gap) > 0.5 || s.fly) {
      // ease toward the target at the same pace whatever the frame rate (the fly-through sets the pace itself)
      s.cur += (reduceMotion || s.fly) ? gap : gap * (1 - Math.exp(-dt / 220));
      if (Math.abs(s.target - s.cur) < 0.5) s.cur = s.target;
      var pt = pointAt(l, s.cur);
      hiker.setLngLat([pt.p[0], pt.p[1]]);
      if (l._cursor) l._cursor(s.cur);
      if (Math.abs(s.cur - s.lastWalk) > 12) {
        var line = l.track.slice(0, pt.i + 1).map(function (p) { return [p[0], p[1]]; });
        line.push([pt.p[0], pt.p[1]]);
        map.getSource('walked').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.length > 1 ? line : [line[0], line[0]] } });
        s.lastWalk = s.cur;
      }
      if (s.mode === 'follow' && !s.userCam && !map.isEasing()) {
        if (s.fly) {
          var ahead = pointAt(l, Math.min(l.total, s.cur + 320)).p;
          if (hav(pt.p, ahead) > 40) s.fly.bearing += angDiff(bearing(pt.p, ahead), s.fly.bearing) * (1 - Math.exp(-dt / 2200));
          map.jumpTo({ center: [pt.p[0], pt.p[1]], bearing: s.fly.bearing });
        } else map.setCenter([pt.p[0], pt.p[1]]);
      }
    }
    // the clock eases too, so dusk falls smoothly however fast the reader scrolls
    var cg = s.clockT - s.clockCur;
    if (Math.abs(cg) > 0.001) s.clockCur += (reduceMotion || s.fly) ? cg : cg * (1 - Math.exp(-dt / 380));
    if (Math.abs(s.clockCur - s.skyAt) > 0.012 || (now - s.skyT > 500 && Math.abs(angDiff(map.getBearing(), s.skyB)) > 3)) { s.skyT = now; skyUpdate(); }
    s.raf = requestAnimationFrame(tick);
  }

  // ---------- the clock: what time it was at each point of the story ----------
  // The watch recording gives the start and end. Between them time runs with distance. On an overnight trip the
  // rows written at the hut carry the evening, the night and the next morning.
  function buildClock(l, items) {
    var n = l.dates.length, mov = l.time ? hm(l.time) : (l.km / 4 + l.gain / 500), W = l.window || null;
    var N = items.length, T = new Array(N), day = new Array(N), i, d = 0;
    var rise = function (k) { return l.weather[k] ? hm(l.weather[k].sunrise) : 6.5; };
    var sett = function (k) { return l.weather[k] ? hm(l.weather[k].sunset) : 19.5; };
    var marks = items.filter(function (it) { return it.k === 'h' && /Day\s*\d/i.test(it.html); }).length;
    if (n === 1) for (i = 0; i < N; i++) day[i] = 0;
    else if (marks >= n - 1) {
      for (i = 0; i < N; i++) { var m = items[i].k === 'h' && /Day\s*(\d)/i.exec(items[i].html); if (m) d = clamp(+m[1] - 1, d, n - 1); day[i] = d; }
    } else {
      var huts = l.huts.slice().sort(function (a, b) { return a.idx - b.idx; });
      var stops = (huts.length <= n - 1 ? huts : n === 2 ? [huts[0]] : [huts[0], huts[huts.length - 1]]).map(function (h) { return l.cum[h.idx] / l.total; });
      for (i = 0; i < N; i++) { while (d < stops.length && items[i].f > stops[d] + 0.012) d++; day[i] = Math.min(d, n - 1); }
    }
    // each day: its rows, how far they travel, and which trailing rows are spent at the hut
    var D = [], all = 0;
    for (d = 0; d < n; d++) D.push({ rows: [], path: [], len: 0, stay: 0 });
    for (i = 0; i < N; i++) {
      var o = D[day[i]];
      if (o.rows.length) o.len += Math.abs(items[i].f - items[i - 1].f);
      o.rows.push(i); o.path.push(o.len);
    }
    D.forEach(function (o, k) {
      all += o.len;
      if (k < n - 1 && o.rows.length) { // also when the story ends at the hut: its last rows carry the evening
        var end = items[o.rows[o.rows.length - 1]].f, j = o.rows.length - 1;
        while (j >= 0 && Math.abs(items[o.rows[j]].f - end) < 0.012) j--;
        o.stay = o.rows.length - 1 - j;
      }
    });
    D.forEach(function (o, k) {
      var span = Math.max(0.6, (o.len / Math.max(1, all)) * mov * 1.25), dusk = sett(k) - 1.5; // o.len is a share of the route
      if (n === 1) { o.dep = W ? W[1] : clamp(12.5 - span / 2, 7.5, 11); o.arr = W ? W[3] : o.dep + span; }
      else if (k === 0) { o.dep = W ? W[1] : 11; o.arr = Math.min(o.dep + span, Math.max(dusk, o.dep + 0.5)); }
      else if (k === n - 1 && W) { o.arr = W[3]; o.dep = clamp(o.arr - span, 5.5, Math.max(5.5, o.arr - 0.5)); }
      else { o.dep = 8.25; o.arr = Math.min(o.dep + span, dusk); }
    });
    D.forEach(function (o, k) {
      var moving = o.rows.length - o.stay, reach = moving > 0 ? o.path[Math.max(0, moving - 1)] : 0, j;
      if (o.stay) reach = o.path[o.rows.length - o.stay]; // the hut itself is where the day's walking ends
      for (j = 0; j < moving; j++) T[o.rows[j]] = 24 * k + o.dep + (reach ? Math.min(1, o.path[j] / reach) : 0) * (o.arr - o.dep);
      if (!o.stay) return;
      var a = 24 * k + o.arr, ss = 24 * k + sett(k), sr = 24 * (k + 1) + rise(k + 1), dp = 24 * (k + 1) + D[k + 1].dep;
      var K = D[k + 1].rows.length ? [a, ss - 1, ss - 0.1, ss + 0.55, 24 * k + 23.6, sr - 0.7, sr + 0.25, dp] : [a, ss - 1, ss - 0.1, ss + 0.6, 24 * k + 22.8];
      if (!D[k + 1].rows.length) dp = K[K.length - 1] + 0.3;
      for (j = 1; j < K.length; j++) K[j] = Math.max(K[j], K[j - 1] + 0.05);
      for (j = K.length - 2; j >= 0; j--) K[j] = Math.min(K[j], dp - 0.05 * (K.length - 1 - j));
      for (j = 0; j < o.stay; j++) {
        var x = (j / o.stay) * (K.length - 1), xi = Math.floor(x);
        T[o.rows[moving + j]] = K[xi] + (K[Math.min(K.length - 1, xi + 1)] - K[xi]) * (x - xi);
      }
    });
    for (i = 1; i < N; i++) if (!(T[i] >= T[i - 1])) T[i] = T[i - 1]; // time never runs backwards
    return { T: T, est: !W };
  }
  function weatherAt(l, T) {
    var d = clamp(Math.floor(T / 24), 0, l.weather.length - 1), day = l.weather[d];
    if (!day) return null;
    var h = T - 24 * d, x = clamp(h - 5, 0, 16), i = Math.floor(x), j = Math.min(16, i + 1), t = x - i;
    var v = function (a) { return a[i] + (a[j] - a[i]) * t; };
    var temp = v(day.temp), rain = v(day.rain);
    return { d: d, day: day, hour: h, temp: temp, cloud: v(day.cloud) / 100, rain: rain, gust: v(day.gusts),
      snow: rain > 0.04 && (temp <= 0.8 || (day.snow > 0 && temp <= 2.5)) };
  }
  function skyUpdate(force) {
    var s = story;
    if (!s || !mapReady) return;
    s.skyAt = s.clockCur; s.skyB = map.getBearing();
    var w = weatherAt(s.l, s.clockCur);
    if (!w) return;
    var pt = pointAt(s.l, s.cur).p, sn = WMSky.sun(s.l.dates[0], s.clockCur, pt[1], pt[0]);
    w.az = sn.az; w.alt = sn.alt;
    drawClock(s, w, sn, pt);
    if (!lightOn) return;
    var L = WMSky.apply(map, w);
    if (!wx) wx = new WMSky.Overlay($('wx-shade'), $('wx-fall'));
    wx.still = reduceMotion;
    wx.set(w, L, s.skyB);
    document.body.classList.toggle('is-night', L.night > 0.6);
  }
  var DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function drawClock(s, w, sn, pt) {
    var p = parts(w.day.date), night = sn.alt < -4;
    $('clock').hidden = false;
    $('clock-time').textContent = DOW3[p.dow] + ' ' + p.d + ' ' + MON[p.m] + ', ' + (s.est ? 'about ' : '') + clockText(w.hour);
    var c = w.cloud * 100, sky = c < 15 ? (night ? 'clear night' : 'clear') : c < 40 ? (night ? 'mostly clear' : 'mostly sunny') : c < 65 ? 'partly cloudy' : c < 88 ? 'mostly cloudy' : 'overcast';
    if (w.rain > 0.04) sky = (w.rain < 0.6 ? 'light ' : '') + (w.snow ? 'snow' : 'rain');
    $('clock-wx').textContent = fmt(w.temp) + '°, ' + sky + ', gusts ' + fmt(w.gust) + ' km/h';
    // the sun's real path over the day, with the sun (or moon) where it is now
    var X = function (h) { return 6 + (h / 24) * 108; }, Y = function (alt) { return 31 - clamp(alt, -22, 70) * 0.4; };
    if (s.arcDay !== w.d) {
      s.arcDay = w.d;
      var a = $('clock-arc'); a.innerHTML = '';
      var up = '', down = '', k, last = null;
      for (k = 0; k <= 96; k++) {
        var hh = k / 4, alt = WMSky.sun(s.l.dates[0], 24 * w.d + hh, pt[1], pt[0]).alt, seg = alt >= 0 ? 'u' : 'd';
        var cmd = (last === seg ? 'L' : 'M') + X(hh).toFixed(1) + ' ' + Y(alt).toFixed(1);
        if (seg === 'u') up += cmd; else down += cmd;
        last = seg;
      }
      a.appendChild(svg('path', { d: down, fill: 'none', stroke: '#9AA6AE', 'stroke-width': 1.5, 'stroke-dasharray': '2 3', 'stroke-linecap': 'round' }));
      a.appendChild(svg('line', { x1: 4, x2: 116, y1: 31, y2: 31, stroke: LINE, 'stroke-width': 1 }));
      a.appendChild(svg('path', { d: up, fill: 'none', stroke: '#E8A317', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      s.arcSun = svg('circle', { r: 5.5, stroke: '#fff', 'stroke-width': 2 });
      a.appendChild(s.arcSun);
    }
    s.arcSun.setAttribute('cx', X(w.hour).toFixed(1)); s.arcSun.setAttribute('cy', Y(sn.alt).toFixed(1));
    s.arcSun.setAttribute('fill', sn.alt > 6 ? '#F2B01E' : sn.alt > -1 ? '#F0763A' : '#8E9BB0');
  }
  function setLight(on) {
    lightOn = on;
    $('light').setAttribute('aria-pressed', String(on));
    if (!mapReady) return;
    if (!on) { WMSky.reset(map); if (wx) wx.stop(); document.body.classList.remove('is-night'); }
    else if (story) skyUpdate(true);
  }

  // ---------- photo spots along the route ----------
  function addShots() {
    map.addSource('shots', { type: 'geojson', promoteId: 'id', data: { type: 'FeatureCollection', features: [] } });
    var on = ['boolean', ['feature-state', 'on'], false];
    map.addLayer({ id: 'shots', type: 'circle', source: 'shots', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', on, 5, 2.5], 14, ['case', on, 9, 5.5]],
      'circle-color': ['case', on, RED, '#FFFFFF'], 'circle-stroke-color': ['case', on, '#FFFFFF', INK], 'circle-stroke-width': ['case', on, 3, 2] } });
    map.addLayer({ id: 'shots-hit', type: 'circle', source: 'shots', paint: { 'circle-radius': 15, 'circle-color': '#000', 'circle-opacity': 0 } });
    map.on('mousemove', 'shots-hit', function (e) {
      if (!story || !e.features.length) return;
      var g = story.shots[e.features[0].properties.id];
      if (!g) return;
      map.getCanvas().style.cursor = 'pointer';
      var it = story.items[g.rows[0]];
      showTip('<img alt="" src="' + esc(it.k === 'video' ? it.poster : it.src) + '"><b>' + (g.rows.length > 1 ? g.rows.length + ' photos' : (it.k === 'video' ? 'Clip' : 'Photo')) + ' at ' + fmt(g.f * story.l.km, 1) + ' km</b><br>Select to read from here', e.originalEvent.clientX, e.originalEvent.clientY - 8);
    });
    map.on('mouseleave', 'shots-hit', function () { map.getCanvas().style.cursor = ''; hideTip(); });
    map.on('click', 'shots-hit', function (e) {
      if (!story || !e.features.length) return;
      var g = story.shots[e.features[0].properties.id];
      if (!g) return;
      hideTip();
      if (story.fly) { story.fly.u = g.rows[0]; story.fly.hold = 0; flyArrive(g.rows[0]); } else scrollToRow(g.rows[0]);
    });
  }
  function setShots(l) {
    var s = story, groups = [], last = null;
    s.shotOf = {}; s.shotOn = null;
    s.items.forEach(function (it, i) {
      if (it.k !== 'img' && it.k !== 'video') return;
      if (last && Math.abs(last.f - it.f) < 0.0015) last.rows.push(i);
      else { last = { f: it.f, rows: [i] }; groups.push(last); }
      s.shotOf[i] = groups.length - 1;
    });
    s.shots = groups;
    map.getSource('shots').setData({ type: 'FeatureCollection', features: groups.map(function (g, k) {
      var p = pointAt(l, g.f * l.total).p;
      return { type: 'Feature', properties: { id: k }, geometry: { type: 'Point', coordinates: [p[0], p[1]] } };
    }) });
  }
  function scrollToRow(i) {
    var row = story.rows[i], body = $('panel-body');
    if (!row) return;
    var y = row.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - body.clientHeight * 0.42 + row.offsetHeight / 2;
    body.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- summit names around the route, and the look-around from a hut ----------
  function setPeaks(l) {
    var near = [], step = Math.max(1, Math.floor(l.track.length / 40)), max = small() ? 7 : 13;
    PEAKS.forEach(function (pk) {
      var at = [pk[2], pk[3]], best = Infinity;
      for (var i = 0; i < l.track.length; i += step) best = Math.min(best, hav(l.track[i], at));
      l.huts.forEach(function (h) { best = Math.min(best, hav(h.at, at)); });
      if (best < 7500) near.push({ pk: pk, at: at });
    });
    var keep = [];
    near.forEach(function (c) { // highest first; skip one that crowds a higher neighbour
      if (keep.length >= max) return;
      if (keep.some(function (k) { return hav(k.at, c.at) < 900; })) return;
      keep.push(c);
    });
    keep.forEach(function (c) {
      var n = el('div', 'peak', '<b>' + esc(c.pk[0]) + '</b><span>' + fmt(c.pk[1]) + ' m</span>');
      peakMarks.push(new maplibregl.Marker({ element: n, anchor: 'bottom', offset: [0, -2], opacity: '1', opacityWhenCovered: '0.12' }).setLngLat(c.at).addTo(map));
    });
  }
  function startPano(h) {
    if (!story || !mapReady) return;
    if (story.fly) stopFly();
    stopPano();
    story.userCam = true;
    pano = { raf: 0, t: 0, turned: 0 };
    showHud('Looking around from ' + (h.label ? 'the high point' : h.name), 'The names are the summits around the hut. Drag the map to take over.', [['Stop', stopPano]]);
    map.easeTo({ center: h.at, zoom: small() ? 12.4 : 12.9, pitch: 73, duration: reduceMotion ? 0 : 1600 });
    var spin = function (now) {
      if (!pano) return;
      var dt = Math.min(100, now - (pano.t || now)); pano.t = now;
      if (!map.isEasing()) {
        var step = dt * (360 / 70000); // one turn in 70 seconds
        pano.turned += step;
        map.setBearing(map.getBearing() + step);
        if (pano.turned >= 360) { stopPano(); return; }
      }
      pano.raf = requestAnimationFrame(spin);
    };
    if (!reduceMotion) pano.raf = requestAnimationFrame(spin);
  }
  function stopPano() {
    if (!pano) return;
    cancelAnimationFrame(pano.raf); pano = null;
    if (!replay && !(story && story.fly)) hideHud();
  }

  // ---------- the heads-up strip used by the fly-through, the look-around and the replay ----------
  function showHud(title, sub, btns, bar) {
    $('hud-title').textContent = title; $('hud-sub').textContent = sub || '';
    var host = $('hud-btns'); host.innerHTML = '';
    (btns || []).forEach(function (b) {
      var n = el('button', 'btn' + (b[2] ? '' : ' is-quiet')); n.type = 'button'; n.textContent = b[0];
      n.addEventListener('click', b[1]); host.appendChild(n);
    });
    $('hud-bar').hidden = !bar;
    $('hud').hidden = false;
  }
  function hideHud() { $('hud').hidden = true; }

  // ---------- fly the route: the camera follows the hiker, photos surface as they are reached ----------
  function startFly() {
    var s = story;
    if (!s || !mapReady || s.fly) return;
    stopPano();
    var l = s.l;
    s.fly = { u: Math.max(0, Math.min(s.now, s.rows.length - 2)), hold: 0, playing: true, bearing: map.getBearing(), v: l.total / clamp(l.km * 5.5, 30, 100), card: 0 };
    if (s.now >= s.rows.length - 1) s.fly.u = 0;
    document.body.classList.add('fly-open');
    s.mode = 'follow'; s.userCam = false;
    map.setPadding(clearArea());
    if (!small()) drawProfile(l);
    var p = pointAt(l, s.f[Math.floor(s.fly.u)] * l.total).p;
    map.easeTo({ center: [p[0], p[1]], zoom: small() ? 13.3 : 13.9, pitch: 66, duration: reduceMotion ? 0 : 1400 });
    flyHud();
    flyArrive(Math.floor(s.fly.u));
  }
  function flyHud() {
    var s = story, F = s.fly;
    showHud(s.l.title, F.done ? 'End of the route' : (F.playing ? 'Flying the route' : 'Paused'), [
      [F.done ? 'Fly again' : (F.playing ? 'Pause' : 'Play'), function () { if (F.done) { F.u = 0; F.done = false; flyArrive(0); flyPlay(true); } else flyPlay(!F.playing); }, true],
      ['Back to the story', stopFly]
    ], true);
  }
  function flyPlay(on) {
    var s = story;
    if (!s || !s.fly) return;
    s.fly.playing = on;
    if (on) { s.userCam = false; s.mode = 'follow'; }
    flyHud();
  }
  function flyArrive(i) {
    var s = story, F = s.fly, it = s.items[i];
    setNow(i);
    if (!it) return;
    if (it.k === 'img' || it.k === 'video') {
      var pt = pointAt(s.l, it.f * s.l.total).p;
      $('flycard-img').src = it.k === 'video' ? it.poster : it.src;
      $('flycard-cap').textContent = fmt(it.f * s.l.km, 1) + ' km, ' + fmt(pt[2]) + ' m';
      $('flycard').hidden = false; $('flycard').classList.remove('is-in'); void $('flycard').offsetWidth; $('flycard').classList.add('is-in');
      F.hold = 2600; F.card = 5200;
    } else if (it.k === 'h') {
      $('hud-sub').textContent = it.html.replace(/<[^>]+>/g, '');
      F.hold = 900;
    }
  }
  function flyStep(dt) {
    var s = story, F = s.fly, last = s.rows.length - 1;
    if (F.card > 0 && F.playing) { F.card -= dt; if (F.card <= 0) $('flycard').hidden = true; }
    if (F.playing) {
      if (F.hold > 0) F.hold -= dt;
      else {
        var i = Math.min(Math.floor(F.u), last), j = i + 1;
        if (j > last) { F.playing = false; F.done = true; flyHud(); }
        else {
          var dM = Math.abs(s.f[j] - s.f[i]) * s.l.total, dT = Math.abs(s.T[j] - s.T[i]);
          var dur = Math.max(dM / F.v, dT > 0.7 ? 1.5 : 0.1); // a night at the hut gets a moment to pass
          F.u = Math.min(j, F.u + dt / 1000 / dur);
          if (F.u >= j) flyArrive(j);
        }
      }
    }
    var a = Math.min(Math.floor(F.u), last), b = Math.min(a + 1, last), t = F.u - a;
    s.target = (s.f[a] + (s.f[b] - s.f[a]) * t) * s.l.total;
    s.clockT = s.T[a] + (s.T[b] - s.T[a]) * t;
    $('hud-fill').style.width = (last ? (F.u / last) * 100 : 0).toFixed(1) + '%';
  }
  function stopFly() {
    var s = story;
    if (!s || !s.fly) return;
    var at = Math.round(s.fly.u);
    s.fly = null;
    document.body.classList.remove('fly-open');
    $('flycard').hidden = true; hideHud();
    map.setPadding(clearArea());
    if (!small()) drawProfile(s.l);
    s.userCam = false;
    var row = s.rows[at], body = $('panel-body');
    if (row) body.scrollTop = row.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - body.clientHeight * 0.42 + row.offsetHeight / 2;
    s.mode = ''; onStoryScroll();
  }

  // =====================================================================
  // Charts
  // =====================================================================
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function niceStep(span, target) {
    var raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }
  var tip = $('tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(x - w / 2, 8), window.innerWidth - w - 8) + 'px';
    tip.style.top = Math.max(y - h - 12, 8) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // Elevation profile along the bottom of the map. The marker on it is the hiker.
  function drawProfile(l) {
    var host = $('strip-chart'); host.innerHTML = '';
    var W = Math.max(320, Math.round($('strip').clientWidth - 28)), H = 112, m = { t: 18, r: 10, b: 20, l: 40 };
    var total = l.total;
    var step = niceStep(l.max - l.min, 3);
    var y0 = Math.floor(l.min / step) * step, y1 = Math.ceil(l.max / step) * step;
    if (y1 === y0) y1 = y0 + step;
    var X = function (d) { return m.l + (d / total) * (W - m.l - m.r); };
    var Y = function (e) { return H - m.b - ((e - y0) / (y1 - y0)) * (H - m.t - m.b); };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Elevation profile from ' + fmt(l.min) + ' to ' + fmt(l.max) + ' metres over ' + fmt(l.km, 1) + ' kilometres' });
    for (var e = y0; e <= y1 + 1e-6; e += step) {
      s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: Y(e), y2: Y(e), stroke: LINE, 'stroke-width': 1 }));
      s.appendChild(svg('text', { x: m.l - 6, y: Y(e) + 4, 'text-anchor': 'end' }, fmt(e)));
    }
    var kmStep = niceStep(l.km, 6);
    for (var k = 0; k <= l.km + 1e-6; k += kmStep) {
      s.appendChild(svg('text', { x: X((k / l.km) * total), y: H - 5, 'text-anchor': k === 0 ? 'start' : 'middle' }, k === 0 ? '0 km' : fmt(k, kmStep < 1 ? 1 : 0)));
    }
    var d = '', i;
    for (i = 0; i < l.track.length; i++) d += (i ? 'L' : 'M') + X(l.cum[i]).toFixed(1) + ' ' + Y(l.track[i][2]).toFixed(1);
    s.appendChild(svg('path', { d: d + 'L' + X(total) + ' ' + (H - m.b) + 'L' + m.l + ' ' + (H - m.b) + 'Z', fill: RED, 'fill-opacity': 0.1 }));
    var clipId = 'walked-clip';
    var defs = svg('defs', {}), clip = svg('clipPath', { id: clipId }), clipRect = svg('rect', { x: 0, y: 0, width: m.l, height: H });
    clip.appendChild(clipRect); defs.appendChild(clip); s.appendChild(defs);
    s.appendChild(svg('path', { d: d, fill: 'none', stroke: '#F0A49D', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    s.appendChild(svg('path', { d: d, fill: 'none', stroke: RED, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'clip-path': 'url(#' + clipId + ')' }));
    var lastX = -99;
    l.huts.forEach(function (h) {
      if (h.label) return;
      var hx = X(l.cum[h.idx]), hy = Y(l.track[h.idx][2]);
      s.appendChild(svg('circle', { cx: hx, cy: hy, r: 4, fill: RED, stroke: '#fff', 'stroke-width': 2 }));
      if (hx - lastX > 84) {
        var anchor = hx > W - 80 ? 'end' : hx < m.l + 60 ? 'start' : 'middle';
        s.appendChild(svg('text', { x: hx, y: Math.max(hy - 8, 10), 'text-anchor': anchor, 'class': 'hutlabel' }, h.name));
        lastX = hx;
      }
    });
    var me = svg('circle', { r: 6, fill: RED, stroke: '#fff', 'stroke-width': 2.5, cx: X(0), cy: Y(l.track[0][2]) });
    s.appendChild(me);
    var ghost = svg('g', { visibility: 'hidden' });
    var gl = svg('line', { y1: m.t - 6, y2: H - m.b, stroke: INK, 'stroke-width': 1 });
    var gc = svg('circle', { r: 4.5, fill: '#FFD100', stroke: INK, 'stroke-width': 2 });
    ghost.appendChild(gl); ghost.appendChild(gc); s.appendChild(ghost);
    host.appendChild(s);

    l._cursor = function (dist) {
      var pt = pointAt(l, dist), x = X(dist);
      me.setAttribute('cx', x); me.setAttribute('cy', Y(pt.p[2]));
      clipRect.setAttribute('width', x);
      $('strip-now').textContent = fmt((dist / total) * l.km, 1) + ' km in, ' + fmt(pt.p[2]) + ' m';
    };
    l._cursor(story ? story.cur : 0);
    var distAt = function (ev) {
      var r = s.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      return Math.min(total, Math.max(0, ((px - m.l) / (W - m.l - m.r)) * total));
    };
    host.onpointermove = function (ev) {
      var dist = distAt(ev), pt = pointAt(l, dist), x = X(dist), r = s.getBoundingClientRect();
      gl.setAttribute('x1', x); gl.setAttribute('x2', x); gc.setAttribute('cx', x); gc.setAttribute('cy', Y(pt.p[2]));
      ghost.setAttribute('visibility', 'visible');
      var dd = ensureDot(); if (dd) dd.setLngLat([pt.p[0], pt.p[1]]).addTo(map);
      showTip('<b>' + fmt(pt.p[2]) + ' m</b><br>' + fmt((dist / total) * l.km, 1) + ' km in<br>Select to jump the story here', r.left + (x / W) * r.width, r.top + (Y(pt.p[2]) / H) * r.height);
    };
    host.onpointerleave = function () { hideTip(); ghost.setAttribute('visibility', 'hidden'); if (dot) { dot.remove(); dot = null; } };
    host.onclick = function (ev) {
      if (!story) return;
      var f = distAt(ev) / total, best = null, bd = 9;
      story.rows.forEach(function (r) { var d = Math.abs(+r.dataset.f - f); if (d < bd) { bd = d; best = r; } });
      if (best) { var bi = story.rows.indexOf(best); if (story.fly) { story.fly.u = bi; story.fly.hold = 0; flyArrive(bi); } else scrollToRow(bi); }
    };
  }

  function skyWords(day, from, to) {
    var c = 0, n = 0;
    for (var h = from; h <= to; h++) { c += day.cloud[h - 5]; n++; }
    c = c / n;
    var sky = c < 15 ? 'Clear' : c < 40 ? 'Mostly sunny' : c < 65 ? 'Partly cloudy' : c < 88 ? 'Mostly cloudy' : 'Overcast';
    var wet = day.rain.reduce(function (a, b) { return a + b; }, 0);
    if (wet >= 0.5) {
      var snowy = day.snow > 0 && day.tmax < 3;
      var mixed = day.snow > 0 && !snowy;
      sky += ', ' + (wet < 3 ? 'light ' : '') + (snowy ? 'snow' : mixed ? 'rain and snow' : 'rain');
    }
    return sky;
  }

  function drawWeather(l) {
    var host = $('weather'); host.innerHTML = '';
    l.weather.forEach(function (day) {
      var block = el('div', 'day');
      var win = null;
      if (l.window) {
        var a = l.window[0] === day.date ? l.window[1] : (l.window[0] < day.date ? 5 : null);
        var b = l.window[2] === day.date ? l.window[3] : (l.window[2] > day.date ? 21 : null);
        if (a != null && b != null) win = [Math.max(5, a), Math.min(21, b)];
      }
      var from = win ? Math.max(5, Math.floor(win[0])) : 8, to = win ? Math.min(21, Math.ceil(win[1])) : 17;
      var wet = day.rain.reduce(function (x, y) { return x + y; }, 0);
      block.innerHTML = '<div class="day-head"><h3>' + dayName(day.date) + '</h3><p>' + skyWords(day, from, to) + '</p></div>' +
        '<div class="day-facts">' +
        '<div><b>' + fmt(day.tmax) + '° / ' + fmt(day.tmin) + '°</b>high and low</div>' +
        '<div><b>' + (day.snow > 0 ? fmt(day.snow, 1) + ' cm' : fmt(day.precip, 1) + ' mm') + '</b>' + (day.snow > 0 ? 'new snow' : 'rain') + '</div>' +
        '<div><b>' + day.gust + ' km/h</b>strongest gust</div>' +
        '<div><b>' + fmt(day.sun, 1) + ' h</b>sunshine</div></div>' +
        '<p class="chart-label">Temperature, °C, with cloud cover underneath' + (win ? '. The shaded span is when my watch was recording.' : '') + '</p>';
      var chart = el('div', 'chart'); block.appendChild(chart);
      host.appendChild(block);

      var W = 560, H = 132, m = { t: 12, r: 8, b: 40, l: 38 };
      var tmin = Math.min.apply(null, day.temp), tmax = Math.max.apply(null, day.temp);
      var step = niceStep(Math.max(tmax - tmin, 4), 3);
      var y0 = Math.floor(tmin / step) * step, y1 = Math.ceil(tmax / step) * step;
      if (y1 === y0) y1 += step;
      var X = function (h) { return m.l + ((h - 5) / 16) * (W - m.l - m.r); };
      var Y = function (t) { return H - m.b - ((t - y0) / (y1 - y0)) * (H - m.t - m.b); };
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Hourly temperature and cloud cover on ' + dayName(day.date) });
      if (win) s.appendChild(svg('rect', { x: X(win[0]), y: m.t - 4, width: Math.max(2, X(win[1]) - X(win[0])), height: H - m.b - m.t + 4, fill: '#F2F4F6' }));
      for (var t = y0; t <= y1 + 1e-6; t += step) {
        s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? GRANITE : LINE, 'stroke-width': 1, 'stroke-dasharray': t === 0 ? '3 3' : '' }));
        s.appendChild(svg('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, t + '°'));
      }
      var d = '';
      day.temp.forEach(function (v, i) { d += (i ? 'L' : 'M') + X(i + 5).toFixed(1) + ' ' + Y(v).toFixed(1); });
      s.appendChild(svg('path', { d: d, fill: 'none', stroke: RED, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      var cw = (W - m.l - m.r) / 16;
      day.cloud.forEach(function (c, i) {
        var g = Math.round(242 - (c / 100) * 150);
        s.appendChild(svg('rect', { x: X(i + 5) - cw / 2 + 1, y: H - m.b + 8, width: cw - 2, height: 9, fill: 'rgb(' + g + ',' + (g + 4) + ',' + (g + 8) + ')' }));
      });
      [6, 9, 12, 15, 18, 21].forEach(function (h) { s.appendChild(svg('text', { x: X(h), y: H - 4, 'text-anchor': 'middle' }, (h < 10 ? '0' : '') + h + ':00')); });
      var cur = svg('g', { visibility: 'hidden' });
      var cl = svg('line', { y1: m.t - 4, y2: H - m.b + 17, stroke: INK, 'stroke-width': 1 });
      var cc = svg('circle', { r: 4.5, fill: RED, stroke: '#fff', 'stroke-width': 2 });
      cur.appendChild(cl); cur.appendChild(cc); s.appendChild(cur);
      chart.appendChild(s);
      if (wet > 0) {
        var p = el('p', 'chart-label');
        p.textContent = 'Rain or snow fell in ' + day.rain.filter(function (v) { return v > 0; }).length + ' of these 17 hours, ' + fmt(wet, 1) + ' mm in all. Hover the chart for each hour.';
        block.appendChild(p);
      }
      var onMove = function (ev) {
        var r = s.getBoundingClientRect();
        var px = ((ev.clientX - r.left) / r.width) * W;
        var i = Math.min(16, Math.max(0, Math.round(((px - m.l) / (W - m.l - m.r)) * 16)));
        var x = X(i + 5);
        cl.setAttribute('x1', x); cl.setAttribute('x2', x);
        cc.setAttribute('cx', x); cc.setAttribute('cy', Y(day.temp[i]));
        cur.setAttribute('visibility', 'visible');
        showTip('<b>' + (i + 5 < 10 ? '0' : '') + (i + 5) + ':00</b><br>' + day.temp[i] + '°C, cloud ' + day.cloud[i] + '%<br>Gusts ' + day.gusts[i] + ' km/h' + (day.rain[i] > 0 ? '<br>Precipitation ' + day.rain[i] + ' mm' : ''),
          r.left + (x / W) * r.width, r.top + (Y(day.temp[i]) / H) * r.height);
      };
      chart.addEventListener('pointermove', onMove);
      chart.addEventListener('pointerdown', onMove);
      chart.addEventListener('pointerleave', function () { hideTip(); cur.setAttribute('visibility', 'hidden'); });
    });
  }

  // =====================================================================
  // Mission and About
  // =====================================================================
  function leavePanelFor(nav) {
    if (active) { active = null; history.replaceState(null, '', location.pathname + location.search); }
    if (dot) { dot.remove(); dot = null; }
    $('nav-mission').removeAttribute('aria-pressed'); $('nav-about').removeAttribute('aria-pressed');
    $(nav).setAttribute('aria-pressed', 'true');
    if (!userBase) setBase('aerial');
  }
  function afterSidePanel() { applyStates(); if (mapReady) goHome(1400); }
  function openMission() {
    leavePanelFor('nav-mission');
    openPanel(window.WMPages.mission(), false);
    window.WMPages.missionWire($('panel-body'));
    afterSidePanel();
  }
  function openAbout() {
    leavePanelFor('nav-about');
    openPanel('<div class="sheet prose" style="padding-top:34px"><h1>Visit all 153 SAC huts in Switzerland</h1>' +
      '<p>The Swiss Alpine Club runs about 153 official huts, most of them high in the Alps. This site is the logbook of my attempt to reach every one, with the route, photos and notes from each trip.</p>' +
      '<section class="block"><h2>The rules</h2>' +
      '<p>A hut counts once I have physically touched it. A night, a meal or just getting within selfie distance all qualify.</p>' +
      '<p>Sleeping over is optional. A night in each would mean 153 nights away from home.</p>' +
      '<p>Huts that need real mountaineering skills or equipment wait until I have built up to them. For now I go for the ones reachable on foot in summer or on skis in winter.</p>' +
      '<p>There is no deadline. Eight to ten huts a year puts the finish 15 to 20 years out.</p></section>' +
      '<section class="block"><h2>Reading the map</h2>' +
      '<p>Red lines are routes I recorded on my watch. Each numbered pin is a hut and opens its logbook. A white pin marks a hut that is not on the SAC list, and the small white dots are the SAC huts still to come. Inside a logbook, scroll the story and the hiker walks the route beside it, in the light and weather of that day. The Light button switches that off.</p>' +
      '<p>Drag to pan, scroll to zoom, and hold the right mouse button or use two fingers to tilt and turn. Maps are from swisstopo. Terrain is from Mapterhorn.</p></section></div>', false);
    afterSidePanel();
  }

  // =====================================================================
  // The whole mission on the map: huts still to visit, and the replay
  // =====================================================================
  function addGhosts() {
    map.addSource('ghosts', { type: 'geojson', data: { type: 'FeatureCollection', features: HUTS.map(function (h, i) {
      return h.log ? null : { type: 'Feature', properties: { i: i }, geometry: { type: 'Point', coordinates: h.at } };
    }).filter(Boolean) } });
    map.addLayer({ id: 'ghost', type: 'circle', source: 'ghosts', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.4, 9, 4.6, 13, 7.5],
      'circle-color': '#FFFFFF', 'circle-opacity': 0.92, 'circle-stroke-color': '#3A454E', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.9 } });
    map.addLayer({ id: 'ghost-hit', type: 'circle', source: 'ghosts', paint: { 'circle-radius': 13, 'circle-color': '#000', 'circle-opacity': 0 } });
    var words = function (h) { return '<b>' + esc(h.n) + '</b><br>' + fmt(h.ele) + ' m, ' + esc(h.p) + ' (' + h.c + ')<br>Not visited yet'; };
    map.on('mousemove', 'ghost-hit', function (e) {
      if (!e.features.length || story) return;
      map.getCanvas().style.cursor = 'pointer';
      showTip(words(HUTS[e.features[0].properties.i]), e.originalEvent.clientX, e.originalEvent.clientY - 6);
    });
    map.on('mouseleave', 'ghost-hit', function () { map.getCanvas().style.cursor = ''; hideTip(); });
    map.on('click', 'ghost-hit', function (e) { // a tap on a phone has no hover, so show the same words
      if (!e.features.length || story) return;
      showTip(words(HUTS[e.features[0].properties.i]), e.originalEvent.clientX, e.originalEvent.clientY - 6);
      clearTimeout(addGhosts.t); addGhosts.t = setTimeout(hideTip, 3200);
    });
  }
  function focusHut(i) {
    var h = HUTS[i];
    if (!h || !mapReady) return;
    if (!$('panel').hidden) closePanel();
    map.setPadding({ top: 0, left: 0, right: 0, bottom: 0 });
    map.flyTo({ center: h.at, zoom: 11.6, pitch: 55, padding: padded(0), duration: reduceMotion ? 0 : 2200 });
    map.once('moveend', function () {
      var pt = map.project(h.at), r = map.getCanvas().getBoundingClientRect();
      showTip('<b>' + esc(h.n) + '</b><br>' + fmt(h.ele) + ' m, ' + esc(h.p) + ' (' + h.c + ')<br>Not visited yet', r.left + pt.x, r.top + pt.y - 12);
      setTimeout(hideTip, 4500);
    });
  }
  function setMeter(n) {
    $('meter-done').textContent = n;
    var t = $('meter-ticks').children;
    for (var i = 0; i < t.length; i++) t[i].className = i < n ? 'on' : '';
  }
  function startReplay() {
    if (!mapReady || replay) return;
    if (!$('panel').hidden) closePanel();
    hideCard(); hideTip();
    var seq = LOGS.filter(function (l) { return l.huts.length; }).sort(function (a, b) { return a.no - b.no; });
    var k = clamp(48 / (seq.length * 2.75), 0.35, 1), tok = { live: true }, count = 0;
    replay = tok;
    document.body.classList.add('replaying');
    pins.forEach(function (p) { p.node.classList.add('is-unborn'); });
    LOGS.forEach(function (l) { if (l.track) map.setFeatureState({ source: 'routes', id: l.id }, { off: true, hot: false, dim: false }); });
    setMeter(0);
    showHud('The mission so far', seq.length + ' trips, from the first hut to the latest', [['Skip', stopReplay]], true);
    $('hud-fill').style.width = '0%';
    var wait = function (ms) { return new Promise(function (res) { setTimeout(function () { res(tok.live); }, ms); }); };
    var draw = function (l, ms) {
      return new Promise(function (res) {
        var t0 = 0, n = l.track.length;
        var step = function (now) {
          if (!tok.live) return res(false);
          if (!t0) t0 = now;
          var f = Math.min(1, (now - t0) / ms), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2, upto = Math.max(2, Math.round(e * n));
          map.getSource('walked').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l.track.slice(0, upto).map(function (p) { return [p[0], p[1]]; }) } });
          if (f < 1) requestAnimationFrame(step); else res(true);
        };
        requestAnimationFrame(step);
      });
    };
    (async function () {
      goHome(900);
      if (!(await wait(1500))) return;
      for (var i = 0; i < seq.length; i++) {
        var l = seq[i], b = new maplibregl.LngLatBounds();
        (l.track || []).forEach(function (p) { b.extend([p[0], p[1]]); });
        l.huts.forEach(function (h) { b.extend(h.at); });
        $('hud-title').textContent = dateRange(l.dates);
        $('hud-sub').textContent = l.title;
        map.fitBounds(b, { padding: padded(small() ? 56 : 120), maxZoom: 10.7, pitch: 50, bearing: 0, duration: reduceMotion ? 0 : 1000 * k });
        if (!(await wait(1050 * k))) return;
        if (l.track) {
          if (!(await draw(l, reduceMotion ? 1 : 1300 * k))) return;
          map.setFeatureState({ source: 'routes', id: l.id }, { off: false });
          map.getSource('walked').setData({ type: 'FeatureCollection', features: [] });
        }
        pins.forEach(function (p) { if (p.id === l.id) { p.node.classList.remove('is-unborn'); if (p.sac) count++; } });
        setMeter(count);
        $('hud-fill').style.width = (((i + 1) / seq.length) * 100).toFixed(1) + '%';
        if (!(await wait(720 * k))) return;
      }
      $('hud-title').textContent = count + ' of ' + WM.meta.total + ' huts';
      $('hud-sub').textContent = (WM.meta.total - count) + ' still to go';
      goHome(2200);
      if (await wait(4200)) stopReplay(true);
    })();
  }
  function stopReplay(stay) {
    if (!replay) return;
    replay.live = false; replay = null;
    document.body.classList.remove('replaying');
    pins.forEach(function (p) { p.node.classList.remove('is-unborn'); });
    LOGS.forEach(function (l) { if (l.track) map.setFeatureState({ source: 'routes', id: l.id }, { off: false }); });
    map.getSource('walked').setData({ type: 'FeatureCollection', features: [] });
    setMeter(WM.meta.visited);
    hideHud(); applyStates();
    if (stay !== true) goHome(1200);
  }

  // =====================================================================
  // Photos
  // =====================================================================
  var PHOTOS = window.WM_PHOTOS || [], FLAT = [], lbAt = -1, galleryBuilt = false, lbReturn = null;
  PHOTOS.forEach(function (g) { g.items.forEach(function (p) { p.g = g; p.i = FLAT.length; FLAT.push(p); }); });
  function buildGallery() {
    galleryBuilt = true;
    var h = '<h1>Photos</h1><p class="lede">' + FLAT.length + ' photos from the huts and the trails between them, newest first. Select one to see it large. Every photo can be downloaded at full resolution.</p>';
    PHOTOS.forEach(function (g) {
      h += '<section class="g-sec"><div class="g-head"><h2>' + esc(g.t) + '</h2><span>' + g.items.length + (g.items.length === 1 ? ' photo' : ' photos') + '</span>' +
        (g.id ? '<button type="button" data-go="' + g.id + '">Read the logbook</button>' : '') + '</div><div class="g-grid">';
      g.items.forEach(function (p) {
        var ar = p.w / p.h;
        h += '<button type="button" class="g-item" data-i="' + p.i + '" style="flex:' + ar.toFixed(3) + ' 1 ' + Math.round(ar * (small() ? 130 : 230)) + 'px" aria-label="Open photo ' + (p.i + 1) + ' of ' + FLAT.length + ', ' + esc(g.t) + '">' +
          '<img loading="lazy" decoding="async" alt="" src="photos/thumb/' + p.n + '.webp" width="' + Math.round(ar * 480) + '" height="480"></button>';
      });
      h += '</div></section>';
    });
    $('gallery-in').innerHTML = h;
    $('gallery-in').addEventListener('click', function (e) {
      var it = e.target.closest('.g-item'), go = e.target.closest('[data-go]');
      if (it) openPhoto(+it.dataset.i, it);
      else if (go) { closeGallery(true); openLog(go.dataset.go); }
    });
  }
  function openGallery() {
    if (!galleryBuilt) buildGallery();
    $('gallery').hidden = false;
    $('nav-photos').setAttribute('aria-pressed', 'true');
    if (location.hash !== '#photos') history.replaceState(null, '', '#photos');
    $('gallery-in').focus({ preventScroll: true });
  }
  function closeGallery(keepHash) {
    $('gallery').hidden = true;
    $('nav-photos').setAttribute('aria-pressed', 'false');
    if (!keepHash && location.hash === '#photos') history.replaceState(null, '', active ? '#' + active : location.pathname + location.search);
  }
  function openPhoto(i, from) {
    if (from) lbReturn = from;
    lbAt = (i + FLAT.length) % FLAT.length;
    var p = FLAT[lbAt], img = $('lb-img');
    img.src = 'photos/thumb/' + p.n + '.webp'; // instant, then swap in the large one
    var big = new Image();
    big.onload = function () { if (FLAT[lbAt] === p) img.src = big.src; };
    big.src = 'photos/large/' + p.n + '.webp';
    img.alt = p.g.t + ', photo ' + (lbAt + 1);
    $('lb-cap').innerHTML = '<b>' + esc(p.g.t) + '</b>' + (lbAt + 1) + ' of ' + FLAT.length + ', ' + fmt(p.w) + ' × ' + fmt(p.h) + ' px';
    var dl = $('lb-dl');
    dl.href = 'photos/original/' + p.n + '.' + p.e;
    dl.setAttribute('download', 'wanderlust-mission-' + p.n + '.' + p.e);
    dl.textContent = 'Download full size (' + p.e.toUpperCase() + ', ' + fmt(p.mb, 1) + ' MB)';
    $('lightbox').hidden = false;
    $('lb-close').focus();
  }
  function closePhoto() {
    $('lightbox').hidden = true; lbAt = -1;
    if (lbReturn && lbReturn.focus) lbReturn.focus();
    lbReturn = null;
  }

  // =====================================================================
  // Wire up
  // =====================================================================
  buildRail(); buildMeter();
  if (small()) setRail(false);
  $('nav-logbook').addEventListener('click', function () { setRail($('rail').classList.contains('is-shut')); });
  $('nav-mission').addEventListener('click', openMission);
  $('meter').addEventListener('click', openMission);
  $('nav-about').addEventListener('click', openAbout);
  $('panel-close').addEventListener('click', closePanel);
  $('replay').addEventListener('click', startReplay);
  $('light').addEventListener('click', function () { setLight(this.getAttribute('aria-pressed') !== 'true'); });
  $('nav-menu').addEventListener('click', function () {
    var open = !$('nav').classList.contains('is-open');
    $('nav').classList.toggle('is-open', open); this.setAttribute('aria-expanded', String(open));
  });
  $('nav').addEventListener('click', function () { $('nav').classList.remove('is-open'); $('nav-menu').setAttribute('aria-expanded', 'false'); });
  ['nav-logbook', 'nav-mission', 'nav-about', 'nav-photos', 'nav-rankings', 'brand', 'meter'].forEach(function (id) {
    $(id).addEventListener('click', function () { if (replay) stopReplay(true); }, true);
  });
  $('brand').addEventListener('click', function (e) { e.preventDefault(); if (!$('panel').hidden) closePanel(); else if (mapReady) goHome(1800); });
  document.addEventListener('keydown', function (e) {
    if (!$('lightbox').hidden) {
      if (e.key === 'Escape') closePhoto();
      else if (e.key === 'ArrowRight') openPhoto(lbAt + 1);
      else if (e.key === 'ArrowLeft') openPhoto(lbAt - 1);
      return;
    }
    if (!$('page').hidden) return; // the rankings page handles its own keys
    if (e.key === ' ' && story && story.fly && !/^(BUTTON|A|INPUT|VIDEO)$/.test(e.target.tagName)) { e.preventDefault(); flyPlay(!story.fly.playing); return; }
    if (e.key !== 'Escape') return;
    if (!$('gallery').hidden) closeGallery();
    else if (replay) stopReplay();
    else if (pano) stopPano();
    else if (story && story.fly) stopFly();
    else if (!$('panel').hidden) closePanel();
  });
  $('nav-photos').addEventListener('click', function () { if ($('gallery').hidden) openGallery(); else closeGallery(); });
  $('lb-close').addEventListener('click', closePhoto);
  $('lb-prev').addEventListener('click', function () { openPhoto(lbAt - 1); });
  $('lb-next').addEventListener('click', function () { openPhoto(lbAt + 1); });
  $('lightbox').addEventListener('click', function (e) { if (e.target === this || e.target.id === 'lb-img') closePhoto(); });
  ['nav-logbook', 'nav-mission', 'nav-about', 'brand'].forEach(function (id) { $(id).addEventListener('click', function () { if (!$('gallery').hidden) closeGallery(); }, true); });
  document.querySelectorAll('#basemap button').forEach(function (b) { b.addEventListener('click', function () { setBase(b.dataset.base, true); }); });
  $('tilt').addEventListener('click', function () {
    var on = this.getAttribute('aria-pressed') !== 'true';
    this.setAttribute('aria-pressed', String(on));
    if (mapReady) map.easeTo({ pitch: on ? (active ? 60 : HOME.pitch) : 0, duration: 700 });
  });
  var scrollQueued = false;
  $('panel-body').addEventListener('scroll', function () {
    if (!story || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () { scrollQueued = false; onStoryScroll(); });
  }, { passive: true });
  var resizeT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (wx) wx.size();
      if (!story) return;
      $('strip').hidden = small();
      drawProfile(story.l);
      if (mapReady) map.setPadding(clearArea());
      onStoryScroll();
    }, 200);
  });
  window.addEventListener('hashchange', function () {
    var id = location.hash.replace('#', '');
    if (id === 'photos') openGallery(); else if (BY_ID[id] && id !== active) { closeGallery(true); openLog(id); }
  });
  if (location.hash === '#photos') openGallery();

  initMap();
  window.__wm = { open: openLog, logs: LOGS, map: function () { return map; }, story: function () { return story; }, fly: startFly, replay: startReplay, light: setLight, pano: startPano };
  window.WMApp = { LOGS: LOGS, BY_ID: BY_ID, HUTS: HUTS, meta: WM.meta, fmt: fmt, esc: esc, el: el, svg: svg, dateRange: dateRange, parts: parts, MON: MON, small: small,
    openLog: openLog, closePanel: closePanel, closeGallery: closeGallery, startReplay: startReplay, focusHut: focusHut, showTip: showTip, hideTip: hideTip,
    panelOpen: function () { return !$('panel').hidden; } };
})();
