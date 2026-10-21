# Textul task-ului programat „Novaria – date zilnice pentru evaluatorul de pe site”

Varianta de mai jos adaugă pasul 3b (calibrarea factorilor din anunțuri → `lib/calib.json`) față de textul actual al task-ului.
Se lipește integral în câmpul de instrucțiuni al task-ului programat (claude.ai → Scheduled tasks → task-ul de mai sus → Edit).

---

Actualizarea zilnică a datelor pentru evaluatorul de pe novaria.ro (depozitul GitHub birouvanzaribragadiru-glitch/novaria-date).

Ce faci, pe scurt: citești colecțiile de piață din aplicația internă Novaria, rulezi exportul (cifre agregate pe zone și factorii străzilor față de media zonei) și calibrarea factorilor de ajustare din anunțuri, iar dacă s-a schimbat ceva, urci data/evaluator.json și lib/calib.json în depozit. Nu modifici nimic în aplicația internă: doar CITEȘTI din baza ei de date. Nu scrii nicăieri altundeva în afară de depozitul novaria-date.

1. Depozitul: apelează mcp__claude-code-remote__add_repo cu owner "birouvanzaribragadiru-glitch", repo "novaria-date", access "push", apoi clonează-l cum îți spune rezultatul (în /home/claude/novaria-date dacă nu ți se indică altă cale) și apelează register_repo_root dacă ți se cere. Dacă add_repo întoarce o eroare de autorizare, oprește-te și raportează exact mesajul (Lucian trebuie să reconecteze GitHub); nu încerca alte căi.

2. Datele: artefactul aplicației este https://claude.ai/artifact/1UirP9yLygohrb5fZMuHmk. Cu ArtifactData, action "list", query {"limit": 1000} și out_dir "/tmp/nvdump", citește pe rând colecțiile: piata, agentii, portaluri, capturi, referinte, setari (o colecție goală e în regulă). Dacă un rezultat are next_cursor, citește și paginile următoare (același out_dir, cursorul primit) până nu mai e next_cursor. NU citi colecția veche „lipite” (anunțurile capturate sunt acum în pachetele din „capturi”, ~128 de documente). NU copia conținutul documentelor în conversație și nu-l rescrie de mână: lucrezi doar cu fișierele salvate de out_dir.
   Verificare minimă: în /tmp/nvdump/piata trebuie să fie cel puțin 20 de fișiere. Dacă sunt mai puține, oprește-te fără să urci nimic și raportează câte ai găsit. Dacă /tmp/nvdump/capturi are mai puțin de 100 de fișiere, continuă, dar spune în raport câte ai găsit.

3. Exportul: în depozit rulează
   node scripts/export.js /tmp/nvdump data/evaluator.json
   Scriptul se oprește singur (cod de ieșire diferit de 0) dacă rezultatul ar conține ceva ce arată a link, email sau telefon. Dacă se oprește, nu urca nimic și raportează mesajul.
   Verifică rezultatul cu: node -e "const d=require('./data/evaluator.json'); if(d.v!==1||d.zone.length<100) process.exit(1); console.log(d.anunturi, d.zone.length)"

3b. Calibrarea factorilor de ajustare (regresie pe anunțurile din bază; scrie doar coeficienți și numărători, niciun anunț): în depozit rulează
   node scripts/calibrare.js /tmp/nvdump lib/calib.json
   Verifică: node -e "const c=require('./lib/calib.json'); if(!c.factors||!c.features||!c.n) process.exit(1); console.log(Object.keys(c.factors).length+' factori aplicați din '+(c.n.apartament+c.n.casa)+' anunțuri')"
   Dacă scriptul dă eroare sau verificarea pică, lasă lib/calib.json cum era (git checkout -- lib/calib.json), continuă cu urcarea exportului și spune în raport că nu s-a calibrat.

4. Urcarea: dacă exportul a scris „NESCHIMBAT” (s-a schimbat doar data) și lib/calib.json nu apare în git status cu alte schimbări decât data din „generatLa”, nu face commit. Altfel copiază fișierul de export și în plugin:
   cp data/evaluator.json plugin/novaria-evaluator/data/evaluator.json
   apoi commit pe main cu mesajul "Date piață <data de azi>: <nr anunțuri> anunțuri · calibrare: <nr factori aplicați> factori" și push. Dacă push-ul e refuzat pentru că depozitul s-a schimbat, fă git pull --rebase și încearcă o singură dată din nou.
   Nu modifica alte fișiere din depozit în afară de fișierele de date: data/evaluator.json, copia lui din plugin, lib/calib.json și, doar dacă exportul l-a rescris (apare în git status), data/strazi.json.

5. Raport scurt (3–4 rânduri, în română): câte anunțuri pe surse (din ieșirea exportului, inclusiv rândul „capturi: … pachete, … anunțuri”), câte străzi au factor public și la ce tipuri se aplică (rândul „străzi cu factor public” din ieșire), câți factori a aplicat calibrarea și din câte anunțuri (plus primele 3 rânduri cu ✓ din ieșirea calibrării), dacă ai urcat sau nu și de ce. Nu trimite emailuri și nu scrie mesaje nimănui.
