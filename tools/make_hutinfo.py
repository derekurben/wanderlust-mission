#!/usr/bin/env python3
"""Build site/js/hutinfo.js: practical facts for every hut on the list.

source/hut_info_raw.tsv was gathered on 27 Nov 2026: beds, winter room, website and booking link from
OpenStreetMap (c OpenStreetMap contributors, ODbL), and the nearest public transport stop from the Swiss
timetable (transport.opendata.ch) with its height from swisstopo. No phone numbers, emails or names are kept."""
import json, os, csv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = {}
for r in csv.DictReader(open(ROOT + '/source/hut_info_raw.tsv', encoding='utf8'), delimiter='\t', quoting=csv.QUOTE_NONE):
    e = {}
    num = lambda v: int(v) if v and v.strip().isdigit() and int(v) > 0 else None
    if num(r['beds']): e['beds'] = num(r['beds'])
    if num(r['winter_room']): e['winter'] = num(r['winter_room'])
    if r['website'].startswith('http'): e['web'] = r['website'].strip()
    if r['booking'].startswith('http'): e['book'] = r['booking'].strip()
    if r['food'] == 'yes': e['food'] = 1
    if r['stop'] and r['stop_m']:
        e['stop'] = {'n': r['stop'], 'km': round(int(float(r['stop_m'])) / 1000, 1)}
        if r['stop_ele']: e['stop']['ele'] = int(float(r['stop_ele']))
    if e: out[r['hut']] = e
js = 'window.WM_HUTINFO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(ROOT + '/site/js/hutinfo.js', 'w', encoding='utf8').write(js)
c = lambda k: sum(1 for v in out.values() if k in v)
print(f'hutinfo.js: {len(out)} huts; beds {c("beds")}, winter room {c("winter")}, website {c("web")}, booking {c("book")}, stop {c("stop")}; {len(js)} bytes')
