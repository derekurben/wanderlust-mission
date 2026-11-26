import os,sys,time,json
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS=None
T0=time.time(); BUDGET=float(sys.argv[1])
site=os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site'); dst=os.path.expanduser('~/wm/orig-c86'); os.makedirs(dst,exist_ok=True)
s=open(site+'/js/photos.js',encoding='utf8').read(); G=json.loads(s[s.index('['):s.rindex(']')+1])
items=[p for g in G for p in g['items']]; done=0
for p in items:
    o=f"{dst}/{p['n']}.jpg"
    if os.path.exists(o): continue
    if time.time()-T0>BUDGET: break
    srcp=f"{site}/photos/original/{p['n']}.{p['e']}"
    im=Image.open(srcp); exif=im.info.get('exif'); icc=im.info.get('icc_profile')
    im=ImageOps.exif_transpose(im).convert('RGB')
    kw=dict(quality=86,optimize=True,progressive=True,subsampling=2)
    if icc: kw['icc_profile']=icc
    tmp=o+'.tmp'; im.save(tmp,'JPEG',**kw)
    # never make a file bigger: keep the original bytes if it was already a small JPEG
    if p['e']=='jpg' and os.path.getsize(tmp)>=os.path.getsize(srcp):
        os.remove(tmp); 
        with open(srcp,'rb') as a, open(tmp,'wb') as b: b.write(a.read())
    os.replace(tmp,o); done+=1
tot=sum(os.path.getsize(f"{dst}/{p['n']}.jpg") for p in items if os.path.exists(f"{dst}/{p['n']}.jpg"))
n=sum(1 for p in items if os.path.exists(f"{dst}/{p['n']}.jpg"))
print('done now',done,'have',n,'of',len(items),'MB so far',tot//2**20,'secs',round(time.time()-T0))
