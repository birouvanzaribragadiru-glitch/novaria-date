=== Novaria Evaluator ===
Contributors: novaria
Tags: imobiliare, evaluare, real estate, valuation
Requires at least: 5.8
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.5.2
License: GPLv2 or later

Evaluator online pentru apartamente, case și terenuri din București și Ilfov, cu date de piață actualizate zilnic.

== Descriere ==

* Pune [novaria_evaluator] pe orice pagină.
* Vizitatorul alege tipul proprietății, scrie zona (cu sugestii, fără diacritice) și suprafața și vede imediat intervalul de preț.
* Opțional scrie strada (lista străzilor din OpenStreetMap, doar cele din zona aleasă): unde anunțurile arată că strada e mai scumpă sau mai ieftină decât media zonei, estimarea ține cont; la apartamentele din București strada completează și distanța până la metrou.
* Raportul detaliat (preț rapid / realist / de listare, ce crește și ce scade valoarea, piața din zonă) se deschide după ce lasă un număr de telefon și bifează acordul de contactare.
* Cererile se salvează la „Lead-uri evaluare” (vizibile doar administratorilor) și vin pe email.
* Datele de piață vin dintr-un fișier public cu cifre agregate pe zone, actualizat zilnic de Novaria. Dacă fișierul nu e disponibil, plugin-ul folosește ultima copie bună sau copia inclusă.

== Setări ==

Setări → Novaria Evaluator: emailul pentru lead-uri, telefonul și WhatsApp-ul afișate, pagina de confidențialitate, culorile, cât timp se păstrează lead-urile.

== Date personale ==

Se salvează doar ce completează vizitatorul (telefon, opțional nume și email), datele proprietății și estimarea afișată, plus momentul acordului. Evaluările făcute fără să se lase un contact se păstrează 6 luni, doar cu datele proprietății și estimarea (fără nume, telefon sau email). Lead-urile mai vechi decât perioada aleasă în setări se șterg automat. Plugin-ul se leagă de instrumentele WordPress de export și ștergere a datelor personale (Unelte → Exportă / Șterge date personale).

== Changelog ==

= 1.5.2 =
* Expeditorul mailurilor se setează din Setări (nume + adresă pe domeniul site-ului; implicit „Novaria <contact@domeniu>”), în loc de „WordPress <wordpress@domeniu>”. Se aplică la estimarea trimisă clientului, urmărirea la 30/60/90 de zile, notificările către agenție.

= 1.5.1 =
* Chiria mediană și randamentul brut pe zonă (din anunțurile de închiriere), în rezultat și în raportul lunar.

= 1.5.0 =
* Raport lunar de piață pe zonă: shortcode `[novaria_raport zona="bragadiru"]` (preț median, evoluție, anunțuri noi/ieșite, preț redus, pondere proprietari) și articol creat automat în prima zi a lunii pentru zonele alese (ciornă sau publicat automat).
* Urmărire după evaluare: la 30, 60 și 90 de zile, cine a lăsat emailul primește ce s-a schimbat în zona lui și estimarea actualizată, cu dezabonare dintr-un clic.
* Negocierea măsurată din vânzările reale (din aplicația internă) intră în calcul când sunt destule vânzări.
* Pagina de setări arată evaluările, cererile și conversia din ultimele 30 de zile.

= 1.4.1 =
* Motor nou, identic cu cel din aplicația internă: băi, lift, acoperiș (ultimul etaj), material, orientare, certificat energetic, vedere, stadiu, mobilat, boxă — toate opționale, în „Mai multe detalii”.
* Factorii calibrați din anunțurile reale (vin zilnic cu datele) se aplică și pe site.
* Câmpurile opționale se adaptează la camere / etaj (băile nu apar la garsoniere, acoperișul și liftul apar la ultimul etaj).

= 1.4.0 =
* Evaluările făcute de vizitatori (și fără contact) se păstrează 6 luni, fără date personale, și apar în aplicația internă Novaria (Dosare → De pe site), împreună cu cererile de raport.
* Cheie de citire pentru aplicația internă (Setări → Novaria Evaluator).

= 1.3.0 =
* Câmpul „Ansamblu rezidențial”: proiectele cu prețuri diferite de zonă (de ex. Spazio Residence) au diferența lor, în locul factorului străzii.

= 1.2.1 =
* Străzile notate de agenție se aplică la toate tipurile de proprietăți, cu eticheta potrivită.
* Evaluatorul știe că suprafața din anunțuri include balconul (datele publicate sunt deja pe mp util).

= 1.2.0 =
* Suprafața utilă și balconul / terasa se scriu separat: balconul nu intră în suprafața utilă și contează cam la jumătate din prețul pe mp (terasa, cam 30%), față de un balcon obișnuit.
* Pe telefon, câmpul de zonă se golește la atingere, ca să poți scrie direct altă zonă.
* Balconul apare în lead și în email.

= 1.1.0 =
* Câmpul „Strada”, cu factorul străzii față de media zonei (calculat automat din anunțurile de pe stradă și din jur) și distanța până la metrou din stradă.
* Strada apare în lead și în email.

= 1.0.2 =
* Săgețile listelor vizibile cu tema site-ului.
