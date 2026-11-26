import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys, json, glob
A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
def ck(s):
    h=0
    for c in s: h=(h*31+ord(c))%1000003
    return h
def dec(s):
    out=[];v=0;sh=0
    for c in s:
        b=A.index(c)
        v|=(b&0x1f)<<sh; sh+=5
        if b<0x20:
            out.append(~(v>>1) if v&1 else v>>1); v=0; sh=0
    return out
tracks={};bad=0
for fn in sorted(glob.glob(ROOT + '/source/tracks*.txt')):
    for line in open(fn,encoding='utf8'):
        line=line.rstrip('\n')
        if not line: continue
        p=line.split('|')
        name=p[0]; ll,el,tm=p[15],p[16],p[17]
        for lab,s,c in (('ll',ll,p[12]),('el',el,p[13]),('tm',tm,p[14])):
            L,H=c.split(':')
            if len(s)!=int(L) or (s and ck(s)!=int(H)):
                print('BAD',name,lab,len(s),L,ck(s),H); bad+=1
        d=dec(ll); pts=[];la=lo=0
        for i in range(0,len(d),2):
            la+=d[i]; lo+=d[i+1]; pts.append([lo/1e5,la/1e5])
        e=0
        for i,x in enumerate(dec(el)): e+=x; pts[i].append(e)
        if tm:
            t=int(p[8])
            for i,x in enumerate(dec(tm)): t+=x; pts[i].append(t)
        assert len(pts)==int(p[1]),(name,len(pts),p[1])
        hi=[float(x) for x in p[7].split(',')]
        tracks[name]=dict(km=float(p[2]),gain=int(p[3]),loss=int(p[4]),max=int(p[5]),min=int(p[6]),hi=hi,t0=int(p[8]),t1=int(p[9]),mov=int(p[10]),eleSrc=p[11],pts=pts)
print(len(tracks),'tracks, bad =',bad)
json.dump(tracks,open(ROOT + '/source/tracks.json','w'))
