#!/usr/bin/env python3
# Novaria — evaluările și cererile de pe novaria.ro → documentul site/lista din baza aplicației interne.
# Intrare: răspunsul JSON al endpoint-ului /wp-json/novaria-evaluator/v1/evaluari (adus cu curl).
# Ieșire: un singur document {items, n, updatedAt, generat} cu cel mult 300 de înregistrări, cele mai noi primele,
# câmpurile tăiate la lungimi rezonabile. Nu scrie nimic în afara fișierului de ieșire și nu afișează date personale.
#   python3 -I nv_site.py site.json out/site_lista.json
import json, sys, time, re

if len(sys.argv) < 3:
    print('folosire: nv_site.py site.json iesire.json'); sys.exit(2)
try:
    with open(sys.argv[1], encoding='utf-8') as f: d = json.load(f)
except Exception as e:
    print('JSON invalid:', e); sys.exit(1)
if not isinstance(d, dict) or not d.get('ok') or not isinstance(d.get('items'), list):
    print('răspuns neașteptat de la site:', str(d)[:120]); sys.exit(1)

def s(v, n): return str(v)[:n] if v not in (None, '') else ''
def num(v):
    try: return float(v) if v not in (None, '') else None
    except Exception: return None

items = []
for it in d['items'][:300]:
    if not isinstance(it, dict): continue
    prop = it.get('prop') if isinstance(it.get('prop'), dict) else {}
    est = it.get('est') if isinstance(it.get('est'), dict) else {}
    ct = it.get('contact') if isinstance(it.get('contact'), dict) else None
    p = {}
    for k, v in prop.items():
        if isinstance(v, bool): p[k] = v
        elif isinstance(v, (int, float)): p[k] = v
        elif isinstance(v, str): p[k] = v[:80]
    e = {k: round(num(v)) for k, v in est.items() if num(v) is not None}
    o = {'id': s(it.get('id'), 40), 'fel': 'lead' if it.get('fel') == 'lead' else 'evaluare', 't': s(it.get('t'), 40),
         'tip': s(it.get('tip'), 20), 'zonaNume': s(it.get('zonaNume'), 80), 'prop': p, 'est': e, 'pagina': s(it.get('pagina'), 200),
         'contact': {'nume': s(ct.get('nume'), 80), 'telefon': s(ct.get('telefon'), 30), 'email': s(ct.get('email'), 120), 'timeline': s(ct.get('timeline'), 40), 'mesaj': s(ct.get('mesaj'), 600)} if ct else None}
    if o['id'] and o['tip']: items.append(o)
items.sort(key=lambda o: o['t'], reverse=True)
out = {'items': items, 'n': len(items), 'nContact': sum(1 for o in items if o['contact']), 'updatedAt': int(time.time() * 1000), 'generat': s(d.get('generat'), 40)}
with open(sys.argv[2], 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
print('site/lista:', out['n'], 'înregistrări, dintre care', out['nContact'], 'cu contact →', sys.argv[2])
