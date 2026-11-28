# Stare — 28 nov. 2026

**Faza:** v1.3 instalată pe Mac mini pe 28 nov. (ultima instalare de mână): panou, alarme, raportul de la 07:30, actualizare automată. Felia 3 (ziarul zilei) e în sarcina programată Claude. v1.4 (doar textul raportului de pe Telegram, care anunță ziarul) e publicată ca primă actualizare automată reală: Lucian trebuie să primească „⬆️ s-a actualizat singur: v1.3 → v1.4” în cel mult o oră. Dacă nu vine, e de verificat actualizarea.

**Versiunea 1.3 (de instalat o dată):**
- **Actualizare automată.** O dată pe oră, și la cerere cu /versiune, agentul citește `versiune.json` din depozitul public novaria-date, folderul `sistem/`. Ia doar fișierele din listă, fiecare verificat cu SHA-256, iar codul trebuie să compileze. Nu se poate înlocui așa nici `config.json`, nici lansatorul. Agentul se repornește și anunță pe Telegram „⬆️ s-a actualizat singur” și ce e nou.
- **Lansatorul `porneste.py`** (launchd îl pornește pe el, nu se actualizează singur). Dacă o versiune nouă cade de 3 ori la pornire, pune la loc fișierele vechi (`*.vechi`) și anunță. Versiunea respinsă nu mai e încercată.
- **Raportul de la 07:30** pe Telegram, fără sunet: starea de acum, plus ce s-a stricat și ce și-a revenit de la raportul trecut, cu ora. Comanda /raport îl dă oricând. Primul raport vine a doua zi după instalare.
- **Sarcina programată Claude** „Sistemul AI: raportul de dimineață”: zilnic la 06:59, notificare push, aprobare automată. Citește chaturile din ultimele 24 de ore și scrie ce s-a lucrat ieri, ce a rămas deschis și 3 idei. Fără e-mailuri. Prima rulare e pe 29 nov.

**Verificat:**
- 42 de teste de comportament trec (`teste/test_sistem.py`), cu macOS și Telegram simulate și un server local în locul GitHub-ului.
- Actualizarea a fost testată pe toate cazurile: fișier corupt, cod cu greșeli, nume nepermise, lansatorul neatins, versiune bună instalată cu copie `.vechi`. Am testat și revenirea cu procese reale: versiunea stricată cade de 3 ori, iar a patra oară pornește cea veche.
- Instalarea a fost rulată cap-coadă într-un „home” fals.

**Bug reparat în v1.1:** chat ID-ul fusese salvat greșit (numele botului în loc de număr), așa că Telegram refuza mesajele fără să se vadă. Acum instalarea așteaptă /start, acceptă doar un ID numeric, trimite o probă și se oprește dacă proba nu ajunge. Panoul arată când alarmele nu ajung.

**Feliile 4–9 (28 nov.):** felia 4 a fost sărită la cererea lui Lucian. Feliile 5–9 sunt în skill-ul `banda-anunt`, propus lui Lucian pentru salvare.

**Ce așteaptă după Lucian:**
1. să confirme că a primit „⬆️ v1.3 → v1.4”;
2. să salveze skill-ul `banda-anunt` din cardul din chat;
3. să lege în vidIQ Instagram-ul, Pagina de Facebook și TikTok-ul Novaria, plus canalul de YouTube pe care merg reel-urile (acum e legat doar Ghidul Stoic);
4. prima rulare a benzii pe o proprietate reală, pe MacBook, cu Lightroom și DaVinci deschise.

**Următorul pas:** 29 nov.: verificăm raportul Claude (06:59, cu ziarul) și pe cel de pe Telegram (07:30); apoi prima bandă pe o proprietate.

**Probleme deschise:**
- Panoul se vede doar în rețeaua locală; de oriunde merge /stare în Telegram.
- Dacă Mac mini-ul se oprește de tot (curent, internet), nu poate trimite alarmă. Veghea serverului Novaria anunță oricum când colectorul tace.
- O versiune care pornește bine, dar cade mai târziu, nu e prinsă de lansator. Lucian ar observa lipsa raportului de la 07:30.
