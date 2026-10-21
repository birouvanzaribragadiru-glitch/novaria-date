#!/usr/bin/env python3
# Novaria — curățarea capturilor (idempotentă): anunțuri din alte județe, prețuri/suprafețe aberante, teren din titlu,
# suprafața construită luată greșit din teren. Folosire: python3 -I scripts/fix_capturi.py <dir-dump> <versions.txt>
# <dir-dump>/capturi = colecția capturi (ArtifactData list cu out_dir); scrie <dir-dump>/fix/writes.json (loturi „set” cu if_version).
# Curățarea capturilor (idempotentă): alte județe, prețuri aberante, teren din titlu, suprafața = terenul la case
import json,glob,os,re,sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nv_outarea import out_of_area
SRC=sys.argv[1]+'/capturi'; OUT=sys.argv[1]+'/fix'; VERS=sys.argv[2]; os.makedirs(OUT,exist_ok=True)
vers={}
for ln in open(VERS,encoding='utf-8'):
    m=re.search(r'^\s*-\s*"(s\d{3})"\s+\d+\s+bytes\s+version\s+(\d+)',ln)
    if m: vers[m.group(1)]=int(m.group(2))
TER=re.compile(r'teren(?:\s+de)?\s*:?\s*(\d{1,2}[.\s]?\d{3}|\d{2,4})\s*(?:mp|m2|m²|m\b)',re.I)
TER2=re.compile(r'(\d{1,2}[.\s]?\d{3}|\d{2,4})\s*(?:mp|m2|m²)\s*(?:de\s+)?(?:teren|curte)',re.I)
def num(v):
    try: return float(v)
    except Exception: return None
def bad_ppm(a):
    p,m=num(a.get('pret')),num(a.get('mp'))
    if not p or not m: return False
    r=p/m; return (r>3000 or r<3) if a.get('tip')=='teren' else (r>12000 or r<150)
writes=[]; st={'afara':0,'pret':0,'teren':0,'mp_teren':0}
for f in sorted(glob.glob(SRC+'/*.json')):
    sid=os.path.basename(f)[:-5]
    d=json.load(open(f)); d=d.get('data',d) if isinstance(d.get('data'),dict) and 'a' in d['data'] else d
    ch=False
    for k,x in (d.get('a') or {}).items():
        if not isinstance(x,dict) or x.get('exclus'): continue
        if out_of_area(x): x['zonaInitiala']=x.get('zona') or ''; x['zona']=''; x['exclus']='în afara Bucureștiului și Ilfovului'; st['afara']+=1; ch=True; continue
        mt=TER.search(x.get('titlu') or ''); tv=int(re.sub(r'[.\s]','',mt.group(1))) if mt else None
        if tv is not None and not (50<=tv<=20000): tv=None
        m=num(x.get('mp'))
        mt2=TER2.search(x.get('titlu') or ''); tv2=int(re.sub(r'[.\s]','',mt2.group(1))) if mt2 else None
        if tv is None and tv2 and 50<=tv2<=20000: tv=tv2
        p_=num(x.get('pret')); low=(x.get('tip')=='casa' and m and m>=350 and p_ and p_/m<500)
        if x.get('tip')=='casa' and m and ((m>=150 and tv and abs(tv-m)<=2) or low):
            if low and not tv: tv=int(m)
            # suprafața citită din titlu era terenul: construita nu se știe → nu mai intră în calculul pe mp
            x['mpInitial']=x['mp']; del x['mp']; x['teren']=tv; x['mpCorectat']='suprafața din titlu era terenul'; st['mp_teren']+=1; ch=True; continue
        if bad_ppm(x): x['zonaInitiala']=x.get('zona') or ''; x['zona']=''; x['exclus']='preț sau suprafață greșit citite'; st['pret']+=1; ch=True; continue
        if x.get('tip')=='casa' and not x.get('teren') and tv: x['teren']=tv; x['terenDin']='titlu'; st['teren']+=1; ch=True
    if ch:
        if sid not in vers: print('LIPSĂ versiune',sid); continue
        fp=os.path.abspath(os.path.join(OUT,sid+'.json')); json.dump(d,open(fp,'w',encoding='utf-8'),ensure_ascii=False)
        writes.append({'op':'set','collection':'capturi','doc_id':sid,'file_path':fp,'if_version':vers[sid]})
B=[];cur=[];cb=0
for w in writes:
    b=os.path.getsize(w['file_path'])+200
    if cur and (len(cur)>=50 or cb+b>850*1024): B.append(cur);cur=[];cb=0
    cur.append(w);cb+=b
if cur:B.append(cur)
json.dump(B,open(OUT+'/writes.json','w'))
print(st,'pachete de rescris:',len(writes),'loturi:',len(B),[len(x) for x in B])
