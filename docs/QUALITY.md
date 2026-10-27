# Terrain / O — Qualità misurata della pipeline

**Versione 0.7.0 · Bozza preliminare**

English edition: [QUALITY.en.md](QUALITY.en.md).

Questo documento riporta i numeri con cui la pipeline di classificazione,
vettorizzazione, riconoscimento e fusione viene verificata. Non sono stime: ogni
valore è prodotto da un test che gira in CI (`npm run test`) e fallisce se il
risultato peggiora.

## Perché una scena sintetica

Un'ortofoto reale non ha una verità a terra pixel per pixel, quindi non permette
di misurare nulla in modo ripetibile. `src/test/orthophoto.ts` genera una scena
960×720 deterministica che contiene i casi difficili di un rilievo vero:

- bosco con 420 chiome dipinte singolarmente, ombreggiatura radiale e texture;
- prato con bande di sfalcio, rumore fine e grana;
- lago e stagno con riflessi sinusoidali (lo stagno è l'unico foro chiuso);
- strada in asfalto che attraversa il bosco, con aggregato grossolano;
- edificio con colmo del tetto e ombra portata netta;
- affioramento roccioso chiaro e screziato;
- ombra morbida su un terzo della scena.

Ogni pixel ha la classe che la fotografia mostra davvero, e ogni chioma ha la sua
coordinata. La variante `hardenScene` aggiunge due passate di sfocatura 3×3,
un'ombra a bordo netto al 45% dell'esposizione e un'esposizione sinusoidale: è la
versione "ottica reale" su cui la classificazione deve restare accurata.

## Cosa misura il test

`src/classify/realistic.test.ts` verifica quattro cose.

### 1. Accuratezza per classe

| Scena | Accuratezza | IoU vegetazione | IoU aperto | IoU acqua | IoU artificiale |
| --- | --- | --- | --- | --- | --- |
| Pulita | 99,9% | 0,998 | 0,999 | 1,000 | 0,999 |
| Ombra + sfocatura + grana | 99,5% | 0,99 | 0,99 | 0,999 | 0,995 |

La soglia di test è 99% (scena pulita) e 98,5% (scena difficile), con IoU minimo
0,97 e 0,95. Il caso difficile è quello che ha guidato la riscrittura delle
regole: prima della correzione l'accuratezza scendeva all'81,9%, con 124.513
pixel di prato in ombra letti come vegetazione.

### 2. Rilevamento chiome

| Metrica | Valore | Soglia di test |
| --- | --- | --- |
| Chiome rilevate | 418 su 420 attese | — |
| Precisione (entro 9 px) | 0,742 | > 0,68 |
| Richiamo | 0,738 | > 0,65 |
| Rilevamenti sul bordo del bosco | 0 | nessuno entro 1,2× scala |

Il rilevatore usa una differenza di medie a tre scale con segno, un test di
anello e la distanza dal bordo della vegetazione. Resta un rilevatore
sperimentale: i punti sono sempre modificabili e mai verificati automaticamente.

### 3. Topologia e copertura della vettorizzazione

| Metrica | Valore |
| --- | --- |
| Poligoni | 10 |
| Anelli totali | 11 |
| Fori conservati | 1 (lo stagno) |
| Poligoni invalidi | 0 |
| Poligoni scartati | 0 |
| Area coperta rispetto al fotogramma | 99,97% |
| Errore d'area per classe | < 2% |
| Vertici duplicati negli anelli | 0 |
| Vertici condivisi fra poligoni adiacenti | 148 |

Il test impone invalid = 0, scartati = 0, copertura > 99,5%, errore d'area < 2%
per classe e almeno 50 vertici condivisi: due classi adiacenti devono avere lo
stesso confine, non due confini simili.

### 4. Export reali

L'audit end-to-end importa la scena come PNG + world file, esegue **Esegui
tutto**, poi scarica GeoJSON, OMAP, PNG e SVG. Sul file GeoJSON esportato:

| Controllo | Esito |
| --- | --- |
| Anelli non chiusi | 0 |
| Auto-intersezioni | 0 |
| Vertici duplicati consecutivi | 0 |
| Anelli con meno di 4 coordinate | 0 |
| Copertura dell'area rispetto al fotogramma | 99,97% |
| OMAP | 191 simboli, 686 oggetti, 686 blocchi coordinate |
| PNG | 1032×956 px, con titolo, nord, legenda e avvertenza |
| SVG | 11 elementi vettoriali, raster incorporato |

Gli artefatti dell'audit (screenshot, export, report) sono in
`screenshots/audit/` e non entrano nel repository.

## Cosa è cambiato in questa versione

- **Regole per tinta, non per asse a\***: la separazione vegetazione/aperto usa
  l'angolo di tinta Lab (verde 130–190°, giallo/oliva 78–125°), quindi il prato
  in ombra non viene più letto come bosco. Le superfici costruite hanno una
  regola propria per i tetti caldi, che prima cadevano in "aperto" o "incerto".
- **Bilanciamento locale più ampio**: il guadagno massimo passa da 1,6× a 2,6×,
  perché un'ombra reale vale 0,3–0,5 esposizione.
- **Confidenza ricalibrata**: combina evidenza e separazione dal secondo posto;
  la soglia del vettorizzatore scende a 0,45 e non taglia più pixel classificati
  con decisione (prima il 12,6% del fotogramma spariva dalle maschere).
- **Riconciliazione dei bordi riparativa**: un anello che si auto-interseca
  viene ripristinato da solo invece di far scartare l'intero passaggio. Gli
  invalidi passano da 25 a 0 e i confini condivisi sono davvero condivisi.
- **Estrattore di contorni corretto**: un arco già percorso non interrompe più
  il ciclo, quindi gli anelli interni non vengono persi.
- **Chiore**: differenza di medie a tre scale con segno, test di anello,
  distanza dal bordo e soppressione non massima dipendente dalla scala.

## Riproduzione

```bash
npm run test          # include src/classify/realistic.test.ts
npm run check         # lint + tipi + test + build
npx playwright test   # flussi UI, AI, OSM mock, export, WCAG AA
```

## Limiti

- La scena sintetica è difficile ma non è un campo: non sostituisce un rilievo.
- La classificazione resta materia prima sperimentale. Il programma non dichiara
  percorribilità, vegetazione sotto copertura, sicurezza del terreno, quota di
  precisione, ostacoli non visibili, nord geografico verificato o conformità IOF.
- Il rilevamento chiome è un rilevatore, non un censimento: falsi positivi e
  chiome mancate restano possibili e vanno corretti a mano.
- OSM e DEM dipendono da servizi esterni; l'audit li esclude per essere
  riproducibile e offline.
