#!/usr/bin/env python3
# Sistemul AI al lui Lucian — felia 1: panou + alarme, pe Mac mini.
# La fiecare 5 minute verifică sistemele care rulează pe Mac mini (CryptoRadar, Novaria Studio, colectorul, Chrome,
# spațiul pe disc, repornirile) și scrie pe Telegram doar când ceva se strică, când își revine și, cât timp e stricat,
# o dată la 3 ore. Panoul se deschide din rețeaua de acasă/birou; de oriunde, /stare în Telegram.
# Doar biblioteca standard Python (3.9+). Pornește singur la boot și se repornește dacă cade (launchd).
#
# Configurare: ~/SistemAI/config.json (o scrie Instalare.command; tokenul nu apare nicăieri altundeva)
import hashlib, html, json, os, plistlib, re, shutil, subprocess, sys, threading, time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ACASA = os.path.expanduser(os.environ.get('SISTEM_ACASA', '~/SistemAI'))
CFG = json.load(open(os.path.join(ACASA, 'config.json'), encoding='utf-8'))
STARE_CALE = os.path.join(ACASA, 'stare.json')
JURNAL = os.path.join(ACASA, 'sistem.log')
INTERVAL = int(CFG.get('interval_secunde', 300))
REAMINTIRE = int(CFG.get('reamintire_ore', 3)) * 3600
PRAG_DISC_GB = float(CFG.get('prag_disc_gb', 15))
LINISTE = CFG.get('liniste', [23, 7])          # între orele astea, mesajele vin fără sunet
blocaj = threading.Lock()
VERSIUNE = '1.3'
SURSA = CFG.get('actualizari_url', 'https://raw.githubusercontent.com/birouvanzaribragadiru-glitch/novaria-date/main/sistem/')


def jurnal(mesaj):
    try:
        if os.path.exists(JURNAL) and os.path.getsize(JURNAL) > 1_000_000:
            os.replace(JURNAL, JURNAL + '.1')
        with open(JURNAL, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {mesaj}\n")
    except OSError:
        pass


def ruleaza(cmd, intrare=None, timeout=30):
    try:
        r = subprocess.run(cmd, input=intrare, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout
    except (OSError, subprocess.TimeoutExpired):
        return -1, ''


# ------------------------------------------------------------------ Telegram (prin curl: tokenul nu apare în lista de procese)
def telegram(metoda, campuri, timeout=30):
    token = CFG.get('telegram_token')
    if not token:
        return None
    args = ['/usr/bin/curl', '-s', '-m', str(timeout), '-K', '-']
    for k, v in campuri.items():
        args += ['--data-urlencode', f'{k}={v}']
    cod, iesire = ruleaza(args, intrare=f'url = "https://api.telegram.org/bot{token}/{metoda}"\n', timeout=timeout + 5)
    try:
        return json.loads(iesire) if cod == 0 else None
    except ValueError:
        return None


def trimite(text, sunet=True):
    acum = datetime.now().hour
    a, b = LINISTE
    noaptea = acum >= a or acum < b
    r = telegram('sendMessage', {'chat_id': CFG.get('telegram_chat_id', ''), 'text': text,
                                 'disable_notification': 'true' if (noaptea or not sunet) else 'false'})
    ok = bool(r and r.get('ok'))
    if not ok:
        jurnal('Telegram n-a primit mesajul: ' + text.splitlines()[0] + ' — ' + str((r or {}).get('description', 'fără răspuns')))
    with blocaj:                                          # panoul arată dacă alarmele chiar ajung
        st = citeste_stare()
        st['telegram'] = {'ok': ok, 'la': time.time(), 'eroare': None if ok else (r or {}).get('description', 'fără răspuns de la Telegram')}
        scrie_stare(st)
    return ok


# ------------------------------------------------------------------ verificările
def job_launchd(eticheta):
    """(rulează_acum, ultimul_cod_de_ieșire) pentru un job launchd al utilizatorului; None dacă nu e încărcat."""
    cod, iesire = ruleaza(['launchctl', 'list', eticheta])
    if cod != 0:
        return None
    pid = re.search(r'"PID"\s*=\s*(\d+)', iesire)
    ies = re.search(r'"LastExitStatus"\s*=\s*(-?\d+)', iesire)
    return bool(pid), int(ies.group(1)) if ies else 0


def verifica_job(v):
    st = job_launchd(v['eticheta'])
    if st is None:
        return False, 'nu e pornit deloc (launchd nu-l are încărcat)'
    ruleaza_acum, ies = st
    if v.get('permanent', True):
        return (True, 'rulează') if ruleaza_acum else (False, f's-a oprit (ultimul cod: {ies}); launchd încearcă să-l repornească')
    return (True, 'ultima rulare a mers') if ies == 0 else (False, f'ultima rulare a dat eroare (cod {ies})')


def verifica_proces(v):
    cod, _ = ruleaza(['pgrep', '-x', v['proces']])
    return (True, 'deschis') if cod == 0 else (False, 'nu e deschis')


def verifica_disc(_v):
    t, _, liber = shutil.disk_usage(CFG.get('disc', os.path.expanduser('~')))
    gb, total = liber / 1e9, t / 1e9
    text = f'{gb:.0f} GB liberi din {total:.0f} GB'
    return (gb >= PRAG_DISC_GB, text if gb >= PRAG_DISC_GB else text + f' (sub pragul de {PRAG_DISC_GB:.0f} GB)')


FEL = {'launchd': verifica_job, 'proces': verifica_proces, 'disc': verifica_disc}


def pornit_la():
    cod, iesire = ruleaza(['sysctl', '-n', 'kern.boottime'])
    m = re.search(r'sec = (\d+)', iesire) if cod == 0 else None
    return int(m.group(1)) if m else None


def citeste_stare():
    try:
        return json.load(open(STARE_CALE, encoding='utf-8'))
    except (OSError, ValueError):
        return {'verificari': {}}


def scrie_stare(st):
    tmp = STARE_CALE + '.tmp'
    json.dump(st, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, STARE_CALE)


def ora(ts):
    return datetime.fromtimestamp(ts).strftime('%d.%m %H:%M') if ts else '—'


def tura(acum=None):
    """O tură de verificări. Întoarce mesajele trimise (pentru teste)."""
    acum = acum or time.time()
    mesaje = []
    with blocaj:
        st = citeste_stare()
        vechi = st.get('verificari', {})
        noi = {}
        for v in CFG.get('verificari', []):
            try:
                ok, detaliu = FEL[v['fel']](v)
            except Exception as e:                       # o verificare stricată nu oprește celelalte
                ok, detaliu = False, f'verificarea a dat eroare: {e}'
            p = vechi.get(v['id'], {})
            r = {'nume': v['nume'], 'ok': ok, 'detaliu': detaliu,
                 'din': p.get('din', acum) if p.get('ok') == ok else acum,
                 'anuntat': p.get('anuntat') if p.get('ok') == ok else None}
            if not ok and (p.get('ok') is not False or acum - (p.get('anuntat') or 0) >= REAMINTIRE):
                prima = p.get('ok') is not False
                mesaje.append(('🔴 ' if prima else '⏰ Tot stricat: ') + f"{v['nume']} — {detaliu}"
                              + ('' if prima else f" (din {ora(r['din'])})"))
                r['anuntat'] = acum
            elif ok and p.get('ok') is False:
                mesaje.append(f"🟢 {v['nume']} și-a revenit (a fost stricat din {ora(p.get('din'))})")
            noi[v['id']] = r
        boot = pornit_la()
        if boot and st.get('pornit_la') and boot != st['pornit_la']:
            mesaje.append(f'🔄 Mac mini-ul a repornit la {ora(boot)} (pană de curent sau actualizare?)')
        st.update({'verificari': noi, 'pornit_la': boot or st.get('pornit_la'), 'ultima_tura': acum,
                   'evenimente': (st.get('evenimente', []) + [{'la': acum, 'text': m} for m in mesaje])[-200:]})
        scrie_stare(st)
    for m in mesaje:
        jurnal(m)
        trimite(m)
    return mesaje


def rezumat():
    st = citeste_stare()
    v = st.get('verificari', {})
    if not v:
        return 'Încă n-am făcut prima verificare.'
    rau = [x for x in v.values() if not x['ok']]
    cap = '✅ Totul merge' if not rau else f'⚠️ {len(rau)} cu probleme'
    linii = [f"{'🟢' if x['ok'] else '🔴'} {x['nume']}: {x['detaliu']}" for x in sorted(v.values(), key=lambda x: x['ok'])]
    return f"{cap} — verificat la {ora(st.get('ultima_tura'))}\n" + '\n'.join(linii)


ZILE = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică']


def raport(acum=None):
    """Ce s-a întâmplat pe Mac mini de la raportul trecut (sau din ultimele 24 de ore) și cum stă acum."""
    acum = acum or time.time()
    st = citeste_stare()
    de_la = st.get('ultimul_raport_la') or acum - 86400
    ev = [e for e in st.get('evenimente', []) if e['la'] > de_la]
    zi = datetime.fromtimestamp(acum)
    linii = [f"☀️ Noaptea pe Mac mini — {ZILE[zi.weekday()]} {zi:%d.%m}", '', rezumat()]
    linii += ['', 'De la raportul trecut:'] + [f"• {datetime.fromtimestamp(e['la']):%H:%M} {e['text']}" for e in ev] if ev \
        else ['', 'Liniște: nicio problemă de la raportul trecut.']
    linii += ['', f"Mac mini-ul e pornit din {ora(st.get('pornit_la'))}.",
              'Ce ai lucrat ieri, ce urmează și ideile vin de la Claude, în aplicația Claude.']
    return '\n'.join(linii)


def verifica_raport(acum=None):
    """Trimite raportul o dată pe zi, după ora din config (implicit 07:30). Întoarce True dacă l-a trimis."""
    acum = acum or time.time()
    h, m = map(int, CFG.get('raport_ora', '07:30').split(':'))
    t = datetime.fromtimestamp(acum)
    azi = t.strftime('%Y-%m-%d')
    with blocaj:
        st = citeste_stare()
        if (t.hour, t.minute) < (h, m) or st.get('ultimul_raport_zi') == azi:
            return False
    text = raport(acum)
    with blocaj:
        st = citeste_stare()
        st.update({'ultimul_raport_zi': azi, 'ultimul_raport_la': acum})
        scrie_stare(st)
    trimite(text, sunet=False)
    return True


# ------------------------------------------------------------------ actualizare automată
# Versiunile noi stau în depozitul public novaria-date, folderul sistem/: versiune.json + fișierele.
# Se iau doar fișierele din listă, fiecare verificat cu SHA-256; .py trebuie să compileze.
# Lansatorul (porneste.py) pune la loc versiunea veche dacă cea nouă nu pornește.
NUME_PERMIS = re.compile(r'^[a-z0-9_]+\.(py|md)$')
NEATINSE = {'porneste.py'}


def descarca(url, timeout=60):
    try:
        r = subprocess.run(['/usr/bin/curl', '-fsSL', '-m', str(timeout), url], capture_output=True, timeout=timeout + 10)
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def nr_versiune(v):
    return tuple(int(x) for x in re.findall(r'\d+', str(v)))


def cauta_actualizare():
    """Instalează versiunea nouă dacă există. Întoarce versiunea instalată sau None. Nu repornește singură."""
    brut = descarca(SURSA + 'versiune.json', timeout=30)
    try:
        man = json.loads(brut) if brut else None
    except ValueError:
        man = None
    if not man or not isinstance(man.get('fisiere'), list):
        return None
    noua = str(man.get('versiune', ''))
    if nr_versiune(noua) <= nr_versiune(VERSIUNE) or noua == citeste_stare().get('versiune_refuzata'):
        return None
    fisiere = {}
    for f in man['fisiere']:
        n = f.get('nume', '')
        if not NUME_PERMIS.match(n) or n in NEATINSE:
            jurnal(f'actualizarea {noua} refuzată: fișier nepermis {n!r}')
            return None
        b = descarca(SURSA + n)
        if b is None or hashlib.sha256(b).hexdigest() != f.get('sha256'):
            jurnal(f'actualizarea {noua} refuzată: {n} nu s-a descărcat întreg (SHA-256 diferit)')
            return None
        if n.endswith('.py'):
            try:
                compile(b, n, 'exec')
            except SyntaxError as e:
                jurnal(f'actualizarea {noua} refuzată: {n} are o greșeală de scriere ({e})')
                return None
        fisiere[n] = b
    for n, b in fisiere.items():
        open(os.path.join(ACASA, n + '.nou'), 'wb').write(b)
    for n in fisiere:
        tinta = os.path.join(ACASA, n)
        if os.path.exists(tinta):
            shutil.copy2(tinta, tinta + '.vechi')
        os.replace(tinta + '.nou', tinta)
    json.dump({'versiune': noua, 'de_la': VERSIUNE, 'noutati': man.get('noutati', ''), 'fisiere': list(fisiere), 'incercari': 0},
              open(os.path.join(ACASA, 'proba.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    jurnal(f'actualizat la {noua}; repornesc')
    return noua


def confirma_pornirea():
    """După prima tură reușită: anunță actualizarea făcută sau revenirea la versiunea veche."""
    p_cale, r_cale = os.path.join(ACASA, 'proba.json'), os.path.join(ACASA, 'revenit.json')
    try:
        p = json.load(open(p_cale, encoding='utf-8'))
        os.remove(p_cale)
        trimite(f"⬆️ Sistemul AI s-a actualizat singur: v{p.get('de_la')} → v{VERSIUNE}" + (f"\n{p['noutati']}" if p.get('noutati') else ''), sunet=False)
    except (OSError, ValueError):
        pass
    try:
        r = json.load(open(r_cale, encoding='utf-8'))
        os.remove(r_cale)
        with blocaj:
            st = citeste_stare()
            st['versiune_refuzata'] = r.get('versiune')
            scrie_stare(st)
        trimite(f"⚠️ Versiunea {r.get('versiune')} n-a pornit pe Mac mini, așa că am revenit singur la v{VERSIUNE}. "
                'Alarmele merg ca înainte; spune-i lui Claude să repare versiunea nouă.')
    except (OSError, ValueError):
        pass


def actualizeaza_si_reporneste():
    if cauta_actualizare():
        os._exit(0)                                       # launchd îl pornește din nou, prin porneste.py, cu versiunea nouă


# ------------------------------------------------------------------ Telegram: /stare de oriunde
def asculta():
    deplasare = 0
    while True:
        r = telegram('getUpdates', {'timeout': 25, 'offset': deplasare, 'allowed_updates': '["message"]'}, timeout=35)
        if not r or not r.get('ok'):
            time.sleep(20)
            continue
        for u in r.get('result', []):
            deplasare = u['update_id'] + 1
            m = u.get('message') or {}
            if str((m.get('chat') or {}).get('id')) != str(CFG.get('telegram_chat_id')):
                continue                                  # răspunde doar lui Lucian
            text = (m.get('text') or '').strip().lower()
            if text.startswith('/stare') or text.startswith('/start'):
                trimite(rezumat(), sunet=False)
            elif text.startswith('/verifica'):
                tura()
                trimite(rezumat(), sunet=False)
            elif text.startswith('/raport'):
                trimite(raport(), sunet=False)
            elif text.startswith('/versiune'):
                trimite(f'Sistemul AI v{VERSIUNE}. Caut actualizări…', sunet=False)
                actualizeaza_si_reporneste()
                trimite('Nu e nimic nou.', sunet=False)
            elif text.startswith('/test'):
                trimite('🔔 Test: așa arată o alarmă. Dacă ai auzit-o, alarmele merg.')
            elif text.startswith('/'):
                trimite('/stare — cum stau sistemele\n/raport — raportul de noapte, acum\n/versiune — versiunea și caută actualizări\n/verifica — verifică acum\n/test — trimite o alarmă de probă', sunet=False)


# ------------------------------------------------------------------ panoul (rețeaua locală, doar citire)
PAGINA = """<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Sistemul AI</title><style>
:root{color-scheme:dark}body{margin:0;font:16px/1.45 -apple-system,system-ui,sans-serif;background:#0d1117;color:#e6edf3}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:26px;margin:0}.sub{color:#8b949e;margin:4px 0 20px}
.cap{padding:14px 16px;border-radius:14px;font-weight:600;margin-bottom:16px}.bun{background:#12261a;color:#7ee2a0}.rau{background:#2d1517;color:#ff9b9b}
.grila{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.card{background:#161b22;border:1px solid #262c36;border-radius:14px;padding:14px 16px}.card.r{border-color:#7a2a2f}
.nume{font-weight:600}.det{color:#c9d1d9;font-size:14px;margin-top:4px}.din{color:#8b949e;font-size:12px;margin-top:8px}
.punct{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:#3fb950}.card.r .punct{background:#f85149}
footer{color:#8b949e;font-size:13px;margin-top:20px}</style></head><body><main>
<h1>Sistemul AI</h1><div class="sub">Mac mini · v{versiune} · verificat la {ultima} · pornit din {pornit}</div>
{telegram}<div class="cap {clasa}">{cap}</div><div class="grila">{carduri}</div>
<footer>Se reîmprospătează singur la un minut. De oriunde: /stare în Telegram.</footer></main></body></html>"""


def pagina():
    st = citeste_stare()
    v = sorted(st.get('verificari', {}).values(), key=lambda x: x['ok'])      # ce e stricat, primul
    rau = [x for x in v if not x['ok']]
    carduri = ''.join(
        f"<div class='card{'' if x['ok'] else ' r'}'><div class='nume'><span class='punct'></span>{html.escape(x['nume'])}</div>"
        f"<div class='det'>{html.escape(x['detaliu'])}</div><div class='din'>{'merge' if x['ok'] else 'stricat'} din {ora(x.get('din'))}</div></div>"
        for x in v)
    valori = {'{versiune}': VERSIUNE, '{ultima}': ora(st.get('ultima_tura')), '{pornit}': ora(st.get('pornit_la')), '{clasa}': 'rau' if rau else 'bun',
              '{cap}': (f'{len(rau)} din {len(v)} au probleme' if rau else f'Toate cele {len(v)} merg') if v else 'Prima verificare e în curs…',
              '{carduri}': carduri,
              '{telegram}': '' if (st.get('telegram') or {}).get('ok', True) else
                  f"<div class='cap rau'>Alarmele pe Telegram nu ajung: {html.escape(str(st['telegram'].get('eroare')))}. Rulează din nou instalarea.</div>"}
    pag = PAGINA
    for k, x in valori.items():                          # nu .format(): CSS-ul are acolade
        pag = pag.replace(k, x)
    return pag


class Panou(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/api/stare':
            corp, tip = json.dumps(citeste_stare(), ensure_ascii=False).encode(), 'application/json; charset=utf-8'
        elif self.path.split('?')[0] == '/':
            corp, tip = pagina().encode(), 'text/html; charset=utf-8'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', tip)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(corp)

    def log_message(self, *a):
        pass


def main():
    port = int(CFG.get('port', 8790))
    srv = ThreadingHTTPServer((CFG.get('adresa', '0.0.0.0'), port), Panou)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    if CFG.get('telegram_token'):
        threading.Thread(target=asculta, daemon=True).start()
    jurnal(f'pornit; panoul pe portul {port}')
    boot = pornit_la()
    if boot and time.time() - boot < 600:
        time.sleep(180)                                   # imediat după repornire, celelalte sisteme încă pornesc: fără alarme false
    prima = not os.path.exists(STARE_CALE)
    tura()
    confirma_pornirea()
    actualizeaza_si_reporneste()
    if prima:
        trimite('✅ Sistemul AI a pornit pe Mac mini.\n\n' + rezumat() + '\n\nScrie /stare oricând vrei să vezi cum stau.')
    with blocaj:
        st = citeste_stare()
        if 'ultimul_raport_zi' not in st:                 # primul raport vine mâine dimineață, nu imediat după instalare
            st.update({'ultimul_raport_zi': datetime.now().strftime('%Y-%m-%d'), 'ultimul_raport_la': time.time()})
            scrie_stare(st)
    ture = 0
    while True:
        time.sleep(INTERVAL)
        ture += 1
        try:
            tura()
            verifica_raport()
            if ture % max(1, 3600 // INTERVAL) == 0:      # o dată pe oră
                actualizeaza_si_reporneste()
        except Exception as e:
            jurnal(f'tura a dat eroare: {e}')


if __name__ == '__main__':
    main()
