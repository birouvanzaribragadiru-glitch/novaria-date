# Textul task-ului programat „Novaria – copie de siguranță săptămânală”

Rulează duminica la 04:13 (Europe/Bucharest). Se lipește integral în câmpul de instrucțiuni al task-ului.

---

Copia de siguranță săptămânală a bazei aplicației interne Novaria Evaluator (artefactul https://claude.ai/artifact/1UirP9yLygohrb5fZMuHmk), în depozitul GitHub birouvanzaribragadiru-glitch/novaria-date, folderul backup/.

Reguli: doar CITEȘTI din baza aplicației; singurul document pe care îl scrii în aplicație este setari/backup (data ultimei copii). În depozit modifici doar folderul backup/. Depozitul e public, deci arhiva se urcă NUMAI criptată, cu scriptul de mai jos; nu urca niciodată fișierele JSON brute, nu le lipi în raport și nu afișa cheia în raport. Nu ștergi nimic din baza aplicației. Dacă un pas eșuează, oprește-te și raportează exact ce s-a întâmplat.

1. Depozitul: apelează mcp__claude-code-remote__add_repo cu owner "birouvanzaribragadiru-glitch", repo "novaria-date", access "push", clonează-l cum îți spune rezultatul (în /home/claude/novaria-date dacă nu ți se indică altă cale) și apelează register_repo_root dacă ți se cere. Dacă add_repo întoarce o eroare de autorizare, oprește-te și raportează mesajul.

2. Cheia: cu ArtifactData, action "get", collection "setari", doc_id "general", citește câmpul backupKey. Dacă lipsește sau e mai scurt de 24 de caractere, oprește-te și raportează „lipsește cheia de backup” (nu inventa una). Scrie cheia într-un fișier temporar: printf '%s' '<cheia>' > /tmp/nvkey (nimic altceva în fișier).

3. Datele: cu ArtifactData, action "list", query {"limit": 40}, out_dir "/tmp/nvbak", citește pe rând colecțiile: evaluari, proprietari, cumparatori, tranzactii, capturi, alerte, portaluri, piata, istoric, agentii, referinte, rapoarte, setari, site, calib, lipite. Când un rezultat are next_cursor, continuă cu același out_dir și cursorul primit până nu mai există. O colecție goală sau inexistentă e în regulă (treci mai departe). La final verifică: find /tmp/nvbak -name '*.json' | wc -l trebuie să fie cel puțin 200, iar /tmp/nvbak/capturi cel puțin 100 de fișiere; dacă nu, oprește-te și raportează câte ai găsit pe fiecare colecție (ls /tmp/nvbak).

4. Arhiva: în depozit rulează
   NV_BACKUP_KEY="$(cat /tmp/nvkey)" python3 -I scripts/backup.py /tmp/nvbak backup/
   Scriptul criptează, verifică singur decriptarea, păstrează ultimele 6 arhive și tipărește un rând JSON cu {ok, fisier, marime, documente, colectii, sterse}. Dacă nu tipărește "ok": true, nu urca nimic și raportează mesajul lui.

5. Urcarea: git add backup/ && git commit -m "Backup <data de azi>: <documente> documente" && git push. Dacă push-ul e refuzat pentru că depozitul s-a schimbat, git pull --rebase și încearcă o singură dată din nou. Nu adăuga alte fișiere.

6. Nota în aplicație: cu ArtifactData, action "get", collection "setari", doc_id "backup" — dacă există, action "set" cu if_version = versiunea citită; dacă nu există, "set" fără if_version — cu data {"la": <acum, milisecunde Unix>, "fisier": "<numele arhivei>", "marime": <octeți>, "documente": <număr>, "colectii": <obiectul colectii din scriptul de backup>}.

7. Curățenie: rm -f /tmp/nvkey; rm -rf /tmp/nvbak.

8. Raport (3 rânduri, în română): numele arhivei și mărimea, câte documente pe colecții (evaluari, proprietari, tranzactii, capturi — restul însumat), ce arhive vechi au fost șterse. Dacă ceva a eșuat, spune pasul și mesajul exact. Nu include cheia și niciun conținut din documente.
