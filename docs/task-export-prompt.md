# Textul task-ului programat „Novaria – date zilnice pentru evaluatorul de pe site”

Actualizat 1 nov. 2026 (pasul 3d: testul de precizie). Se lipește integral în câmpul de instrucțiuni al task-ului programat (21:37, Europe/Bucharest).

---

Actualizarea zilnică a datelor pentru evaluatorul de pe novaria.ro (depozitul GitHub birouvanzaribragadiru-glitch/novaria-date) și alimentarea copiei „Novaria Evaluator – Parteneri”.

Ce faci, pe scurt: citești colecțiile de piață din aplicația internă Novaria, rulezi exportul (cifre agregate pe zone, dinamica pieței pe zone, chiria mediană și randamentul pe zone și factorii străzilor față de media zonei) și calibrarea factorilor de ajustare din anunțuri, iar dacă s-a schimbat ceva, urci data/evaluator.json și lib/calib.json în depozit și pui factorii calibrați în aplicație (documentul calib/current). La final copiezi datele de piață, filtrate, în copia Parteneri. În aplicația internă scrii DOAR documentul calib/current; restul bazei ei o CITEȘTI doar. În copia Parteneri scrii DOAR documentele produse de scriptul nv_feed.py. Nu scrii nicăieri altundeva în afară de depozitul novaria-date.

1. Depozitul: apelează mcp__claude-code-remote__add_repo cu owner "birouvanzaribragadiru-glitch", repo "novaria-date", access "push", apoi clonează-l cum îți spune rezultatul (în /home/claude/novaria-date dacă nu ți se indică altă cale) și apelează register_repo_root dacă ți se cere. Dacă add_repo întoarce o eroare de autorizare, oprește-te și raportează exact mesajul (Lucian trebuie să reconecteze GitHub); nu încerca alte căi.

2. Datele: artefactul aplicației este https://claude.ai/artifact/1UirP9yLygohrb5fZMuHmk. Cu ArtifactData, action "list", query {"limit": 1000} și out_dir "/tmp/nvdump", citește pe rând colecțiile: piata, istoric, agentii, portaluri, capturi, chirii, referinte, setari, tranzactii, alerte, rapoarte, calib (o colecție goală sau inexistentă e în regulă). Dacă un rezultat are next_cursor, citește și paginile următoare (același out_dir, cursorul primit) până nu mai e next_cursor. NU citi colecția veche „lipite” (anunțurile capturate sunt acum în pachetele din „capturi”, ~128 de documente). NU copia conținutul documentelor în conversație și nu-l rescrie de mână: lucrezi doar cu fișierele salvate de out_dir.
   Verificare minimă: în /tmp/nvdump/piata trebuie să fie cel puțin 20 de fișiere. Dacă sunt mai puține, oprește-te fără să urci nimic și raportează câte ai găsit. Dacă /tmp/nvdump/capturi are mai puțin de 100 de fișiere, continuă, dar spune în raport câte ai găsit.
   2b. Vânzările agenților (intră în calibrarea negocierii, fără nume): ArtifactData action "list", collection "agenti", query {"limit": 200}, out_dir "/tmp/nvdump" (fișierele /tmp/nvdump/agenti/<id>.json dau id-urile agenților). Pentru fiecare id: action "list", collection "agenti/<id>/tranzactii", query {"limit": 500}, out_dir "/tmp/nvdump". Apoi la fel pentru copia Parteneri (url https://claude.ai/artifact/GcUhs6jbMpzu4FJ6BRNcEh): collection "agenti" cu out_dir "/tmp/nvdump/parteneri", apoi "agenti/<id>/tranzactii" pentru fiecare id, tot cu out_dir "/tmp/nvdump/parteneri". Colecțiile goale sunt în regulă.

3. Exportul: în depozit rulează
   node scripts/export.js /tmp/nvdump data/evaluator.json
   Scriptul se oprește singur (cod de ieșire diferit de 0) dacă rezultatul ar conține ceva ce arată a link, email sau telefon. Dacă se oprește, nu urca nimic și raportează mesajul.
   Verifică rezultatul cu: node -e "const d=require('./data/evaluator.json'); if(d.v!==1||d.zone.length<100) process.exit(1); console.log(d.anunturi, d.zone.length, d.zone.filter(z=>z.din).length+' zone cu dinamică', d.zone.filter(z=>z.ch).length+' zone cu chirii')"

3b. Calibrarea factorilor de ajustare (regresie pe anunțurile din bază; scrie doar coeficienți și numărători, niciun anunț): în depozit rulează
   node scripts/calibrare.js /tmp/nvdump lib/calib.json
   Verifică: node -e "const c=require('./lib/calib.json'); if(!c.factors||!c.features||!c.n) process.exit(1); console.log(Object.keys(c.factors).length+' factori aplicați din '+(c.n.apartament+c.n.casa)+' anunțuri')"
   Dacă scriptul dă eroare sau verificarea pică, lasă lib/calib.json cum era (git checkout -- lib/calib.json), continuă cu urcarea exportului și spune în raport că nu s-a calibrat.

3c. Factorii calibrați în aplicație (aplicația nu poate citi fișiere din afara ei, așa că îi primește prin baza ei de date): dacă pasul 3b a reușit, cu ArtifactData fă action "get", collection "calib", doc_id "current" (poate lipsi; dacă există, reține versiunea afișată), apoi action "set", collection "calib", doc_id "current", file_path "<calea depozitului>/lib/calib.json", cu if_version = versiunea reținută (fără if_version doar dacă documentul nu exista). Dacă e refuzat pentru versiune, fă din nou get și reia o singură dată. Acesta e singurul document pe care îl scrii în aplicația principală.

3d. Testul de precizie al evaluatorului (cifre agregate, niciun anunț): în depozit rulează
   node scripts/precizie.js /tmp/nvdump data/precizie
   Tipărește un rând „precizie <data>: apartamente eroare mediană …”. Reține rândul pentru raport. Dacă scriptul dă eroare, lasă data/precizie cum era (git checkout -- data/precizie), continuă și spune în raport că nu s-a măsurat.

4. Urcarea: dacă exportul a scris „NESCHIMBAT” (s-a schimbat doar data) și lib/calib.json nu apare în git status cu alte schimbări decât data din „generatLa”, fă commit doar pentru data/precizie (mesaj "Precizie <data de azi>") dacă a apărut ceva nou acolo; altfel nu face commit. Altfel copiază fișierul de export și în plugin:
   cp data/evaluator.json plugin/novaria-evaluator/data/evaluator.json
   apoi commit pe main cu mesajul "Date piață <data de azi>: <nr anunțuri> anunțuri · calibrare: <nr factori aplicați> factori" și push. Dacă push-ul e refuzat pentru că depozitul s-a schimbat, fă git pull --rebase și încearcă o singură dată din nou.
   Nu modifica alte fișiere din depozit în afară de fișierele de date: data/evaluator.json, copia lui din plugin, lib/calib.json, data/precizie/ și, doar dacă exportul l-a rescris (apare în git status), data/strazi.json.

5. Alimentarea copiei Parteneri (https://claude.ai/artifact/GcUhs6jbMpzu4FJ6BRNcEh), într-o singură direcție, principal → parteneri. Zonele rezervate Novaria (sectoarele 5 și 6, Bragadiru, Domnești, Măgurele) și datele interne nu se copiază niciodată; filtrarea o face scriptul. Pașii:
   a) `mkdir -p /tmp/nvfeed/dst /tmp/nvfeed/out`. Din copia Parteneri, ArtifactData action "list", query {"limit": 1000}, out_dir "/tmp/nvfeed/dst", pentru colecțiile: piata, istoric, portaluri, chirii, agentii, capturi, alerte, rapoarte, referinte, calib, setari (cu cursor până la capăt; la început pot fi goale).
   b) În depozit: `python3 -I scripts/nv_versiuni.py /tmp/nvfeed/versions.txt --sub /tmp/nvfeed/dst`, apoi `python3 -I scripts/nv_feed.py /tmp/nvdump /tmp/nvfeed/dst /tmp/nvfeed/out --versiuni /tmp/nvfeed/versions.txt --zones lib/zones.json`. Scriptul sare documentele neschimbate și scrie /tmp/nvfeed/out/writes.json (loturi de cel mult 50 de scrieri). Dacă afișează „ATENȚIE: lipsește versiunea”, re-listează din Parteneri colecția respectivă și rulează din nou ambele scripturi.
   c) Pentru fiecare lot din /tmp/nvfeed/out/writes.json, în ordine: ArtifactData action "batch", url = copia Parteneri, writes = lotul (ia intrările din fișier, nu le rescrie de mână). Dacă un lot e refuzat pentru o versiune schimbată, re-listează colecția, rulează din nou scripturile și reia lotul o singură dată.

6. Raport scurt (4–6 rânduri, în română): câte anunțuri pe surse (din ieșirea exportului, inclusiv rândul „capturi: … pachete, … anunțuri”), câte zone au dinamică pentru raportul lunar, câte au chirii și câte vânzări reale a găsit (rândurile „zone cu dinamică”, „zone cu chirii”, „vânzări reale” și „vânzări ale agenților” din ieșire), câți factori a aplicat calibrarea și din câte anunțuri (plus primele 3 rânduri cu ✓ din ieșirea calibrării) și dacă au ajuns în aplicație (calib/current), rândul „precizie …” de la pasul 3d, dacă ai urcat sau nu și de ce, iar pentru Parteneri: câte documente au fost scrise și câte sărite ca neschimbate (rândul „Pe colecții” al nv_feed.py) și rândul „Capturi: anunțuri păstrate … din …”. Nu trimite emailuri și nu scrie mesaje nimănui.
