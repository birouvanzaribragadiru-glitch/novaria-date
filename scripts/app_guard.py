#!/usr/bin/env python3
# Novaria — „paznicul” aplicațiilor: păstrează în baza aplicației principale (colecția app, vizibilă doar proprietarului)
# copia bună a fiecărei pagini publicate (în bucăți), ca un task zilnic să poată verifica și restaura.
#
#   store <pagina.html> <nume> <capabilities.json> <versionId> <dir-iesire> [<pagina-servita.html>]
#       → scrie <dir-iesire>/writes.json (loturi ArtifactData: app/<nume> + app/<nume>/chunks/<i>) și tipărește sha256
#       pagina servită (descărcată cu Artifact read path index.html) are un înveliș adăugat la publicare: sha256-ul ei
#       e cel cu care se compară paginile live (sha256Servit); bucățile păstrează pagina-sursă, cea care se republică
#   assemble <dir-cu-chunks> <meta.json> <iesire.html>
#       → lipește bucățile (fișierele <dir>/<i>.json scrise de ArtifactData cu out_dir), verifică sha256 și scrie pagina
#   check <pagina-descarcata.html> <meta.json>
#       → tipărește OK / DIFERIT (sha256-ul paginii live față de cel din meta)
import sys, os, json, hashlib, glob

CHUNK = 150000  # caractere pe bucată (documentele bazei rămân mici)

def sha(b): return hashlib.sha256(b).hexdigest()

def store(page, name, caps_path, version_id, out, served=None):
    html = open(page, encoding='utf-8').read()
    served_sha = sha(open(served, 'rb').read()) if served else None
    caps = json.load(open(caps_path, encoding='utf-8')) if caps_path and caps_path != '-' else None
    os.makedirs(out, exist_ok=True)
    parts = [html[i:i + CHUNK] for i in range(0, len(html), CHUNK)]
    h = sha(html.encode('utf-8'))
    meta = {'name': name, 'sha256': h, 'sha256Servit': served_sha, 'bytes': len(html.encode('utf-8')), 'chars': len(html), 'n': len(parts), 'versionId': version_id, 'capabilities': caps, 'storedAt': __import__('time').time() * 1000}
    writes = []
    mp = os.path.join(out, name + '.meta.json'); json.dump(meta, open(mp, 'w', encoding='utf-8'), ensure_ascii=False)
    writes.append({'op': 'set', 'collection': 'app', 'doc_id': name, 'file_path': mp})
    for i, p in enumerate(parts):
        fp = os.path.join(out, '%s.%d.json' % (name, i)); json.dump({'i': i, 'n': len(parts), 'sha256': h, 'data': p}, open(fp, 'w', encoding='utf-8'), ensure_ascii=False)
        writes.append({'op': 'set', 'collection': 'app/' + name + '/chunks', 'doc_id': str(i), 'file_path': fp})
    json.dump([writes[i:i + 50] for i in range(0, len(writes), 50)], open(os.path.join(out, 'writes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'ok': True, 'name': name, 'sha256': h, 'sha256Servit': served_sha, 'bytes': meta['bytes'], 'chunks': len(parts), 'writes': os.path.join(out, 'writes.json')}))

def load(p):
    d = json.load(open(p, encoding='utf-8'))
    if isinstance(d, dict) and isinstance(d.get('data'), dict) and 'sha256' in d['data']: d = d['data']
    return d

def assemble(dirp, meta_path, out_html):
    meta = load(meta_path)
    n = int(meta['n']); parts = {}
    for f in glob.glob(os.path.join(dirp, '*.json')):
        d = load(f)
        if isinstance(d, dict) and 'i' in d and 'data' in d: parts[int(d['i'])] = d['data']
    missing = [i for i in range(n) if i not in parts]
    if missing: print('REFUZ: lipsesc bucățile', missing); sys.exit(1)
    html = ''.join(parts[i] for i in range(n))
    h = sha(html.encode('utf-8'))
    if h != meta['sha256']: print('REFUZ: sha256 diferit după lipire', h, meta['sha256']); sys.exit(1)
    open(out_html, 'w', encoding='utf-8').write(html)
    print(json.dumps({'ok': True, 'sha256': h, 'bytes': len(html.encode('utf-8')), 'out': out_html, 'versionId': meta.get('versionId')}))

def check(page, meta_path):
    meta = load(meta_path); h = sha(open(page, 'rb').read()); ref = meta.get('sha256Servit') or meta['sha256']
    print('OK' if h == ref else 'DIFERIT', h, ref, 'versiune cunoscută:', meta.get('versionId'))

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(2)
    if a[0] == 'store': store(*a[1:7])
    elif a[0] == 'assemble': assemble(*a[1:4])
    elif a[0] == 'check': check(*a[1:3])
    else: print('comenzi: store | assemble | check'); sys.exit(2)
