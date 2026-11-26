/* Wanderlust Mission: the day's light and weather on the 3D map.
   The sun's position is computed for the date, time and place. Cloud, rain, snow and wind come from the hourly
   weather record in js/data.js. Nothing here loads from the network. window.WMSky is used by js/app.js. */
(function () {
  'use strict';
  var RAD = Math.PI / 180;

  // ---------- time and sun ----------
  // Hours that Swiss clocks are ahead of UTC on a given local date and hour.
  function zurichOffset(y, m, d, h) {
    function lastSunday(month) { var dt = new Date(Date.UTC(y, month + 1, 0)); return dt.getUTCDate() - dt.getUTCDay(); }
    var a = Date.UTC(y, 2, lastSunday(2), 1), b = Date.UTC(y, 9, lastSunday(9), 1), t = Date.UTC(y, m, d, h - 1);
    return (t >= a && t < b) ? 2 : 1;
  }
  // Sun azimuth (degrees clockwise from north) and altitude (degrees above the horizon).
  // iso is the local date, hour is local clock time and may run past 24 into the next day.
  function sun(iso, hour, lat, lng) {
    var p = iso.split('-').map(Number);
    var off = zurichOffset(p[0], p[1] - 1, p[2], Math.min(hour, 23));
    var ms = Date.UTC(p[0], p[1] - 1, p[2]) + (hour - off) * 3600000;
    var d = ms / 86400000 - 0.5 + 2440588 - 2451545;
    var M = RAD * (357.5291 + 0.98560028 * d);
    var C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var L = M + C + RAD * 102.9372 + Math.PI;
    var e = RAD * 23.4397;
    var dec = Math.asin(Math.sin(L) * Math.sin(e));
    var ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    var th = RAD * (280.16 + 360.9856235 * d) + lng * RAD;
    var H = th - ra, phi = lat * RAD;
    var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { az: ((az / RAD + 180) % 360 + 360) % 360, alt: alt / RAD };
  }

  // ---------- colour ----------
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : +a.toFixed(3)) + ')'; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smooth(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // The look of a clear sky at six sun heights. Everything between is interpolated.
  var KEYS = [
    { alt: -18, sky: '#050A18', hor: '#0E1830', fog: '#0A1224', tint: '#06123A', top: 0.58, bri: 0.30, sat: -0.55 },
    { alt: -6,  sky: '#1D2B55', hor: '#5A5282', fog: '#3A3F66', tint: '#1A2A66', top: 0.42, bri: 0.50, sat: -0.35 },
    { alt: -1,  sky: '#4A6AA8', hor: '#F0916B', fog: '#E5A28C', tint: '#D8643C', top: 0.20, bri: 0.82, sat: -0.05 },
    { alt: 4,   sky: '#78A6DC', hor: '#FFC98C', fog: '#FFDDB5', tint: '#FF9A45', top: 0.13, bri: 0.96, sat: 0.08 },
    { alt: 12,  sky: '#86B6E6', hor: '#E8F0F6', fog: '#F1F5F8', tint: '#FFD9A8', top: 0.03, bri: 1.00, sat: 0.03 },
    { alt: 30,  sky: '#8FBCE8', hor: '#EAF2F8', fog: '#F2F6F9', tint: '#FFFFFF', top: 0.00, bri: 1.00, sat: 0.00 }
  ];
  KEYS.forEach(function (k) { ['sky', 'hor', 'fog', 'tint'].forEach(function (n) { k[n] = hex(k[n]); }); });
  function clearSky(alt) {
    if (alt <= KEYS[0].alt) return KEYS[0];
    for (var i = 1; i < KEYS.length; i++) {
      if (alt <= KEYS[i].alt) {
        var a = KEYS[i - 1], b = KEYS[i], t = (alt - a.alt) / (b.alt - a.alt);
        return { sky: mix(a.sky, b.sky, t), hor: mix(a.hor, b.hor, t), fog: mix(a.fog, b.fog, t), tint: mix(a.tint, b.tint, t),
          top: a.top + (b.top - a.top) * t, bri: a.bri + (b.bri - a.bri) * t, sat: a.sat + (b.sat - a.sat) * t };
      }
    }
    return KEYS[KEYS.length - 1];
  }

  // w: { az, alt, cloud 0..1, rain mm/h, snow bool, gust km/h }
  function look(w) {
    var k = clearSky(w.alt), c = clamp(w.cloud, 0, 1), day = smooth(w.alt, -6, 8);
    var wet = clamp(w.rain / 2, 0, 1);
    var glow = smooth(w.alt, -5, 1) * (1 - smooth(w.alt, 6, 16)) * (1 - c * c * 0.9); // warm low sun, killed by thick cloud
    var grey = mix(hex('#0C1220'), hex('#B4BDC4'), day), greyHor = mix(hex('#141B2B'), hex('#D3D9DD'), day);
    var veil = c * 0.85;
    var sky = mix(k.sky, grey, veil), hor = mix(k.hor, greyHor, veil), fog = mix(k.fog, greyHor, veil);
    // ground tint: the clear-sky colour, plus a flat grey under cloud
    var tw = k.top * (1 - 0.55 * c * day), gw = 0.17 * c * day + 0.06 * wet * day;
    var tint = mix(k.tint, hex('#7F8A93'), gw / (tw + gw + 1e-6));
    var low = 1 - smooth(w.alt, 6, 45); // 1 with the sun near the horizon
    return {
      sky: css(sky), horizon: css(hor), fog: css(fog),
      fogGround: clamp(0.62 - 0.3 * c - 0.2 * wet, 0.12, 0.7),
      tint: css(tint), tintOpacity: clamp(tw + gw, 0, 0.64),
      brightness: clamp(k.bri * (1 - 0.13 * c * day) * (1 - 0.06 * wet), 0.2, 1),
      saturation: clamp(k.sat - 0.26 * c - 0.1 * wet + 0.1 * glow, -0.8, 0.3),
      contrast: clamp(-0.14 * c * day + 0.07 * glow, -0.3, 0.2),
      shadeDir: Math.round(w.az), shadeAlt: clamp(w.alt, 4, 80),
      shade: clamp(day * (1 - 0.8 * c) * (0.2 + 0.36 * low), 0, 0.6),
      shadow: css(mix(hex('#1B2A4A'), hex('#3A2A5A'), glow), 0.9),
      highlight: css(mix(hex('#FFFFFF'), hex('#FFC27A'), glow), 0.75),
      day: day, glow: glow, night: 1 - smooth(w.alt, -9, -2)
    };
  }

  var RASTERS = ['summer', 'winter', 'aerial'];
  function addLayers(map, before) {
    if (map.getLayer('sunshade')) return;
    map.addLayer({ id: 'sunshade', type: 'hillshade', source: 'relief', layout: { visibility: 'none' },
      paint: { 'hillshade-method': 'basic', 'hillshade-illumination-anchor': 'map', 'hillshade-exaggeration': 0,
        'hillshade-shadow-color': 'rgba(27,42,74,0.9)', 'hillshade-highlight-color': 'rgba(255,255,255,0.75)', 'hillshade-accent-color': 'rgba(27,42,74,0.4)' } }, before);
    map.addLayer({ id: 'tint', type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': '#06123A', 'background-opacity': 0 } }, before);
  }
  function apply(map, w) {
    var L = look(w);
    RASTERS.forEach(function (id) {
      map.setPaintProperty(id, 'raster-brightness-max', L.brightness);
      map.setPaintProperty(id, 'raster-saturation', L.saturation);
      map.setPaintProperty(id, 'raster-contrast', L.contrast);
    });
    map.setLayoutProperty('sunshade', 'visibility', L.shade > 0.01 ? 'visible' : 'none');
    map.setPaintProperty('sunshade', 'hillshade-illumination-direction', L.shadeDir);
    map.setPaintProperty('sunshade', 'hillshade-illumination-altitude', L.shadeAlt);
    map.setPaintProperty('sunshade', 'hillshade-exaggeration', L.shade);
    map.setPaintProperty('sunshade', 'hillshade-shadow-color', L.shadow);
    map.setPaintProperty('sunshade', 'hillshade-highlight-color', L.highlight);
    map.setLayoutProperty('tint', 'visibility', L.tintOpacity > 0.004 ? 'visible' : 'none');
    map.setPaintProperty('tint', 'background-color', L.tint);
    map.setPaintProperty('tint', 'background-opacity', L.tintOpacity);
    map.setSky({ 'sky-color': L.sky, 'horizon-color': L.horizon, 'fog-color': L.fog, 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': L.fogGround });
    return L;
  }
  var NEUTRAL_SKY = { 'sky-color': '#9CC4E4', 'horizon-color': '#F2F4F6', 'fog-color': '#FFFFFF', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 };
  function reset(map) {
    RASTERS.forEach(function (id) {
      map.setPaintProperty(id, 'raster-brightness-max', 1);
      map.setPaintProperty(id, 'raster-saturation', 0);
      map.setPaintProperty(id, 'raster-contrast', 0);
    });
    if (map.getLayer('sunshade')) map.setLayoutProperty('sunshade', 'visibility', 'none');
    if (map.getLayer('tint')) map.setLayoutProperty('tint', 'visibility', 'none');
    map.setSky(NEUTRAL_SKY);
  }

  // ---------- what falls and drifts: cloud shadows, rain, snow, low-sun glare ----------
  // Two canvases over the map: `shade` is multiplied onto it (cloud shadows), `fall` is drawn normally.
  function Overlay(shade, fall) {
    this.shade = shade; this.fall = fall; this.w = null; this.L = null; this.bearing = 0;
    this.raf = 0; this.t = 0; this.still = false;
    var blobs = [], seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 16; i++) blobs.push({ x: rnd() * 1.6 - 0.3, y: rnd() * 1.1 - 0.05, r: 0.16 + rnd() * 0.22, s: 0.6 + rnd() * 0.8, sq: 0.55 + rnd() * 0.35 });
    this.blobs = blobs;
    var drops = [];
    for (i = 0; i < 420; i++) drops.push({ x: rnd(), y: rnd(), v: 0.75 + rnd() * 0.5, l: 0.7 + rnd() * 0.6, ph: rnd() * 6.28, r: 0.9 + rnd() * 1.9 });
    this.drops = drops;
    this.tick = this.tick.bind(this);
  }
  Overlay.prototype.size = function () {
    var r = this.fall.parentNode.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
    this.fall.width = this.W * dpr; this.fall.height = this.H * dpr; this.dpr = dpr;
    this.shade.width = Math.ceil(this.W / 4); this.shade.height = Math.ceil(this.H / 4);
  };
  Overlay.prototype.set = function (w, L, bearing) {
    this.w = w; this.L = L; this.bearing = bearing;
    if (!this.W) this.size();
    if (!this.raf) { this.t = 0; this.raf = requestAnimationFrame(this.tick); }
  };
  Overlay.prototype.stop = function () {
    cancelAnimationFrame(this.raf); this.raf = 0; this.w = null;
    if (this.W) { this.shade.getContext('2d').clearRect(0, 0, this.shade.width, this.shade.height); this.fall.getContext('2d').clearRect(0, 0, this.fall.width, this.fall.height); }
  };
  Overlay.prototype.tick = function (now) {
    if (!this.w) { this.raf = 0; return; }
    var dt = Math.min(0.1, (now - (this.t || now)) / 1000); this.t = now;
    if (this.still) dt = 0;
    var w = this.w, L = this.L, W = this.W, H = this.H;
    var wind = clamp(w.gust / 60, 0.08, 1);

    // cloud shadows: strongest under broken cloud, fading out as the sky closes over (the grey tint takes over)
    var g = this.shade.getContext('2d'), sw = this.shade.width, sh = this.shade.height;
    g.clearRect(0, 0, sw, sh);
    var c = clamp(w.cloud, 0, 1), broken = c < 0.8 ? c / 0.8 : Math.max(0.25, (1 - c) / 0.2);
    var strength = broken * L.day * 0.34;
    if (strength > 0.01) {
      var n = Math.round(4 + c * 12);
      for (var i = 0; i < n; i++) {
        var b = this.blobs[i];
        b.x += dt * (0.006 + 0.03 * wind) * b.s; if (b.x - b.r > 1.3) b.x = -0.3 - b.r;
        var cx = b.x * sw, cy = b.y * sh, r = b.r * sw;
        g.save(); g.translate(cx, cy); g.scale(1, b.sq);
        var gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, 'rgba(24,34,52,' + strength.toFixed(3) + ')'); gr.addColorStop(0.55, 'rgba(24,34,52,' + (strength * 0.55).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(24,34,52,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill(); g.restore();
      }
    }

    var f = this.fall.getContext('2d');
    f.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    f.clearRect(0, 0, W, H);
    // low sun: a warm glow from the side of the view the sun is on
    if (L.glow > 0.03) {
      var rel = ((w.az - this.bearing + 540) % 360) - 180; // sun direction relative to where the camera looks
      var gx, gy, gr2 = Math.max(W, H) * 0.95;
      if (Math.abs(rel) <= 75) { gx = W * (0.5 + rel / 150); gy = -H * 0.04; }
      else { gx = rel > 0 ? W * 1.08 : -W * 0.08; gy = H * (0.18 + 0.5 * smooth(Math.abs(rel), 75, 180)); }
      var a = L.glow * (Math.abs(rel) <= 75 ? 0.42 : 0.24);
      var sg = f.createRadialGradient(gx, gy, 0, gx, gy, gr2);
      sg.addColorStop(0, 'rgba(255,214,150,' + a.toFixed(3) + ')'); sg.addColorStop(0.3, 'rgba(255,170,96,' + (a * 0.45).toFixed(3) + ')'); sg.addColorStop(1, 'rgba(255,150,80,0)');
      f.globalCompositeOperation = 'lighter'; f.fillStyle = sg; f.fillRect(0, 0, W, H); f.globalCompositeOperation = 'source-over';
    }
    // rain or snow
    if (w.rain > 0.04) {
      var heavy = clamp(w.rain / 2.5, 0.08, 1), area = clamp((W * H) / 900000, 0.35, 1.4), k, d;
      if (w.snow) {
        var ns = Math.round((70 + 300 * heavy) * area);
        f.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * L.day).toFixed(2) + ')';
        for (k = 0; k < ns && k < this.drops.length; k++) {
          d = this.drops[k];
          d.y += dt * (0.07 + 0.09 * d.v); d.ph += dt * 1.4; d.x += dt * (0.02 + 0.07 * wind) + Math.sin(d.ph) * 0.0006;
          if (d.y > 1.03) { d.y = -0.03; } if (d.x > 1.03) d.x -= 1.06;
          f.beginPath(); f.arc(d.x * W, d.y * H, d.r, 0, 6.2832); f.fill();
        }
      } else {
        var nr = Math.round((50 + 330 * heavy) * area), slant = 0.12 + 0.5 * wind;
        f.strokeStyle = 'rgba(232,240,250,' + (0.22 + 0.2 * heavy).toFixed(2) + ')'; f.lineWidth = 1.1; f.lineCap = 'round';
        f.beginPath();
        for (k = 0; k < nr && k < this.drops.length; k++) {
          d = this.drops[k];
          d.y += dt * 1.25 * d.v; d.x += dt * 1.25 * d.v * slant * (H / W);
          if (d.y > 1.04) { d.y = -0.04; } if (d.x > 1.04) d.x -= 1.08;
          var x = d.x * W, y = d.y * H, len = 15 * d.l;
          f.moveTo(x, y); f.lineTo(x - len * slant, y - len);
        }
        f.stroke();
      }
    }
    var busy = strength > 0.01 || w.rain > 0.04;
    this.raf = (busy && !this.still) ? requestAnimationFrame(this.tick) : 0;
  };

  window.WMSky = { sun: sun, look: look, addLayers: addLayers, apply: apply, reset: reset, Overlay: Overlay, zurichOffset: zurichOffset };
})();
