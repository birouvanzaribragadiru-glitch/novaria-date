#!/usr/bin/env python3
# Scrie versiune.json pentru actualizarea automată: versiunea din sistem.py, noutățile (argumentul) și SHA-256 pentru fiecare fișier.
# Folosire, din folderul sistem/ al depozitului: python3 publica.py "Ce e nou, pe un rând"
import hashlib, json, os, re, sys
AICI = os.path.dirname(os.path.abspath(__file__))
FISIERE = ['sistem.py']                                   # doar ce ia Mac mini-ul singur; lansatorul nu se actualizează
cod = open(os.path.join(AICI, 'sistem.py'), encoding='utf-8').read()
versiune = re.search(r"^VERSIUNE = '([\d.]+)'", cod, re.M).group(1)
man = {'versiune': versiune, 'noutati': ' '.join(sys.argv[1:]).strip(),
       'fisiere': [{'nume': n, 'sha256': hashlib.sha256(open(os.path.join(AICI, n), 'rb').read()).hexdigest()} for n in FISIERE]}
json.dump(man, open(os.path.join(AICI, 'versiune.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(man, ensure_ascii=False, indent=1))
