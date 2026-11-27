/* Wanderlust Mission: live conditions over the whole map.
   Snow line, valley fog, cloud and storms are drawn from the current MeteoSwiss forecast model (ICON-CH1, read
   through the Open-Meteo API) on top of the terrain. The "Satellite" switch shows the latest Meteosat picture
   from EUMETSAT instead. Everything is fetched by the visitor's browser when Live is switched on; nothing here
   runs on a server. Uses window.WMApp (js/app.js) and window.WMSky (js/sky.js). */
(function () {
  'use strict';
  var A = window.WMApp, $ = function (id) { return document.getElementById(id); };
  var Z = 8, X0 = 132, X1 = 135, Y0 = 89, Y1 = 91, TS = 512;               // terrain tiles that cover Switzerland
  var GW = (X1 - X0 + 1) * TS, GH = (Y1 - Y0 + 1) * TS;                    // ground canvas, about 300 m a pixel
  var CW = 512, CH = 384;                                                  // cloud canvas
  var lonOf = function (x) { return x / Math.pow(2, Z) * 360 - 180; };
  var latOf = function (y) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / Math.pow(2, Z)))) * 180 / Math.PI; };
  var WEST = lonOf(X0), EAST = lonOf(X1 + 1), NORTH = latOf(Y0), SOUTH = latOf(Y1 + 1);
  var CORNERS = [[WEST, NORTH], [EAST, NORTH], [EAST, SOUTH], [WEST, SOUTH]];
  var LON0 = 5.8, LAT0 = 45.7, STEP = 0.4, NX = 13, NY = 6;                // weather sampling grid: 78 points
  var KEY = 'wm-live-v1', FRESH = 15 * 60000;
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var smooth = function (x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  var on = false, paused = false, busy = false, sat = false, dem = null, data = null, fields = null;
  var ground = null, clouds = null, noise = null, raf = 0, timer = 0, drift = { x: 0, y: 0, t: 0 }, flashes = [];

  // ---------- data ----------
  function loadDem() {
    if (dem) return Promise.resolve(dem);
    var c = document.createElement('canvas'); c.width = GW; c.height = GH;
    var g = c.getContext('2d', { willReadFrequently: true }), jobs = [];
    for (var y = Y0; y <= Y1; y++) for (var x = X0; x <= X1; x++) jobs.push(new Promise(function (res, rej) {
      var im = new Image(), px = (x - X0) * TS, py = (y - Y0) * TS;
      im.crossOrigin = 'anonymous';
      im.onload = function () { g.drawImage(im, px, py, TS, TS); res(); };
      im.onerror = function () { rej(new Error('terrain tile')); };
      im.src = 'https://tiles.mapterhorn.com/' + Z + '/' + x + '/' + y + '.webp';
    }));
    return Promise.all(jobs).then(function () {
      var d = g.getImageData(0, 0, GW, GH).data, e = new Float32Array(GW * GH);
      for (var i = 0, j = 0; i < e.length; i++, j += 4) e[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
      dem = e; return e;
    });
  }
  function loadWeather(force) {
    try {
      var hit = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (hit && !force && Date.now() - hit.at < FRESH) return Promise.resolve(hit);
    } catch (e) { /* no storage: fetch every time */ }
    var la = [], lo = [];
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) { la.push((LAT0 + j * STEP).toFixed(2)); lo.push((LON0 + i * STEP).toFixed(2)); }
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + la.join(',') + '&longitude=' + lo.join(',') +
      '&models=meteoswiss_icon_ch1&current=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,cloud_base,snow_depth,freezing_level_height,precipitation,weather_code,cape,wind_speed_10m,wind_direction_10m,is_day&timezone=Europe%2FZurich';
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('weather ' + r.status); return r.json(); }).then(function (j) {
      var pts = j.map(function (p) {
        var c = p.current;
        return { lat: p.latitude, lon: p.longitude, e: p.elevation, t: c.temperature_2m, c: c.cloud_cover || 0, lo: c.cloud_cover_low || 0, mi: c.cloud_cover_mid || 0, hi: c.cloud_cover_high || 0,
          base: c.cloud_base, snow: c.snow_depth || 0, fz: c.freezing_level_height, rain: c.precipitation || 0, code: c.weather_code || 0, cape: c.cape || 0, ws: c.wind_speed_10m || 0, wd: c.wind_direction_10m || 0 };
      });
      var out = { at: Date.now(), time: j[0].current.time, pts: pts };
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* fine */ }
      return out;
    });
  }

  // ---------- from scattered model points to smooth fields ----------
  function km(a, b) { var dx = (a.lon - b.lon) * 76, dy = (a.lat - b.lat) * 111; return Math.sqrt(dx * dx + dy * dy); }
  // The height that best separates points with the property (above it) from points without, near a place.
  function level(pts, at, has, reach) {
    var list = [], i, tw = 0;
    for (i = 0; i < pts.length; i++) { var d = km(pts[i], at), w = Math.exp(-(d * d) / (reach * reach)); if (w > 0.002) { list.push({ e: pts[i].e, y: has(pts[i]), w: w }); tw += w; } }
    list.sort(function (a, b) { return a.e - b.e; });
    var below = 0, above = 0, best = Infinity, lo = 0, hi = 0;
    for (i = 0; i < list.length; i++) if (!list[i].y) above += list[i].w;             // cost at t below everything: clear points above the line
    for (i = 0; i <= list.length; i++) {
      var cost = below + above;                                                        // snowy points below t + clear points above t
      var a = i ? list[i - 1].e : (list.length ? list[0].e - 300 : 0), b = i < list.length ? list[i].e : (list.length ? list[list.length - 1].e + 300 : 0);
      if (cost < best - 1e-9) { best = cost; lo = a; hi = b; } else if (Math.abs(cost - best) < 1e-9) hi = b;
      if (i < list.length) { if (list[i].y) below += list[i].w; else above -= list[i].w; }
    }
    return (lo + hi) / 2;
  }
  // Fog or a low stratus deck: low cloud whose base is close to the ground and not high in the mountains.
  function isFog(p) { return p.lo >= 60 && p.base != null && p.base < 1750 && p.base - p.e < 900; }
  // Fade out around Switzerland in a loose, uneven oval, so the drawn area never ends in a straight line.
  function edge(x, y, w, h, n) {
    var u = (x / w - 0.47) / 0.47, v = (y / h - 0.5) / 0.46, r = Math.sqrt(u * u + v * v) + (n - 0.5) * 0.34;
    return 1 - smooth(r, 0.72, 1.06);
  }
  function build(pts) {
    var n = NX * NY, f = { snow: new Float32Array(n), top: new Float32Array(n), fog: new Float32Array(n), cov: new Float32Array(n), thick: new Float32Array(n), rain: new Float32Array(n), storm: new Float32Array(n) };
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var k = j * NX + i, at = { lat: LAT0 + j * STEP, lon: LON0 + i * STEP }, p = pts[k];
      f.snow[k] = level(pts, at, function (q) { return q.snow >= 0.03; }, 60);
      // low cloud: a deck with its base near or below the ground is fog; either way it fills the valleys up to its top
      var ws = 0, wt = 0, wa = 0, q, d, w;
      for (q = 0; q < pts.length; q++) {
        d = km(pts[q], at); w = Math.exp(-(d * d) / (45 * 45));
        if (isFog(pts[q])) { var top = Math.max(pts[q].base, pts[q].e) + 280; ws += w * (pts[q].lo / 100); wt += w * top; wa += w; }
      }
      var topHere = wa > 0.02 ? wt / wa : 0, clear = 0;
      for (q = 0; q < pts.length; q++) { // a clear point only counts against fog if it sits below the deck
        d = km(pts[q], at); w = Math.exp(-(d * d) / (45 * 45));
        if (!isFog(pts[q]) && pts[q].e < topHere) clear += w;
      }
      f.top[k] = topHere; f.fog[k] = wa > 0.02 ? ws / (wa + clear) : 0;
      f.cov[k] = clamp(Math.max(p.mi, p.hi * 0.75, p.lo * 0.45) / 100, 0, 1);
      f.thick[k] = clamp((p.mi + p.lo * 0.5) / 100, 0, 1);
      f.rain[k] = p.rain;
      f.storm[k] = (p.code >= 95 || (p.cape > 900 && p.rain > 1)) ? 1 : 0;
    }
    return f;
  }
  function sampler(arr) { // bilinear over the weather grid, in grid units
    return function (gx, gy) {
      gx = clamp(gx, 0, NX - 1.001); gy = clamp(gy, 0, NY - 1.001);
      var i = gx | 0, j = gy | 0, u = gx - i, v = gy - j, k = j * NX + i;
      return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + NX] * (1 - u) + arr[k + NX + 1] * u) * v;
    };
  }
  function gridX(px, w) { return (WEST + (px + 0.5) / w * (EAST - WEST) - LON0) / STEP; }
  function gridY(py, h) { return (latOf(Y0 + (py + 0.5) / h * (Y1 - Y0 + 1)) - LAT0) / STEP; }

  // ---------- drawing ----------
  function makeNoise() { // tileable, soft, 0..1
    var N = 256, out = new Float32Array(N * N), seed = 11, o, x, y;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    [[8, 0.5], [16, 0.27], [32, 0.15], [64, 0.08]].forEach(function (oc) {
      var n = oc[0], g = new Float32Array(n * n), s = N / n;
      for (o = 0; o < g.length; o++) g[o] = rnd();
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
        var fx = x / s, fy = y / s, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
        var i1 = (i + 1) % n, j1 = (j + 1) % n;
        out[y * N + x] += oc[1] * ((g[j * n + i] * (1 - u) + g[j * n + i1] * u) * (1 - v) + (g[j1 * n + i] * (1 - u) + g[j1 * n + i1] * u) * v);
      }
    });
    return out;
  }
  function drawGround() {
    var g = ground.getContext('2d'), img = g.createImageData(GW, GH), d = img.data;
    var snow = sampler(fields.snow), top = sampler(fields.top), fog = sampler(fields.fog);
    var gxs = new Float32Array(GW), x, y;
    for (x = 0; x < GW; x++) gxs[x] = gridX(x, GW);
    for (y = 0; y < GH; y++) {
      var gy = gridY(y, GH);
      for (x = 0; x < GW; x++) {
        var k = y * GW + x, e = dem[k], gx = gxs[x], n = noise[((y & 255) << 8) | (x & 255)] - 0.5;
        var line = snow(gx, gy) + n * 260, rim = edge(x, y, GW, GH, noise[(((y >> 3) & 255) << 8) | ((x >> 3) & 255)]);
        var sa = smooth(e, line - 90, line + 170) * 0.86;                   // snow: thin at the line, solid above it
        if (sa > 0.01 && x > 0 && x < GW - 1 && y > 0 && y < GH - 1) {      // steep rock sheds its snow
          var slope = (Math.abs(dem[k + 1] - dem[k - 1]) + Math.abs(dem[k + GW] - dem[k - GW])) / 600;
          sa *= 1 - 0.7 * smooth(slope, 0.55, 1.25);
        }
        var t = top(gx, gy), fa = 0;
        if (t > 0) {                                                         // a sea of fog: level top, soft and slightly uneven
          var n2 = noise[(((y >> 2) & 255) << 8) | ((x >> 2) & 255)];
          fa = smooth(t - e + n * 110, 0, 170) * clamp(fog(gx, gy) * 1.2, 0, 0.9) * (0.8 + 0.2 * n2 * 2);
        }
        sa *= rim; fa = clamp(fa, 0, 0.92) * rim;
        var a = fa + sa * (1 - fa);
        if (a < 0.004) continue;
        var w = a ? fa / a : 0, o = k * 4, tone = 14 * (noise[(((y >> 1) & 255) << 8) | ((x >> 1) & 255)] - 0.5); // fog lies over the snow, and is greyer
        d[o] = 252 - (40 - tone) * w; d[o + 1] = 253 - (33 - tone) * w; d[o + 2] = 255 - (24 - tone) * w; d[o + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    push('live-ground');
  }
  function drawClouds(now) {
    var g = clouds.getContext('2d'), img = clouds._img || (clouds._img = g.createImageData(CW, CH)), d = img.data;
    var cov = clouds._cov, thick = clouds._thick, al = clouds._al || (clouds._al = new Float32Array(CW * CH)), x, y, k = 0;
    var ox = drift.x, oy = drift.y;
    for (y = 0; y < CH; y++) for (x = 0; x < CW; x++, k++) {
      var c = cov[k];
      if (c < 0.04) { al[k] = 0; continue; }
      var n = noise[(((y * 0.9 + oy) & 255) << 8) | ((x * 0.9 + ox) & 255)] * 0.7 + noise[(((y * 2.3 + oy * 1.7) & 255) << 8) | ((x * 2.3 + ox * 1.7) & 255)] * 0.3;
      al[k] = smooth(n, 0.84 - c * 0.62, 0.98 - c * 0.62) * (0.5 + 0.42 * thick[k]) * clouds._rim[k];
    }
    var SH = 5 * CW + 4; // the shadow falls a little to the south-east, which is what makes cloud readable over snow
    for (k = 0; k < CW * CH; k++) {
      var a = al[k], sh = k >= SH ? al[k - SH] * 0.42 : 0, o = k * 4, out = a + sh * (1 - a);
      if (out < 0.006) { d[o + 3] = 0; continue; }
      var cw = a / out, shade = 250 - 62 * thick[k] * a;                     // thick, wet cloud is greyer
      d[o] = shade * cw + 22 * (1 - cw); d[o + 1] = (shade + 2) * cw + 30 * (1 - cw); d[o + 2] = (shade + 6) * cw + 48 * (1 - cw); d[o + 3] = Math.round(out * 255);
    }
    g.putImageData(img, 0, 0);
    // lightning: a short white bloom inside storm cells
    for (var i = flashes.length - 1; i >= 0; i--) {
      var fl = flashes[i], age = now - fl.t;
      if (age > 260) { flashes.splice(i, 1); continue; }
      var r = 16 + fl.r * 14, gr = g.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r), al = (age < 70 || (age > 130 && age < 190)) ? 0.95 : 0.25;
      gr.addColorStop(0, 'rgba(255,255,240,' + al + ')'); gr.addColorStop(0.4, 'rgba(255,244,190,' + al * 0.5 + ')'); gr.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = gr; g.fillRect(fl.x - r, fl.y - r, r * 2, r * 2);
    }
    push('live-clouds');
  }
  function prepClouds() {
    var cov = sampler(fields.cov), thick = sampler(fields.thick), storm = sampler(fields.storm), rain = sampler(fields.rain);
    clouds._cov = new Float32Array(CW * CH); clouds._thick = new Float32Array(CW * CH); clouds._rim = new Float32Array(CW * CH); clouds._storms = [];
    for (var y = 0, k = 0; y < CH; y++) { var gy = gridY(y, CH); for (var x = 0; x < CW; x++, k++) {
      var gx = gridX(x, CW), s = storm(gx, gy), r = rain(gx, gy);
      clouds._rim[k] = edge(x, y, CW, CH, noise[(((y * 2) & 255) << 8) | ((x * 2) & 255)]);
      clouds._cov[k] = clamp(cov(gx, gy) + s * 0.3, 0, 1); clouds._thick[k] = clamp(thick(gx, gy) + Math.min(0.5, r * 0.25) + s * 0.5, 0, 1);
      if (s > 0.5 && (x % 9 === 0) && (y % 9 === 0)) clouds._storms.push([x, y]);
    } }
  }
  function push(id) { // a canvas source uploads its pixels only while "playing"
    var map = A.map(), s = map.getSource(id);
    if (!s) return;
    s.play(); map.triggerRepaint();
    map.once('render', function () { s.pause(); });
  }
  function loop(now) {
    if (!on || paused || sat) { raf = 0; return; }
    if (now - drift.t > 110) {
      var dt = Math.min(1, (now - (drift.t || now)) / 1000); drift.t = now;
      drift.x += drift.vx * dt; drift.y += drift.vy * dt;
      var st = clouds._storms;
      if (st.length && Math.random() < 0.09) { var c = st[(Math.random() * st.length) | 0]; flashes.push({ x: c[0] + (Math.random() - 0.5) * 8, y: c[1] + (Math.random() - 0.5) * 8, r: Math.random(), t: now }); }
      drawClouds(now);
    }
    raf = requestAnimationFrame(loop);
  }

  // ---------- map layers ----------
  function addLayers() {
    var map = A.map();
    if (map.getSource('live-ground')) return;
    ground = document.createElement('canvas'); ground.width = GW; ground.height = GH;
    clouds = document.createElement('canvas'); clouds.width = CW; clouds.height = CH;
    map.addSource('live-ground', { type: 'canvas', canvas: ground, coordinates: CORNERS, animate: false });
    map.addSource('live-clouds', { type: 'canvas', canvas: clouds, coordinates: CORNERS, animate: false });
    map.addSource('live-sat', { type: 'raster', tileSize: 512, maxzoom: 9, attribution: 'Satellite: © EUMETSAT',
      tiles: ['https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:rgb_geocolour&styles=&format=image/jpeg&crs=EPSG:3857&width=512&height=512&bbox={bbox-epsg-3857}'] }); // the exact picture is named in satLatest()
    // snow and fog lie on the ground under the sun shading; cloud floats over the shading; the colour wash covers both
    map.addLayer({ id: 'live-sat', type: 'raster', source: 'live-sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 300 } }, 'sunshade');
    map.addLayer({ id: 'live-ground', type: 'raster', source: 'live-ground', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.96 } }, 'sunshade');
    map.addLayer({ id: 'live-clouds', type: 'raster', source: 'live-clouds', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.9 } }, 'tint');
  }
  function show() {
    var map = A.map(), vis = on && !paused;
    if (!map.getLayer('live-ground')) return;
    map.setLayoutProperty('live-ground', 'visibility', vis && !sat && fields ? 'visible' : 'none');
    map.setLayoutProperty('live-clouds', 'visibility', vis && !sat && fields ? 'visible' : 'none');
    map.setLayoutProperty('live-sat', 'visibility', vis && sat ? 'visible' : 'none');
    $('livechip').hidden = !vis;
    if (vis) light(); else if (!paused) window.WMSky.reset(map);
    if (vis && !sat && fields && !raf) raf = requestAnimationFrame(loop);
  }
  // the real sun, and the sky colour for the present cloud
  function light() {
    var map = A.map(), c = map.getCenter(), now = new Date();
    var z = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
    var sn = window.WMSky.sun(z.year + '-' + z.month + '-' + z.day, +z.hour + z.minute / 60, c.lat, c.lng);
    var cover = 0;
    if (data) { data.pts.forEach(function (p) { cover += p.c; }); cover /= data.pts.length * 100; }
    window.WMSky.apply(map, { az: sn.az, alt: sat ? Math.max(sn.alt, 30) : sn.alt, cloud: sat ? 0 : cover * 0.5, rain: 0, snow: false, gust: 10 }); // the satellite picture carries its own light
    if (map.getLayer('sunshade') && sat) map.setLayoutProperty('sunshade', 'visibility', 'none');
    if (!sat) map.setPaintProperty('tint', 'background-opacity', map.getPaintProperty('tint', 'background-opacity') * 0.6); // snow and fog take colour strongly: go easy
    return { sun: sn, clock: z.hour + ':' + z.minute };
  }

  // ---------- the words ----------
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[a.length >> 1] : null; }
  function round100(v) { return A.fmt(Math.round(v / 100) * 100); }
  function describe() {
    var p = data.pts, alps = [], fogTops = [], foggy = 0, cov = 0, storms = 0, wet = 0, i, j;
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) { var k = j * NX + i, lat = LAT0 + j * STEP, lon = LON0 + i * STEP;
      if (lat > 45.9 && lat < 47.3 && lon > 6.8 && lon < 10.4) alps.push(fields.snow[k]);
      if (fields.fog[k] > 0.45) { foggy++; fogTops.push(fields.top[k]); }
      cov += p[k].c; if (fields.storm[k]) storms++; if (p[k].rain > 0.1) wet++; }
    cov /= p.length;
    var s = [], line = median(alps), hi = Math.max.apply(null, p.map(function (q) { return q.e; }));
    s.push(line >= hi ? 'No snow on the ground in the model' : 'Snow above about ' + round100(line) + ' m');
    if (foggy >= 4) s.push('fog or low cloud filling the valleys to about ' + round100(median(fogTops)) + ' m');
    s.push(cov < 15 ? 'clear skies' : cov < 45 ? 'some cloud' : cov < 80 ? 'a good deal of cloud' : 'mostly overcast');
    if (storms) s.push('thunderstorms in ' + (storms > 6 ? 'many places' : 'places')); else if (wet > 5) s.push('rain or snow falling in places');
    return s.join(', ') + '.';
  }
  function chip(msg) {
    var c = $('livechip'), t = data ? data.time.slice(11, 16) : '';
    var st = satAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(satAt) : '';
    $('live-title').textContent = sat ? 'Satellite' + (st ? ', ' + st : '') : (busy ? 'Live conditions' : 'Live, ' + t);
    $('live-text').textContent = msg || (sat ? 'The latest Meteosat picture, from EUMETSAT. A new one arrives every 10 minutes. Detail is about 1 km, so it is best zoomed out. By night it shows cloud and city lights.' : (fields ? describe() : ''));
    $('live-src').textContent = sat ? '' : 'From the MeteoSwiss forecast model, read through Open-Meteo. It is a model of now, not a measurement.';
    $('live-sat').setAttribute('aria-pressed', String(sat));
    c.hidden = !(on && !paused);
  }

  // ---------- switching ----------
  function refresh(force) {
    if (busy) return;
    busy = true; chip('Loading the current conditions…');
    Promise.all([loadDem(), loadWeather(force)]).then(function (r) {
      busy = false;
      if (!on) return;
      data = r[1]; fields = build(data.pts);
      if (!noise) noise = makeNoise();
      var u = 0, v = 0; data.pts.forEach(function (p) { var a = p.wd * Math.PI / 180; u += -Math.sin(a) * p.ws; v += Math.cos(a) * p.ws; }); // wind blows from wd
      u /= data.pts.length; v /= data.pts.length;
      drift.vx = -u * 0.12; drift.vy = v * 0.12; // noise offset moves against the wind so the cloud moves with it
      drawGround(); prepClouds(); show(); chip();
    }).catch(function () {
      busy = false;
      if (on) chip('The live weather feed is not reachable right now. Try again in a few minutes.');
    });
  }
  function set(v) {
    if (!A.mapReady()) return;
    on = v; $('live').setAttribute('aria-pressed', String(v));
    document.body.classList.toggle('live-on', v);
    addLayers();
    clearInterval(timer);
    if (v) { refresh(false); timer = setInterval(function () { if (on && !paused) { refresh(true); } }, FRESH); show(); chip(busy ? 'Loading the current conditions…' : ''); }
    else { sat = false; show(); }
  }
  function pause(v) { // a logbook has its own light and weather: step aside while one is open
    if (!on) return;
    paused = v; show(); if (!v) chip();
  }

  $('live').addEventListener('click', function () { set(!on); });
  // Every tile must come from the same satellite picture, so ask which one is the latest and name it.
  var SAT = 'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:rgb_geocolour&styles=&format=image/jpeg&crs=EPSG:3857&width=512&height=512&bbox={bbox-epsg-3857}';
  var satAt = null, satAsked = 0;
  function satLatest() {
    if (Date.now() - satAsked < 8 * 60000) return Promise.resolve(satAt);
    satAsked = Date.now();
    return fetch('https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities').then(function (r) { return r.text(); }).then(function (t) {
      var i = t.indexOf('<Name>mtg_fd:rgb_geocolour</Name>'), m = i < 0 ? null : /<Dimension name="time"[^>]*>[^<\/]*\/([^<\/]+)\/[^<]*</.exec(t.slice(i, i + 8000));
      if (!m) throw new Error('no time');
      satAt = new Date(m[1]);
      A.map().getSource('live-sat').setTiles([SAT + '&time=' + encodeURIComponent(satAt.toISOString())]);
      return satAt;
    });
  }
  $('live-sat').addEventListener('click', function () {
    sat = !sat;
    if (!sat) { show(); chip(); return; }
    chip('Finding the latest satellite picture…');
    satLatest().then(function () { if (sat && on) { show(); chip(); } }).catch(function () { sat = false; show(); chip('The satellite service is not reachable right now.'); });
  });
  $('live-close').addEventListener('click', function () { set(false); });
  window.WMLive = { set: set, pause: pause, isOn: function () { return on; }, state: function () { return { on: on, paused: paused, sat: sat, data: data, fields: fields }; } };
})();
