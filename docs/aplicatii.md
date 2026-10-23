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
3. Artifact publish pentru fiecare, cu `capabilities` = `docs/app-capabilities-echipa.json` pentru principală și `docs/app-capabilities.json` pentru Parteneri (întotdeauna explicit, ca regulile să nu rămână cumva cele ale altcuiva).
4. Copia bună pentru paznic: Artifact read cu `path: index.html` și `out_dir` (dă pagina servită + versionId), apoi
   `python3 -I scripts/app_guard.py store <pagina.html> <main|parteneri> docs/app-capabilities.json <versionId> <dir> <pagina-servita.html>`
   și scrie loturile din `<dir>/writes.json` în baza aplicației PRINCIPALE cu ArtifactData batch (documentele `app/<nume>` și `app/<nume>/chunks/<i>` există deja: ia-le versiunile cu `list` și pune `if_version`).
5. Arhivează sursele: `tar czf - -C /home/claude cma --exclude=cma/node_modules --exclude='cma/app_v*' --exclude='cma/*.html' | NV_BACKUP_KEY=… openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:NV_BACKUP_KEY -out app/src-AAAA-LL-ZZ.tar.gz.enc` (aceeași cheie ca backup-ul).

## Task-uri programate legate de aplicații
- „date zilnice pentru evaluatorul de pe site” (21:37) — export + calibrare; citește și vânzările agenților din `agenti/*/tranzactii` (principală și Parteneri).
- „alimentare Parteneri” (22:17) — `docs/task-feed-prompt.md`.
- „paznicul aplicațiilor” (06:23, 15:23) — `docs/task-paznic-prompt.md`: compară amprenta paginilor live cu copia bună și restaurează.
- „copie de siguranță săptămânală” (duminică 04:13, creat 22 oct. 2026) — `docs/task-backup-prompt.md`: toate colecțiile și subcolecțiile, arhivă criptată în `backup/` (ultimele 6).

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

## Căutarea de proprietari (v54 principală / v9 Parteneri, 22 oct. 2026)
- Un singur panou de filtre (`fqPanel`) pe Azi („De sunat”) și în Proprietari: Toate (salvați + Publi24 + alerte, fără dubluri), Găsite, Alerte noi, Salvate. Filtrele fiecărei liste se țin minte în browser (`nv-fq-<listă>`).
- Filtre: tip, mai multe zone, stradă (text + strada recunoscută pe hartă, opțional pe o rază de 300 m / 1 km), ansamblu, camere, suprafață, preț, €/mp, etaj, an, compartimentare, încălzire, stare, parcare, teren, față de piață, reduceri, zile pe piață, ține la preț, repostat, promovare, mai multe anunțuri, ieșit de pe portal, cine vinde, pus și la agenții, „fără agenții”, stadiu, refuzat dar nevândut, ultimul contact, agent, notă, am client, notele minime.
- Două note pe fiecare anunț: „Vandabil” (ca înainte) și „Exclusivitate” (`exScore`: peste piață 5–30%, vechime, reduceri, repostare, promovare, pus și la agenții, cumpărător potrivit, refuz vechi; minus pentru anunțuri noi, preț nerealist, „fără agenții”, agenți).
- Căutări gata făcute (nimic nu e filtrat din oficiu; o căutare se aplică la apăsare și se scoate la a doua apăsare): Am client, Obosiți, Haos cu agenții, Abia a redus, Expirați, Refuzat tot nevândut, Strada mea, Rapide. Căutările salvate cu nume stau în `setari/cautari` (Lucian) sau `agenti/<id>/setari/cautari` (agenți) și apar pe Azi cu câte anunțuri noi au.
- Stadiul „E agenție” (v53): anunțul iese din proprietari; celelalte anunțuri ale aceluiași cont (amprenta `vk`) primesc „de verificat”. La schimbarea stadiului se notează `contactLa`.
- Istoria anunțurilor (vechime, reduceri, repostări, reactivări, retrageri) o ține deja `nv_piata.py` din colectarea săptămânală; la 22 oct. avea o singură rulare (19 oct.), deci filtrele de timp se umplu de la rulările următoare.
- v55 (22 oct., la cererea lui Lucian): fără filtre din oficiu; „De sunat” pe Azi = lista lui plus proprietarii găsiți și nesalvați încă (un stadiu sau o notă pus pe unul nesalvat îl salvează); filtrele detaliate stau în butonul „Filtre”; filtrele din browser au cheia nouă `nv-fq2-<listă>`.
- v56 (22 oct.): pe Azi, în loc de panoul de filtre, trei alegeri simple: Sub piață (−10…−30%, case/terenuri −20…−60%), Stau de mult (60+ zile, repostat sau revenit), Peste piață (+15…+50%, case/terenuri +30…+100%); doar proprietari credibili, cu preț și suprafață, încă pe piață, fără „fără agenții”. Panoul complet rămâne în Proprietari.

## Baza aplicației: limite și curățenia din 22 oct. 2026
- Limitele bazei unui artefact: 25.000 de documente, 256 KiB pe document și o limită de mărime totală (nepublicată). Datele care cresc se țin în pachete (mai multe elemente într-un document), nu câte un document pe element.
- 22 oct.: baza avea 14.211 documente, dintre care 13.141 în colecția veche `lipite` (un document pe anunț capturat, oprită pe 19–20 oct., când anunțurile au trecut în cele 128 de pachete `capturi`; aplicația și task-urile nu o mai citeau). Verificare înainte de ștergere: toate cele 13.141 erau în pachete (10.810 identice, 2.331 în varianta corectată pe 21 oct.). Copie completă: `backup/novaria-2026-10-21.tar.gz.enc` (criptată) și o copie zip pe laptopul lui Lucian (Downloads), fără documentul cu chei. Apoi, cu acordul explicit al lui Lucian, colecția `lipite` a fost ștearsă integral pe 22 oct. (263 de loturi a câte 50, toate 13.141 de documente; verificat după: colecția e goală). Pachetele `capturi` au rămas neatinse: 128 de pachete cu 16.091 de anunțuri. Baza are acum ≈ 1.070 de documente (≈ 4% din limita de 25.000).
- Ce crește cu timpul: `alerte` (un document pe zi), `rapoarte` (unul pe colectare), `proprietari` (unul pe proprietar salvat). Când se apropie de limită: arhivare lunară a celor vechi în `backup/` + indicator în Setări (neimplementate încă).

## Oferta pe WhatsApp (v57 principală, 22 oct. 2026) — doar Lucian
- Buton „WhatsApp” pe fiecare proprietar din Azi și din Proprietari, vizibil numai pentru proprietarul aplicației (agentele și copia Parteneri nu îl au).
- Pasul 1: mesaj scurt, personal (cine e Lucian, ce a văzut în anunț, „v-am pregătit gratuit o analiză, v-o trimit aici?”). Pasul 2, după răspuns: mesajul cu cifrele și oferta + PDF-ul (v58: 5 pagini A4; v60: format de telefon 112,5×200 mm, text de 11 pt, ~9 pagini), generat în aplicație cu jsPDF, fonturile Novaria și poza lui Lucian: copertă; piața și tabelul concurenților cu linkuri publice curate; de ce nu se vinde + prețul de ~30 de zile; cum vinde Lucian pas cu pas (după novaria.ro/vinde-cu-novaria, cu clipurile TikTok); despre el, rezultate (300+ vândute, ~30 de zile la preț corect, 17 recenzii Google, 692K pe o reclamă TikTok), oferta și contactul. Zilele pe piață ale concurenței nu se afișează până nu avem istoric (date din 19 oct.); în loc: argumentul „filtrul până la X €”.
- Oferta: comision 3% în loc de 5% dacă listăm la prețul real de piață din analiză, exclusivitate 3–6 luni, valabilă 14 zile; alternativ pachetul media 250 € în loc de 500 € până pe 31 dec. 2026. „Fără agenții” → doar pachetul media. Constantele stau în `OF_CFG` din `app.js`.
- Ce s-a trimis se ține în colecția `oferte` (regulă owner/owner): doc per anunț cu m1/m2/sit/pana și o amprentă (SHA-256 trunchiat) a telefonului, ca să nu se scrie de două ori aceluiași om de pe anunțuri diferite. Telefonul în clar nu se salvează.
- v60: campaniile plătite apar cu bugetul lui Lucian, „minimum 100 de lei pe zi” (pasul 3 din PDF, pagina „Despre mine”, coperta și mesajul 2). Referința „piața din zonă” din PDF folosește aceeași mediană ca diferența procentuală (când zona nu are istoric, mediana din scorul anunțului).
- v61, situația „la prețul pieței”: argumentul „prețul e corect, dar nu mai e suficient”, doar din cifre reale — imo360 (anunțuri în toată zona, doar București), Publi24 (câte anunțuri sunt acum în zonă, câte promovate plătit, câte repostate) și câte proprietăți asemănătoare cer ±10% același preț/mp. Mesajul 1 promite „cum vă scoatem anunțul în față fără să scădeți prețul”; mesajul 2 și PDF-ul (secțiunea cu 4 cifre + 4 argumente: locul din listă se cumpără, la preț egal decide prezentarea, portalul atinge doar cine caută azi, mai mulți cumpărători deodată țin prețul). Situația se alege „la piață” doar dacă și evaluarea motorului e de acord (prețul ≤ listarea recomandată +3%). Mesajul 2 spune câți cumpărători activi din bază se potrivesc, dacă există.
- Sursele aplicației: `app/src-2026-10-23-v61.tar.gz.enc` (aceeași cheie ca backup-ul; fără `harta/`, care stă în fișierele publicate ale artefactului).

## Publi24 scos din proprietari (v60, 22 oct. 2026)
- Pe Publi24 multe agenții se dau persoane fizice, iar semnalele pe care le putem citi (agenție geamănă pe alt portal, text, contul cu mai multe anunțuri) prind doar ~6% (71 din 1.117). Fără telefon (pe care nu-l stocăm) nu se pot deosebi sigur.
- Implicit, anunțurile Publi24 nu mai apar în „Azi” și „Proprietari” (Găsite, Alerte noi, Toate) și nici în numărul de alerte noi; cele salvate de mână rămân. Comutatorul „Arată și anunțurile Publi24” din Proprietari le aduce înapoi (preferință pe dispozitiv, `nv-p24` în localStorage).
- Datele Publi24 rămân în evaluări, în prețurile zonelor, în potrivirile cu cumpărătorii și în lista concurenților din PDF-ul ofertei.

