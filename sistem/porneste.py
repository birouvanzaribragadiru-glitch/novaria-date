#!/usr/bin/env python3
# Lansatorul Sistemului AI: pe el îl pornește launchd, iar el pornește sistem.py.
# Nu se actualizează singur, ca să poată repara o actualizare stricată:
# dacă o versiune nouă cade de 3 ori la pornire, pune la loc fișierele de dinainte (*.vechi).
import json, os, shutil, sys

ACASA = os.path.expanduser(os.environ.get('SISTEM_ACASA', '~/SistemAI'))
PROBA = os.path.join(ACASA, 'proba.json')

try:
    p = json.load(open(PROBA, encoding='utf-8'))
except (OSError, ValueError):
    p = None
if p:
    p['incercari'] = p.get('incercari', 0) + 1
    if p['incercari'] > 3:
        for n in p.get('fisiere', []):
            vechi = os.path.join(ACASA, n + '.vechi')
            if os.path.exists(vechi):
                shutil.copy2(vechi, os.path.join(ACASA, n))
        json.dump({'versiune': p.get('versiune'), 'de_la': p.get('de_la')},
                  open(os.path.join(ACASA, 'revenit.json'), 'w', encoding='utf-8'))
        os.remove(PROBA)
    else:
        json.dump(p, open(PROBA, 'w', encoding='utf-8'))
os.execv(sys.executable, [sys.executable, os.path.join(ACASA, 'sistem.py')])
