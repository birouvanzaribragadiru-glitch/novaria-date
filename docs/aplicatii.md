# Aplicațiile Novaria Evaluator — cum sunt construite, publicate și păzite

## Cele două aplicații
| | Principală | Parteneri |
|---|---|---|
| Artefact | https://claude.ai/artifact/1UirP9yLygohrb5fZMuHmk | https://claude.ai/artifact/GcUhs6jbMpzu4FJ6BRNcEh |
| Pentru cine | Lucian + agentele Novaria (invitate ca Editor) | agenții altor agenții, gratis (invitați ca Editor) |
| Date | toate | datele de piață copiate zilnic de task-ul „alimentare Parteneri”, **fără** sectoarele 5 și 6, Bragadiru, Domnești, Măgurele; fără cereri de pe site, liste, dosare sau chei |
| Sursă | aceleași fișiere (`/home/claude/cma`, arhivate criptat în `app/`), build cu `NV_VARIANT=parteneri` | |

Baza fiecărei aplicații are aceleași reguli de acces (`docs/app-capabilities.json`): datele de piață se citesc de toți și se scriu doar de proprietar (Lucian) și de task-uri; `site`, `evaluari`, `proprietari`, `cumparatori`, `tranzactii`, `repartizari`, `app`, `setari/chei` se văd doar de proprietar; fiecare agent are sertarul lui `agenti/<id>/…` (regula `agenti/{self}`), invizibil pentru ceilalți agenți și vizibil pentru proprietar (fila „Echipa”).

## Publicarea unei versiuni noi (din sesiunea de lucru)
1. `cd /home/claude/cma && NV_MIN=1 python3 build.py` → `novaria-evaluator.html` (compactat și amestecat cu terser).
2. `NV_MIN=1 NV_VARIANT=parteneri NV_PARTNER_URL=https://claude.ai/artifact/GcUhs6jbMpzu4FJ6BRNcEh python3 build.py` → `novaria-evaluator-parteneri.html`.
3. Artifact publish pentru fiecare, cu `capabilities` = `docs/app-capabilities.json` (întotdeauna explicit, ca regulile să nu rămână cumva cele ale altcuiva).
4. Copia bună pentru paznic: Artifact read cu `path: index.html` și `out_dir` (dă pagina servită + versionId), apoi
   `python3 -I scripts/app_guard.py store <pagina.html> <main|parteneri> docs/app-capabilities.json <versionId> <dir> <pagina-servita.html>`
   și scrie loturile din `<dir>/writes.json` în baza aplicației PRINCIPALE cu ArtifactData batch (documentele `app/<nume>` și `app/<nume>/chunks/<i>` există deja: ia-le versiunile cu `list` și pune `if_version`).
5. Arhivează sursele: `tar czf - -C /home/claude cma --exclude=cma/node_modules --exclude='cma/app_v*' --exclude='cma/*.html' | NV_BACKUP_KEY=… openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:NV_BACKUP_KEY -out app/src-AAAA-LL-ZZ.tar.gz.enc` (aceeași cheie ca backup-ul).

## Task-uri programate legate de aplicații
- „date zilnice pentru evaluatorul de pe site” (21:37) — export + calibrare; citește și vânzările agenților din `agenti/*/tranzactii` (principală și Parteneri).
- „alimentare Parteneri” (22:17) — `docs/task-feed-prompt.md`.
- „paznicul aplicațiilor” (06:23, 15:23) — `docs/task-paznic-prompt.md`: compară amprenta paginilor live cu copia bună și restaurează.

## Invitarea agenților
Share (dreapta sus) → adresa de e-mail → Editor (singurul rol care, în afara organizației, poate salva). Niciodată „Anyone with the link”. Agentul apare în „Echipa” după prima deschidere a aplicației și își declară o dată adresa de e-mail (platforma nu o dă). Un lead se trimite unui agent din „Proprietari”, „Azi” sau „Dosare → De pe site” cu „Trimite la…”.

## Capturile din paginile de rezultate
Portalurile (mai ales Storia) umplu paginile cu „alte anunțuri” din toată țara. Din v49 captura ignoră cardurile a căror localizare se termină cu alt județ decât Ilfov/București și scoate din calcul anunțurile cu preț/suprafață evident greșit citite (marcate `exclus`, cu zona inițială păstrată în `zonaInitiala`, deci reversibil). Pe 21 oct. 2026 s-au curățat la fel capturile existente (43 din alte județe, ~65 cu prețuri aberante) și s-a completat `teren` din titlu unde lipsea (`terenDin: "titlu"`).

## Fișa unică și vânzările (v52 principală / v7 Parteneri, 22 oct. 2026)
- **O singură fișă a proprietății** (`FD` + `FISA` în `app.js`) pentru evaluare, comparabile și vânzări reale: aceleași câmpuri, opțiuni și grupuri (Esențial, Adresa, apoi detaliile). La comparabile un câmp gol e „— necunoscut —”; scara, apartamentul, reperul, situația juridică și metroul nu apar acolo.
- **Adresa pe câmpuri:** `strada`, `nr`, `bloc`, `scara`, `apNr`, `reper`; `adresa` rămâne textul compus din ele (îl folosesc motorul, rapoartele și căutarea). Dosarele vechi se despart automat la deschidere (`parseAdresa`), fără să se piardă textul vechi. Sub adresă: dacă strada e recunoscută, dacă numărul e în harta OSM și butonul „Arată pe hartă”.
- **„Vândut” din dosar** (butonul „Am vândut-o” sau stadiul „Vândut”): obligatorii doar prețul final și data. Vânzarea se scrie singură în `tranzactii` cu id `v-<dosar>` (sau preia vânzarea veche legată de dosar / una trecută de mână identică) și se ține la zi din dosar. Dacă dosarul iese din „Vândut”, vânzarea primește `anulat: true` (nu se șterge) și iese din calcul.
- **Fila „Vânzări”** (sus, nu mai e în Dosare): formular complet (vânzarea + fișa), „Modifică” pentru vânzările fără dosar, „Fă dosar” dintr-o vânzare, avertisment de dublură în pagină (același link sau aceeași zonă + suprafață ±1 mp + preț ±1% + dată ±45 de zile).
- La „Vândut” direct din „Doar evaluat” data listării nu se mai pune singură pe azi (strica zilele pe piață).
