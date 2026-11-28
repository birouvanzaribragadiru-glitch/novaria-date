# Teste pentru felia 1 (panou + alarme). Rulează pe Linux cu launchctl/sysctl/pgrep falși și Telegram simulat.
# Comportamentul verificat: ce mesaje primește Lucian și ce arată panoul, nu detaliile interne.
import ast, importlib.util, json, os, shutil, sys, tempfile, threading, time, urllib.request, urllib.error

AICI = os.path.dirname(os.path.abspath(__file__))
COD = os.path.join(AICI, '..', 'sistem.py')
FAKE = tempfile.mkdtemp()
ACASA = tempfile.mkdtemp()
os.environ['FAKE'] = FAKE
os.environ['SISTEM_ACASA'] = ACASA
os.environ['PATH'] = os.path.join(AICI, 'bin') + ':' + os.environ['PATH']

ast.parse(open(COD).read(), feature_version=(3, 9))          # merge pe Python-ul de pe Mac (3.9)

joburi = {'ro.lucian.cryptoradar': {'pid': 101}, 'ro.novaria.studio': {'pid': 102}, 'ro.novaria.colector': {'exit': 0}}
def seteaza(**schimbari):
    for k, v in schimbari.items():
        if v is None: joburi.pop(k, None)
        else: joburi[k] = v
    json.dump(joburi, open(os.path.join(FAKE, 'joburi.json'), 'w'))
seteaza()
open(os.path.join(FAKE, 'boot.txt'), 'w').write('1764140000')
open(os.path.join(FAKE, 'procese.txt'), 'w').write('Google Chrome\n')
json.dump({'telegram_token': 'x', 'telegram_chat_id': '42', 'port': 18790, 'adresa': '127.0.0.1', 'prag_disc_gb': 1, 'liniste': [23, 7],
           'verificari': [
               {'id': 'cr', 'nume': 'CryptoRadar', 'fel': 'launchd', 'eticheta': 'ro.lucian.cryptoradar', 'permanent': True},
               {'id': 'st', 'nume': 'Novaria Studio', 'fel': 'launchd', 'eticheta': 'ro.novaria.studio', 'permanent': True},
               {'id': 'co', 'nume': 'Colectorul Novaria', 'fel': 'launchd', 'eticheta': 'ro.novaria.colector', 'permanent': False},
               {'id': 'chrome', 'nume': 'Chrome (pentru colector)', 'fel': 'proces', 'proces': 'Google Chrome'},
               {'id': 'disc', 'nume': 'Spațiu pe disc', 'fel': 'disc'}]},
          open(os.path.join(ACASA, 'config.json'), 'w'))

spec = importlib.util.spec_from_file_location('sistem', COD)
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
trimise = []
def tg_fals(metoda, campuri, timeout=30):
    trimise.append((metoda, dict(campuri)))
    return {'ok': True, 'result': []}
s.telegram = tg_fals
def mesaje(): return [c['text'] for m, c in trimise if m == 'sendMessage']

reusite = 0
def verifica(conditie, ce):
    global reusite
    if not conditie:
        print('PICAT:', ce); print('  mesaje:', mesaje()); sys.exit(1)
    reusite += 1; print('ok  ', ce)

T0 = 1764150000.0
# 1. totul merge → nicio alarmă
verifica(s.tura(T0) == [], 'când totul merge, nu primește niciun mesaj')
# 2. CryptoRadar cade → o alarmă
seteaza(**{'ro.lucian.cryptoradar': {'exit': 1}})
m = s.tura(T0 + 300)
verifica(len(m) == 1 and m[0].startswith('🔴 CryptoRadar') and 's-a oprit' in m[0], 'CryptoRadar oprit → o singură alarmă 🔴 cu motivul')
# 3. tot căzut, după 5 minute → liniște
verifica(s.tura(T0 + 600) == [], 'tot oprit după 5 minute → nu mai repetă alarma')
# 4. după 3 ore → reamintire
m = s.tura(T0 + 300 + 3 * 3600)
verifica(len(m) == 1 and m[0].startswith('⏰ Tot stricat: CryptoRadar'), 'tot oprit după 3 ore → o reamintire ⏰')
# 5. își revine → mesaj verde
seteaza(**{'ro.lucian.cryptoradar': {'pid': 111}})
m = s.tura(T0 + 4 * 3600)
verifica(len(m) == 1 and m[0].startswith('🟢 CryptoRadar și-a revenit'), 'CryptoRadar repornit → mesaj 🟢 „și-a revenit”')
# 6. Studio descărcat complet din launchd
seteaza(**{'ro.novaria.studio': None})
m = s.tura(T0 + 5 * 3600)
verifica(len(m) == 1 and 'Novaria Studio' in m[0] and 'nu e pornit deloc' in m[0], 'Novaria Studio scos din launchd → alarmă „nu e pornit deloc”')
seteaza(**{'ro.novaria.studio': {'pid': 102}}); s.tura(T0 + 5 * 3600 + 60)
# 7. job periodic: fără PID e normal; codul de ieșire ≠ 0 e problemă
verifica(s.citeste_stare()['verificari']['co']['ok'], 'colectorul periodic fără PID dar cu ieșire 0 → considerat OK')
seteaza(**{'ro.novaria.colector': {'exit': 78}})
m = s.tura(T0 + 6 * 3600)
verifica(len(m) == 1 and 'Colectorul Novaria' in m[0] and 'cod 78' in m[0], 'colectorul periodic cu eroare → alarmă cu codul')
seteaza(**{'ro.novaria.colector': {'exit': 0}}); s.tura(T0 + 6 * 3600 + 60)
# 8. Chrome închis
open(os.path.join(FAKE, 'procese.txt'), 'w').write('')
m = s.tura(T0 + 7 * 3600)
verifica(len(m) == 1 and 'Chrome' in m[0] and 'nu e deschis' in m[0], 'Chrome închis → alarmă')
open(os.path.join(FAKE, 'procese.txt'), 'w').write('Google Chrome\n'); s.tura(T0 + 7 * 3600 + 60)
# 9. disc aproape plin
s.PRAG_DISC_GB = 10 ** 9
m = s.tura(T0 + 8 * 3600)
verifica(len(m) == 1 and 'Spațiu pe disc' in m[0] and 'sub pragul' in m[0], 'disc sub prag → alarmă cu GB liberi')
s.PRAG_DISC_GB = 1; s.tura(T0 + 8 * 3600 + 60)
# 10. repornire
open(os.path.join(FAKE, 'boot.txt'), 'w').write('1764190000')
m = s.tura(T0 + 9 * 3600)
verifica(len(m) == 1 and m[0].startswith('🔄 Mac mini-ul a repornit'), 'Mac mini repornit → mesaj 🔄')
# 11. o verificare care aruncă eroare nu le oprește pe celelalte
vechi = s.FEL['disc']; s.FEL['disc'] = lambda v: 1 / 0
m = s.tura(T0 + 10 * 3600)
st = s.citeste_stare()['verificari']
verifica(len(m) == 1 and 'verificarea a dat eroare' in m[0] and st['cr']['ok'], 'verificare stricată → alarmă clară, restul merg')
s.FEL['disc'] = vechi; s.tura(T0 + 10 * 3600 + 60)
# 12. sunet: noaptea mesajele vin fără sunet, ziua cu sunet
trimise.clear(); s.LINISTE = [0, 24]; s.trimite('noapte')
verifica(trimise[-1][1]['disable_notification'] == 'true', 'în orele de liniște, alarma vine fără sunet')
s.LINISTE = [24, 0]; s.trimite('zi')
verifica(trimise[-1][1]['disable_notification'] == 'false', 'ziua, alarma vine cu sunet')
# 13. /stare: răspunde doar lui Lucian
raspunsuri = iter([{'ok': True, 'result': [
    {'update_id': 1, 'message': {'chat': {'id': 999}, 'text': '/stare'}},
    {'update_id': 2, 'message': {'chat': {'id': 42}, 'text': '/stare'}}]}])
def tg_ascultare(metoda, campuri, timeout=30):
    if metoda == 'getUpdates':
        try: return next(raspunsuri)
        except StopIteration: raise SystemExit
    return tg_fals(metoda, campuri, timeout)
trimise.clear(); s.telegram = tg_ascultare
try: s.asculta()
except SystemExit: pass
s.telegram = tg_fals
txt = [c for m, c in trimise if m == 'sendMessage']
verifica(len(txt) == 1 and txt[0]['chat_id'] == '42' and txt[0]['text'].startswith('✅ Totul merge') and 'CryptoRadar' in txt[0]['text'],
         '/stare → rezumat doar pentru chatul lui Lucian, străinii sunt ignorați')
# 14. panoul
threading.Thread(target=lambda: s.ThreadingHTTPServer(('127.0.0.1', 18790), s.Panou).serve_forever(), daemon=True).start(); time.sleep(0.3)
seteaza(**{'ro.lucian.cryptoradar': {'exit': 1}}); s.tura(T0 + 11 * 3600)
pag = urllib.request.urlopen('http://127.0.0.1:18790/').read().decode()
verifica('1 din 5 au probleme' in pag and 'CryptoRadar' in pag and 'Spațiu pe disc' in pag and "class='card r'" in pag, 'panoul arată 5 sisteme, CryptoRadar marcat cu roșu')
js = json.loads(urllib.request.urlopen('http://127.0.0.1:18790/api/stare').read())
verifica(js['verificari']['cr']['ok'] is False and 'telegram_token' not in json.dumps(js), '/api/stare dă starea, fără token')
try: urllib.request.urlopen('http://127.0.0.1:18790/config.json'); verifica(False, '404')
except urllib.error.HTTPError as e: verifica(e.code == 404, 'config.json nu se poate citi din panou (404)')
# 15. alarmele nu ajung (chat ID greșit) → panoul o spune clar; când ajung din nou, avertismentul dispare
s.telegram = lambda m, c, timeout=30: {'ok': False, 'error_code': 400, 'description': 'Bad Request: chat not found'}
verifica(s.trimite('probă') is False, 'trimite() raportează eșecul')
pag = urllib.request.urlopen('http://127.0.0.1:18790/').read().decode()
verifica('Alarmele pe Telegram nu ajung: Bad Request: chat not found' in pag, 'panoul arată că alarmele nu ajung și de ce')
s.telegram = tg_fals; s.trimite('probă')
pag = urllib.request.urlopen('http://127.0.0.1:18790/').read().decode()
verifica('nu ajung' not in pag, 'după un mesaj reușit, avertismentul dispare')
verifica('verificari' in s.citeste_stare() and s.citeste_stare()['verificari']['cr']['nume'] == 'CryptoRadar', 'starea verificărilor rămâne întreagă după ce trimite() scrie')
# 16. raportul de dimineață: o dată pe zi, după 07:30, cu ce s-a întâmplat noaptea
from datetime import datetime as _dt
def la(zi, h, m): return _dt(2026, 11, zi, h, m).timestamp()
st = s.citeste_stare(); st.update({'ultimul_raport_zi': '2026-11-28', 'ultimul_raport_la': la(28, 7, 31), 'evenimente': []}); s.scrie_stare(st)
seteaza(**{'ro.lucian.cryptoradar': {'pid': 101}}); s.tura(la(28, 7, 0))
trimise.clear()
verifica(s.verifica_raport(la(29, 7, 10)) is False and not mesaje(), 'înainte de 07:30 nu trimite raportul')
open(os.path.join(FAKE, 'procese.txt'), 'w').write(''); s.tura(la(29, 2, 14))
open(os.path.join(FAKE, 'procese.txt'), 'w').write('Google Chrome\n'); s.tura(la(29, 2, 19))
trimise.clear()
verifica(s.verifica_raport(la(29, 7, 32)) is True, 'la 07:32 trimite raportul')
r = mesaje()[-1]
verifica(r.startswith('☀️ Noaptea pe Mac mini — duminică 29.11'), 'raportul începe cu ziua și data')
verifica('02:14 🔴 Chrome' in r and '02:19 🟢 Chrome' in r, 'raportul listează ce s-a stricat și ce și-a revenit noaptea, cu ora')
verifica('07:00' not in r and '✅ Totul merge' in r, 'nu repetă ce a fost înainte de raportul trecut; arată starea de acum')
verifica([c for m, c in trimise if m == 'sendMessage'][-1]['disable_notification'] == 'true', 'raportul vine fără sunet')
trimise.clear()
verifica(s.verifica_raport(la(29, 7, 37)) is False and not mesaje(), 'nu-l trimite a doua oară în aceeași zi')
verifica(s.verifica_raport(la(30, 7, 31)) is True and 'Liniște: nicio problemă' in mesaje()[-1], 'a doua zi, noapte liniștită → „Liniște”')
# 17. actualizarea automată (server local în loc de GitHub)
import hashlib, subprocess, functools, http.server
os.environ['NO_PROXY'] = os.environ['no_proxy'] = '127.0.0.1,localhost'
DEP = tempfile.mkdtemp()
threading.Thread(target=http.server.ThreadingHTTPServer(('127.0.0.1', 18799), functools.partial(http.server.SimpleHTTPRequestHandler, directory=DEP)).serve_forever, daemon=True).start()
s.SURSA = 'http://127.0.0.1:18799/'
open(os.path.join(ACASA, 'sistem.py'), 'w').write('# versiunea instalata\n')
def publica(versiune, fisiere, sha_gresit=False, noutati='Raport mai clar.'):
    man = {'versiune': versiune, 'noutati': noutati, 'fisiere': []}
    for n, cod in fisiere.items():
        open(os.path.join(DEP, n), 'w').write(cod)
        man['fisiere'].append({'nume': n, 'sha256': '0' * 64 if sha_gresit else hashlib.sha256(cod.encode()).hexdigest()})
    json.dump(man, open(os.path.join(DEP, 'versiune.json'), 'w'))
instalat = lambda: open(os.path.join(ACASA, 'sistem.py')).read()
publica('1.3', {'sistem.py': 'x = 1\n'})
verifica(s.cauta_actualizare() is None, 'aceeași versiune → nu face nimic')
publica('1.4', {'sistem.py': 'x = 2\n'}, sha_gresit=True)
verifica(s.cauta_actualizare() is None and instalat() == '# versiunea instalata\n', 'fișier descărcat cu alt SHA-256 → refuzat, nimic schimbat')
publica('1.4', {'sistem.py': 'def f(:\n'})
verifica(s.cauta_actualizare() is None and instalat() == '# versiunea instalata\n', 'cod cu greșeală de scriere → refuzat, nimic schimbat')
publica('1.4', {'config.json': '{}'})
verifica(s.cauta_actualizare() is None, 'un fișier care nu e cod (config.json) → refuzat')
publica('1.4', {'porneste.py': 'x = 1\n'})
verifica(s.cauta_actualizare() is None, 'lansatorul nu poate fi înlocuit de o actualizare')
publica('1.4', {'sistem.py': 'x = 4\n'})
verifica(s.cauta_actualizare() == '1.4' and instalat() == 'x = 4\n' and open(os.path.join(ACASA, 'sistem.py.vechi')).read() == '# versiunea instalata\n',
         'versiune nouă bună → instalată, cea veche păstrată ca .vechi')
pr = json.load(open(os.path.join(ACASA, 'proba.json')))
verifica(pr['versiune'] == '1.4' and pr['de_la'] == '1.3' and pr['fisiere'] == ['sistem.py'], 'lasă proba.json pentru lansator')
trimise.clear(); s.VERSIUNE = '1.4'; s.confirma_pornirea(); s.VERSIUNE = '1.3'
verifica(not os.path.exists(os.path.join(ACASA, 'proba.json')) and mesaje() and mesaje()[-1].startswith('⬆️ Sistemul AI s-a actualizat singur: v1.3 → v1.4') and 'Raport mai clar.' in mesaje()[-1],
         'după pornire: anunță pe Telegram actualizarea, cu noutățile')
json.dump({'versiune': '1.5', 'de_la': '1.4'}, open(os.path.join(ACASA, 'revenit.json'), 'w'))
trimise.clear(); s.confirma_pornirea()
verifica('⚠️ Versiunea 1.5 n-a pornit' in mesaje()[-1] and s.citeste_stare().get('versiune_refuzata') == '1.5', 'după o revenire: anunță și ține minte versiunea refuzată')
publica('1.5', {'sistem.py': 'x = 5\n'})
verifica(s.cauta_actualizare() is None, 'nu mai încearcă versiunea refuzată')
# lansatorul, cu procese reale: versiunea nouă cade la pornire → după 3 încercări revine la cea veche
L = tempfile.mkdtemp(); env = dict(os.environ, SISTEM_ACASA=L)
shutil.copy(os.path.join(AICI, '..', 'porneste.py'), L)
open(os.path.join(L, 'sistem.py'), 'w').write('raise SystemExit(3)\n')
open(os.path.join(L, 'sistem.py.vechi'), 'w').write('import os\nopen(os.path.join(os.environ["SISTEM_ACASA"], "a_pornit"), "w").write("vechi")\n')
json.dump({'versiune': '2.0', 'de_la': '1.9', 'fisiere': ['sistem.py'], 'incercari': 0}, open(os.path.join(L, 'proba.json'), 'w'))
coduri = [subprocess.run([sys.executable, os.path.join(L, 'porneste.py')], env=env).returncode for _ in range(4)]
verifica(coduri[:3] == [3, 3, 3], 'versiunea stricată cade de 3 ori (launchd o tot repornește)')
verifica(coduri[3] == 0 and open(os.path.join(L, 'a_pornit')).read() == 'vechi' and json.load(open(os.path.join(L, 'revenit.json')))['versiune'] == '2.0'
         and not os.path.exists(os.path.join(L, 'proba.json')), 'a patra oară lansatorul pune la loc versiunea veche și notează revenirea')
print(f'\n{reusite} verificări trecute')
shutil.rmtree(FAKE); shutil.rmtree(ACASA)
