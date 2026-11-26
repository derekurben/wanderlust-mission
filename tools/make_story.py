"""Build js/stories.js: every logbook's text and photos, each block pinned to a point on the route.

Anchors are hand-placed from reading each post (landmarks, stated elevations, the hut);
blocks without an anchor are spread evenly between their neighbours.
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json, re, html, math, os, glob

D = ROOT + '/source/'
posts = json.load(open(D + 'posts.json'))
manifest = json.load(open(D + 'manifest.json'))
src = open(ROOT + '/site/js/data.js', encoding='utf8').read()
WM = json.loads(src[src.index('{'):src.rindex('}') + 1])
LOG = {l['id']: l for l in WM['logbooks']}

IDMAP = {
    'dammahutte-6zb3f': 'kroenten', 'kroentenhutte': 'damma', 'albertheimhutte': 'albertheim',
    'rugghubelhutte': 'rugghubel', 'glarus-grand-tour': 'glarus', 'glarnischhutte': 'glarnisch',
    'piansecco-hblbn-pz4tr': 'sewen', 'piansecco-hblbn': 'salbit', 'piansecco': 'piansecco',
    'leglerhutte': 'legler', 'spitzmeilenhutte': 'spitzmeilen',
    'chamanna-da-grialetsch-cas-fyzaf-g74ff-xgj96': 'voralp', 'chamanna-da-grialetsch-cas-fyzaf-g74ff': 'lidernen',
    'chamanna-da-grialetsch-cas-fyzaf': 'loborn', 'chamanna-da-grialetsch-cas-fyzaf-g74ff-6f89g': 'glattalp',
    'chamanna-da-grialetsch-cas': 'grialetsch', 'episode-02-soundtrack-to-my-life-5yc5c': 'obererbs',
    'episode-02-soundtrack-to-my-life-5yc5c-4xffw': 'hundstein', 'logbook1': 'intro',
}

# item index -> anchor.  S start, E end, H hut, T highest point, A>B:f a fraction of the way from A to B,
# e:N the next time the route climbs through N metres, d:N the next time it drops through N metres.
ANCHORS = {
 'kroenten': {4: 'S', 6: 'S>H:.05', 7: 'e:1400', 9: 'e:1460', 10: 'S>H:.82', 12: 'H', 27: 'H', 28: 'H>E:.3', 29: 'H>E:.45',
              30: 'H>E:.65', 31: 'H>E:.85', 33: 'H>E:.95', 34: 'E'},
 'damma': {4: 'S', 5: 'S>H:.35', 6: 'S>H:.48', 7: 'S>H:.52', 8: 'S>H:.8', 9: 'H', 12: 'H', 13: 'H>E:.2', 14: 'H>E:.3',
           15: 'H>E:.7', 16: 'H>E:.75', 17: 'E'},
 'albertheim': {4: 'S', 5: 'S>H:.1', 6: 'S>H:.3', 8: 'S>H:.5', 11: 'S>H:.6', 12: 'S>H:.85', 13: 'S>H:.92', 14: 'H', 17: 'H',
                18: 'H>E:.2', 19: 'H>E:.55'},
 'rugghubel': {3: 'S', 4: 'S>H:.5', 5: 'S>H:.65', 6: 'S>H:.72', 7: 'H', 9: 'H', 10: 'H>E:.1', 11: 'H>E:.9', 12: 'E'},
 'glarus': {5: 'S', 6: 'e:900', 7: 'e:1000', 8: 'e:1000', 9: 'e:1200', 11: 'e:1200', 12: 'e:1300', 13: 'e:1400', 14: 'e:1600',
            15: 'e:1850', 16: 'F1', 28: 'F1', 29: 'F1>G:.3', 30: 'F1>G:.4', 31: 'e:2150', 32: 'e:2150', 33: 'e:2350', 34: 'e:2350',
            35: 'G', 36: 'G', 37: 'F2', 38: 'F2>P:.12', 39: 'F2>P:.12', 40: 'F2>M:.55', 41: 'M', 42: 'M', 43: 'M>P:.3',
            44: 'M>P:.3', 45: 'M>P:.45', 46: 'e:2500', 47: 'e:2500', 48: 'e:2750', 49: 'e:2900', 50: 'e:2900', 51: 'P', 70: 'P',
            71: 'P>E:.25', 72: 'P>E:.3', 73: 'P>E:.6', 74: 'P>E:.85', 75: 'E'},
 'glarnisch': {6: 'S', 7: 'e:1200', 8: 'e:1200', 9: 'S>H:.5', 10: 'S>H:.5', 11: 'S>H:.62', 12: 'S>H:.62', 13: 'e:1390',
               14: 'e:1550', 15: 'e:1650', 16: 'e:1800', 17: 'e:1950', 18: 'H', 21: 'H', 22: 'H>E:.3', 23: 'H>E:.6', 24: 'E'},
 'sewen': {3: 'S', 4: 'S>H:.05', 5: 'S>H:.4', 6: 'S>H:.6', 7: 'S>H:.9', 8: 'H', 10: 'H', 11: 'H>E:.25', 12: 'H>E:.25',
           13: 'H>E:.5', 14: 'H>E:.55', 15: 'H>E:.7', 16: 'H>E:.7'},
 'salbit': {5: 'S', 6: 'e:1800', 7: 'e:1800', 8: 'e:1850', 9: 'e:2000', 10: 'e:2000', 11: 'H', 13: 'H', 14: 'H>E:.1', 15: 'H>E:.5'},
 'piansecco': {2: 'S', 3: 'S>H:.1', 5: 'S>H:.1', 6: 'S>H:.3', 8: 'S>H:.35', 9: 'S>H:.5', 10: 'S>H:.55', 11: 'S>H:.65',
               12: 'S>H:.7', 13: 'S>H:.85', 14: 'S>H:.9', 15: 'S>H:.93', 16: 'S>H:.93', 17: 'H', 19: 'H', 20: 'H>E:.3', 21: 'H>E:.7'},
 'legler': {5: 'S', 6: 'S>H:.08', 7: 'S>H:.3', 8: 'S>H:.5', 9: 'S>H:.5', 10: 'e:2210', 11: 'e:2210', 12: 'S>H:.95', 13: 'S>H:.95',
            14: 'H', 26: 'H', 27: 'H>E:.15', 28: 'H>E:.2', 29: 'H>E:.35', 30: 'H>E:.55', 31: 'H>E:.6', 32: 'E', 33: 'H>E:.9'},
 'spitzmeilen': {5: 'S', 6: 'S>H:.15', 7: 'S>H:.2', 8: 'S>H:.35', 9: 'S>H:.4', 10: 'e:1800', 11: 'e:1800', 12: 'S>H:.82',
                 13: 'S>H:.82', 14: 'S>H:.9', 15: 'S>H:.96', 16: 'S>H:.96', 17: 'H', 25: 'H', 26: 'H>E:.08', 27: 'H>E:.08',
                 28: 'H>E:.15', 29: 'H>E:.15', 30: 'H>E:.3', 31: 'H>E:.35', 32: 'H>E:.45', 33: 'H>E:.7', 34: 'H>E:.75', 35: 'E'},
 'voralp': {3: 'S', 4: 'S>H:.12', 5: 'S>H:.12', 6: 'S>H:.2', 7: 'S>H:.2', 8: 'e:1661', 9: 'e:1661', 10: 'e:1800', 11: 'e:1800',
            12: 'S>H:.8', 13: 'S>H:.8', 14: 'S>H:.9', 15: 'S>H:.9', 16: 'S>H:.95', 17: 'S>H:.95', 18: 'H'},
 'lidernen': {3: 'S', 4: 'S>T:.3', 5: 'S>T:.75', 6: 'S>T:.75', 7: 'T', 10: 'T', 11: 'T>E:.4', 12: 'T>E:.75', 13: 'T>E:.75',
              14: 'T>E:.92', 15: 'E'},
 'loborn': {2: 'S', 3: 'S>T:.15', 4: 'S>T:.15', 5: 'S>T:.55', 6: 'S>T:.7', 7: 'S>T:.7', 8: 'S>T:.8', 9: 'S>T:.8', 10: 'T'},
 'glattalp': {1: 'S', 2: 'S>E:.15', 3: 'S>E:.2', 4: 'S>E:.35', 5: 'S>E:.45', 6: 'S>E:.5', 7: 'S>E:.6', 8: 'S>E:.65', 9: 'E'},
 'grialetsch': {4: 'S', 5: 'S>H:.2', 6: 'S>H:.4', 7: 'S>H:.45', 8: 'S>H:.85', 9: 'S>H:.85', 10: 'H'},
 'obererbs': {2: 'S', 3: 'S>H:.1', 4: 'S>H:.85', 5: 'S>H:.55', 6: 'H'},
 'hundstein': {1: 'S', 2: 'S>H:.08', 3: 'S>H:.45', 4: 'S>H:.45', 5: 'S>H:.55', 6: 'S>H:.65', 7: 'S>H:.85', 8: 'H', 11: 'H',
               12: 'H>E:.5', 13: 'H>E:.6'},
 'intro': {},
}

def hav(a, b):
    r = math.pi / 180
    s = math.sin((b[1] - a[1]) * r / 2) ** 2 + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin((b[0] - a[0]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(s))

ALLOWED = {'p', 'h2', 'h3', 'h4', 'a', 'strong', 'em', 'b', 'i', 'u', 's', 'ul', 'ol', 'li', 'br', 'blockquote', 'sup', 'sub'}
def clean(h):
    def tag(m):
        close, name, attrs = m.group(1), m.group(2).lower(), m.group(3) or ''
        if name == 'h1': name = 'h2'
        if name not in ALLOWED: return ''
        if close: return f'</{name}>'
        if name == 'a':
            hm = re.search(r'href="([^"]*)"', attrs)
            href = hm.group(1) if hm else '#'
            if href.startswith('/'): href = 'https://www.wanderlustmission.com' + href
            if not re.match(r'^(https?:|mailto:)', href): href = '#'
            own = re.match(r'https?://(?:www\.)?wanderlustmission\.com/logbook/([^/?#]+)/?$', href)
            if own and own.group(1) in IDMAP: return f'<a href="#{IDMAP[own.group(1)]}">'
            return f'<a href="{href}" target="_blank" rel="noopener">'
        return f'<{name}>'
    h = re.sub(r'<(/?)([a-zA-Z0-9]+)((?:\s[^>]*)?)>', tag, h)
    return re.sub(r'\s+', ' ', h).strip()
def text(h): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h))).strip()

VIDEOS = {'aa3f3ff8': 'damma-helicopter', '92e856a9': 'glarus-gruenhorn', 'dd1a22fc': 'glarus-ochsenstock-drone',
          '982caad8': 'glarus-planura-drone', '0cce6c86': 'spitzmeilen-drone', 'cc0bc82b': 'voralp-river'}

stories, report = {}, []
for p in posts:
    lid = IDMAP[p['urlId']]
    items, src_words, got_words = [], 0, 0
    for b in p['blocks']:
        if b['t'] == 'html':
            src_words += len(text(b['html']).split())
            for tag, inner in re.findall(r'<(p|h[1-4]|ul|ol)\b[^>]*>(.*?)</\1>', b['html'], flags=re.S):
                if not text(inner): continue
                got_words += len(text(inner).split())
                name = 'h3' if tag[0] == 'h' else tag
                items.append(dict(k='h' if tag[0] == 'h' else 't', html=f'<{name}>{clean(inner)}</{name}>'))
        elif b['t'] == 'image':
            m = manifest[b['src']]
            it = dict(k='img', src=m['file'], w=m['w'], h=m['h'])
            if b.get('cap') and text(b['cap']): it['cap'] = clean(b['cap'])
            if b.get('alt') and not re.search(r'\.(jpe?g|png|webp)$', b['alt'], re.I): it['alt'] = b['alt']
            items.append(it)
        elif b['t'] == 'video':
            v = b.get('video') or ''
            m = re.search(r'/([0-9a-f]{8})-[0-9a-f-]+/\{variant\}', v)
            if not m: continue
            ar = re.search(r'"aspectRatio":([0-9.]+)', v)
            name = VIDEOS[m.group(1)]
            assert os.path.exists(ROOT + f'/site/video/{name}.mp4')
            items.append(dict(k='video', src=f'video/{name}.mp4', poster=f'video/{name}.webp', ar=round(float(ar.group(1)), 3) if ar else 1.78))
    assert src_words == got_words, (lid, src_words, got_words)

    l = LOG.get(lid)
    if l and l.get('track'):
        tr = l['track']; n = len(tr)
        cum = [0.0]
        for i in range(1, n): cum.append(cum[-1] + hav(tr[i - 1], tr[i]))
        def near(at, first=True):
            idx = [i for i in range(n) if hav(tr[i], at) < 130]
            return (idx[0] if first else idx[-1]) if idx else min(range(n), key=lambda i: hav(tr[i], at))
        pts = {'S': 0, 'E': n - 1, 'T': max(range(n), key=lambda i: tr[i][2])}
        h0 = l['huts'][0]['at']
        pts['H'] = min(range(n), key=lambda i: hav(tr[i], h0))
        if lid == 'glarus':
            f, g, pl = [h['at'] for h in l['huts']]
            pts['F1'] = pts['H']; pts['G'] = min(range(n), key=lambda i: hav(tr[i], g))
            pts['F2'] = max(i for i in range(pts['G'], n) if hav(tr[i], f) < 130)
            pts['P'] = min(range(n), key=lambda i: hav(tr[i], pl))
            pts['M'] = min(range(pts['F2'], pts['P']), key=lambda i: tr[i][2])
            print('glarus points', pts, [tr[v][2] for v in pts.values()])
        spec = ANCHORS[lid]; pos = {}; last = 0
        for i in sorted(spec):
            s = spec[i]
            if s in pts: d = cum[pts[s]]
            elif s[:2] in ('e:', 'd:'):
                lvl = float(s[2:]); up = s[0] == 'e'
                j = next((k for k in range(last, n) if (tr[k][2] >= lvl if up else tr[k][2] <= lvl)), None)
                assert j is not None, (lid, i, s)
                if j > 0 and j > last:      # interpolate inside the segment
                    a, b2 = tr[j - 1][2], tr[j][2]
                    t = (lvl - a) / (b2 - a) if b2 != a else 0
                    d = cum[j - 1] + (cum[j] - cum[j - 1]) * max(0, min(1, t))
                else: d = cum[j]
            else:
                ab, fr = s.split(':'); a, b2 = ab.split('>')
                d = cum[pts[a]] + (cum[pts[b2]] - cum[pts[a]]) * float(fr)
            pos[i] = d
            last = max(k for k in range(n) if cum[k] <= d + 1e-6)
        keys = sorted(pos)
        for i, it in enumerate(items):
            if i in pos: d = pos[i]
            elif not keys or i < keys[0]: d = 0.0
            elif i > keys[-1]: d = pos[keys[-1]]
            else:
                lo = max(k for k in keys if k < i); hi = min(k for k in keys if k > i)
                d = pos[lo] + (pos[hi] - pos[lo]) * (i - lo) / (hi - lo)
            it['f'] = round(d / cum[-1], 4)
        back = sum(1 for a, b2 in zip(items, items[1:]) if b2['f'] < a['f'] - 1e-6)
        report.append(f"{lid:12s} items {len(items):3d} words {got_words:5d} imgs {sum(1 for x in items if x['k']=='img'):2d} anchors {len(spec):2d} backward steps {back}")
    else:
        report.append(f"{lid:12s} items {len(items):3d} words {got_words:5d} imgs {sum(1 for x in items if x['k']=='img'):2d} (no route)")
    stories[lid] = items

js = 'window.WM_STORIES = ' + json.dumps(stories, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(ROOT + '/site/js/stories.js', 'w', encoding='utf8').write(js)
print('\n'.join(report)); print('stories.js KB', len(js) // 1024)
