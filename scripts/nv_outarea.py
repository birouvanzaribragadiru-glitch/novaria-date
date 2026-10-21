import json,glob,unicodedata,re,collections,sys
def norm(s): return unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
JUD=['alba','arad','arges','bacau','bihor','bistrita-nasaud','bistrita nasaud','botosani','braila','brasov','buzau','calarasi','caras-severin','caras severin','cluj','constanta','covasna','dambovita','dolj','galati','giurgiu','gorj','harghita','hunedoara','ialomita','iasi','maramures','mehedinti','mures','neamt','olt','prahova','salaj','satu mare','sibiu','suceava','teleorman','timis','tulcea','valcea','vaslui','vrancea']
def out_of_area(a):
    loc = norm(a.get('adresa') or '')
    if not loc: return False
    parts=[p.strip() for p in loc.split(',') if p.strip()]
    if not parts: return False
    last=parts[-1]
    if last in ('ilfov','bucuresti') or 'sector' in last: return False
    return last in JUD
def bad_ppm(a):
    p,m=a.get('pret'),a.get('mp')
    try: p=float(p); m=float(m)
    except Exception: return False
    if not p or not m: return False
    r=p/m
    return r>12000 or r<100
if __name__=='__main__':
    ads=[]
    for f in glob.glob(sys.argv[1]+'/*.json'):
        d=json.load(open(f)); d=d.get('data',d) if isinstance(d.get('data'),dict) and 'a' in d['data'] else d
        for k,a in (d.get('a') or {}).items(): ads.append((f,k,a))
    oa=[x for x in ads if out_of_area(x[2])]; bp=[x for x in ads if bad_ppm(x[2]) and not out_of_area(x[2])]
    print('total',len(ads),'în afara Buc/Ilfov:',len(oa),'preț aberant:',len(bp))
    print('zone afectate (afara):',collections.Counter(x[2].get('zona') for x in oa).most_common(12))
    print('tip (afara):',collections.Counter(x[2].get('tip') for x in oa))
    print('auto vs manual (afara):',collections.Counter(bool(x[2].get('auto')) for x in oa))
    for x in bp[:8]: print('  aberant:',x[2].get('zona'),x[2].get('tip'),x[2].get('pret'),x[2].get('mp'),(x[2].get('titlu') or '')[:50])
