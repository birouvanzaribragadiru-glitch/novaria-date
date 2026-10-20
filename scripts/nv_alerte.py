#!/usr/bin/env python3
# Novaria — citește alertele de pe portaluri (e-mailurile de la Storia și Imobiliare.ro, salvate ca JSON din Gmail)
# și le transformă în anunțuri pentru aplicația Novaria Evaluator.
#
#   python3 nv_alerte.py DIR                 -> procesează DIR/mail/*.json și scrie DIR/out/
#   python3 nv_alerte.py DIR --doar-numara   -> doar numără ce ar extrage (fără stare, fără scrieri)
#
# DIR/mail/*.json      rezultatele brute ale tool-ului Gmail get_thread / get_message (FULL_CONTENT), oricâte fișiere
# DIR/prev/capturi/    documentele existente „capturi/sNNN” (descărcate cu ArtifactData list, out_dir), opțional
# DIR/prev/alerte/     „stare.json” și „<azi>.json”, opțional
# DIR/prev/portaluri/  documentele „<zona>__<tip>.json”, opțional
# DIR/versions.txt     textul listărilor ArtifactData (liniile cu  "doc_id"  N bytes  version V), ca să pinuim scrierile
# DIR/zones.json       lib/zones.json din novaria-date (lista zonelor cu aliasuri)
# DIR/extra.json       opțional: listă de anunțuri extrase altfel (ex. Publi24): {sursa, tip, titlu, pret, mp, camere, etaj, loc sau zona, link, vanzator, venitLa (ISO sau ms)}
#
# Ce scrie în DIR/out/: capturi/sNNN.json (update: doar anunțurile noi/schimbate), portaluri/<zona>__<tip>.json (set),
# alerte/<azi>.json (set), alerte/stare.json (set) și writes.json (loturi de cel mult 50 de scrieri pentru ArtifactData batch).
#
# Reguli: nu se rețin nume de vânzători, telefoane sau linkuri de auto-login; linkurile Imobiliare se decodează
# până la adresa anunțului; cele de la Storia rămân linkurile din e-mail. Anunțurile intră în „capturi” (cu auto: true),
# deci apar în comparabile și în statistici exact ca cele copiate de mână, dar nu ating niciodată capturile manuale.
import json, os, sys, re, glob, html, base64, datetime, hashlib, unicodedata
from urllib.parse import urlparse, parse_qs, unquote

args = [a for a in sys.argv[1:] if not a.startswith('--')]
BASE = os.path.abspath(args[0] if args else '.')
COUNT_ONLY = '--doar-numara' in sys.argv
def utcnow(): return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
TODAY = os.environ.get('NV_TODAY') or (utcnow() + datetime.timedelta(hours=3)).strftime('%Y-%m-%d')
NOW_MS = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
CAP_N, CAP_GROUPS = 128, 32
RET_CAPTURI_ZILE = 120      # anunțurile automate mai vechi de atât se scot din capturi (cele manuale nu se ating)
RET_PORTAL_ZILE, PORTAL_MAX = 45, 40
ALERTE_MAX, STARE_MAX = 300, 6000

def load(p, d=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d

def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', s)).strip()

def num(s):
    if s is None: return None
    t = str(s).replace('\xa0', ' ')
    m = re.search(r'\d[\d .]*(?:,\d+)?', t)
    if not m: return None
    v = m.group(0).replace(' ', '')
    if ',' in v: v = v.replace('.', '').replace(',', '.')
    elif v.count('.') == 1 and len(v.split('.')[1]) != 3: pass      # 79.30 (zecimale cu punct)
    else: v = v.replace('.', '')
    try: return float(v)
    except ValueError: return None

def fnv_shard(s):
    h = 2166136261
    for ch in str(s):
        h ^= ord(ch); h = (h * 16777619) & 0xFFFFFFFF
    return 's%03d' % (h % CAP_N)

# ---------- zone ----------
Z = load(os.path.join(BASE, 'zones.json')) or {}
ZONES = Z.get('zone', [])
ZID = {z['id']: z for z in ZONES}
EXTRA = {   # nume de pe portaluri -> zona din aplicație (completează aliasurile din zones.json)
    'uranus': '13-septembrie', 'progresul': 'giurgiului', 'imgb': 'metalurgiei', 'valea cascadelor': 'iuliu-maniu',
    'leu': 'politehnica', 'preciziei': 'pacii', 'margeanului': 'sebastian', 'piata sudului': 'oltenitei',
    'sudului': 'oltenitei', 'chitila': 'bucurestii-noi', 'jiului': 'bucurestii-noi', 'laminorului': 'bucurestii-noi',
    'titulescu': 'victoriei', 'banu manta': '1-mai', 'turda': '1-mai', 'expozitiei': '1-mai', 'ion mihalache': '1-mai',
    'iancu nicolae': 'pipera', 'polona': 'dorobanti', 'beller': 'dorobanti', 'televiziune': 'dorobanti', 'alexandru obregia': 'berceni', 'obregia': 'berceni', 'dudesti': 'vitan', 'basarabia': 'muncii', 'diham': 'muncii', 'bucur obor': 'obor', 'cutitul de argint': 'tineretului', 'fizicienilor': 'nicolae-grigorescu', 'salaj': 'ferentari', 'splaiul independentei': 'cotroceni', 'drumul sarii': 'drumul-taberei', 'odaile': 'otopeni', 'camil ressu': 'titan', 'liviu rebreanu': 'titan', 'chisinau': 'muncii', 'arena nationala': 'muncii', 'morarilor': 'pantelimon', 'delfinului': 'pantelimon', 'vergului': 'pantelimon', 'mega mall': 'pantelimon', 'bd timisoara': 'drumul-taberei', 'timisoara': 'drumul-taberei', 'brasov': 'drumul-taberei', 'valea ialomitei': 'drumul-taberei', 'ghencea': 'ghencea', 'raul doamnei': 'drumul-taberei', 'plaza romania': 'lujerului', 'cora lujerului': 'lujerului', 'apaca': 'lujerului', 'afi cotroceni': 'politehnica', 'vasile milea': 'politehnica', 'regie': 'grozavesti', 'orhideea': 'grozavesti', 'eroilor': 'cotroceni', 'izvor': 'cismigiu', 'sala palatului': 'cismigiu', 'stirbei voda': 'cismigiu', 'plevnei': 'cismigiu', 'popa tatu': 'cismigiu', 'calea victoriei': 'victoriei', 'lascar catargiu': 'victoriei', 'aviatorilor': 'aviatorilor', 'charles de gaulle': 'aviatorilor', 'herastrau': 'herastrau', 'nordului': 'herastrau', 'sisesti': 'straulesti', 'bucurestii noi': 'bucurestii-noi', 'pod constanta': 'bucurestii-noi', 'grivitei': 'grivita', 'dinicu golescu': 'grivita', 'titulescu': 'victoriei', 'ion mihalache': '1-mai', 'domenii': 'domenii', 'clabucet': 'domenii', 'piata presei': 'domenii', 'casa presei': 'damaroaia', 'petrom city': 'damaroaia', 'pipera': 'pipera', 'dimitrie pompeiu': 'pipera', 'fabrica de glucoza': 'pipera', 'promenada': 'aviatiei', 'aurel vlaicu': 'aviatiei', 'nicolae caramfil': 'aviatiei', 'pescariu': 'floreasca', 'garibaldi': 'floreasca', 'floreasca': 'floreasca', 'lacul tei': 'tei', 'barbu vacarescu': 'barbu-vacarescu', 'stefan cel mare': 'stefan-cel-mare', 'dinamo': 'stefan-cel-mare', 'circului': 'stefan-cel-mare', 'mosilor': 'mosilor', 'eminescu': 'mosilor', 'dacia': 'dacia', 'icoanei': 'dacia', 'gradina icoanei': 'dacia', 'armeneasca': 'dacia', 'obor': 'obor', 'ferdinand': 'obor', 'pache protopopescu': 'iancului', 'vatra luminoasa': 'iancului', 'iancului': 'iancului', 'mihai bravu': 'mihai-bravu', 'colentina': 'colentina', 'fundeni': 'fundeni', 'doamna ghica': 'doamna-ghica', 'andronache': 'andronache', 'baicului': 'baicului', 'petricani': 'petricani', 'pantelimon': 'pantelimon', 'cernica': 'cernica', 'universitate': 'centrul-vechi', 'centrul vechi': 'centrul-vechi', 'unirii': 'unirii', 'piata unirii': 'unirii', 'nerva traian': 'centrul-civic', 'octavian goga': 'centrul-civic', 'timpuri noi': 'timpuri-noi', 'vacaresti': 'vacaresti', 'asmita': 'vacaresti', 'tineretului': 'tineretului', 'parcul carol': 'tineretului', 'cantemir': 'tineretului', 'oltenitei': 'oltenitei', 'piata sudului': 'oltenitei', 'sudului': 'oltenitei', 'big berceni': 'berceni', 'brancoveanu': 'brancoveanu', 'resita': 'brancoveanu', 'aparatorii patriei': 'aparatorii', 'metalurgiei': 'metalurgiei', 'giurgiului': 'giurgiului', 'progresul': 'giurgiului', 'luica': 'giurgiului', 'eroii revolutiei': 'giurgiului', 'rahova': 'rahova', 'sebastian': 'sebastian', 'margeanului': 'sebastian', '13 septembrie': '13-septembrie', 'uranus': '13-septembrie', 'panduri': 'panduri', 'antiaeriana': 'antiaeriana', 'ferentari': 'ferentari', 'cotroceni': 'cotroceni', 'politehnica': 'politehnica', 'leu': 'politehnica', 'grozavesti': 'grozavesti', 'crangasi': 'crangasi', 'giulesti': 'giulesti', 'militari': 'militari', 'lujerului': 'lujerului', 'gorjului': 'gorjului', 'pacii': 'pacii', 'preciziei': 'pacii', 'iuliu maniu': 'iuliu-maniu', 'valea cascadelor': 'iuliu-maniu', 'prelungirea ghencea': 'prelungirea-ghencea', 'vitan': 'vitan', 'dristor': 'dristor', 'titan': 'titan', 'nicolae grigorescu': 'nicolae-grigorescu', 'ozana': 'ozana', 'balta alba': 'balta-alba', 'theodor pallady': 'pallady', 'pallady': 'pallady', 'catelu': 'catelu', 'industriilor': 'catelu', 'decebal': 'decebal', 'alba iulia': 'decebal', 'muncii': 'muncii', 'piata muncii': 'muncii', 'nordului': 'herastrau', 'kiseleff': 'aviatorilor', 'arcul de triumf': 'aviatorilor',
    'agronomie': 'herastrau', 'romana': 'victoriei', 'piata romana': 'victoriei', 'universitate': 'centrul-vechi',
    'kogalniceanu': 'cismigiu', 'gara de nord': 'grivita', 'basarab': 'grivita', 'eminescu': 'mosilor',
    'foisorul de foc': 'lizeanu', 'vatra luminoasa': 'iancului', 'baba novac': 'dristor', 'salajan': 'titan',
    '1 decembrie 1918': 'titan', 'industriilor': 'catelu', 'nerva traian': 'centrul-civic', 'vitan barzesti': 'vitan',
    'alba iulia': 'decebal', 'piata alba iulia': 'decebal', 'piata muncii': 'muncii', 'piata iancului': 'iancului',
    'piata victoriei': 'victoriei', 'piata unirii': 'unirii', 'piata universitatii': 'centrul-vechi', 'lipscani': 'centrul-vechi',
    'tineretului': 'tineretului', 'parcul carol': 'tineretului', 'eroii revolutiei': 'tineretului', 'sincai': 'tineretului',
    'piata sudului': 'oltenitei', 'aparatorii patriei': 'aparatorii', 'brancoveanu': 'brancoveanu', 'luica': 'giurgiului',
    'toporasi': 'giurgiului', 'pieptanari': 'giurgiului', 'margeanului': 'sebastian', 'petre ispirescu': 'sebastian',
    'drumul taberei': 'drumul-taberei', 'favorit': 'drumul-taberei', 'moghioros': 'drumul-taberei', 'romancierilor': 'drumul-taberei',
    'lujerului': 'lujerului', 'gorjului': 'gorjului', 'uverturii': 'militari', 'veteranilor': 'militari', 'apusului': 'militari',
    'dezrobirii': 'militari', 'pacii': 'pacii', 'iuliu maniu': 'iuliu-maniu', 'giulesti': 'giulesti', 'ghencea': 'ghencea',
    'prelungirea ghencea': 'prelungirea-ghencea', 'militari residence': 'militari-residence', 'bucurestii noi': 'bucurestii-noi',
    'damaroaia': 'damaroaia', 'pajura': 'pajura', 'straulesti': 'straulesti', 'domenii': 'domenii', 'aviatiei': 'aviatiei',
    'baneasa': 'baneasa', 'pipera': 'pipera', 'floreasca': 'floreasca', 'dorobanti': 'dorobanti', 'primaverii': 'primaverii',
    'herastrau': 'herastrau', 'aviatorilor': 'aviatorilor', 'barbu vacarescu': 'barbu-vacarescu', 'tei': 'tei', 'lacul tei': 'tei',
    'obor': 'obor', 'colentina': 'colentina', 'doamna ghica': 'doamna-ghica', 'andronache': 'andronache', 'fundeni': 'fundeni',
    'pantelimon': 'pantelimon', 'baicului': 'baicului', 'petricani': 'petricani', 'stefan cel mare': 'stefan-cel-mare',
    'lizeanu': 'lizeanu', 'mosilor': 'mosilor', 'dacia': 'dacia', 'icoanei': 'dacia', 'armeneasca': 'dacia', 'iancului': 'iancului',
    'mihai bravu': 'mihai-bravu', 'muncii': 'muncii', 'decebal': 'decebal', 'unirii': 'unirii', 'centrul civic': 'centrul-civic',
    'centrul vechi': 'centrul-vechi', 'vitan': 'vitan', 'dristor': 'dristor', 'titan': 'titan', 'nicolae grigorescu': 'nicolae-grigorescu',
    'ozana': 'ozana', 'balta alba': 'balta-alba', 'theodor pallady': 'pallady', 'pallady': 'pallady', 'catelu': 'catelu',
    'timpuri noi': 'timpuri-noi', 'vacaresti': 'vacaresti', 'oltenitei': 'oltenitei', 'berceni': 'berceni', 'metalurgiei': 'metalurgiei',
    'giurgiului': 'giurgiului', 'cotroceni': 'cotroceni', '13 septembrie': '13-septembrie', 'panduri': 'panduri', 'sebastian': 'sebastian',
    'rahova': 'rahova', 'antiaeriana': 'antiaeriana', 'ferentari': 'ferentari', 'politehnica': 'politehnica', 'grozavesti': 'grozavesti',
    'crangasi': 'crangasi', 'militari': 'militari', 'cismigiu': 'cismigiu', 'grivita': 'grivita', '1 mai': '1-mai', 'victoriei': 'victoriei',
    'popesti leordeni': 'popesti-leordeni', 'popesti': 'popesti-leordeni', 'bragadiru': 'bragadiru', 'voluntari': 'voluntari',
    'otopeni': 'otopeni', 'corbeanca': 'corbeanca', 'snagov': 'snagov', 'mogosoaia': 'mogosoaia', 'tunari': 'tunari',
    'stefanestii de jos': 'stefanestii-de-jos', 'stefanesti': 'stefanestii-de-jos', 'dobroesti': 'dobroesti', 'balotesti': 'balotesti',
    'buftea': 'buftea', 'chiajna': 'chiajna', 'dudu': 'chiajna', 'rosu': 'chiajna', 'dragomiresti vale': 'dragomiresti-vale',
    'dragomiresti deal': 'dragomiresti-vale', 'magurele': 'magurele', 'domnesti': 'domnesti', 'teghes': 'domnesti', 'clinceni': 'clinceni',
    'olteni': 'clinceni', 'cornetu': 'cornetu', 'jilava': 'jilava', '1 decembrie': '1-decembrie', 'afumati': 'afumati', 'cernica': 'cernica',
    'tanganu': 'cernica', 'glina': 'glina', 'branesti': 'branesti', 'ciorogarla': 'ciorogarla', 'vidra': 'vidra', 'moara vlasiei': 'moara-vlasiei',
    'ciolpani': 'ciolpani', 'gruiu': 'gruiu', 'petrachioaia': 'petrachioaia', 'ganeasa': 'ganeasa', 'dascalu': 'dascalu', 'peris': 'peris',
    'gradistea': 'gradistea', 'copaceni': 'copaceni', 'darasti': 'darasti', 'darasti ilfov': 'darasti',
}
ALIAS = {}
def _add(k, zid):
    k = norm(k)
    if len(k) < 3: return
    ALIAS.setdefault(k, [])
    if zid not in ALIAS[k]: ALIAS[k].append(zid)
for k, v in EXTRA.items(): _add(k, v)
for z in ZONES:
    for a in [z.get('nume', '')] + list(z.get('alias') or []):
        for part in re.split(r'/|\(|\)', a): _add(part, z['id'])
ALIAS_KEYS = list(ALIAS)
UNMAPPED = {}

def map_zone(loc_text, sector=None, ilfov=False):
    """loc_text: ex. „Chitila, Sector 1”, „Uranus, Sectorul 5, Bucuresti”, „Bragadiru, Ilfov”, „Berceni, Berceni, Ilfov”."""
    t = norm(loc_text)
    m = re.search(r'sector(?:ul)?\s*(\d)', t)
    if m: sector = int(m.group(1))
    if 'ilfov' in t: ilfov = True
    if sector: ilfov = False
    parts = [p.strip() for p in re.split(r',', loc_text or '') if p.strip()]
    cands = []
    for p in parts:
        p = norm(p)
        if not p or re.fullmatch(r'(sector(ul)?\s*\d|bucuresti|ilfov|judetul ilfov|romania)', p): continue
        if p not in cands: cands.append(p)
    def fits(z, exact):
        if ilfov and z.get('sector'): return False            # anunț din Ilfov, zonă din București
        if sector and not z.get('sector'): return False       # anunț din București, zonă din Ilfov
        if sector and z.get('sector') and z['sector'] != sector and not exact: return False
        return True
    # 1) potrivire exactă pe aliasuri; 2) alias conținut în text (cel mai lung); Ilfov are prioritate când e spus explicit
    for exact in (True, False):
        for c in cands:
            for key in sorted(ALIAS_KEYS, key=len, reverse=True):
                hit = (c == key) if exact else (len(key) >= 5 and (c.startswith(key + ' ') or c.endswith(' ' + key) or (' ' + key + ' ') in (' ' + c + ' ')))
                if not hit: continue
                for zid in ALIAS[key]:
                    z = ZID.get(zid)
                    if z and fits(z, exact): return zid
    key = (loc_text or '').strip()
    if key: UNMAPPED[key] = UNMAPPED.get(key, 0) + 1
    return None

def zone_from_title(titlu, loc_text):
    """când localizarea nu spune cartierul („Sectorul 1, Bucuresti”), încercăm titlul anunțului, cu aceleași constrângeri"""
    t = ' ' + norm(titlu) + ' '
    lt = norm(loc_text)
    m = re.search(r'sector(?:ul)?\s*(\d)', lt); sector = int(m.group(1)) if m else None
    ilfov = ('ilfov' in lt) and not sector
    best = None
    for key in sorted(ALIAS_KEYS, key=len, reverse=True):
        if len(key) < 5 or (' ' + key + ' ') not in t: continue
        for zid in ALIAS[key]:
            z = ZID.get(zid)
            if not z: continue
            if ilfov and z.get('sector'): continue
            if sector and (not z.get('sector') or z['sector'] != sector): continue
            if not sector and not ilfov: continue
            best = zid; break
        if best: break
    return best

# ---------- e-mailuri ----------
def html_lines(h):
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h or '', flags=re.S | re.I)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'</(td|tr|div|p|li|h\d|table)>', '\n', t, flags=re.I)
    t = re.sub(r'<a\s[^>]*href="([^"]+)"[^>]*>', r'\n[LINK]\1\n', t, flags=re.I)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t).replace('\xa0', ' ')
    out = []
    for l in t.split('\n'):
        l = re.sub(r'\s+', ' ', l).strip()
        if l and not re.fullmatch(r'[​‌‍﻿͏ ]+', l): out.append(l)
    return out

def imob_real_link(url):
    """Linkul din e-mailul Imobiliare e un redirect cu ținta în base64; păstrăm doar adresa anunțului, niciodată auto-login."""
    try:
        m = re.search(r'link\.imobiliare\.ro/click/[^/]+/([A-Za-z0-9_\-]+)', url or '')
        if not m: return None
        b = m.group(1); b += '=' * (-len(b) % 4)
        target = base64.urlsafe_b64decode(b.encode()).decode('utf-8', 'ignore')
        q = parse_qs(urlparse(target).query)
        if 'redirectUrl' in q: target = unquote(q['redirectUrl'][0])
        if 'auto-login' in target: return None
        target = target.split('?')[0]
        return target if 'imobiliare.ro' in target else None
    except Exception:
        return None

def tip_from(text):
    t = norm(text)
    if re.search(r'apartament|garsonier', t): return 'apartament'
    if re.search(r'\bteren', t): return 'teren'
    if re.search(r'\bcas[ae]\b|\bvil[ae]\b', t): return 'casa'
    return None

def parse_imobiliare(msg):
    L = html_lines(msg.get('htmlBody') or '')
    subj = msg.get('subject') or ''
    tip = tip_from(subj) or 'apartament'
    out, i = [], 0
    while i < len(L):
        # bloc: titlu, nr. poze, titlu (din nou), preț, localizare, [Comision 0%], atribute, [LINK]…
        if i + 3 < len(L) and L[i] == L[i + 2] and re.fullmatch(r'\d{1,3}', L[i + 1]) and '€' in L[i + 3]:
            titlu, pret, loc = L[i], num(L[i + 3]), L[i + 4] if i + 4 < len(L) else ''
            j, attrs, com0, link = i + 5, '', False, None
            while j < len(L) and not L[j].startswith('[LINK]'):
                if re.search(r'comision 0', L[j], re.I): com0 = True
                elif re.search(r'\bmp\b|camere|Et\.', L[j]): attrs = L[j]
                j += 1
            while j < len(L) and L[j].startswith('[LINK]'):
                cand = imob_real_link(L[j][6:])
                if cand and '/oferta' in cand or (cand and not link): link = link or cand
                j += 1
            a = {'sursa': 'imobiliare', 'tip': tip, 'titlu': titlu[:80], 'pret': pret, 'loc': loc, 'comision0': com0, 'link': link}
            m = re.search(r'(\d+)\s*camere', attrs); a['camere'] = int(m.group(1)) if m else None
            m = re.search(r'([\d.,]+)\s*mp(?!\s*teren)', attrs); a['mp'] = num(m.group(1)) if m else None
            m = re.search(r'([\d.,]+)\s*mp\s*teren|teren\s*([\d.,]+)\s*mp', attrs, re.I); a['teren'] = num(m.group(1) or m.group(2)) if m else None
            m = re.search(r'Et\.\s*([A-Za-z0-9]+)\s*/\s*(\d+)', attrs)
            if m: a['etaj'] = m.group(1).upper(); a['etajeTotal'] = int(m.group(2))
            out.append(a); i = j
        else:
            i += 1
    return out

HIDDEN = {'storia': 0, 'imobiliare': 0, 'emailuri_cu_ascunse': 0}
def parse_storia(msg):
    body = msg.get('plaintextBody') or ''
    mh = re.search(r'Verific[ăa]\s+restul.*?(\d+)\s*anun', body, re.S)
    if mh: HIDDEN['storia'] += int(mh.group(1)); HIDDEN['emailuri_cu_ascunse'] += 1
    subj = msg.get('subject') or ''
    tip = tip_from(subj) or 'apartament'
    if body.strip():
        lines = [re.sub(r'\s+', ' ', l).strip() for l in body.split('\n')]
        lines = [l for l in lines if l]
    else:
        lines = html_lines(msg.get('htmlBody') or '')
    out, i = [], 0
    # bloc în text: „--------” titlu „--------” localizare preț „&euro;” … „m²” „N camere” vânzător …
    while i < len(lines):
        l = lines[i]
        if re.fullmatch(r'-{6,}', l) and i + 2 < len(lines) and re.fullmatch(r'-{6,}', lines[i + 2]):
            titlu = lines[i + 1]; j = i + 3
            a = {'sursa': 'storia', 'tip': tip, 'titlu': titlu[:80], 'pret': None, 'mp': None, 'camere': None, 'loc': '', 'link': None, 'vanzator': None}
            seller_seen = False
            while j < len(lines) and not re.fullmatch(r'-{6,}', lines[j]) and not lines[j].startswith('Ad -->'):
                s = lines[j]
                if not a['loc'] and re.search(r'sector|ilfov|bucuresti', s, re.I) and '€' not in s: a['loc'] = s
                elif a['pret'] is None and re.fullmatch(r'[\d\s.]+', s) and j + 1 < len(lines) and re.search(r'euro|€', lines[j + 1]) and not re.search(r'/m', lines[j + 1]):
                    a['pret'] = num(s)
                elif a['pret'] is None and re.search(r'^[\d\s.,]+\s*(€|&euro;)\s*$', s): a['pret'] = num(s)
                elif a['mp'] is None and re.search(r'm²|\bmp\b', s) and not re.search(r'/m', s):
                    a['mp'] = num(s)
                elif a['camere'] is None and re.search(r'(\d+)\s*camer', s): a['camere'] = int(re.search(r'(\d+)\s*camer', s).group(1))
                elif a['mp'] is not None and a['pret'] is not None and not seller_seen and not s.startswith('(') and 'http' not in s and not re.search(r'verific', s, re.I):
                    seller_seen = True
                    v = re.sub(r'\s*Contact\s*$', '', s, flags=re.I)
                    # Storia: înainte de „Contact” e numele agenției; la proprietari nu e niciun text
                    a['vanzator'] = 'persoana' if (not v or re.search(r'persoan[aă] fizic|proprietar|privat', v, re.I)) else 'companie'
                elif a['link'] is None and re.search(r'https?://', s):
                    m = re.search(r'(https?://\S+)', s); a['link'] = m.group(1).rstrip(')')
                j += 1
            out.append(a); i = j
        else:
            i += 1
    if not out:   # varianta HTML (fără text)
        L = html_lines(msg.get('htmlBody') or '')
        for k in range(len(L) - 5):
            if '€' in L[k + 2] and re.search(r'm²', L[k + 4]) and re.search(r'sector|ilfov|bucuresti', L[k + 1], re.I):
                a = {'sursa': 'storia', 'tip': tip, 'titlu': L[k][:80], 'loc': L[k + 1], 'pret': num(L[k + 2]), 'mp': num(L[k + 4]), 'camere': None, 'link': None, 'vanzator': None}
                m = re.search(r'(\d+)\s*camer', L[k + 5]); a['camere'] = int(m.group(1)) if m else None
                for q in range(k + 5, min(k + 12, len(L))):
                    if L[q].startswith('[LINK]'): a['link'] = L[q][6:]; break
                    if q > k + 5 and not re.search(r'camer|contact|verific', L[q], re.I): a['vanzator'] = 'persoana' if re.search(r'persoan[aă] fizic|proprietar|privat', L[q], re.I) else 'companie'
                out.append(a)
    return out

def classify(msg):
    s = (msg.get('sender') or '').lower(); subj = (msg.get('subject') or '').lower()
    if 'storia' in s: return 'storia' if 'cautari-salvate' in s or 'căutarea ta salvată' in (msg.get('plaintextBody') or '').lower() or 'anunț' in subj else None
    if 'imobiliare' in s or 'sailthru' in s: return 'imobiliare' if re.search(r'anun[tț](uri)? no', subj) else None
    if 'olx' in s: return 'olx'
    return None

def ms_of(msg):
    try: return int(msg.get('internalDate'))
    except Exception:
        try: return int(datetime.datetime.strptime(msg['date'][:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        except Exception: return NOW_MS

def cheie(a):
    return '%s|%s|%.1f|%s' % (a['sursa'], a['tip'], a['mp'] or 0, re.sub(r'[^a-z0-9]', '', norm(a['titlu']))[:40])

def cap_id(a):
    if a['sursa'] == 'imobiliare' and a.get('link'):
        m = re.search(r'-(\d{6,})/?$', a['link']) or re.search(r'/oferta/.*?(\w{8,})$', a['link'])
        if m: return 'im' + m.group(1)
    return 'al' + hashlib.sha1(cheie(a).encode()).hexdigest()[:10]

# ---------- citire ----------
messages = {}
for f in sorted(glob.glob(os.path.join(BASE, 'mail', '*.json'))):
    d = load(f)
    if not d: continue
    msgs = d.get('messages') if isinstance(d, dict) and isinstance(d.get('messages'), list) else ([d] if isinstance(d, dict) and d.get('id') else [])
    for m in msgs:
        if m.get('id'): messages[m['id']] = m

stare = load(os.path.join(BASE, 'prev', 'alerte', 'stare.json'), {}) or {}
if 'data' in stare and isinstance(stare['data'], dict) and 'procesate' in stare['data']: stare = stare['data']
procesate = set(stare.get('procesate') or [])
chei_vechi = set(stare.get('chei') or [])

listings, per_msg, skipped = [], {}, {'procesate': 0, 'nerelevante': 0, 'olx': 0}
for mid, m in sorted(messages.items(), key=lambda kv: ms_of(kv[1])):
    if mid in procesate and not COUNT_ONLY: skipped['procesate'] += 1; continue
    kind = classify(m)
    if kind is None: skipped['nerelevante'] += 1; continue
    if kind == 'olx': skipped['olx'] += 1; per_msg[mid] = 0; continue
    got = parse_imobiliare(m) if kind == 'imobiliare' else parse_storia(m)
    if kind == 'imobiliare':
        mh = re.match(r'\s*(\d+)\s+anun', m.get('subject') or '')
        if mh and int(mh.group(1)) > len(got): HIDDEN['imobiliare'] += int(mh.group(1)) - len(got); HIDDEN['emailuri_cu_ascunse'] += 1
    t = ms_of(m)
    for a in got:
        a['venitLa'] = t; a['msg'] = mid
        a['zona'] = map_zone(a.get('loc') or '') or zone_from_title(a.get('titlu') or '', a.get('loc') or '')
    per_msg[mid] = len(got)
    listings.extend(got)

# anunțuri extrase altfel (Publi24 etc.), din DIR/extra.json
linkuri_vechi = set(stare.get('linkuri') or [])
extra_links = []
for a in (load(os.path.join(BASE, 'extra.json'), []) or []):
    if not isinstance(a, dict) or not a.get('sursa'): continue
    if a.get('link') and a['link'] in linkuri_vechi and not COUNT_ONLY: continue
    a.setdefault('tip', tip_from(a.get('titlu') or '') or 'apartament')
    a['titlu'] = str(a.get('titlu') or '')[:80]
    for k in ('pret', 'mp', 'teren'):
        if a.get(k) is not None: a[k] = num(a[k])
    v = a.get('venitLa')
    if isinstance(v, str):
        try: a['venitLa'] = int(datetime.datetime.strptime(v[:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        except Exception: a['venitLa'] = NOW_MS
    elif not isinstance(v, (int, float)): a['venitLa'] = NOW_MS
    if not a.get('zona'): a['zona'] = map_zone(a.get('loc') or '', ilfov=True)
    if a.get('zona') and a['zona'] not in ZID: a['zona'] = map_zone(a['zona'], ilfov=True)
    if a.get('link'): extra_links.append(a['link'])
    listings.append(a)

# curățare + deduplicare în lot
def ok(a):
    p, m = a.get('pret'), a.get('mp')
    if not p or not m or m < 8: return False
    ppm = p / m
    if a['tip'] in ('apartament', 'casa') and not (250 <= ppm <= 9000): return False
    if a['tip'] == 'teren' and not (3 <= ppm <= 5000): return False
    return True

valid = [a for a in listings if ok(a)]
by_key, order = {}, []
for a in valid:
    k = cheie(a)
    if k in by_key:
        o = by_key[k]
        if a['venitLa'] > o['venitLa'] and a['pret'] != o['pret']: o['pretAnterior'] = o['pret']; o['pret'] = a['pret']; o['venitLa'] = a['venitLa']
        continue
    by_key[k] = a; order.append(k)
uniq = [by_key[k] for k in order]

if COUNT_ONLY:
    src = {}
    for a in uniq: src[a['sursa']] = src.get(a['sursa'], 0) + 1
    zon = sum(1 for a in uniq if a.get('zona'))
    print(json.dumps({'mesaje': len(messages), 'citite': len(per_msg), 'sarite': skipped, 'anunturi_brute': len(listings), 'valide': len(valid), 'unice': len(uniq), 'pe_surse': src,
                      'cu_zona': zon, 'fara_zona': len(uniq) - zon, 'cu_link': sum(1 for a in uniq if a.get('link')), 'persoane': sum(1 for a in uniq if a.get('vanzator') == 'persoana'),
                      'pe_tip': {t: sum(1 for a in uniq if a['tip'] == t) for t in ('apartament', 'casa', 'teren')}, 'neincapute_in_email': HIDDEN,
                      'nemapate_top': sorted(UNMAPPED.items(), key=lambda kv: -kv[1])[:40]}, ensure_ascii=False, indent=1))
    for a in uniq[:12]: print(json.dumps({k: a.get(k) for k in ('sursa', 'tip', 'titlu', 'pret', 'mp', 'camere', 'etaj', 'loc', 'zona', 'vanzator', 'link')}, ensure_ascii=False))
    sys.exit(0)

# ---------- versiuni ----------
versions = {}
vt = os.path.join(BASE, 'versions.txt')
if os.path.exists(vt):
    coll = None
    for line in open(vt, encoding='utf-8'):
        m = re.search(r'from collection "([^"]+)"', line)
        if m: coll = m.group(1)
        m = re.search(r'"([^"]+)"\s+\d+\s+bytes\s+version\s+(\d+)', line)
        if m and coll: versions[coll + '/' + m.group(1)] = int(m.group(2))
for k, v in (load(os.path.join(BASE, 'versions.json'), {}) or {}).items(): versions[k] = int(v)

def prev_doc(coll, did):
    d = load(os.path.join(BASE, 'prev', coll, did + '.json'))
    if isinstance(d, dict) and 'data' in d and isinstance(d['data'], dict) and len(d) <= 3: d = d['data']
    return d if isinstance(d, dict) else None

out_dir = os.path.join(BASE, 'out')
for sub in ('capturi', 'portaluri', 'alerte'): os.makedirs(os.path.join(out_dir, sub), exist_ok=True)
writes = []

# ---------- capturi (toate anunțurile cu zonă) ----------
cap_new, cap_upd, cap_del = 0, 0, 0
by_shard = {}
for a in uniq:
    if not a.get('zona'): continue
    cid = cap_id(a); sh = fnv_shard(cid)
    prev = prev_doc('capturi', sh) or {}
    pa = (prev.get('a') or {}).get(cid)
    d = {'id': cid, 'auto': True, 'sursa': a['sursa'], 'tip': a['tip'], 'zona': a['zona'], 'titlu': a['titlu'][:60], 'pret': int(round(a['pret'])), 'mp': round(a['mp'], 1),
         'camere': a.get('camere'), 'etaj': a.get('etaj'), 'etajeTotal': a.get('etajeTotal'), 'teren': a.get('teren'), 'vanzator': a.get('vanzator'),
         'link': a.get('link'), 'adresa': (a.get('loc') or '')[:40] or None, 'captura': True, 'capturatLa': a['venitLa'], 'adaugatLa': a['venitLa'], 'dosar': None}
    if a.get('comision0'): d['comision0'] = True
    d = {k: v for k, v in d.items() if v is not None or k in ('dosar',)}
    if pa:
        d['adaugatLa'] = pa.get('adaugatLa') or d['adaugatLa']
        if pa.get('pret') and abs(pa['pret'] - d['pret']) >= 1: d['pretAnterior'] = pa['pret']; d['schimbatLa'] = NOW_MS
        elif pa.get('pretAnterior'): d['pretAnterior'] = pa['pretAnterior']
        if pa.get('dosar'): d['dosar'] = pa['dosar']
        if not pa.get('auto'): continue                      # captură manuală cu același id: nu o atingem
        if pa.get('pret') == d['pret'] and pa.get('link') == d.get('link'): continue
        cap_upd += 1
    else:
        cap_new += 1
    by_shard.setdefault(sh, {})[cid] = d
# curățenie: anunțurile automate mai vechi de RET_CAPTURI_ZILE ies din shard-urile pe care oricum le scriem
for sh in list(by_shard):
    prev = prev_doc('capturi', sh) or {}
    for cid, pa in (prev.get('a') or {}).items():
        if pa.get('auto') and (NOW_MS - (pa.get('adaugatLa') or NOW_MS)) > RET_CAPTURI_ZILE * 86400000 and cid not in by_shard[sh]:
            by_shard[sh][cid] = {'__delete__': True}; cap_del += 1
for sh, items in sorted(by_shard.items()):
    exists = prev_doc('capturi', sh) is not None or ('capturi/' + sh) in versions
    fp = os.path.join(out_dir, 'capturi', sh + '.json')
    if exists:
        doc = {'a': items}
        w = {'op': 'update', 'collection': 'capturi', 'doc_id': sh, 'file_path': fp}
        if versions.get('capturi/' + sh): w['if_version'] = versions['capturi/' + sh]
    else:
        doc = {'v': 1, 'g': int(sh[1:]) % CAP_GROUPS, 'a': {k: v for k, v in items.items() if '__delete__' not in v}}
        w = {'op': 'set', 'collection': 'capturi', 'doc_id': sh, 'file_path': fp}
    with open(fp, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False)
    writes.append(w)

# ---------- portaluri (fereastră scurtă, pentru cumpărători și semnale) ----------
def slim(a):
    o = {'cheie': cheie(a), 'sursa': a['sursa'], 'titlu': a['titlu'][:60], 'pret': int(round(a['pret'])), 'mp': round(a['mp'], 1), 'camere': a.get('camere'), 'etaj': a.get('etaj'),
         'vanzator': a.get('vanzator'), 'venitLa': datetime.datetime.fromtimestamp(a['venitLa'] / 1000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'link': a.get('link'), 'pretAnterior': a.get('pretAnterior')}
    return o
groups = {}
for a in uniq:
    if a.get('zona'): groups.setdefault(a['zona'] + '__' + a['tip'], []).append(a)
port_docs = 0
for key, lst in sorted(groups.items()):
    zona, tip = key.split('__', 1)
    prev = prev_doc('portaluri', key) or {}
    old = [x for x in (prev.get('anunturi') or []) if isinstance(x, dict)]
    by_c = {x.get('cheie'): x for x in old if x.get('cheie')}
    for a in lst:
        s = slim(a); c = s['cheie']
        if c in by_c:
            o = by_c[c]
            if o.get('pret') and o['pret'] != s['pret']: s['pretAnterior'] = o['pret']
            elif o.get('pretAnterior'): s['pretAnterior'] = o['pretAnterior']
            s['venitLa'] = min(o.get('venitLa') or s['venitLa'], s['venitLa'])
        by_c[c] = s
    cutoff = (utcnow() - datetime.timedelta(days=RET_PORTAL_ZILE)).strftime('%Y-%m-%dT%H:%M:%SZ')
    items = sorted([x for x in by_c.values() if (x.get('venitLa') or '') >= cutoff], key=lambda x: x.get('venitLa') or '', reverse=True)[:PORTAL_MAX]
    doc = {'zona': zona, 'tip': tip, 'actualizatLa': utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'anunturi': [{k: v for k, v in x.items() if v is not None} for x in items]}
    fp = os.path.join(out_dir, 'portaluri', key + '.json')
    with open(fp, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False)
    w = {'op': 'set', 'collection': 'portaluri', 'doc_id': key, 'file_path': fp}
    if versions.get('portaluri/' + key): w['if_version'] = versions['portaluri/' + key]
    elif prev: print('ATENȚIE: lipsește versiunea pentru portaluri/' + key)
    writes.append(w); port_docs += 1

# ---------- alerte (anunțurile de la persoane fizice, pentru „Proprietari”) ----------
prev_al = prev_doc('alerte', TODAY) or {}
al_items = [x for x in (prev_al.get('anunturi') or []) if isinstance(x, dict)]
al_keys = {x.get('cheie') for x in al_items}
for a in uniq:
    if a.get('vanzator') != 'persoana' or not a.get('zona'): continue
    s = slim(a); s['zona'] = a['zona']; s['tip'] = a['tip']
    if s['cheie'] in al_keys or s['cheie'] in chei_vechi: continue
    al_items.append({k: v for k, v in s.items() if v is not None}); al_keys.add(s['cheie'])
al_items = al_items[-ALERTE_MAX:]
doc = {'data': TODAY, 'actualizatLa': utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'anunturi': al_items}
fp = os.path.join(out_dir, 'alerte', TODAY + '.json')
with open(fp, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False)
w = {'op': 'set', 'collection': 'alerte', 'doc_id': TODAY, 'file_path': fp}
if versions.get('alerte/' + TODAY): w['if_version'] = versions['alerte/' + TODAY]
elif prev_al: print('ATENȚIE: lipsește versiunea pentru alerte/' + TODAY)
writes.append(w)

# ---------- stare ----------
proc = list(procesate) + [m for m in per_msg if m not in procesate]
chei = list(chei_vechi) + [cheie(a) for a in uniq if cheie(a) not in chei_vechi]
linkuri = list(linkuri_vechi) + [l for l in extra_links if l not in linkuri_vechi]
stare_doc = {'ultimaRulare': utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'procesate': proc[-STARE_MAX:], 'chei': chei[-STARE_MAX:], 'linkuri': linkuri[-3000:]}
fp = os.path.join(out_dir, 'alerte', 'stare.json')
with open(fp, 'w', encoding='utf-8') as f: json.dump(stare_doc, f, ensure_ascii=False)
w = {'op': 'set', 'collection': 'alerte', 'doc_id': 'stare', 'file_path': fp}
if versions.get('alerte/stare'): w['if_version'] = versions['alerte/stare']
elif stare: print('ATENȚIE: lipsește versiunea pentru alerte/stare')
writes.append(w)

batches = [writes[i:i + 50] for i in range(0, len(writes), 50)]
with open(os.path.join(out_dir, 'writes.json'), 'w', encoding='utf-8') as f: json.dump(batches, f, ensure_ascii=False, indent=1)
src = {}
for a in uniq: src[a['sursa']] = src.get(a['sursa'], 0) + 1
rez = {'mesaje_noi': len(per_msg), 'sarite': skipped, 'anunturi_unice': len(uniq), 'pe_surse': src, 'cu_zona': sum(1 for a in uniq if a.get('zona')),
       'fara_zona': sum(1 for a in uniq if not a.get('zona')), 'persoane': sum(1 for a in uniq if a.get('vanzator') == 'persoana'),
       'capturi': {'noi': cap_new, 'actualizate': cap_upd, 'sterse_vechi': cap_del, 'shard_uri': len(by_shard)}, 'portaluri_docs': port_docs,
       'alerte_azi': len(al_items), 'neincapute_in_email': HIDDEN, 'scrieri': len(writes), 'loturi': len(batches), 'nemapate_top': sorted(UNMAPPED.items(), key=lambda kv: -kv[1])[:15]}
with open(os.path.join(out_dir, 'rezumat.json'), 'w', encoding='utf-8') as f: json.dump(rez, f, ensure_ascii=False, indent=1)
print('Rezumat:', json.dumps(rez, ensure_ascii=False))
print('Scrieri:', len(writes), 'în', len(batches), 'loturi ->', os.path.join(out_dir, 'writes.json'))
