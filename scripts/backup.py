#!/usr/bin/env python3
# Novaria — copia de siguranță a bazei aplicației interne: arhivă tar.gz criptată AES-256 (openssl, pbkdf2), în folderul backup/ al depozitului.
# Depozitul e public, deci arhiva NU se urcă necriptată niciodată: scriptul refuză să scrie fără cheie și verifică singur că arhiva se decriptează.
#   NV_BACKUP_KEY=<cheie> python3 -I scripts/backup.py <dir-dump> backup/
# <dir-dump> conține subfoldere pe colecții (așa cum le scrie ArtifactData cu out_dir): <colecție>/<doc>.json
# Păstrează ultimele PASTREAZA arhive; scrie backup/README.md (fără cheie) și tipărește un rând JSON cu rezultatul.
import os, sys, json, tarfile, subprocess, datetime, hashlib, tempfile, glob

PASTREAZA = 6
if len(sys.argv) < 3:
    print('folosire: NV_BACKUP_KEY=... backup.py <dir-dump> <dir-backup>'); sys.exit(2)
src, out = sys.argv[1], sys.argv[2]
key = os.environ.get('NV_BACKUP_KEY', '').strip()
if len(key) < 24:
    print('REFUZ: lipsește cheia (NV_BACKUP_KEY, minimum 24 de caractere); arhiva nu se scrie necriptată.'); sys.exit(1)
if not os.path.isdir(src):
    print('REFUZ: nu găsesc folderul cu date', src); sys.exit(1)

# toate colecțiile, inclusiv subcolecțiile (agenti/<id>/…, app/<id>/chunks): calea relativă se păstrează în arhivă
files = sorted(glob.glob(os.path.join(src, '**', '*.json'), recursive=True))
colls = {}
for f in files:
    c = os.path.relpath(os.path.dirname(f), src)
    colls[c] = colls.get(c, 0) + 1
if len(files) < 50:
    print('REFUZ: prea puține documente în dump (%d); ceva nu s-a citit.' % len(files)); sys.exit(1)

today = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
os.makedirs(out, exist_ok=True)
name = 'novaria-%s.tar.gz.enc' % today
dest = os.path.join(out, name)
with tempfile.TemporaryDirectory() as tmp:
    tgz = os.path.join(tmp, 'novaria.tar.gz')
    with tarfile.open(tgz, 'w:gz') as tf:
        for f in files:
            tf.add(f, arcname=os.path.relpath(f, src))
        meta = os.path.join(tmp, 'META.json')
        with open(meta, 'w', encoding='utf-8') as m: json.dump({'data': today, 'colectii': colls, 'documente': len(files), 'format': 'ArtifactData out_dir, un JSON pe document'}, m, ensure_ascii=False)
        tf.add(meta, arcname='META.json')
    raw = os.path.getsize(tgz)
    # criptare (parola prin fișier, nu prin linia de comandă)
    pw = os.path.join(tmp, 'pw'); open(pw, 'w').write(key)
    r = subprocess.run(['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', tgz, '-out', dest, '-pass', 'file:' + pw], capture_output=True, text=True)
    if r.returncode != 0:
        print('REFUZ: criptarea a eșuat:', r.stderr.strip()[:200]); sys.exit(1)
    # verificare: se decriptează și arhiva e întreagă
    chk = os.path.join(tmp, 'check.tar.gz')
    r = subprocess.run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', dest, '-out', chk, '-pass', 'file:' + pw], capture_output=True, text=True)
    ok = r.returncode == 0 and hashlib.sha256(open(chk, 'rb').read()).hexdigest() == hashlib.sha256(open(tgz, 'rb').read()).hexdigest()
    if not ok:
        os.remove(dest); print('REFUZ: verificarea decriptării a picat; arhiva a fost ștearsă.'); sys.exit(1)
    with tarfile.open(chk, 'r:gz') as tf: n_in = len([m for m in tf.getmembers() if m.isfile()])
    if n_in != len(files) + 1:
        os.remove(dest); print('REFUZ: arhiva nu are toate fișierele (%d vs %d).' % (n_in, len(files) + 1)); sys.exit(1)

# curățenie: ultimele PASTREAZA arhive
old = sorted(glob.glob(os.path.join(out, 'novaria-*.tar.gz.enc')))
removed = []
for f in old[:-PASTREAZA]:
    os.remove(f); removed.append(os.path.basename(f))

readme = """# Copia de siguranță a bazei Novaria Evaluator

Arhive săptămânale `novaria-AAAA-LL-ZZ.tar.gz.enc`: toate colecțiile aplicației interne (un JSON pe document, în foldere pe colecții),
criptate AES-256-CBC (openssl, PBKDF2 200.000 iterații). Depozitul e public: fără cheie, fișierele nu pot fi citite.
Cheia e în aplicație (Setări → Copia de siguranță) și trebuie păstrată separat.

Restaurare (pe orice calculator cu openssl):

    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in novaria-AAAA-LL-ZZ.tar.gz.enc -out novaria.tar.gz
    tar xzf novaria.tar.gz

Reîncărcarea în aplicație se face cu ArtifactData (batch set, câte 50 de documente), colecție cu colecție.
Se păstrează ultimele %d arhive.
""" % PASTREAZA
with open(os.path.join(out, 'README.md'), 'w', encoding='utf-8') as f: f.write(readme)
print(json.dumps({'ok': True, 'fisier': name, 'marime': os.path.getsize(dest), 'brut': raw, 'documente': len(files), 'colectii': colls, 'sterse': removed}, ensure_ascii=False))
