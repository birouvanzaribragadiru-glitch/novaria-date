#!/usr/bin/env python3
# Novaria — adună rezultatele apelurilor Gmail get_thread (FULL_CONTENT) din transcriptele sesiunii
# (ale agentului principal și ale sub-agenților) și le salvează ca fișiere JSON, câte unul pe fir.
# Rezultatele mari sunt salvate de sistem în fișiere „tool-results”; cele mici vin inline în transcript.
# Scriptul le găsește pe amândouă, așa că agentul nu trebuie să copieze sau să rescrie nimic.
#
#   python3 nv_mail_extract.py DIR_MAIL [ids.txt] [--ore N] [--versiuni FIȘIER]
#     DIR_MAIL  unde se scriu <threadId>.json
#     ids.txt   opțional: lista id-urilor de fire așteptate (unul pe rând); la final raportează lipsurile
#     --ore N   caută doar în transcriptele modificate în ultimele N ore (implicit 12)
#     --versiuni FIȘIER  scrie și versiunile documentelor din rezultatele ArtifactData (list/get) găsite în transcripte,
#                        în formatul pe care îl citește nv_alerte.py (versions.txt); ultima versiune văzută câștigă
import json, os, sys, re, glob, time, shutil

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args: print('folosire: nv_mail_extract.py DIR_MAIL [ids.txt] [--ore N]'); sys.exit(2)
MAIL = os.path.abspath(args[0]); os.makedirs(MAIL, exist_ok=True)
IDS = [l.strip() for l in open(args[1], encoding='utf-8')] if len(args) > 1 and os.path.exists(args[1]) else []
IDS = [i for i in IDS if i]
ore = 12
VERS_OUT = None
argv = sys.argv[1:]
for i, a in enumerate(argv):
    m = re.match(r'--ore[= ]?(\d+)', a)
    if m: ore = int(m.group(1))
    if a == '--versiuni' and i + 1 < len(argv): VERS_OUT = argv[i + 1]
    m = re.match(r'--versiuni=(.+)', a)
    if m: VERS_OUT = m.group(1)
args = [a for a in args if a != VERS_OUT]
MAIL = os.path.abspath(args[0]); IDS = [l.strip() for l in open(args[1], encoding='utf-8')] if len(args) > 1 and os.path.exists(args[1]) else []
IDS = [i for i in IDS if i]
ROOT = os.path.expanduser('~/.claude/projects')
cutoff = time.time() - ore * 3600
files = [f for f in glob.glob(os.path.join(ROOT, '**', '*.jsonl'), recursive=True) if os.path.getmtime(f) >= cutoff]
files.sort(key=os.path.getmtime, reverse=True)

calls, results = {}, {}   # tool_use_id -> threadId ; tool_use_id -> content text
vers = {}                 # "colecție/doc" -> (ordine, versiune)
ordine = 0
for f in reversed(files):   # de la cel mai vechi la cel mai nou, ca ultima versiune văzută să câștige
    try:
        with open(f, encoding='utf-8') as fh:
            for line in fh:
                if 'mcp__Gmail__get_thread' not in line and 'tool_result' not in line: continue
                ordine += 1
                try: rec = json.loads(line)
                except Exception: continue
                msg = rec.get('message') or {}
                content = msg.get('content')
                if not isinstance(content, list): continue
                for c in content:
                    if not isinstance(c, dict): continue
                    if c.get('type') == 'tool_use' and c.get('name') == 'mcp__Gmail__get_thread':
                        tid = (c.get('input') or {}).get('threadId')
                        if tid and c.get('id'): calls[c['id']] = tid
                    elif c.get('type') == 'tool_result' and c.get('tool_use_id'):
                        cc = c.get('content')
                        if isinstance(cc, list): cc = ''.join(x.get('text', '') for x in cc if isinstance(x, dict))
                        if isinstance(cc, str) and c['tool_use_id'] not in results: results[c['tool_use_id']] = cc
                        if isinstance(cc, str) and 'version' in cc and ('from collection' in cc or 'Document ' in cc or '"version"' in cc or 'batch committed' in cc):
                            coll = None
                            for ln in cc.split('\n'):
                                mc = re.search(r'from collection "([^"]+)"', ln)
                                if mc: coll = mc.group(1)
                                mv = re.search(r'^\s*-\s*"([^"]+)"\s+\d+\s+bytes\s+version\s+(\d+)', ln)
                                if mv and coll: vers[coll + '/' + mv.group(1)] = (ordine, int(mv.group(2)))
                                # listări lungi: „[87 more saved documents ... (id, version): "doc" 2, "doc2" 1, ...]”
                                if coll and 'more saved documents' in ln:
                                    for md in re.finditer(r'"([^"]+)"\s+(\d+)(?=,|\])', ln.split('(id, version):')[-1]):
                                        vers[coll + '/' + md.group(1)] = (ordine, int(md.group(2)))
                                # rezultatele scrierilor: „- update "capturi"/"s000" (version 6)”
                                mw = re.search(r'^\s*-\s*(?:update|set|str_replace)\s+"([^"]+)"/"([^"]+)"\s+\(version\s+(\d+)\)', ln)
                                if mw: vers[mw.group(1) + '/' + mw.group(2)] = (ordine, int(mw.group(3)))
                            mg = re.search(r'[Dd]ocument "?([A-Za-z0-9_./~:@+-]+)"? .*?version (\d+)', cc)
                            if mg and '/' in mg.group(1) and not coll:
                                path = mg.group(1).split('/'); vers['/'.join(path[:-1]) + '/' + path[-1]] = (ordine, int(mg.group(2)))
    except Exception as e:
        print('nu pot citi', f, e)

def is_thread(obj, tid):
    return isinstance(obj, dict) and isinstance(obj.get('messages'), list) and (obj.get('id') == tid or not obj.get('id'))

saved, missing, bad = [], [], []
for tuid, tid in calls.items():
    out = os.path.join(MAIL, tid + '.json')
    if os.path.exists(out) and os.path.getsize(out) > 100: saved.append(tid); continue
    txt = results.get(tuid)
    if not txt: missing.append(tid); continue
    obj = None
    try: obj = json.loads(txt)
    except Exception: obj = None
    if is_thread(obj, tid):
        with open(out, 'w', encoding='utf-8') as fh: json.dump(obj, fh, ensure_ascii=False)
        saved.append(tid); continue
    m = re.search(r'(/[^\s"\']*tool-results/[^\s"\']+\.txt)', txt)
    if m and os.path.exists(m.group(1)):
        try:
            with open(m.group(1), encoding='utf-8') as fh: obj = json.load(fh)
        except Exception: obj = None
        if is_thread(obj, tid):
            shutil.copyfile(m.group(1), out); saved.append(tid); continue
    bad.append(tid)

if VERS_OUT:
    by_coll = {}
    for k, (o, v) in vers.items():
        coll, doc = k.rsplit('/', 1); by_coll.setdefault(coll, []).append((doc, v))
    with open(VERS_OUT, 'w', encoding='utf-8') as fh:
        for coll, items in by_coll.items():
            fh.write('%d documents from collection "%s" (versiuni culese din transcript):\n' % (len(items), coll))
            for doc, v in sorted(items): fh.write('- "%s"  0 bytes  version %d  ""\n' % (doc, v))
    print('versiuni:', {c: len(i) for c, i in by_coll.items()}, '->', VERS_OUT)

have = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(MAIL, '*.json'))}
lipsa = [i for i in IDS if i not in have]
print(json.dumps({'transcripte': len(files), 'apeluri_get_thread': len(calls), 'salvate': len(set(saved)), 'fara_rezultat': len(set(missing)), 'neinteles': len(set(bad)),
                  'fisiere_in_dir': len(have), 'asteptate': len(IDS), 'lipsesc': lipsa[:50]}, ensure_ascii=False))
