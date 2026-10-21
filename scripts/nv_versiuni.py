#!/usr/bin/env python3
# Novaria — culege versiunile documentelor din rezultatele ArtifactData (list/get/batch) găsite în transcriptele sesiunii,
# ca scripturile să poată scrie „set” cu if_version fără ca cineva să le copieze de mână.
#   python3 -I nv_versiuni.py <fisier-iesire> [--sub /tmp/nvfeed/dst]
# --sub: ia în calcul doar listările salvate cu out_dir sub acel folder (ca să nu amesteci două aplicații diferite)
# Formatul ieșirii e cel citit de nv_alerte.py / nv_feed.py: „N documents from collection "X" …” + „- "doc"  0 bytes  version N  ""”
import json, os, sys, glob, re

if len(sys.argv) < 2: print('folosire: nv_versiuni.py <fisier-iesire> [--sub DIR]'); sys.exit(2)
OUT = sys.argv[1]
SUB = None
for i, a in enumerate(sys.argv):
    if a == '--sub' and i + 1 < len(sys.argv): SUB = os.path.abspath(sys.argv[i + 1]).rstrip('/') + '/'
    m = re.match(r'--sub=(.+)', a)
    if m: SUB = os.path.abspath(m.group(1)).rstrip('/') + '/'

home = os.path.expanduser('~')
files = sorted(glob.glob(os.path.join(home, '.claude', 'projects', '*', '*.jsonl')) + glob.glob(os.path.join(home, '.claude', 'projects', '*', '*', 'subagents', '*.jsonl')), key=os.path.getmtime)
vers, ordine = {}, 0
for f in files:   # de la cel mai vechi la cel mai nou: ultima versiune văzută câștigă
    try:
        with open(f, encoding='utf-8') as fh:
            for line in fh:
                if 'version' not in line or 'tool_result' not in line: continue
                ordine += 1
                try: rec = json.loads(line)
                except Exception: continue
                content = (rec.get('message') or {}).get('content')
                if not isinstance(content, list): continue
                for c in content:
                    if not isinstance(c, dict) or c.get('type') != 'tool_result': continue
                    cc = c.get('content')
                    if isinstance(cc, list): cc = ''.join(x.get('text', '') for x in cc if isinstance(x, dict))
                    if not isinstance(cc, str) or 'version' not in cc: continue
                    if not ('from collection' in cc or 'Document ' in cc or 'batch committed' in cc or 'Database ' in cc): continue
                    coll, in_sub = None, (SUB is None)
                    for ln in cc.split('\n'):
                        mc = re.search(r'from collection "([^"]+)"', ln)
                        if mc:
                            coll = mc.group(1)
                            if SUB is not None: in_sub = ('under "' + SUB.rstrip('/')) in ln or (SUB in ln)
                        mv = re.search(r'^\s*-\s*"([^"]+)"\s+\d+\s+bytes\s+version\s+(\d+)(?:\s+"([^"]*)")?', ln)
                        if mv and coll:
                            path = mv.group(3) or ''
                            if SUB is None or in_sub or (path and path.startswith(SUB)): vers[coll + '/' + mv.group(1)] = (ordine, int(mv.group(2)))
                        if coll and 'more saved documents' in ln and (SUB is None or in_sub):
                            for md in re.finditer(r'"([^"]+)"\s+(\d+)(?=,|\])', ln.split('(id, version):')[-1]): vers[coll + '/' + md.group(1)] = (ordine, int(md.group(2)))
                        # rezultatele scrierilor („- set "piata"/"x" (version 3)”) nu spun aplicația: le luăm doar fără --sub
                        if SUB is None:
                            mw = re.search(r'^\s*-\s*(?:update|set|str_replace)\s+"([^"]+)"/"([^"]+)"\s+\(version\s+(\d+)\)', ln)
                            if mw: vers[mw.group(1) + '/' + mw.group(2)] = (ordine, int(mw.group(3)))
                    if SUB is None or SUB in cc:
                        mg = re.search(r'[Dd]ocument "?([A-Za-z0-9_./~:@+-]+)"? .*?version (\d+)', cc)
                        if mg and '/' in mg.group(1) and not coll:
                            path = mg.group(1).split('/'); vers['/'.join(path[:-1]) + '/' + path[-1]] = (ordine, int(mg.group(2)))
    except Exception as e:
        print('nu pot citi', f, e)

by_coll = {}
for k, (o, v) in vers.items():
    coll, doc = k.rsplit('/', 1); by_coll.setdefault(coll, []).append((doc, v))
with open(OUT, 'w', encoding='utf-8') as fh:
    for coll, items in by_coll.items():
        fh.write('%d documents from collection "%s" (versiuni culese din transcript):\n' % (len(items), coll))
        for doc, v in sorted(items): fh.write('- "%s"  0 bytes  version %d  ""\n' % (doc, v))
print('versiuni:', {c: len(i) for c, i in by_coll.items()}, '->', OUT)
