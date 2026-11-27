#!/usr/bin/env python3
"""Fetch the watch recordings for every logbook date from Garmin's Personal API.

Reads the trip dates from site/js/data.js, asks Garmin for the activities on those dates, downloads each
original file, and writes source/garmin/<logbook id>.json holding only what the site draws: time, position,
height, heart rate, speed, cadence and temperature, one point about every 10 seconds.

The key comes from the environment (GARMIN_PERSONAL_API_KEY). This script prints counts and field names
only, never values, because the logs of a public repository are public."""
import io, json, os, sys, zipfile, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'source', 'garmin')
STEP = 10  # seconds between kept points

def trips():
    s = open(os.path.join(ROOT, 'site', 'js', 'data.js'), encoding='utf8').read()
    d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    return [(l['id'], l['dates']) for l in d['logbooks'] if l.get('dates') and l.get('huts')]

def pick(d, *names):
    for n in names:
        if isinstance(d, dict) and d.get(n) is not None:
            return d[n]
    return None

def main():
    key = os.environ.get('GARMIN_PERSONAL_API_KEY', '').strip()
    if not key:
        print('No key found. Add the repository secret GARMIN_PERSONAL_API_KEY, then run this again.')
        return 1
    from garmin_personal_api import GarminPersonalApiClient, PersonalApiAuthenticator
    from garmin_fit_sdk import Decoder, Stream
    with PersonalApiAuthenticator() as auth:
        token = auth.obtain_token(key)
    os.makedirs(OUT, exist_ok=True)
    saved = 0
    with GarminPersonalApiClient(token.access_token) as client:
        shown = False
        for lid, dates in trips():
            path = os.path.join(OUT, lid + '.json')
            if os.path.exists(path):
                continue
            end = (datetime.date.fromisoformat(dates[-1]) + datetime.timedelta(days=1)).isoformat()
            try:
                found = client.search_activities(start=0, limit=50, start_date=dates[0], end_date=end)
            except Exception as e:
                print(f'{lid}: search failed ({type(e).__name__})')
                continue
            acts = found if isinstance(found, list) else (pick(found, 'activities', 'activityList', 'results') or [])
            if acts and not shown:
                print('activity fields:', sorted(acts[0].keys())[:60])
                shown = True
            days = []
            for a in acts:
                aid = pick(a, 'activityId', 'id')
                start = str(pick(a, 'startTimeLocal', 'startTimeGMT', 'beginTimestamp') or '')
                if aid is None or start[:10] not in dates:
                    continue
                kind = pick(a.get('activityType') or {}, 'typeKey') if isinstance(a.get('activityType'), dict) else a.get('activityType')
                try:
                    blob = client.download_activity(aid)
                except Exception as e:
                    print(f'{lid}: download failed ({type(e).__name__})')
                    continue
                fit = None
                if blob[:2] == b'PK':
                    with zipfile.ZipFile(io.BytesIO(blob)) as z:
                        names = [n for n in z.namelist() if n.lower().endswith('.fit')]
                        if names:
                            fit = z.read(names[0])
                        else:
                            print(f'{lid}: archive holds', [os.path.splitext(n)[1] for n in z.namelist()])
                else:
                    fit = blob
                if not fit:
                    continue
                msgs, errs = Decoder(Stream.from_byte_array(bytearray(fit))).read()
                recs = msgs.get('record_mesgs', [])
                pts, last, t0 = [], None, None
                for r in recs:
                    t = r.get('timestamp')
                    if t is None:
                        continue
                    if t0 is None:
                        t0 = t
                    if last is not None and (t - last).total_seconds() < STEP:
                        continue
                    last = t
                    lat, lon = r.get('position_lat'), r.get('position_long')
                    sc = 180 / 2 ** 31
                    alt = r.get('enhanced_altitude', r.get('altitude'))
                    spd = r.get('enhanced_speed', r.get('speed'))
                    pts.append([int((t - t0).total_seconds()),
                                round(lon * sc, 5) if lon is not None else None, round(lat * sc, 5) if lat is not None else None,
                                round(alt) if alt is not None else None, r.get('heart_rate'),
                                round(spd * 3.6, 1) if spd is not None else None, r.get('cadence'), r.get('temperature'),
                                round(r['distance']) if r.get('distance') is not None else None])
                if not pts:
                    print(f'{lid}: a {kind} file with no track points')
                    continue
                ses = (msgs.get('session_mesgs') or [{}])[0]
                days.append({'date': start[:10], 'type': kind, 'startUtc': t0.isoformat(), 'startLocal': start,
                             'summary': {k: ses.get(k) for k in ('total_elapsed_time', 'total_timer_time', 'total_distance', 'total_ascent', 'total_descent',
                                                                 'avg_heart_rate', 'max_heart_rate', 'total_calories', 'avg_temperature') if ses.get(k) is not None},
                             'fields': ['t', 'lon', 'lat', 'ele', 'hr', 'kmh', 'cad', 'temp', 'dist'], 'points': pts})
                print(f'{lid}: {start[:10]} {kind}, {len(recs)} records kept as {len(pts)} points, heart rate {"yes" if any(p[4] for p in pts) else "no"}')
            if days:
                days.sort(key=lambda d: d['startUtc'])
                json.dump({'id': lid, 'days': days}, open(path, 'w', encoding='utf8'), separators=(',', ':'))
                saved += 1
            else:
                print(f'{lid}: no recording found for {dates[0]}' + (f' to {dates[-1]}' if len(dates) > 1 else ''))
    print(f'Saved {saved} new trips.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
