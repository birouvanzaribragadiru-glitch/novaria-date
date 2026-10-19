# novaria-date

Datele publice pentru evaluatorul de pe [novaria.ro/evaluare-gratuita](https://novaria.ro/evaluare-gratuita/).

- `data/evaluator.json` — valorile pe zone (€/mp pentru apartamente vechi și noi, case, terenuri), lichiditatea zonei, câteva statistici agregate și factorii străzilor (cu cât e o stradă peste sau sub media zonei, calculat din mai multe anunțuri de pe stradă și din jur). Se actualizează automat în fiecare zi.
- `data/strazi.json` — lista străzilor din OpenStreetMap (nume, localitate, centru, distanța până la metrou), pentru câmpul „Strada” din formular. © colaboratorii OpenStreetMap, licența ODbL.
- `lib/` — motorul de evaluare (același ca în aplicația internă Novaria), calculul de piață, factorii străzilor (`micro.js`, cu verificare automată: factorul se aplică doar la tipurile la care prezice prețul mai bine decât media zonei), localizarea anunțurilor pe stradă (`geo.js`, pe indexul `strazi.json` din OpenStreetMap) și câmpul de căutare.
- `scripts/export.js` — construiește `data/evaluator.json` din colecțiile aplicației interne.
- `plugin/novaria-evaluator/` — plugin-ul de WordPress.

Fișierul conține doar cifre agregate pe zone și străzi (o stradă apare doar dacă are cel puțin două anunțuri pe ea și în jur). Nu conține anunțuri individuale, linkuri, nume, telefoane sau date ale clienților.

Surse: anunțuri publice monitorizate de Novaria (Publi24, alerte Storia, Sud Rezidențial) și indici de piață imo360 (https://www.imo360.ro), folosiți ca reper de evoluție.
