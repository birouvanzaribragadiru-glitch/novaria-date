# Copia de siguranță a bazei Novaria Evaluator

Arhive săptămânale `novaria-AAAA-LL-ZZ.tar.gz.enc`: toate colecțiile aplicației interne (un JSON pe document, în foldere pe colecții),
criptate AES-256-CBC (openssl, PBKDF2 200.000 iterații). Depozitul e public: fără cheie, fișierele nu pot fi citite.
Cheia e în aplicație (Setări → Copia de siguranță) și trebuie păstrată separat.

Restaurare (pe orice calculator cu openssl):

    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in novaria-AAAA-LL-ZZ.tar.gz.enc -out novaria.tar.gz
    tar xzf novaria.tar.gz

Reîncărcarea în aplicație se face cu ArtifactData (batch set, câte 50 de documente), colecție cu colecție.
Se păstrează ultimele 6 arhive.
