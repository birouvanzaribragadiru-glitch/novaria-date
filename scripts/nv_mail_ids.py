#!/usr/bin/env python3
# Novaria — alege firele Gmail de citit, fără ca agentul să copieze id-uri de mână: citește rezultatele apelurilor
# mcp__Gmail__search_threads din transcriptele sesiunii (ale agentului principal și ale sub-agenților), le compară cu
# lista „procesate” din alerte/stare și scrie ids.txt cu firele care au măcar un mesaj necitit, cele mai vechi întâi.
#
#   python3 -I nv_mail_ids.py STARE.json IDS.txt [--max 360] [--ore 6]
#     STARE.json  alerte/stare salvat de ArtifactData (poate lipsi la prima rulare)
#     IDS.txt     unde se scriu id-urile firelor (unul pe rând)
#     --max N     cel mult N fire (implicit 360); restul rămân pentru rularea următoare
#     --ore N     caută doar în transcriptele modificate în ultimele N ore (implicit 6)
import json, os, sys, re, glob, time

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if len(args) < 2: print('folosire: nv_mail_ids.py STARE.json IDS.txt [--max N] [--ore N]'); sys.exit(2)
STARE, OUT = args[0], args[1]
MAX, ORE = 360, 6
for i, a in enumerate(sys.argv):
    if a == '--max' and i + 1 < len(sys.argv): MAX = int(sys.argv[i + 1])
    if a == '--ore' and i + 1 < len(sys.argv): ORE = int(sys.argv[i + 1])

def load(p, d=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d

st = load(STARE, {}) or {}
if isinstance(st.get('data'), dict) and 'procesate' in st['data']: st = st['data']
procesate = set(st.get('procesate') or [])

ROOT = os.path.expanduser('~/.claude/projects')
cutoff = time.time() - ORE * 3600
files = [f for f in glob.glob(os.path.join(ROOT, '**', '*.jsonl'), recursive=True) if os.path.getmtime(f) >= cutoff]

calls, results = set(), {}
for f in files:
    try:
        with open(f, encoding='utf-8') as fh:
            for line in fh:
                if 'search_threads' not in line and 'tool_result' not in line: continue
                try: rec = json.loads(line)
                except Exception: continue
                content = (rec.get('message') or {}).get('content')
                if not isinstance(content, list): continue
                for c in content:
                    if not isinstance(c, dict): continue
                    if c.get('type') == 'tool_use' and c.get('name') == 'mcp__Gmail__search_threads' and c.get('id'): calls.add(c['id'])
                    elif c.get('type') == 'tool_result' and c.get('tool_use_id'):
                        cc = c.get('content')
                        if isinstance(cc, list): cc = ''.join(x.get('text', '') for x in cc if isinstance(x, dict))
                        if isinstance(cc, str): results[c['tool_use_id']] = cc
    except Exception as e:
        print('nu pot citi', f, e)

threads = {}       # threadId -> {mesaje: {id: date}}
pagini = 0
for tu in calls:
    txt = results.get(tu)
    if not txt: continue
    obj = None
    try: obj = json.loads(txt[:txt.rfind('}') + 1]) if '{' in txt else None
    except Exception: obj = None
    if not isinstance(obj, dict):
        m = re.search(r'(/[^\s"\']*tool-results/[^\s"\']+\.(?:txt|json))', txt)
        if m and os.path.exists(m.group(1)): obj = load(m.group(1))
    if not isinstance(obj, dict) or not isinstance(obj.get('threads'), list): continue
    pagini += 1
    for t in obj['threads']:
        tid = t.get('id')
        if not tid: continue
        e = threads.setdefault(tid, {})
        for m in t.get('messages') or []:
            if m.get('id'): e[m['id']] = m.get('date') or ''
        if not t.get('messages'): e.setdefault(tid, '')

de_citit = []
for tid, ms in threads.items():
    noi = [d for mid, d in ms.items() if mid not in procesate]
    # căutarea arată cel mult 5 mesaje pe fir: un fir cu mai multe poate avea mesaje noi nevăzute aici
    if noi or len(ms) >= 5: de_citit.append((min(noi) if noi else '', tid))
de_citit.sort()
sel = [tid for _, tid in de_citit[:MAX]]
with open(OUT, 'w', encoding='utf-8') as f: f.write('\n'.join(sel) + ('\n' if sel else ''))
print(json.dumps({'transcripte': len(files), 'pagini_cautare': pagini, 'fire_gasite': len(threads),
                  'mesaje_gasite': sum(len(v) for v in threads.values()), 'fire_de_citit': len(de_citit),
                  'scrise_in_ids': len(sel), 'raman_pentru_rularea_urmatoare': max(0, len(de_citit) - len(sel))}, ensure_ascii=False))
