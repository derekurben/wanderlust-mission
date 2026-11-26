import os,json,zipfile,time,math
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS=None
t0=time.time()
site=os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site'); cdir=os.path.expanduser('~/wm/orig-c86')
out=os.path.expanduser('~/mnt/Downloads/wanderlust-mission-site-netlify.zip')
s=open(site+'/js/photos.js',encoding='utf8').read(); G=json.loads(s[s.index('['):s.rindex(']')+1])
keep=set()
for g in G:
    for p in g['items']:
        keep.add(p['n']); p['mb']=round(os.path.getsize(f"{cdir}/{p['n']}.jpg")/2**20,1); p['e']='jpg'
js='window.WM_PHOTOS = '+json.dumps(G,ensure_ascii=False,separators=(',',':'))+';\n'
# quality spot check on three photos: PSNR of the compressed copy against the original pixels
import random; random.seed(3)
for n,e in []and random.sample([(p['n'],None) for g in G for p in g['items']],3):
    src=[f for f in os.listdir(site+'/photos/original') if os.path.splitext(f)[0]==n][0]
    a=ImageOps.exif_transpose(Image.open(f"{site}/photos/original/{src}")).convert('RGB'); b=Image.open(f"{cdir}/{n}.jpg").convert('RGB')
    assert a.size==b.size
    box=(a.width//3,a.height//3,a.width//3+1200,a.height//3+1200)
    da=a.crop(box).tobytes(); db=b.crop(box).tobytes()
    mse=sum((x-y)**2 for x,y in zip(da[::7],db[::7]))/len(da[::7])
    print('check',n,a.size,'PSNR %.1f dB'%(10*math.log10(255*255/mse) if mse else 99))
z=zipfile.ZipFile(out+'.part','w',zipfile.ZIP_STORED,allowZip64=True); n=0
for root,dirs,files in os.walk(site):
    rel=os.path.relpath(root,site).replace(os.sep,'/')
    if rel.startswith('photos/original'): continue
    for f in files:
        arc=(rel+'/'+f) if rel!='.' else f
        if arc=='js/photos.js': continue
        if arc=='js/app.js':
            t=open(os.path.join(root,f),encoding='utf8').read()
            assert "'Download original ('" in t and 'downloaded at its original size' in t
            t=t.replace("'Download original ('","'Download full size ('").replace('downloaded at its original size','downloaded at full resolution')
            z.writestr(arc,t); n+=1; continue
        if arc=='index.html':
            t=open(os.path.join(root,f),encoding='utf8').read().replace('>Download original<','>Download full size<'); z.writestr(arc,t); n+=1; continue
        if arc=='README.txt':
            t=open(os.path.join(root,f),encoding='utf8').read()
            t=t.replace('untouched originals behind each Download button (about 1.4 GB in total)','full-resolution JPEG copies behind each Download button (quality 86, about 430 MB in total, largest 8 MB)')
            t=t.split('\nHosting note:')[0]+'\nThe untouched camera originals are not in this copy; they stay in your own photo folder.\n'
            z.writestr(arc,t); n+=1; continue
        if rel in('photos/thumb','photos/large') and os.path.splitext(f)[0] not in keep: continue
        z.write(os.path.join(root,f),arc); n+=1
z.writestr('js/photos.js',js); n+=1
for k in sorted(keep): z.write(f"{cdir}/{k}.jpg",f"photos/original/{k}.jpg"); n+=1
z.close(); os.replace(out+'.part',out)
print('files',n,'zip MB',os.path.getsize(out)//2**20,'secs',round(time.time()-t0))
bad=zipfile.ZipFile(out).testzip(); print('zip test:', 'ok' if bad is None else bad)
