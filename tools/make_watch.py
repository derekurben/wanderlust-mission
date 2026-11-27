#!/usr/bin/env python3
"""Build site/js/watch.js: what the watch recorded, laid along each logbook's route.

source/garmin/<id>.json (from tools/garmin_import.py) holds the raw recording, a point every 10 seconds.
The site draws things by distance along the route, so each watch point is matched to the route and the
readings are averaged into 100 m steps: clock time, heart rate, speed, climb rate, temperature."""
import json, os, math, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP = 100.0

def hav(a, b):
    R = 6371000.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

s = open(ROOT + '/site/js/data.js', encoding='utf8').read()
logs = {l['id']: l for l in json.loads(s[s.index('{'):s.rindex('}') + 1])['logbooks']}
out = {}
for path in sorted(glob.glob(ROOT + '/source/garmin/*.json')):
    g = json.load(open(path, encoding='utf8'))
    l = logs.get(g['id'])
    if not l or not l.get('track'):
        continue
    tr = l['track']
    cum = [0.0]
    for i in range(1, len(tr)):
        cum.append(cum[-1] + hav(tr[i - 1], tr[i]))
    total = cum[-1]
    n = int(math.ceil(total / STEP)) + 1
    bins = [[] for _ in range(n)]
    cur, used, seen, days = 0, 0, 0, []
    for day in g['days']:
        di = l['dates'].index(day['date'])
        hh = day['startLocal'][11:16].split(':')
        t0 = 24 * di + int(hh[0]) + int(hh[1]) / 60
        pts = [p for p in day['points'] if p[1] is not None]
        last_ele, last_t = None, None
        for p in pts:
            seen += 1
            # the nearest route point, looking a little back and well ahead of where we already are
            best, bd = None, 1e9
            j = max(0, cur - 8)
            while j < len(tr) and cum[j] <= cum[cur] + 900:
                d = hav(tr[j], (p[1], p[2]))
                if d < bd:
                    bd, best = d, j
                j += 1
            if best is None or bd > 120:
                continue
            cur = max(cur, best) if best >= cur - 8 else cur
            used += 1
            vam = None
            if p[3] is not None and last_ele is not None and p[0] > last_t:
                vam = (p[3] - last_ele) / (p[0] - last_t) * 3600
            last_ele, last_t = p[3], p[0]
            bins[min(n - 1, int(round(cum[best] / STEP)))].append((t0 + p[0] / 3600, p[4], p[5], p[7], vam))
        s_ = day['summary']
        days.append({'date': day['date'], 'type': day['type'], 'start': round(t0 - 24 * di, 3), 'end': round(t0 - 24 * di + pts[-1][0] / 3600, 3),
                     'moving': round(s_.get('total_timer_time', 0) / 3600, 2), 'elapsed': round(s_.get('total_elapsed_time', 0) / 3600, 2),
                     'km': round(s_.get('total_distance', 0) / 1000, 1), 'up': s_.get('total_ascent'), 'down': s_.get('total_descent'),
                     'hr': s_.get('avg_heart_rate'), 'hrMax': s_.get('max_heart_rate'), 'kcal': s_.get('total_calories'), 'temp': s_.get('avg_temperature')})
    def col(k, digits):
        vals = []
        for b in bins:
            xs = [x[k] for x in b if x[k] is not None]
            vals.append(sum(xs) / len(xs) if xs else None)
        # fill gaps from the neighbours, then smooth lightly
        known = [i for i, v in enumerate(vals) if v is not None]
        if not known:
            return None
        for i in range(len(vals)):
            if vals[i] is None:
                a = max([k_ for k_ in known if k_ < i], default=None); b = min([k_ for k_ in known if k_ > i], default=None)
                vals[i] = vals[b] if a is None else vals[a] if b is None else vals[a] + (vals[b] - vals[a]) * (i - a) / (b - a)
        if k != 0:
            vals = [sum(vals[max(0, i - 1):i + 2]) / len(vals[max(0, i - 1):i + 2]) for i in range(len(vals))]
        return [round(v, digits) if digits else int(round(v)) for v in vals]
    t = col(0, 3)
    for i in range(1, len(t)):  # the clock never runs backwards along the route
        t[i] = max(t[i], t[i - 1])
    vam = col(4, 0)
    if vam:  # climb rate is noisy at 100 m: smooth it over about half a kilometre
        vam = [int(round(sum(vam[max(0, i - 2):i + 3]) / len(vam[max(0, i - 2):i + 3]) / 10) * 10) for i in range(len(vam))]
    out[g['id']] = {'step': STEP, 't': t, 'hr': col(1, 0), 'kmh': col(2, 1), 'temp': col(3, 0), 'vam': vam, 'days': days}
    filled = sum(1 for b in bins if b)
    print(f"{g['id']:12s} {len(g['days'])} day(s), matched {used}/{seen} points, {filled}/{n} steps filled, reached {cum[cur] / total * 100:.0f}% of the route")
js = 'window.WM_WATCH = ' + json.dumps(out, separators=(',', ':')) + ';\n'
open(ROOT + '/site/js/watch.js', 'w', encoding='utf8').write(js)
print('watch.js:', len(out), 'trips,', len(js), 'bytes')
