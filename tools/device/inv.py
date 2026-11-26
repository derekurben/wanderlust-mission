import os,hashlib,json
src=os.path.expanduser('~/mnt/Edited'); rows=[];seen={}
for f in sorted(os.listdir(src)):
    p=os.path.join(src,f)
    if not os.path.isfile(p) or not f.lower().endswith(('.jpg','.jpeg','.png')): continue
    h=hashlib.md5()
    with open(p,'rb') as fh:
        h.update(fh.read(1<<20)); 
    key=(os.path.getsize(p),h.hexdigest())
    if key in seen: rows.append((f,'DUP of '+seen[key])); continue
    seen[key]=f; rows.append((f,os.path.getsize(p)))
u=[r for r in rows if isinstance(r[1],int)]
print('unique',len(u),'total MB',sum(r[1] for r in u)//2**20,'png',sum(1 for r in u if r[0].lower().endswith('.png')),'png MB',sum(r[1] for r in u if r[0].lower().endswith('.png'))//2**20,'>25MB',sum(1 for r in u if r[1]>25*2**20))
print('dups',[r for r in rows if not isinstance(r[1],int)])
print('variants',[r[0] for r in u if '_0' in r[0]])
