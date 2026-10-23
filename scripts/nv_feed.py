#!/usr/bin/env python3
# Novaria — alimentarea copiei „Parteneri” cu datele de piață din aplicația principală, într-o singură direcție
# (principal → parteneri), FĂRĂ zonele rezervate (sectoarele 5 și 6, Bragadiru, Domnești, Măgurele), fără datele
# interne (dosare, proprietari, cumpărători, vânzări, evaluările de pe site, chei, sertarele agenților) și fără
# anunțurile HomeZZ (acordul cu HomeZZ e doar pentru uz intern: Lucian și agentele lui).
#
#   python3 -I nv_feed.py <dir-sursa> <dir-destinatie> <dir-iesire> [--versiuni versions.txt] [--zone-rezervate a,b,c] [--sectoare 5,6]
#
# <dir-sursa>: colecțiile aplicației principale, așa cum le scrie ArtifactData cu out_dir (<colecție>/<doc>.json)
# <dir-destinatie>: colecțiile copiei Parteneri, la fel (pentru a ști ce documente există deja); poate fi gol
# --versiuni: fișier cu versiunile documentelor din copie (culese din transcript cu nv_versiuni.py); fără el, scrierile
#             peste documente existente ar fi refuzate de bază
# Scrie <dir-iesire>/writes.json: loturi de cel mult 50 de scrieri „set” (collection, doc_id, file_path, if_version)
import json, os, sys, glob, re

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if len(args) < 3:
    print('folosire: nv_feed.py <dir-sursa> <dir-destinatie> <dir-iesire> [--versiuni F] [--zone-rezervate a,b] [--sectoare 5,6]'); sys.exit(2)
SRC, DST, OUT = [os.path.abspath(a) for a in args[:3]]
opt = {}
for i, a in enumerate(sys.argv):
    for k in ('--versiuni', '--zone-rezervate', '--sectoare', '--zones'):
        if a == k and i + 1 < len(sys.argv): opt[k] = sys.argv[i + 1]
        m = re.match(k + '=(.+)', a)
        if m: opt[k] = m.group(1)
REZ = set(x.strip() for x in (opt.get('--zone-rezervate') or 'bragadiru,domnesti,magurele').split(',') if x.strip())
SECT = set(x.strip() for x in (opt.get('--sectoare') or '5,6').split(',') if x.strip())

# zonele din sectoarele rezervate, din lib/zones.json (lângă script, în depozit) sau din fișierul dat cu --zones
zones_path = opt.get('--zones') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib', 'zones.json')
try:
    Z = json.load(open(zones_path, encoding='utf-8'))
    for z in Z.get('zone', []):
        m = re.search(r'Sector\s*(\d)', z.get('grup', '') or '')
        if m and m.group(1) in SECT: REZ.add(z['id'])
except Exception as e:
    print('ATENȚIE: nu pot citi zonele din', zones_path, e, '— exclud doar zonele date explicit')

def load(p):
    try:
        with open(p, encoding='utf-8') as f: d = json.load(f)
    except Exception: return None
    if isinstance(d, dict) and isinstance(d.get('data'), dict) and len(d) <= 3: d = d['data']
    return d

def docs_of(base, coll):
    out = {}
    for f in sorted(glob.glob(os.path.join(base, coll, '*.json'))):
        d = load(f)
        if isinstance(d, dict): out[os.path.basename(f)[:-5]] = d
    return out

def zona_ok(z): return not z or z not in REZ
def key_ok(k): return zona_ok(k.split('__', 1)[0]) if '__' in k else True

# versiunile din copie (din transcript) — formatul scris de nv_versiuni.py: „- "doc"  0 bytes  version N”
VERS = {}
if opt.get('--versiuni') and os.path.exists(opt['--versiuni']):
    coll = None
    for ln in open(opt['--versiuni'], encoding='utf-8'):
        mc = re.search(r'from collection "([^"]+)"', ln)
        if mc: coll = mc.group(1)
        mv = re.search(r'^\s*-\s*"([^"]+)"\s+\d+\s+bytes\s+version\s+(\d+)', ln)
        if mv and coll: VERS[coll + '/' + mv.group(1)] = int(mv.group(2))
        mw = re.search(r'^\s*-\s*(?:update|set|str_replace)\s+"([^"]+)"/"([^"]+)"\s+\(version\s+(\d+)\)', ln)
        if mw: VERS[mw.group(1) + '/' + mw.group(2)] = int(mw.group(3))

exists = set()
for coll in ('piata', 'istoric', 'portaluri', 'chirii', 'agentii', 'capturi', 'alerte', 'rapoarte', 'referinte', 'calib', 'setari'):
    for f in glob.glob(os.path.join(DST, coll, '*.json')): exists.add(coll + '/' + os.path.basename(f)[:-5])

os.makedirs(OUT, exist_ok=True)
writes, stats, lipsa_versiune, neschimbate = [], {}, [], 0
DSTDOC = {}
for coll in ('piata', 'istoric', 'portaluri', 'chirii', 'agentii', 'capturi', 'alerte', 'rapoarte', 'referinte', 'calib', 'setari'):
    for k, d in docs_of(DST, coll).items(): DSTDOC[coll + '/' + k] = d
def same(a, b):
    try: return json.dumps(a, sort_keys=True, ensure_ascii=False) == json.dumps(b, sort_keys=True, ensure_ascii=False)
    except Exception: return False
def emit(coll, doc_id, doc):
    global neschimbate
    if same(DSTDOC.get(coll + '/' + doc_id), doc): neschimbate += 1; return   # identic cu ce e deja în copie: nu rescriem
    d = os.path.join(OUT, coll); os.makedirs(d, exist_ok=True)
    fp = os.path.join(d, doc_id + '.json')
    with open(fp, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False)
    w = {'op': 'set', 'collection': coll, 'doc_id': doc_id, 'file_path': fp}
    k = coll + '/' + doc_id
    if k in exists or k in VERS:
        if k in VERS: w['if_version'] = VERS[k]
        else: lipsa_versiune.append(k)
    writes.append(w); stats[coll] = stats.get(coll, 0) + 1

# anunțurile HomeZZ sunt doar pentru uz intern (acordul cu HomeZZ): nu intră niciodată în copia Parteneri
def e_hz(x): return isinstance(x, dict) and (x.get('sursa') == 'homezz' or 'homezz.ro' in str(x.get('link') or ''))
def fara_hz(lst): return [x for x in lst if not e_hz(x)]
hz_sarite = 0

# 1. colecțiile pe zonă/tip: documentul intră întreg sau deloc (portaluri și chirii: fără anunțurile HomeZZ)
for coll in ('piata', 'istoric', 'portaluri', 'chirii', 'agentii'):
    for k, d in docs_of(SRC, coll).items():
        if not key_ok(k) or not zona_ok(d.get('zona')): continue
        if isinstance(d.get('anunturi'), list):
            l2 = fara_hz(d['anunturi']); hz_sarite += len(d['anunturi']) - len(l2); d = dict(d); d['anunturi'] = l2
        emit(coll, k, d)
# 2. capturile: pachetele intră, dar fără anunțurile din zonele rezervate și fără capturile manuale cu dosar/notă
cap_tot = cap_ok = 0
for k, d in docs_of(SRC, 'capturi').items():
    a = d.get('a') if isinstance(d.get('a'), dict) else {}
    a2 = {}
    for aid, ad in a.items():
        cap_tot += 1
        if not isinstance(ad, dict) or not zona_ok(ad.get('zona')): continue
        if e_hz(ad): hz_sarite += 1; continue
        cap_ok += 1
        ad = dict(ad); ad.pop('dosar', None); ad.pop('nota', None); ad.pop('captura', None)
        a2[aid] = ad
    emit('capturi', k, {'v': d.get('v', 1), 'g': d.get('g', 0), 'a': a2})
# 3. alertele zilnice (proprietari noi): fără zonele rezervate; „stare” (jurnalul task-ului) nu se copiază
for k, d in docs_of(SRC, 'alerte').items():
    if k == 'stare': continue
    d2 = dict(d)
    for fld in ('anunturi', 'proprietari', 'noi'):
        if isinstance(d2.get(fld), list): d2[fld] = [x for x in fara_hz(d2[fld]) if not isinstance(x, dict) or zona_ok(x.get('zona'))]
    emit('alerte', k, d2)
# 4. rapoartele zilnice: listele filtrate
for k, d in docs_of(SRC, 'rapoarte').items():
    d2 = dict(d)
    for fld in ('zone', 'oportunitati', 'leaduri'):
        if isinstance(d2.get(fld), list): d2[fld] = [x for x in fara_hz(d2[fld]) if not isinstance(x, dict) or (zona_ok(x.get('zona')) and key_ok(x.get('key', '')))]
    emit('rapoarte', k, d2)
# 5. referințele imo360: fără zonele rezervate
for k, d in docs_of(SRC, 'referinte').items():
    d2 = dict(d)
    if isinstance(d2.get('zone'), dict): d2['zone'] = {z: v for z, v in d2['zone'].items() if zona_ok(z)}
    emit('referinte', k, d2)
# 6. calibrarea și setările comune (fără chei)
for k, d in docs_of(SRC, 'calib').items(): emit('calib', k, d)
for k, d in docs_of(SRC, 'setari').items():
    if k != 'general': continue
    d2 = {kk: v for kk, v in d.items() if kk not in ('siteKey', 'siteUrl', 'backupKey')}
    if isinstance(d2.get('overrides'), dict): d2['overrides'] = {z: v for z, v in d2['overrides'].items() if zona_ok(z)}
    emit('setari', k, d2)

# loturi de cel mult 50 de scrieri ȘI cel mult ~850 KB (limita bazei e 1 MiB pe cerere; documentele piata sunt mari)
MAX_B, MAX_N = 850 * 1024, 50
batches, cur, cur_b = [], [], 0
for w in writes:
    b = os.path.getsize(w['file_path']) + 200
    if cur and (len(cur) >= MAX_N or cur_b + b > MAX_B): batches.append(cur); cur, cur_b = [], 0
    cur.append(w); cur_b += b
if cur: batches.append(cur)
with open(os.path.join(OUT, 'writes.json'), 'w', encoding='utf-8') as f: json.dump(batches, f, ensure_ascii=False, indent=1)
print('Zone rezervate (excluse):', len(REZ), sorted(REZ))
print('Documente de scris:', len(writes), 'în', len(batches), 'loturi ->', os.path.join(OUT, 'writes.json'))
print('Pe colecții:', json.dumps(stats, ensure_ascii=False), '· neschimbate (sărite):', neschimbate)
print('Capturi: anunțuri păstrate', cap_ok, 'din', cap_tot, '· HomeZZ sărite (uz intern):', hz_sarite)
if lipsa_versiune:
    print('ATENȚIE: lipsește versiunea pentru', len(lipsa_versiune), 'documente existente în copie (scrierile lor vor fi refuzate):', lipsa_versiune[:8])
