import os,re,sys,time,json,hashlib,shutil,unicodedata
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS=None
T0=time.time(); BUDGET=float(sys.argv[1]) if len(sys.argv)>1 else 140
src=os.path.expanduser('~/mnt/Edited'); out=os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site/photos')
for d in('thumb','large','original'): os.makedirs(os.path.join(out,d),exist_ok=True)
def slug(f):
    s=unicodedata.normalize('NFKD',os.path.splitext(f)[0]).encode('ascii','ignore').decode()
    return re.sub(r'[^A-Za-z0-9]+','-',s).strip('-').lower()
files=[];seen={}
for f in sorted(os.listdir(src)):
    p=os.path.join(src,f)
    if not os.path.isfile(p) or not f.lower().endswith(('.jpg','.jpeg','.png')): continue
    with open(p,'rb') as fh: key=(os.path.getsize(p),hashlib.md5(fh.read(1<<20)).hexdigest())
    if key in seen: continue
    seen[key]=f; files.append(f)
meta_p=os.path.join(out,'_meta.json'); meta=json.load(open(meta_p)) if os.path.exists(meta_p) else {}
done=0
for f in files:
    s=slug(f); ext=os.path.splitext(f)[1].lower().replace('.jpeg','.jpg')
    o=os.path.join(out,'original',s+ext)
    if s in meta and os.path.exists(o) and os.path.getsize(o)==os.path.getsize(os.path.join(src,f)): continue
    if time.time()-T0>BUDGET: break
    im=ImageOps.exif_transpose(Image.open(os.path.join(src,f))).convert('RGB')
    W,H=im.size
    lg=im.copy(); lg.thumbnail((2400,2400),Image.LANCZOS); lg.save(os.path.join(out,'large',s+'.webp'),'WEBP',quality=84,method=4)
    th=lg.copy(); th.thumbnail((10**5,480),Image.LANCZOS); th.save(os.path.join(out,'thumb',s+'.webp'),'WEBP',quality=76,method=4)
    sig=list(th.convert('L').resize((16,16)).getdata())
    shutil.copyfile(os.path.join(src,f),o)
    meta[s]=dict(file=f,ext=ext[1:],w=W,h=H,bytes=os.path.getsize(o),sig=sig); done+=1
    json.dump(meta,open(meta_p,'w'))
print('files',len(files),'done now',done,'total done',len(meta),'left',len(files)-len(meta),'secs',round(time.time()-T0))
