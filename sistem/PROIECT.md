# Sistemul AI — fișa proiectului

**Ce e:** „sistemul de operare AI” al lui Lucian, inspirat din Agentic AI OS-ul lui Cristian Ionesi. Un singur loc unde vede ce rulează și ce s-a stricat; mai târziu, tura de noapte, ziarul, memoria și banda completă a unui anunț Novaria (poze → reel → tur 360 → publicare). Planul complet: `PLAN.md` și Whiteboard-ul https://claude.ai/artifact/CrrTnuszmd1Hkz4L7AnE1w

**Unde rulează:** Mac mini (M2, 8 GB), în `~/SistemAI`, pornit de launchd ca `ro.lucian.sistemai` (pornește la boot, se repornește singur). Munca grea din feliile 6–7 (Lightroom, DaVinci) va rula pe MacBook.

**Fișiere:**
- `porneste.py` — lansatorul pe care îl pornește launchd; revine la versiunea veche dacă una nouă nu pornește (nu se actualizează singur)
- `sistem.py` — agentul: verificări la 5 minute, alarme Telegram, `/stare`, panoul web (port 8790, doar citire)
- `config.json` — setările (chmod 600; conține tokenul botului, nu se trimite nimănui)
- `stare.json` — ultima stare a fiecărei verificări; `sistem.log`, `launchd.log` — jurnale

**Cum se instalează:** o singură dată, pe Mac mini, în Terminal: `bash ` + trage `Instalare.command` + Enter. La reinstalare, Enter păstrează botul; lista de verificări se refă singură din joburile launchd găsite.

**Cum se publică o versiune nouă (o face Claude):** în depozitul public `birouvanzaribragadiru-glitch/novaria-date`, folderul `sistem/`: crești `VERSIUNE` în `sistem.py`, rulezi testele, actualizezi `versiune.json` (versiunea, „noutăți” pe un rând, fiecare fișier cu SHA-256: `python3 sistem/publica.py`), commit și push pe main. Mac mini-ul o ia în cel mult o oră (sau imediat cu /versiune). Nu pune niciodată tokenuri, nume de cont sau date personale în depozit: e public.

**Cum se testează:** `python3 test_sistem.py` (pe Linux, cu launchctl/sysctl/pgrep falși și Telegram simulat; 18 verificări de comportament). Pe Mac mini: `/test` în Telegram trimite o alarmă de probă; `/verifica` verifică imediat.

**Servicii și chei (doar numele):** `telegram_token`, `telegram_chat_id` (bot nou, doar pentru sistem — CryptoRadar și Novaria Studio au boții lor).

**Glosar:**
- *verificare* — un lucru urmărit (un job launchd, un proces, discul)
- *job permanent* — job launchd cu KeepAlive: trebuie să aibă proces pornit; *job periodic* — rulează din când în când: contează doar codul ultimei ieșiri
- *alarmă* 🔴 — prima dată când ceva se strică; *reamintire* ⏰ — la 3 ore cât e tot stricat; 🟢 — și-a revenit; 🔄 — Mac mini-ul a repornit
- *ore de liniște* — 23:00–07:00, mesajele vin fără sunet
