#!/usr/bin/env python3
# Novaria — anunțurile de la persoane fizice de pe HomeZZ.ro (București și Ilfov), pentru uz intern
# (Lucian și cele două agente, în aplicația principală). Acordul cu HomeZZ (spus de Lucian, 23.10.2026):
# citire pentru uz intern, fără publicare. De aceea anunțurile HomeZZ NU ajung pe site-ul public (export.js,
# calibrare.js le sar) și nici în copia Parteneri (nv_feed.py le sare).
#
#   python3 -I nv_homezz.py DIR                    descarcă paginile și adaugă anunțurile în DIR/extra.json
#   python3 -I nv_homezz.py DIR --din-fisiere D    citește paginile deja descărcate din D (*.html), fără rețea (test)
#
# Reguli: doar paginile de căutare de mai jos (filtrul „persoană fizică”, cele mai noi întâi), un agent de
# utilizator care spune cine suntem, o pauză de câteva secunde între cereri, cel mult 12 cereri pe rulare
# (5 într-o rulare obișnuită). La orice blocare (cod diferit de 200, pagină de verificare, date lipsă) se
# oprește și nu reîncearcă. Nu se rețin nume, telefoane sau poze; doar ce trebuie pentru comparabile și lead-uri.
import json, os, re, sys, glob, time, html, subprocess, datetime, unicodedata

UA = 'NovariaBot/1.0 (+https://novaria.ro; agentia Novaria, uz intern)'
BAZA = 'https://homezz.ro/vanzare-%s/bucuresti-if?tip_vanzator=persoana_fizica&sort=date_desc'
CAT = [('apartamente', 'apartament'), ('garsoniere', 'apartament'), ('case-vile', 'casa'), ('terenuri', 'teren')]
MAX_CERERI, PAUZA, MAX_ZILE, ALERTA_ZILE, RON_EUR = 12, 5, 90, 2, 5.0
ALTE_JUDETE = r'\b(ialomit[ae]|arges|prahova|giurgiu|calarasi|dambovit[ae]|teleorman|constanta|brasov|buzau|olt|valcea|sibiu|cluj|iasi|timis)\b'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args: print('folosire: nv_homezz.py DIR [--din-fisiere D]'); sys.exit(2)
BASE = os.path.abspath(args[0])
DIN = None
for i, a in enumerate(sys.argv):
    if a == '--din-fisiere' and i + 1 < len(sys.argv): DIN = sys.argv[i + 1]
NOW = datetime.datetime.now(datetime.timezone.utc)

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
    if fv.get('tip_vanzator') != 'persoana_fizica':
        rap['fara_filtru'] += 1; return []
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
             'oras': oras, 'cartier': cartier, 'link': url, 'vanzator': 'persoana',
             'venitLa': venit.strftime('%Y-%m-%dT%H:%M:%SZ')}
        if z is None or z > ALERTA_ZILE: a['faraAlerta'] = True      # intră în comparabile și în „Găsite”, dar nu în „Alerte noi” de azi
        out.append({k: v for k, v in a.items() if v is not None})
    return out

def descarca(url, dest):
    r = subprocess.run(['curl', '-sS', '--compressed', '--max-time', '45', '-A', UA, '-H', 'Accept-Language: ro-RO,ro;q=0.9',
                        '-o', dest, '-w', '%{http_code}', url], capture_output=True, text=True)
    cod = (r.stdout or '').strip()[-3:]
    return cod, (r.stderr or '').strip()[:200]

rap = {k: 0 for k in ('cereri', 'pagini', 'vazute', 'fara_filtru', 'fara_link', 'inchirieri', 'alt_judet', 'incomplete', 'vechi')}
blocat, toate = None, {}
stare = load(os.path.join(BASE, 'prev', 'alerte', 'stare.json'), {}) or {}
if isinstance(stare.get('data'), dict) and 'linkuri' in stare['data']: stare = stare['data']
prima = not any('homezz.ro' in str(l) for l in (stare.get('linkuri') or []))

if DIN:
    for f in sorted(glob.glob(os.path.join(DIN, '*.html'))):
        d = date_pagina(open(f, encoding='utf-8', errors='replace').read())
        if not d: print('fără date:', f); continue
        tp = str((d.get('filterValues') or {}).get('tip_proprietate') or '')
        tip = 'casa' if 'case' in tp else 'teren' if 'teren' in tp else 'apartament'
        rap['pagini'] += 1
        for a in anunturi_din(d, tip, rap): toate[a['link']] = a
else:
    hz = os.path.join(BASE, 'hz'); os.makedirs(hz, exist_ok=True)
    for slug, tip in CAT:
        maxp = 8 if prima else (2 if slug == 'apartamente' else 1)
        p = 1
        while p <= maxp and not blocat:
            if rap['cereri'] >= MAX_CERERI: break
            url = BAZA % slug + ('&page=%d' % p if p > 1 else '')
            dest = os.path.join(hz, '%s-%d.html' % (slug, p))
            if rap['cereri']: time.sleep(PAUZA)
            cod, err = descarca(url, dest); rap['cereri'] += 1
            text = open(dest, encoding='utf-8', errors='replace').read() if os.path.exists(dest) else ''
            if cod != '200':
                blocat = 'cod %s la %s%s' % (cod or '?', slug, (' (' + err + ')') if err else ''); break
            if re.search(r'challenge-platform|cf-chl|Just a moment|captcha', text, re.I) and 'initialData' not in text:
                blocat = 'pagină de verificare la ' + slug; break
            d = date_pagina(text)
            if not d: blocat = 'pagina %s nu mai are datele așteptate (s-a schimbat site-ul?)' % slug; break
            rap['pagini'] += 1
            for a in anunturi_din(d, tip, rap): toate[a['link']] = a
            pg = (d.get('initialData') or {}).get('pagination') or {}
            if p >= int(pg.get('total_pages') or 1): break
            p += 1
        if blocat: break

lista = list(toate.values())
ex_path = os.path.join(BASE, 'extra.json')
ex = load(ex_path, [])
if not isinstance(ex, list): ex = []
ex = [a for a in ex if not (isinstance(a, dict) and a.get('sursa') == 'homezz')] + lista
with open(ex_path, 'w', encoding='utf-8') as f: json.dump(ex, f, ensure_ascii=False)
rez = {'homezz': {'prima_rulare': prima, 'anunturi': len(lista), 'pentru_alerte': sum(1 for a in lista if not a.get('faraAlerta')),
                  'pe_tip': {t: sum(1 for a in lista if a['tip'] == t) for t in ('apartament', 'casa', 'teren')}, 'blocat': blocat, **rap}}
with open(os.path.join(BASE, 'homezz_rezumat.json'), 'w', encoding='utf-8') as f: json.dump(rez, f, ensure_ascii=False)
print(json.dumps(rez, ensure_ascii=False))
if blocat: print('HomeZZ: OPRIT —', blocat, '— nu reîncerca în rularea asta.')
