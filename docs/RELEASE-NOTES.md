## Terrain / O 0.6.0

Programma desktop installabile per Windows, più la pagina di download.

### Installa

Scarica **`Terrain-O-Setup.exe`** qui sotto ed eseguilo. L'installazione è per
utente, non richiede privilegi di amministratore e crea i collegamenti sul
desktop e nel menu Start. Al primo avvio Windows può mostrare l'avviso
SmartScreen (l'eseguibile non ha un certificato commerciale): *Ulteriori
informazioni → Esegui comunque*.

### Cosa contiene

- App Electron che serve lo stesso editor del web da un'origine `app://`, così i
  progetti restano in IndexedDB e funzionano senza connessione. OSM e DEM
  richiedono rete solo quando li si richiede.
- Pagina di download alla radice del sito, con descrizione, limiti dichiarati,
  requisiti, passi di installazione e link diretto all'installer; l'editor vive
  su `/editor.html`.
- Manuale completo (IT/EN) in Markdown e PDF, aggiornato a questa versione.
- Workflow `Desktop release` che ricostruisce e ripubblica l'installer a ogni tag.

### Limiti dichiarati, invariati

L'interpretazione automatica resta materiale sperimentale. Il programma non
dichiara percorribilità, vegetazione sotto copertura, sicurezza del terreno,
quota di precisione, ostacoli non visibili, nord geografico verificato o
conformità IOF; la verifica è sempre una dichiarazione esplicita dell'utente.

**Requisiti:** Windows 10/11 a 64 bit. Nessun account.
