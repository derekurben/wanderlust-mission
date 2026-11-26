# Collect browser-exported payloads (hash list, images) from tool-result files.
import json, glob, base64, os, re, sys
out='/home/claude/data/raw'
os.makedirs(out,exist_ok=True)
def payload(f):
    d=json.load(open(f)); t=d[0]['text']
    try: s,_=json.JSONDecoder().raw_decode(t)
    except Exception: return None
    return s if isinstance(s,str) else None
got={}
for f in glob.glob('/tmp/claude-tool-results/*/*javascript_tool*.txt'):
    s=payload(f)
    if not s: continue
    if s.startswith('WMHASH'):
        open('/home/claude/data/hashes.txt','w').write(s.rstrip('~'))
    elif s.startswith('WMIMG|'):
        head,rest=s.split('\n',1)
        p=head.split('|')
        if p[2].startswith('ERR'): print('ERR',head); continue
        b64=rest.split('\n',1)[0]
        raw=base64.b64decode(b64)
        assert len(raw)==int(p[4]),(head,len(raw))
        assert raw[:4]==b'RIFF' and raw[8:12]==b'WEBP'
        i=int(p[1]); open(f'{out}/{i:03d}.webp','wb').write(raw); got[i]=(p[2],p[3],len(raw))
print('images',len(got),sorted(got))
