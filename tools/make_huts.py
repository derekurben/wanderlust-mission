#!/usr/bin/env python3
"""Build site/js/huts.js: every hut on Derek's master list, with position, canton and (once visited) its logbook.

source/huts_master.json comes from the master Google Sheet (name, height, done, date) with positions from the
swisstopo place-name search. Visited huts are tied to their logbook by name, using site/js/data.js."""
import json, os, re, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
master = json.load(open(ROOT + '/source/huts_master.json', encoding='utf8'))
s = open(ROOT + '/site/js/data.js', encoding='utf8').read()
data = json.loads(s[s.index('{'):s.rindex('}') + 1])

def key(n):
    n = re.sub(r'\s+(SAC|CAS)$', '', n).lower()
    n = n.replace('ü', 'u').replace('ä', 'a').replace('ö', 'o')
    n = re.sub(r'[^a-z]', '', n)
    return re.sub(r'(hutten|hutte)$', 'hut', n)

visited = {}
order = 0
for lb in sorted(data['logbooks'], key=lambda l: l['no']):
    for h in lb['huts']:
        if h['sac']:
            order += 1
            visited[key(h['name'])] = dict(log=lb['id'], no=lb['no'], n=order, date=lb['dates'][0])

MONTHS = 'january february march april may june july august september october november december'.split()
def iso(txt):
    m = re.match(r'(\w+) (\d+),? (\d{4})', txt or '')
    return '%s-%02d-%02d' % (m.group(3), MONTHS.index(m.group(1).lower()) + 1, int(m.group(2))) if m else None

out, seen = [], set()
for h in master:
    e = dict(n=re.sub(r'\s+(SAC|CAS)$', '', h['name']), ele=h['ele'], c=h['canton'], p=h['place'], at=[round(h['lon'], 5), round(h['lat'], 5)])
    v = visited.get(key(h['name']))
    if v:
        e.update(log=v['log'], no=v['n'], date=v['date'], sheet=iso(h['date']))
        seen.add(key(h['name']))
    elif h['done']:
        raise SystemExit('Marked done in the sheet but no logbook: ' + h['name'])
    out.append(e)
missing = set(visited) - seen
assert not missing, missing
out.sort(key=lambda e: (e.get('no', 999), e['n']))
js = 'window.WM_HUTS = ' + json.dumps(dict(listed=len(out), total=data['meta']['total'], huts=out), ensure_ascii=False, separators=(',', ':')) + ';\n'
open(ROOT + '/site/js/huts.js', 'w', encoding='utf8').write(js)
print('huts.js:', len(out), 'huts,', len(seen), 'visited,', len(js), 'bytes')
for e in out:
    if e.get('sheet') and e['sheet'] != e['date']:
        print('  date differs from the sheet:', e['n'], 'logbook', e['date'], 'sheet', e['sheet'])
