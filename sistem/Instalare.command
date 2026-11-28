#!/bin/bash
# Sistemul AI — instalare pe Mac mini. În Terminal: scrie „bash ”, trage fișierul ăsta în fereastră, apasă Enter.
cd "$(dirname "$0")" || exit 1
SRC="$(pwd)"
DEST="$HOME/SistemAI"
LABEL="ro.lucian.sistemai"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UIDN="$(id -u)"
pauza() { echo; read -n 1 -s -r -p "Apasă orice tastă ca să închizi fereastra."; echo; }

clear
echo "=============================================="
echo "   Sistemul AI — instalare (de acum se actualizează singur)"
echo "=============================================="
echo

# 1) Python 3.9+
PY=""
for p in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if [ -x "$p" ] && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; then PY="$p"; break; fi
done
if [ -z "$PY" ]; then
  echo "Lipsește Python 3. Pornesc instalarea uneltelor gratuite de la Apple."
  echo "Apasă „Instalează”, apoi rulează din nou instalarea."
  xcode-select --install >/dev/null 2>&1; pauza; exit 1
fi

# 2) oprește versiunea veche (dacă există), copiază fișierele
launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true
mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
cp "$SRC/sistem.py" "$SRC/porneste.py" "$DEST/"
rm -f "$DEST/proba.json"   # instalarea de mână nu e o actualizare de probat
for f in PROIECT.md STARE.md DECIZII.md PLAN.md; do [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DEST/"; done

# 3) Telegram: un bot nou, doar pentru sistem (CryptoRadar și Studio își păstrează boții lor)
tg() {   # tg METODĂ [câmpuri]; tokenul merge prin stdin, nu apare în lista de procese
  local m="$1"; shift
  printf 'url = "https://api.telegram.org/bot%s/%s"\n' "$TT" "$m" | /usr/bin/curl -s -m 20 -K - "$@"
}
TT=""; TC=""
if [ -f "$DEST/config.json" ]; then
  TT=$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("telegram_token",""))' "$DEST/config.json")
  TC=$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("telegram_chat_id",""))' "$DEST/config.json")
fi
if [ -n "$TT" ]; then
  read -r -p "Botul de Telegram e deja pus. Enter = îl păstrez, d = pun altul: " R
  [ "$R" = "d" ] && TT="" && TC=""
fi
BOT=""
while [ -z "$BOT" ]; do
  if [ -z "$TT" ]; then
    echo "Telegram: deschide @BotFather, scrie /newbot, dă-i un nume (de ex. „Sistemul Lucian”)"
    echo "și copiază tokenul primit. Lipește-l aici (nu apare pe ecran) și apasă Enter:"
    read -r -s TT; echo
    TT="$(echo "$TT" | tr -d '[:space:]')"
    [ -z "$TT" ] && { echo "N-am primit niciun token."; pauza; exit 1; }
  fi
  BOT=$(tg getMe | "$PY" -c 'import json,sys
try:
    r=json.load(sys.stdin)
except ValueError:
    r={}
print(r.get("result",{}).get("username","") if r.get("ok") else "")')
  if [ -z "$BOT" ]; then echo "⚠️ Telegram nu recunoaște tokenul (sau nu e internet). Copiază-l din nou din @BotFather."; TT=""; fi
done
echo "✓ Botul: @$BOT"
# chat ID-ul îl află singur, din mesajul tău /start (e un număr; numele botului nu merge)
if ! [[ "$TC" =~ ^-?[0-9]+$ ]]; then
  TC=""
  echo "Scrie-i lui @$BOT /start în Telegram. Aștept mesajul tău (cel mult 3 minute)…"
  for i in $(seq 1 60); do
    TC=$(tg getUpdates | "$PY" -c 'import json,sys
try:
    r=json.load(sys.stdin).get("result",[])
except ValueError:
    r=[]
ids=[u["message"]["chat"]["id"] for u in r if u.get("message",{}).get("chat",{}).get("type")=="private"]
print(ids[-1] if ids else "")')
    [ -n "$TC" ] && break
    sleep 3
  done
  [ -z "$TC" ] && { echo "Nu a venit niciun mesaj. Scrie-i botului /start și rulează din nou instalarea."; pauza; exit 1; }
fi
# probă: dacă mesajul nu ajunge acum, nu ajung nici alarmele
R=$(tg sendMessage --data-urlencode "chat_id=$TC" --data-urlencode "text=✅ Legat. Aici primești alarmele Sistemului AI. Scrie /stare ca să vezi cum stau sistemele." | "$PY" -c 'import json,sys
try:
    r=json.load(sys.stdin)
except ValueError:
    r={"description":"fără răspuns de la Telegram"}
print("ok" if r.get("ok") else r.get("description","eroare necunoscută"))')
if [ "$R" != "ok" ]; then echo "⚠️ Telegram n-a primit mesajul de probă: $R"; pauza; exit 1; fi
echo "✓ Ți-am trimis un mesaj de probă pe Telegram."

# 4) ce verifică: joburile tale din launchd (CryptoRadar, Novaria Studio, colectorul…), Chrome și discul
"$PY" - "$DEST/config.json" "$TT" "$TC" <<'PY'
import glob, json, os, plistlib, re, sys
cale, tt, tc = sys.argv[1:]
try:
    c = json.load(open(cale))
except (OSError, ValueError):
    c = {"port": 8790, "interval_secunde": 300, "reamintire_ore": 3, "prag_disc_gb": 15, "liniste": [23, 7]}
c["telegram_token"], c["telegram_chat_id"] = tt, tc
NUME = {"ro.lucian.cryptoradar": "CryptoRadar", "ro.novaria.studio": "Novaria Studio"}
ver = []
for f in sorted(glob.glob(os.path.expanduser("~/Library/LaunchAgents/*.plist"))):
    try:
        p = plistlib.load(open(f, "rb"))
    except Exception:
        continue
    e = p.get("Label", "")
    if e == "ro.lucian.sistemai" or not re.search(r"cryptoradar|novaria|colector|lucian", e, re.I):
        continue
    nume = NUME.get(e) or ("Colectorul Novaria" if re.search("colector", e, re.I) else e)
    ver.append({"id": e, "nume": nume, "fel": "launchd", "eticheta": e, "permanent": bool(p.get("KeepAlive"))})
if os.path.isdir("/Applications/Google Chrome.app"):
    ver.append({"id": "chrome", "nume": "Chrome (pentru colector)", "fel": "proces", "proces": "Google Chrome"})
ver.append({"id": "disc", "nume": "Spațiu pe disc", "fel": "disc"})
c["verificari"] = ver
json.dump(c, open(cale, "w"), ensure_ascii=False, indent=1)
print("Verific:")
for v in ver:
    print("  •", v["nume"])
PY
chmod 600 "$DEST/config.json"

# 5) pornire automată
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$DEST/porneste.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DEST/launchd.log</string>
  <key>StandardErrorPath</key><string>$DEST/launchd.log</string>
</dict></plist>
PL
EXISTA=0; [ -f "$DEST/stare.json" ] && EXISTA=1
launchctl bootstrap "gui/$UIDN" "$PLIST"
sleep 3
echo
if launchctl list "$LABEL" 2>/dev/null | grep -q '"PID"'; then
  NUME_MAC="$(scutil --get LocalHostName 2>/dev/null)"; IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
  if [ "$EXISTA" = 1 ]; then echo "✓ Sistemul AI rulează (actualizat; setările au rămas)."
  else echo "✓ Sistemul AI rulează. În câteva secunde primești pe Telegram „Sistemul AI a pornit”."; fi
  echo
  echo "Panoul, de pe telefon sau MacBook, în aceeași rețea:"
  echo "   http://$NUME_MAC.local:8790"
  [ -n "$IP" ] && echo "   sau http://$IP:8790"
  echo "Dacă macOS te întreabă dacă python3 poate primi conexiuni, apasă Permite."
else
  echo "⚠️ Nu a pornit. Trimite-i lui Claude o captură cu ce apare mai jos:"
  tail -20 "$DEST/launchd.log" 2>/dev/null
fi
pauza
