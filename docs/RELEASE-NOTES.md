## Terrain / O 0.7.0

Classificazione e vettorizzazione riscritte dove sbagliavano, con un gate di
qualità che blocca la CI se i numeri peggiorano.

### Installa

Scarica **`Terrain-O-Setup.exe`** qui sotto ed eseguilo. L'installazione è per
utente, non richiede privilegi di amministratore e crea i collegamenti sul
desktop e nel menu Start. Al primo avvio Windows può mostrare l'avviso
SmartScreen (l'eseguibile non ha un certificato commerciale): *Ulteriori
informazioni → Esegui comunque*.

### Cosa è cambiato

- **Regole di classificazione per tinta Lab**: vegetazione e aperto si separano
  per angolo di tinta (verde vs giallo/oliva), non più per il solo asse a\*. Il
  prato in ombra non viene più letto come bosco: su una scena con ombra forte,
  sfocatura e grana l'accuratezza passa dall'81,9% al 99,5%.
- **Tetti e superfici costruite** hanno una regola propria (tinta calda, bassa
  varianza): prima finivano in "aperto" o "incerto".
- **Bilanciamento dell'illuminazione** fino a 2,6× invece di 1,6×, per ombre
  reali a 0,3–0,5 esposizione.
- **Confidenza ricalibrata** e soglia di vettorizzazione a 0,45: sparisce il
  12,6% di fotogramma che veniva tagliato dalle maschere pur essendo classificato
  con decisione. La copertura dei poligoni passa dall'87,3% al 99,97%.
- **Riconciliazione dei bordi riparativa**: gli anelli che si auto-intersecano
  vengono ripristinati singolarmente invece di far scartare l'intero passaggio.
  Poligoni invalidi: 25 → 0. Confini condivisi realmente condivisi.
- **Estrattore di contorni corretto**: un lato già percorso non interrompe più il
  ciclo, quindi gli anelli interni (i fori) non vengono persi.
- **Chiome**: differenza di medie a tre scale con segno, test di anello e
  distanza dal bordo della vegetazione. Precisione 0,74 e richiamo 0,74 sul
  banco di prova; i 127 rilevamenti fasulli sul contorno del bosco sono zero.
- **Nuovo gate di qualità**: `src/classify/realistic.test.ts` misura accuratezza
  per classe, chiome, copertura, fori, invalidità e vertici condivisi su
  un'ortofoto sintetica con verità a terra nota. Metodo e numeri in
  `docs/QUALITY.md` / `docs/QUALITY.en.md`.
- Manuale italiano e inglese aggiornati, con indice corretto e nuova sezione
  "Qualità misurata".

### Verificato

- 124 test unitari, lint, typecheck e build.
- Suite Playwright completa: flussi desktop e mobile, AI, OSM simulato, export
  OMAP, landing, WCAG AA in entrambi i temi.
- Audit end-to-end con export reali: GeoJSON senza anelli aperti né
  auto-intersezioni, 1 foro conservato, copertura 99,97%; OMAP con 191 simboli;
  PNG con titolo, nord, legenda e avvertenza.

### Limiti dichiarati, invariati

L'interpretazione automatica resta materiale sperimentale. Il programma non
dichiara percorribilità, vegetazione sotto copertura, sicurezza del terreno,
quota di precisione, ostacoli non visibili, nord geografico verificato o
conformità IOF; la verifica è sempre una dichiarazione esplicita dell'utente.

**Requisiti:** Windows 10/11 a 64 bit. Nessun account.
