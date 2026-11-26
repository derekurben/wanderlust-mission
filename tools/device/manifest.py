import os,re,json
out=os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site/photos')
meta=json.load(open(os.path.join(out,'_meta.json')))
def corr(a,b):
    n=len(a);ma=sum(a)/n;mb=sum(b)/n
    num=sum((x-ma)*(y-mb) for x,y in zip(a,b));da=sum((x-ma)**2 for x in a)**.5;db=sum((y-mb)**2 for y in b)**.5
    return num/(da*db) if da and db else 0
# drop a "_01" copy that is visually the same picture at the same size as its parent
drop=[]
for s,m in meta.items():
    base=re.sub(r'-0\d$','',s)
    if base!=s and base in meta and (meta[base]['w'],meta[base]['h'])==(m['w'],m['h']) and corr(meta[base]['sig'],m['sig'])>0.995: drop.append(s)
R=[(2218,2237,'kroenten','Kröntenhütte'),(2196,2217,None,'Other outings, autumn 2026'),(2110,2191,'albertheim','Albert-Heim-Hütte'),(2074,2104,'rugghubel','Rugghubelhütte'),(2003,2073,'glarus','The Grand Glarus Tour'),(1861,1977,None,'Other outings, summer 2026'),(1846,1849,'glarnisch','Glärnischhütte'),(1824,1845,'sewen','Sewenhütte'),(1814,1821,'salbit','Salbithütte'),(1746,1787,'piansecco','Capanna Piansecco'),(1707,1735,'legler','Leglerhütte'),(1661,1687,None,'Other outings, spring 2026'),(1600,1653,'spitzmeilen','Spitzmeilenhütte'),(1559,1579,'voralp','Voralphütte'),(1486,1537,None,'Other outings, autumn 2025'),(1447,1480,'loborn','Lobhornhütte (kind of)')]
groups=[dict(t=t,id=i,items=[]) for _,_,i,t in R]
other=dict(t='More',id=None,items=[])
for s in sorted(meta):
    if s in drop: continue
    m=meta[s]; it=dict(n=s,e=m['ext'],w=m['w'],h=m['h'],mb=round(m['bytes']/2**20,1))
    num=re.match(r'dsc0?(\d{4})',s)
    g=None
    if num:
        n=int(num.group(1)); g=next((gr for (a,b,_,_),gr in zip(R,groups) if a<=n<=b),None)
    elif s.startswith('dji-fly-20260809'): g=groups[4]
    (g or other)['items'].append(it)
groups=[g for g in groups if g['items']]+([other] if other['items'] else [])
js='window.WM_PHOTOS = '+json.dumps(groups,ensure_ascii=False,separators=(',',':'))+';\n'
os.makedirs(os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site/js'),exist_ok=True)
open(os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site/js/photos.js'),'w',encoding='utf8').write(js)
print('dropped near-identical',drop); print([(g['t'],len(g['items'])) for g in groups]); print('photos',sum(len(g['items']) for g in groups),'more:',[i['n'] for i in other['items']])
