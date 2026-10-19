# novaria-date

Datele publice pentru evaluatorul de pe [novaria.ro/evaluare-gratuita](https://novaria.ro/evaluare-gratuita/).

- `data/evaluator.json` — valorile pe zone (€/mp pentru apartamente vechi și noi, case, terenuri), lichiditatea zonei și câteva statistici agregate. Se actualizează automat în fiecare zi.
- `lib/` — motorul de evaluare (același ca în aplicația internă Novaria), calculul de piață și câmpul de căutare a zonei.
- `scripts/export.js` — construiește `data/evaluator.json` din colecțiile aplicației interne.
- `plugin/novaria-evaluator/` — plugin-ul de WordPress.

Fișierul conține doar cifre agregate pe zone. Nu conține anunțuri individuale, linkuri, nume, telefoane sau date ale clienților.

Surse: anunțuri publice monitorizate de Novaria (Publi24, alerte Storia, Sud Rezidențial) și indici de piață imo360 (https://www.imo360.ro), folosiți ca reper de evoluție.
