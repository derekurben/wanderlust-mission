import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import json, math, datetime

T = json.load(open(ROOT + '/source/tracks.json'))
import glob, re
POSTS = {p['urlId']: p for p in json.load(open(ROOT + '/source/posts.json'))}
MANIFEST = json.load(open(ROOT + '/source/manifest.json'))
SQ = 'https://images.squarespace-cdn.com/content/v1/695a73d412c9437652572a09/'
OLD = 'https://www.wanderlustmission.com/logbook/'

def hav(a, b):
    R = 6371000; r = math.pi / 180
    dla = (b[1] - a[1]) * r; dlo = (b[0] - a[0]) * r
    s = math.sin(dla / 2) ** 2 + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(s))

def simplify(pts, tol):
    lat0 = math.radians(pts[0][1]); R = 6371000
    P = [(math.radians(p[0]) * R * math.cos(lat0), math.radians(p[1]) * R, p[2]) for p in pts]
    keep = [False] * len(pts); keep[0] = keep[-1] = True; st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop(); md, mi = 0, -1; A, B = P[a], P[b]
        dx, dy, dz = B[0] - A[0], B[1] - A[1], B[2] - A[2]; L = dx * dx + dy * dy + dz * dz
        for i in range(a + 1, b):
            p = P[i]; t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy + (p[2] - A[2]) * dz) / L if L else 0
            t = max(0, min(1, t)); d = math.dist(p, (A[0] + t * dx, A[1] + t * dy, A[2] + t * dz))
            if d > md: md, mi = d, i
        if md > tol: keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(pts, keep) if k]

def hundstein():
    raw = json.load(open(ROOT + '/source/hundstein_raw.json'))[0]['c']
    ele = json.load(open(ROOT + '/source/hundstein_ele.json'))
    assert ele and len(ele) == len(raw)
    pts = [[c[0], c[1], e] for c, e in zip(raw, ele)]
    km = sum(hav(a, b) for a, b in zip(pts, pts[1:])) / 1000
    gain = 0; ref = pts[0][2]
    for p in pts:
        if p[2] - ref > 8: gain += p[2] - ref; ref = p[2]
        elif ref - p[2] > 8: ref = p[2]
    return dict(km=round(km, 1), gain=int(gain), loss=int(gain), t0=0, t1=0, mov=0, eleSrc='dem', pts=simplify(pts, 7))
T['Hundsteinhütte'] = hundstein()

# --- weather -------------------------------------------------------------
W = {}
cur = None
for line in open(ROOT + '/source/weather.txt', encoding='utf8'):
    line = line.strip()
    if not line:
        cur = None; continue
    if cur is None:
        cur = line; W[cur] = []; continue
    parts = line.split('|')
    d = parts[0].split(';')
    day = dict(date=d[0], code=int(d[1]), tmax=float(d[2]), tmin=float(d[3]), precip=float(d[4]),
               snow=float(d[5]), gust=int(d[6]), sun=float(d[7]), sunrise=d[8], sunset=d[9])
    for p in parts[1:]:
        key = {'T': 'temp', 'P': 'rain', 'C': 'cloud', 'G': 'gusts'}[p[0]]
        day[key] = [float(x) if '.' in x else int(x) for x in p[1:].split(',')]
        assert len(day[key]) == 17, (cur, key)
    W[cur].append(day)

# --- hut positions from the master list (see tools/make_huts.py) -----------
def hut_key(n):
    n = re.sub(r'\s+(SAC|CAS)$', '', n).lower().replace('ü', 'u').replace('ä', 'a').replace('ö', 'o')
    return re.sub(r'(hutten|hutte)$', 'hut', re.sub(r'[^a-z]', '', n))
MASTER = {hut_key(h['name']): h for h in json.load(open(ROOT + '/source/huts_master.json', encoding='utf8'))}

# --- logbooks ------------------------------------------------------------
# pin rules: 'hi' = track high point, 'start', 'far' = farthest from start,
# ('near', lat, lng) = track point closest to a known position, matching hut elevation
L = [
 dict(id='intro', no=0, title='How these logbooks work', sub='What they are, what I hope you get out of them. Start here.', dates=['2024-09-15'],
      slug='logbook1', cover='', kind='Notes', canton='', track=None, stated=None, huts=[]),
 dict(id='hundstein', no=1, title='Hundsteinhütte', sub='Our very first SAC hut visit, in the Appenzell Alps', dates=['2024-10-12'],
      slug='episode-02-soundtrack-to-my-life-5yc5c-4xffw', cover=SQ+'1767882680705-F5S5INDDKDICST86HOD3/IMG_7571+%281%29.jpg',
      kind='Hike', canton='AI', track='Hundsteinhütte', stated=None,
      huts=[dict(name='Hundsteinhütte', ele=1554, sac=True, pin='far')]),
 dict(id='obererbs', no=2, title='Skihütte Obererbs', sub='A whiteout snowshoe in Elm', dates=['2024-12-15'],
      slug='episode-02-soundtrack-to-my-life-5yc5c', cover=SQ+'1767559564861-XT0VCN189HWFNMPY5SHV/IMG_9160.jpg',
      kind='Snowshoe', canton='GL', track='Skihutte Obererbs', stated=dict(gain=396, time='2:41'), winter=True,
      huts=[dict(name='Skihütte Obererbs', ele=1700, sac=False, pin='hi')]),
 dict(id='grialetsch', no=3, title='Chamanna da Grialetsch CAS', sub='The Scottish Highlands of Switzerland', dates=['2025-08-14'],
      slug='chamanna-da-grialetsch-cas', cover=SQ+'1767560272853-GTOSNO3M2D6E3TP4ZU6T/IMG_3506.jpg',
      kind='Hike', canton='GR', track='Chamanna da Grialetsch', stated=dict(km=15.7, gain=544, time='3:25'),
      huts=[dict(name='Chamanna da Grialetsch', ele=2542, sac=True, pin='hi')]),
 dict(id='glattalp', no=4, title='Glattalphütte', sub='One of the most beautiful and accessible alpine settings in Switzerland', dates=['2025-09-13'],
      slug='chamanna-da-grialetsch-cas-fyzaf-g74ff-6f89g', cover=SQ+'1767728428314-BIJUJELUA88O1ZOX67O9/IMG_4038.jpg',
      kind='Hike', canton='SZ', track='Glatalphutte', stated=dict(km=6.9, gain=125, time='1:30'),
      huts=[dict(name='Glattalphütte', ele=1892, sac=True, pin='start')]),
 dict(id='loborn', no=5, title='Lobhornhütte (kind of)', sub='An incredible hike, but we didn’t technically make it to the hut, which is also technically not a SAC hut', dates=['2025-09-20', '2025-09-21'],
      slug='chamanna-da-grialetsch-cas-fyzaf', cover='img/covers/loborn.jpg',
      kind='Hike and camp', canton='BE', track='Lobornhutte', stated=dict(km=11.2, gain=706, time='5:07'),
      huts=[dict(name='Lobhornhütte', ele=1955, sac=False, pin='hi', label='High point of the route')]),
 dict(id='lidernen', no=6, title='Lidernenhütte', sub='A quick day trip ski tour to a classic hut in Canton Uri', dates=['2025-12-13'],
      slug='chamanna-da-grialetsch-cas-fyzaf-g74ff', cover=SQ+'1767615116239-QAI3AXWHEFEN6JDHEAAG/IMG_1048.JPG',
      kind='Ski tour', canton='UR', track='Lidernenhutte', stated=dict(km=8.04, gain=705, time='3:35'), winter=True,
      huts=[dict(name='Lidernenhütte', ele=1727, sac=True, pin='start')]),
 dict(id='voralp', no=7, title='Voralphütte', sub='An early spring approach full of snow and wide valleys', dates=['2026-05-02', '2026-05-03'],
      slug='chamanna-da-grialetsch-cas-fyzaf-g74ff-xgj96', cover=SQ+'1780944748741-ZBKK0J6399FWA6U38ZPT/Voralphutte.png',
      kind='Overnight hike', canton='UR', track='Voralphutte', stated=dict(km=18.8, gain=928, time='6:57'),
      huts=[dict(name='Voralphütte', ele=2126, sac=True, pin='hi')]),
 dict(id='spitzmeilen', no=8, title='Spitzmeilenhütte', sub='Spring on the way up, winter on the way down', dates=['2026-05-13', '2026-05-14'],
      slug='spitzmeilenhutte', cover='img/covers/spitzmeilen.jpg',
      kind='Overnight hike', canton='SG', track='Spitzmeilenhutte', stated=dict(km=11.7, gain=954, time='3:55'),
      huts=[dict(name='Spitzmeilenhütte', ele=2087, sac=True, pin='far')]),
 dict(id='legler', no=9, title='Leglerhütte', sub='A glorious opening to summer hut season in Glarus', dates=['2026-06-07', '2026-06-08'],
      slug='leglerhutte', cover='img/covers/legler.jpg',
      kind='Overnight hike', canton='GL', track='Leglerhutte', stated=dict(km=12, gain=781, time='3:36'),
      huts=[dict(name='Leglerhütte', ele=2273, sac=True, pin='far')]),
 dict(id='piansecco', no=10, title='Capanna Piansecco', sub='Family trip to a low elevation, newly renovated hut in Ticino', dates=['2026-06-13', '2026-06-14'],
      slug='piansecco', cover='img/covers/piansecco.jpg',
      kind='Overnight hike', canton='TI', track='Capanna Piansecco', stated=dict(km=10.2, gain=375, time='4:15'),
      huts=[dict(name='Capanna Piansecco', ele=1982, sac=True, pin='far')]),
 dict(id='salbit', no=11, title='Salbithütte', sub='A quick day hike and lunch in the Göschenen valley', dates=['2026-06-25'],
      slug='piansecco-hblbn', cover='img/covers/salbit.jpg',
      kind='Day hike', canton='UR', track='Salbithütte', stated=dict(km=7.9, gain=909, time='5:33'),
      huts=[dict(name='Salbithütte', ele=2105, sac=True, pin='hi')]),
 dict(id='sewen', no=12, title='Sewenhütte', sub='Sunday day hike to the Sustenpass valley', dates=['2026-07-05'],
      slug='piansecco-hblbn-pz4tr', cover='img/covers/sewen.jpg',
      kind='Day hike', canton='UR', track='Sewenhütte', stated=dict(km=7.4, gain=642, time='4:51'),
      huts=[dict(name='Sewenhütte', ele=2150, sac=True, pin='hi')]),
 dict(id='glarnisch', no=13, title='Glärnischhütte', sub='An ass kicking trail run up the Glärnisch', dates=['2026-07-11'],
      slug='glarnischhutte', cover='img/covers/glarnisch.jpg',
      kind='Trail run', canton='GL', track='Glärnischhütte', stated=dict(km=16.4, gain=1151, time='3:45'),
      huts=[dict(name='Glärnischhütte', ele=1990, sac=True, pin='hi')]),
 dict(id='glarus', no=14, title='The Grand Glarus Tour', sub='A 3 day tour to see the best of Glarus', dates=['2026-08-08', '2026-08-09', '2026-08-10'],
      slug='glarus-grand-tour', cover=SQ+'1786624262087-SIKXQOCNPZ5W83XG5IH9/dji_fly_20260809_82146%E2%80%AFPM_0046_1786299825125_photo.jpg',
      kind='3-day tour', canton='GL', track='Fridonlinshutte, Gruehornhutte, Planurahutte', stated=dict(km=39.5, gain=3085, time='12:19'),
      huts=[dict(name='Fridolinshütte', ele=2111, sac=True, pin=('near', 46.82146, 8.95045)),
            dict(name='Grünhornhütte', ele=2448, sac=True, pin=('near', 46.8195, 8.9330)),
            dict(name='Planurahütte', ele=2947, sac=True, pin='hi')]),
 dict(id='rugghubel', no=15, title='Rugghubelhütte', sub='Showing a friend the hut life', dates=['2026-08-30'],
      slug='rugghubelhutte', cover='img/covers/rugghubel.jpg',
      kind='Day hike', canton='OW', track='Rugghubelhutte', stated=dict(km=10.6, gain=555, time='3:59'),
      huts=[dict(name='Rugghubelhütte', ele=2290, sac=True, pin='hi')]),
 dict(id='albertheim', no=16, title='Albert-Heim-Hütte', sub='Comparing 5 star hotels to mountain huts for our family', dates=['2026-09-05', '2026-09-06'],
      slug='albertheimhutte', cover='img/covers/albertheim.jpg',
      kind='Overnight hike', canton='UR', track='Albert Heim Hutte', stated=dict(km=6.2, gain=284, time='2:32'), dateGuess=True,
      huts=[dict(name='Albert-Heim-Hütte', ele=2543, sac=True, pin='hi')]),
 dict(id='damma', no=17, title='Dammahütte', sub='A failed double hut run', dates=['2026-09-12'],
      slug='kroentenhutte', cover=SQ+'1794132752910-YWW6GM2792RPBTVMXPI6/IMG_5852.JPG',
      kind='Trail run', canton='UR', track='Dammahutte', stated=dict(km=13.1, gain=913, time='3:18'),
      huts=[dict(name='Dammahütte', ele=2439, sac=True, pin='hi')]),
 dict(id='kroenten', no=18, title='Kröntenhütte', sub='The last overnight of the 2026 summer season', dates=['2026-10-31', '2026-11-01'],
      slug='dammahutte-6zb3f', cover='img/covers/kroenten.jpg',
      kind='Overnight hike', canton='UR', track='Kroentenhutte', stated=dict(km=10.6, gain=956, time='3:46'),
      huts=[dict(name='Kröntenhütte', ele=1903, sac=True, pin='hi')]),
]

ZH = datetime.timezone(datetime.timedelta(hours=1))
def local_hour(ts):
    # Europe/Zurich: CEST (UTC+2) roughly Apr-Oct for these dates, else CET
    d = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc)
    off = 2 if 4 <= d.month <= 10 else 1
    d = d + datetime.timedelta(hours=off)
    return d.strftime('%Y-%m-%d'), round(d.hour + d.minute / 60, 2)

out = []
for lb in L:
    e = dict(id=lb['id'], no=lb['no'], title=lb['title'], sub=lb['sub'], dates=lb['dates'], kind=lb['kind'],
             canton=lb['canton'], cover=(MANIFEST.get(POSTS[lb['slug']].get('assetUrl') or '', {}).get('file') or lb['cover']) if lb['huts'] else '',
             url=OLD + lb['slug'], winter=bool(lb.get('winter')), dateGuess=bool(lb.get('dateGuess')),
             weather=W.get(lb['id'], []))
    tr = T.get(lb['track']) if lb['track'] else None
    st = lb['stated'] or {}
    if tr:
        pts = tr['pts']
        cum = [0.0]
        for i in range(1, len(pts)):
            cum.append(cum[-1] + hav(pts[i - 1], pts[i]))
        e['track'] = [[round(p[0], 5), round(p[1], 5), int(p[2])] for p in pts]
        e['km'] = st.get('km', tr['km']); e['gain'] = st.get('gain', tr['gain'])
        e['time'] = st.get('time')
        e['max'] = max(p[2] for p in pts); e['min'] = min(p[2] for p in pts)
        e['eleSrc'] = tr['eleSrc']
        if tr['t0']:
            a = local_hour(tr['t0']); b = local_hour(tr['t1'])
            e['window'] = [a[0], a[1], b[0], b[1]]
            assert a[0] == lb['dates'][0] and b[0] == lb['dates'][-1], (lb['id'], a, b, lb['dates'])
        hi = max(range(len(pts)), key=lambda i: pts[i][2])
        far = max(range(len(pts)), key=lambda i: hav(pts[0], pts[i]))
    huts = []
    for h in lb['huts']:
        hh = dict(name=h['name'], ele=h['ele'], sac=h['sac'])
        if h.get('label'): hh['label'] = h['label']
        if 'at' in h: hh['at'] = h['at']
        else:
            pin = h['pin']
            if pin == 'hi': i = hi
            elif pin == 'start': i = 0
            elif pin == 'far': i = far
            else:
                g = [pin[2], pin[1]]
                cand = [k for k in range(len(pts)) if hav(pts[k], g) < 1500 and abs(pts[k][2] - h['ele']) <= 25]
                i = min(cand or range(len(pts)), key=lambda k: hav(pts[k], g))
            hh['at'] = [round(pts[i][0], 5), round(pts[i][1], 5)]
            hh['trackEle'] = int(pts[i][2])
            print(f"{lb['id']:12s} {h['name']:24s} pin@{hh['at']} trackEle={pts[i][2]} hutEle={h['ele']}  idx {i}/{len(pts)}")
        m = MASTER.get(hut_key(h['name'])) if h['sac'] else None
        if m:  # the hut building itself, from swisstopo, not the nearest point of the recording
            d = hav([hh['at'][0], hh['at'][1]], [m['lon'], m['lat']])
            if d > 30: print(f"   moved {h['name']} pin {d:.0f} m onto the building")
            hh['at'] = [round(m['lon'], 5), round(m['lat'], 5)]
        huts.append(hh)
    e['huts'] = huts
    out.append(e)

sac = sum(1 for e in out for h in e['huts'] if h['sac'])
print('covers', [e['cover'] for e in out if not e['cover'].startswith('img/')])
meta = dict(total=153, visited=sac, generated=datetime.date.today().isoformat())
js = 'window.WM = ' + json.dumps(dict(meta=meta, logbooks=out), ensure_ascii=False, separators=(',', ':')) + ';\n'
open(ROOT + '/site/js/data.js', 'w', encoding='utf8').write(js)
print('SAC huts visited:', sac, ' data.js KB:', len(js) // 1024)
print('total km', round(sum(e.get('km', 0) for e in out), 1), 'gain', sum(e.get('gain', 0) for e in out))
