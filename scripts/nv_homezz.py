#!/usr/bin/env python3
# Novaria — anunțurile de pe HomeZZ.ro (București și Ilfov), pentru uz intern (Lucian și cele două agente, în aplicația
# principală). Acordul cu HomeZZ (spus de Lucian, 23.10.2026): citire pentru uz intern, fără publicare. De aceea anunțurile
# HomeZZ NU ajung pe site-ul public (export.js, calibrare.js le sar) și nici în copia Parteneri (nv_feed.py le sare).
#
# Trei treceri la fiecare rulare (de două ori pe zi, din task-ul alertelor):
#   A. proprietarii (persoană fizică): toate paginile, cele mai noi întâi (~10 pagini) → lead-uri + comparabile
#   B. agențiile, cele mai noi: primele pagini din fiecare categorie → comparabile proaspete
#   C. agențiile, „tura”: următoarele pagini dintr-o parcurgere completă ordonată după preț (ordine stabilă), reluată din
#      cursorul salvat în alerte/stare (câmpul „homezz”); o tură completă (~580 de pagini) durează ~7 zile
#
#   python3 -I nv_homezz.py DIR                    descarcă și adaugă anunțurile în DIR/extra.json; cursorul → DIR/homezz_stare.json
#   python3 -I nv_homezz.py DIR --din-fisiere D    citește paginile deja descărcate din D (*.html), fără rețea (test)
#
# Reguli: doar paginile de căutare de mai jos, un agent de utilizator care spune cine suntem, 5 s între cereri, cel mult
# 60 de cereri pe rulare. La orice blocare (cod diferit de 200, pagină de verificare, date lipsă) se oprește tot și nu
# reîncearcă. Nu se rețin nume, telefoane sau poze; doar ce trebuie pentru comparabile și lead-uri.
import json, os, re, sys, glob, time, html, subprocess, datetime, unicodedata

UA = 'NovariaBot/1.0 (+https://novaria.ro; agentia Novaria, uz intern)'
BAZA = 'https://homezz.ro/vanzare-%s/bucuresti-if?tip_vanzator=%s&sort=%s'
CAT = [('apartamente', 'apartament'), ('garsoniere', 'apartament'), ('case-vile', 'casa'), ('terenuri', 'teren')]
NOI_AG = {'apartamente': 3, 'garsoniere': 1, 'case-vile': 1, 'terenuri': 1}      # trecerea B: câte pagini „cele mai noi”
MAX_CERERI, MAX_PROPR, PAUZA, MAX_ZILE, ALERTA_ZILE, RON_EUR = 60, 12, 5, 90, 2, 5.0
MAX_SEC = 480      # cel mult 8 minute pe rulare (pasul din task are timeout de 10 minute); cursorul rămâne unde s-a oprit
if os.environ.get('NV_HZ_MAX', '').isdigit(): MAX_CERERI = min(MAX_CERERI, int(os.environ['NV_HZ_MAX']))   # doar pentru teste (mai puține cereri)
ALTE_JUDETE = r'\b(ialomit[ae]|arges|prahova|giurgiu|calarasi|dambovit[ae]|teleorman|constanta|brasov|buzau|olt|valcea|sibiu|cluj|iasi|timis)\b'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args: print('folosire: nv_homezz.py DIR [--din-fisiere D]'); sys.exit(2)
BASE = os.path.abspath(args[0])
DIN = None
for i, a in enumerate(sys.argv):
    if a == '--din-fisiere' and i + 1 < len(sys.argv): DIN = sys.argv[i + 1]
NOW = datetime.datetime.now(datetime.timezone.utc)
T0 = time.time()
def timp_ok(): return time.time() - T0 < MAX_SEC

def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', s)).strip()

def load(p, dflt=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return dflt

def date_pagina(text):
    """datele paginii (JSON-ul din data-props cu filterValues), sau None"""
    for m in re.finditer(r"data-props='([^']+)'", text or ''):
        v = html.unescape(m.group(1))
        if '"filterValues"' not in v or '"initialData"' not in v: continue
        try: return json.loads(v)
        except Exception: continue
    return None

def vechime_zile(t):
    """„11 ore în urmă”, „1 zi în urmă”, „2 săptămâni în urmă”, „1 lună în urmă”, „1 an în urmă” → zile (aprox.)"""
    t = norm(t)
    if not t: return None
    if re.search(r'acum|secunde|azi|astazi', t) and not re.search(r'\d', t): return 0
    if t.startswith('ieri'): return 1
    m = re.search(r'(\d+)\s*(minut|ora|ore|zi|zile|saptaman|luna|luni|an|ani)', t)
    if not m: return None
    n, u = int(m.group(1)), m.group(2)
    if u == 'minut': return n / 1440
    if u in ('ora', 'ore'): return n / 24
    if u in ('zi', 'zile'): return n
    if u == 'saptaman': return 7 * n
    if u in ('luna', 'luni'): return 30 * n
    return 365 * n

def etaj(v):
    if v is None: return None
    s = norm(v)
    if not s: return None
    if s.startswith('parter'): return 'P'
    if s.startswith('demisol') or s.startswith('subsol'): return 'D'
    if s.startswith('mansard'): return 'M'
    m = re.search(r'-?\d+', s)
    return str(int(m.group(0))) if m else None

def nr(v):
    if v is None: return None
    m = re.search(r'\d[\d.]*(?:,\d+)?', str(v).replace('\xa0', ' ').replace(' ', ''))
    if not m: return None
    s = m.group(0)
    s = s.replace('.', '').replace(',', '.') if ',' in s else (s if s.count('.') == 1 and len(s.split('.')[1]) != 3 else s.replace('.', ''))
    try: return float(s)
    except ValueError: return None

def anunturi_din(d, tip, rap):
    fv = d.get('filterValues') or {}
    tv = fv.get('tip_vanzator')
    if tv not in ('persoana_fizica', 'companie'):
        rap['fara_filtru'] += 1; return []
    vz = 'persoana' if tv == 'persoana_fizica' else 'companie'
    ini = d.get('initialData') or {}
    gtm = {x.get('item_id'): x for x in (ini.get('gtmAds') or []) if isinstance(x, dict)}
    out = []
    for blk in ini.get('ads') or []:           # doar lista paginii; ofertele premium, ansamblurile și bannerele nu respectă filtrul
        if not isinstance(blk, dict) or blk.get('type') != 'ad': continue
        x = blk.get('details') or {}
        rap['vazute'] += 1
        hid, url, titlu = x.get('id'), x.get('url') or '', str(x.get('title') or '').strip()
        if not hid or not re.match(r'^https://homezz\.ro/[a-z0-9-]+-\d{5,}\.html$', url): rap['fara_link'] += 1; continue
        tn = norm(titlu)
        if re.search(r'inchiri|de inchiriat|chirie', tn): rap['inchirieri'] += 1; continue
        if re.search(ALTE_JUDETE, tn): rap['alt_judet'] += 1; continue
        cur = str(x.get('currency') or '').strip().upper()
        p = nr(x.get('price'))
        if p and cur in ('RON', 'LEI'): p = round(p / RON_EUR)
        elif cur not in ('€', 'EUR'): p = None
        at = x.get('attributes') or {}
        mp = nr(at.get('square_meters'))
        if not p or not mp: rap['incomplete'] += 1; continue
        if tip in ('apartament', 'casa') and p < 5000: rap['inchirieri'] += 1; continue   # chirii puse la vânzare
        z = vechime_zile((x.get('meta') or {}).get('listed_at'))
        if z is not None and z > MAX_ZILE: rap['vechi'] += 1; continue
        g = gtm.get(hid) or {}
        oras = str(g.get('item_category3') or (x.get('location') or {}).get('city') or '').strip() or None
        cartier = g.get('item_category4')
        cartier = str(cartier).strip() if cartier and str(cartier).strip().lower() not in ('none', 'null') else None
        cam = nr(at.get('total_rooms'))
        if cam is None and re.search(r'garsonier', tn): cam = 1
        et_tot = nr(at.get('total_floors'))
        venit = NOW - datetime.timedelta(days=z if z is not None else 30)
        a = {'sursa': 'homezz', 'tip': tip, 'titlu': titlu[:80], 'pret': int(p), 'mp': mp, 'camere': int(cam) if cam else None,
             'etaj': etaj(at.get('floor')) if tip == 'apartament' else None, 'etajeTotal': int(et_tot) if et_tot else None,
             'teren': mp if tip == 'teren' else None, 'loc': ', '.join([s for s in (cartier, oras) if s]) or None,
             'oras': oras, 'cartier': cartier, 'link': url, 'vanzator': vz,
             'venitLa': venit.strftime('%Y-%m-%dT%H:%M:%SZ')}
        if vz != 'persoana' or z is None or z > ALERTA_ZILE: a['faraAlerta'] = True   # în comparabile (și la proprietari în „Găsite”), nu în alertele de azi
        out.append({k: v for k, v in a.items() if v is not None})
    return out

def descarca(url, dest):
    r = subprocess.run(['curl', '-sS', '--compressed', '--max-time', '45', '-A', UA, '-H', 'Accept-Language: ro-RO,ro;q=0.9',
                        '-o', dest, '-w', '%{http_code}', url], capture_output=True, text=True)
    cod = (r.stdout or '').strip()[-3:]
    return cod, (r.stderr or '').strip()[:200]

rap = {k: 0 for k in ('cereri', 'pagini', 'vazute', 'fara_filtru', 'fara_link', 'inchirieri', 'alt_judet', 'incomplete', 'vechi')}
treceri = {'proprietari': 0, 'agentii_noi': 0, 'agentii_tura': 0}
blocat, toate = None, {}
stare = load(os.path.join(BASE, 'prev', 'alerte', 'stare.json'), {}) or {}
if isinstance(stare.get('data'), dict) and 'procesate' in stare['data']: stare = stare['data']
hzs = stare.get('homezz') if isinstance(stare.get('homezz'), dict) else {}
cur = hzs.get('cursor') if isinstance(hzs.get('cursor'), dict) else {}
ci = cur.get('cat', 0) if isinstance(cur.get('cat'), int) and 0 <= cur.get('cat', 0) < len(CAT) else 0
cp = cur.get('pagina', 2) if isinstance(cur.get('pagina'), int) and cur.get('pagina', 2) >= 2 else 2   # prima pagină sortată după preț trimite la prima pagină a site-ului (302); o acoperă trecerea B
totaluri = dict(hzs.get('totaluri') or {})
ture = int(hzs.get('ture') or 0)

def adauga(lst, trecere):
    for a in lst:
        if a['link'] not in toate: toate[a['link']] = a; treceri[trecere] += 1

def pagina(slug, tip, vz, sort, p):
    """descarcă și citește o pagină; întoarce (anunțuri, total_pagini) sau None la blocare (și setează `blocat`)"""
    global blocat
    url = BAZA % (slug, vz, sort) + ('&page=%d' % p if p > 1 else '')
    dest = os.path.join(BASE, 'hz', '%s-%s-%s-%d.html' % (slug, vz[:4], sort[:5], p))
    if rap['cereri']: time.sleep(PAUZA)
    cod, err = descarca(url, dest); rap['cereri'] += 1
    text = open(dest, encoding='utf-8', errors='replace').read() if os.path.exists(dest) else ''
    try: os.remove(dest)                         # nu păstrăm paginile descărcate
    except OSError: pass
    if cod != '200':
        blocat = 'cod %s la %s%s' % (cod or '?', slug, (' (' + err + ')') if err else ''); return None
    if re.search(r'challenge-platform|cf-chl|Just a moment|captcha', text, re.I) and 'initialData' not in text:
        blocat = 'pagină de verificare la ' + slug; return None
    d = date_pagina(text)
    if not d: blocat = 'pagina %s nu mai are datele așteptate (s-a schimbat site-ul?)' % slug; return None
    rap['pagini'] += 1
    pg = (d.get('initialData') or {}).get('pagination') or {}
    return anunturi_din(d, tip, rap), int(pg.get('total_pages') or 1)

if DIN:
    for f in sorted(glob.glob(os.path.join(DIN, '*.html'))):
        d = date_pagina(open(f, encoding='utf-8', errors='replace').read())
        if not d: print('fără date:', f); continue
        tp = str((d.get('filterValues') or {}).get('tip_proprietate') or '')
        tip = 'casa' if 'case' in tp else 'teren' if 'teren' in tp else 'apartament'
        rap['pagini'] += 1
        lst = anunturi_din(d, tip, rap)
        adauga(lst, 'proprietari' if lst and lst[0]['vanzator'] == 'persoana' else 'agentii_noi')
else:
    os.makedirs(os.path.join(BASE, 'hz'), exist_ok=True)
    # A. proprietarii: toate paginile
    for slug, tip in CAT:
        p = 1
        while not blocat and rap['cereri'] < MAX_PROPR:
            r = pagina(slug, tip, 'persoana_fizica', 'date_desc', p)
            if not r: break
            adauga(r[0], 'proprietari')
            if p >= r[1]: break
            p += 1
        if blocat: break
    # B. agențiile, cele mai noi
    for slug, tip in CAT:
        if blocat: break
        for p in range(1, NOI_AG[slug] + 1):
            if rap['cereri'] >= MAX_CERERI or not timp_ok(): break
            r = pagina(slug, tip, 'companie', 'date_desc', p)
            if not r: break
            adauga(r[0], 'agentii_noi'); totaluri[slug] = r[1]
            if p >= r[1]: break
    # C. agențiile, tura completă după preț, de unde a rămas rularea trecută
    sarite = 0
    while not blocat and rap['cereri'] < MAX_CERERI and timp_ok() and sarite < len(CAT):
        slug, tip = CAT[ci]
        if int(totaluri.get(slug) or 99) < cp:          # categorie cu o singură pagină (sau tura ei s-a terminat): o acoperă trecerea B
            ci, cp = ci + 1, 2; sarite += 1
            if ci >= len(CAT): ci, ture = 0, ture + 1
            continue
        sarite = 0
        r = pagina(slug, tip, 'companie', 'price_asc', cp)
        if not r: break
        adauga(r[0], 'agentii_tura'); totaluri[slug] = r[1]
        cp += 1
        if cp > r[1]:
            ci, cp = ci + 1, 2
            if ci >= len(CAT): ci, ture = 0, ture + 1

lista = list(toate.values())
ex_path = os.path.join(BASE, 'extra.json')
ex = load(ex_path, [])
if not isinstance(ex, list): ex = []
ex = [a for a in ex if not (isinstance(a, dict) and a.get('sursa') == 'homezz')] + lista
with open(ex_path, 'w', encoding='utf-8') as f: json.dump(ex, f, ensure_ascii=False)
if not DIN:
    hzs = {'cursor': {'cat': ci, 'pagina': cp}, 'totaluri': totaluri, 'ture': ture, 'ultima': NOW.strftime('%Y-%m-%dT%H:%M:%SZ')}
    if blocat: hzs['blocat'] = blocat[:160]
    with open(os.path.join(BASE, 'homezz_stare.json'), 'w', encoding='utf-8') as f: json.dump(hzs, f, ensure_ascii=False)
tot_pag = sum(int(v) for v in totaluri.values()) if totaluri else None
rez = {'homezz': {'anunturi': len(lista), 'proprietari': sum(1 for a in lista if a['vanzator'] == 'persoana'),
                  'agentii': sum(1 for a in lista if a['vanzator'] == 'companie'),
                  'pentru_alerte': sum(1 for a in lista if not a.get('faraAlerta')), 'treceri': treceri,
                  'tura': {'categorie': CAT[ci][0], 'pagina': cp, 'din': totaluri.get(CAT[ci][0]), 'ture_complete': ture, 'pagini_agentii': tot_pag},
                  'secunde': round(time.time() - T0), 'pe_tip': {t: sum(1 for a in lista if a['tip'] == t) for t in ('apartament', 'casa', 'teren')}, 'blocat': blocat, **rap}}
with open(os.path.join(BASE, 'homezz_rezumat.json'), 'w', encoding='utf-8') as f: json.dump(rez, f, ensure_ascii=False)
print(json.dumps(rez, ensure_ascii=False))
if blocat: print('HomeZZ: OPRIT —', blocat, '— nu reîncerca în rularea asta.')
