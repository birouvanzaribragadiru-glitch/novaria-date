# Căutările salvate pe Storia (contul de colectare)

Refăcute pe 21 oct. 2026, la cererea lui Lucian. Total: 112 căutări, toate cu notificări pe e-mail, frecvența „Imediată”.

## De ce sunt împărțite așa
Un e-mail de alertă Storia arată cel mult 5 anunțuri și numără cel mult 31 („Am găsit N anunțuri”). Restul sunt doar în spatele butonului „Verifică restul”, pe care nu-l deschidem. Prin urmare, o căutare e utilă doar dacă aduce cel mult ~5 anunțuri noi pe zi.

Volumul „nou” pe Storia e uriaș: Sectorul 4 a avut ~300 de anunțuri noi pe zi, Ilfov ~250. Cea mai mare parte sunt anunțuri de dezvoltatori și agenții reactualizate zilnic. De aceea împărțirea e pe piață: „deja locuite” = SECONDARY, „noi” = PRIMARY.

## Structura
- **Proprietari (persoane fizice), acoperire completă:**
  - apartamente pe sectoare S1–S6;
  - apartamente Ilfov, două căutări: 1–2 camere și 3–5 camere;
  - case București și case Ilfov;
  - terenuri București și terenuri Ilfov.
- **Revânzare (SECONDARY), pe sector × camere:**
  - benzi de preț pe segmentele mari: S3 2 cam. (≤115k / 115–150k / >150k), S4 2 cam. (≤80k / 80–100k / >100k), S4 3 cam. (≤120k / >120k), S5 2 cam. (≤95k / >95k), S5 3 cam. (≤145k / >145k), S6 2 cam. (≤100k / >100k), S6 3 cam. (≤130k / >130k);
  - Ilfov pe camere (1 / 2 / 3 / 4–5).
- **Construcții noi (PRIMARY), ca eșantion:**
  - câte una pe sector;
  - Ilfov pe camere.
- **Zonele Novaria:**
  - case Bragadiru pe preț (≤180k / 180–210k / 210–250k / >250k);
  - apartamente Bragadiru și Chiajna pe camere (1 / 2 / 3+);
  - căutări „TOATE” pe localitate pentru Domnești, Măgurele, Clinceni, Cornetu, Jilava, Chiajna (case), Popești, Berceni, Voluntari, Otopeni, Pantelimon, Corbeanca, Snagov, Balotești;
  - terenuri pe localitate.
- **Case București** pe sectoare. **Case Ilfov** pe 4 benzi de preț. **Terenuri Ilfov** pe 3 benzi de preț.
- **Închirieri:** 8 căutări, ca eșantion pentru chiria mediană.

Șterse: căutările „TOATE” pe sector, Ilfov, case București/Ilfov, terenuri Ilfov, plus vechile împărțiri sector × camere fără piață, fiindcă erau pline zilnic.

## Limite cunoscute
- Filtrul de camere prin adresă acceptă doar până la 5 („4, 5”). Apartamentele cu 6+ camere nu intră în căutările pe camere, dar sunt rare.
- Pagina „Salvate” (storia.ro/ro/salvat/cautari) arată pentru fiecare căutare `newAdsCount` de la ultima vizită. După o zi, acolo se vede ce căutări depășesc 5 pe zi și trebuie împărțite mai departe. Raportul task-ului de alerte arată și el căutările pline („storia_pline”).
- E-mailul OLX „Anunțuri noi în filtrele tale” arată un singur anunț din zeci, deci nu e folosit.
