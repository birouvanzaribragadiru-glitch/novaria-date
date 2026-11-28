# Sistemul AI (Mac mini)

Panou și alarme pentru automatizările Novaria care rulează pe un Mac mini: CryptoRadar, Novaria Studio, colectorul, Chrome, discul și repornirile. Are raport de dimineață pe Telegram și se actualizează singur din acest folder.

- `sistem.py` — agentul (Python 3.9+, doar biblioteca standard). Îl pornește `porneste.py`.
- `porneste.py` — lansatorul. Dacă o versiune nouă nu pornește, revine la cea veche.
- `versiune.json` — versiunea publicată și SHA-256 pentru fiecare fișier pe care Mac mini-ul îl ia singur (scris de `publica.py`).
- `Instalare.command` — prima instalare, pe Mac.
- `teste/` — testele de comportament: `python3 teste/test_sistem.py`.
- `PROIECT.md`, `STARE.md`, `DECIZII.md`, `PLAN.md` — fișa proiectului.

Folderul e public: nu conține tokenuri, parole sau date despre clienți. Tokenul botului de Telegram stă doar pe Mac mini, în `~/SistemAI/config.json`.
