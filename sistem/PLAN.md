# Planul pe felii

De la v1.3, Mac mini-ul își ia singur versiunile noi (vezi DECIZII.md); doar v1.3 se instalează de mână.

Fiecare felie merge cap-coadă și se verifică singură. Se lucrează doar pe cele ale căror dependențe sunt gata.

| # | Felia | Ce face cap-coadă | Depinde de | Stare |
|---|---|---|---|---|
| 1 | Panou + alarme | Verifică CryptoRadar, Novaria Studio, colectorul, Chrome, discul, repornirile; alarmă pe Telegram; /stare; panou web în rețeaua locală | — | ✓ merge pe Mac mini (28 nov.) |
| 2 | Raportul de dimineață | 07:30 pe Telegram (Mac mini, gratis): ce s-a întâmplat noaptea + starea acum. 06:59 sarcina programată Claude „Sistemul AI: raportul de dimineață” (notificare în aplicația Claude): ce ai lucrat ieri din chaturi, ce a rămas deschis, 3 idei. Fără e-mailuri. | 1 | ✓ instalată pe Mac mini (v1.3, 28 nov.); primele rapoarte pe 29 nov. |
| 3 | Ziarul zilei | Partea a doua a raportului Claude de la 06:59: 3–4 știri AI (mai întâi uneltele lui) + 2–3 de imobiliare (România, București–Ilfov), din ultimele 48 de ore, fiecare cu „Pentru tine”; caută pe web (evaluatorul nu are încă știri) | 1 | ✓ în sarcina programată (28 nov.); prima ediție pe 29 nov. |
| 4 | Memorie de business | — | — | sărită (28 nov.): Claude ține deja minte proiectele, oamenii și deciziile; fără e-mailuri n-ar aduce nimic nou |
| 5 | Intrarea anunțului | Folderul proprietății + `cum-vreau.txt`; fișa `BANDA.md` în folder, ca banda să se poată relua în orice chat | 1 | ✓ în skill-ul `banda-anunt` (28 nov.) |
| 6 | Poze | `poze-hdr` (Lightroom) → `egalizare-lumina` → curățare pe pozele alese → aprobarea 1 | 5 | ✓ în `banda-anunt` |
| 7 | Reel | Pe tăietura lui Lucian din DaVinci: `virtual-staging` → aprobarea 2 → exporturile (YouTube 4K + Meta/TikTok 1080p 20 Mbps) | 5 | ✓ în `banda-anunt` |
| 8 | Tur 360 | `egalizare-lumina` pe panorame → urcat împreună cu anunțul | 5 | ✓ în `banda-anunt` |
| 9 | Publicare | `anunt-novaria` (novaria.ro + Storia, aprobarea 3) → `descrieri-reel-novaria` → vidIQ: o ciornă pentru IG, FB, TikTok, YouTube → aprobarea 4 → publicare | 6, 7, 8 | ✓ în `banda-anunt`; de legat conturile în vidIQ |
