# Terrain / O — Manuale completo

**Versione 0.7.0 · Bozza preliminare**

English edition: [TUTORIAL.en.md](TUTORIAL.en.md).

Questo manuale descrive ogni funzione dell'editor, ogni pannello, ogni voce di menu,
ogni strumento e ogni scorciatoia. È pensato per essere letto dall'inizio alla fine
oppure consultato come riferimento mentre si lavora.

> **Avvertenza.** Terrain / O produce bozze preliminari di mappe di orienteering.
> Non dichiara percorribilità, vegetazione sotto copertura, sicurezza del terreno,
> quota di precisione, ostacoli non visibili, nord geografico verificato o conformità IOF.
> La verifica è sempre una dichiarazione esplicita dell'utente, mai un risultato automatico.

---

## Indice

1. [Prima di iniziare](#1-prima-di-iniziare)
2. [Installazione e comandi](#2-installazione-e-comandi)
3. [Primo avvio](#3-primo-avvio)
4. [Desktop, tablet e telefono](#4-desktop-tablet-e-telefono)
5. [La shell desktop](#5-la-shell-desktop)
6. [I pannelli](#6-i-pannelli)
7. [Import e georeferenziazione](#7-import-e-georeferenziazione)
8. [Calibrazione, scala e stampa](#8-calibrazione-scala-e-stampa)
9. [Navigazione: zoom, pan, righelli](#9-navigazione-zoom-pan-righelli)
10. [Selezione](#10-selezione)
11. [Disegno](#11-disegno)
12. [Modifica degli elementi](#12-modifica-degli-elementi)
13. [Verifica e provenienza](#13-verifica-e-provenienza)
14. [Livelli](#14-livelli)
15. [Classificazione](#15-classificazione)
16. [Vettorizzazione](#16-vettorizzazione)
17. [Import / export, OSM, DEM, tracciato](#17-import-export-osm-dem-tracciato)
18. [Il file .omap](#18-il-file-omap)
19. [Risoluzione dei problemi](#19-risoluzione-dei-problemi)
20. [Appendice](#20-appendice)
21. [Qualità misurata](#21-qualità-misurata)

---

## 1. Prima di iniziare

### 1.1 A cosa serve

Terrain / O trasforma un'ortofoto georeferenziata in una base cartografica di lavoro:

- importa l'immagine e ne conserva la provenienza;
- interpreta colori e texture con una pipeline locale;
- propone aree automatiche vettoriali;
- permette di disegnare e correggere aree, linee e punti;
- gestisce un percorso di orienteering con partenza, controlli e arrivo;
- esporta PNG, SVG, PDF, OMAP, GeoJSON, GPX e KML.

### 1.2 A cosa non serve

Non è un sistema di validazione IOF, non certifica la sicurezza del terreno, non
sostituisce il rilievo sul campo, non è un navigatore GPS e non è un servizio di
collaborazione in tempo reale. I dati OSM e DEM sono di terze parti e possono essere
incompleti, arretrati o disallineati.

### 1.3 Livelli di provenienza

Quattro livelli restano sempre distinti.

| Livello | Origine | Come si riconosce |
| --- | --- | --- |
| **Sorgente** | ortofoto importata | raster, nessun bordo vettoriale |
| **Automatico** | classificazione, AI, vettorizzazione, OSM, DEM | bordo tratteggiato sottile, neutro |
| **Manuale** | geometria disegnata o corretta dall'utente | bordo pieno sottile, neutro |
| **Verificato** | dichiarazione esplicita dell'utente | bordo pieno + spunta ✓ nell'angolo |

La provenienza non è mai affidata al solo colore: tratteggio, linea piena e spunta
sono forme diverse. Non esistono punti interrogativi né badge "sperimentale" fissi
sulla mappa. L'informazione compare solo nel pannello Proprietà e nella status bar.

### 1.4 Regola della verifica

Un elemento nasce **non verificato**. Diventa verificato solo con il pulsante
**Dichiara verificato** nel pannello Proprietà, dopo una dichiarazione esplicita.
Qualsiasi modifica geometrica successiva revoca automaticamente la verifica e lascia
traccia nello storico. Nessun flusso automatico può scrivere `verified`.

### 1.5 Browser consigliati

Chrome, Edge o Firefox aggiornati. Servono IndexedDB, Web Worker, Canvas 2D e
`OffscreenCanvas`/`ImageBitmap` per le elaborazioni. Safari funziona, ma le prestazioni
dei worker e la memoria disponibile possono essere inferiori.

---

## 2. Installazione e comandi

### Programma desktop (Windows)

L'installer è pubblicato nelle release GitHub del progetto (`Terrain-O-Setup.exe`).
L'installazione è per utente, non richiede privilegi di amministratore e crea i
collegamenti sul desktop e nel menu Start.

1. scaricare l'installer dall'ultima release;
2. eseguirlo e seguire il setup;
3. aprire **Terrain / O** dal collegamento creato.

Al primo avvio Windows può mostrare l'avviso SmartScreen, perché l'eseguibile non è
firmato con un certificato commerciale: **Ulteriori informazioni → Esegui comunque**.
Il programma desktop è lo stesso editor del browser, servito in locale da un'origine
`app://`: i progetti restano in IndexedDB, senza server e senza account. Gli export
usano la finestra di salvataggio di Windows. Non servono Node.js né una connessione;
OSM e DEM richiedono rete quando li si richiede.

Per costruire l'installer in locale:

```bash
npm run desktop:dev    # Vite + finestra Electron
npm run desktop:build  # build + installer in release/
```

### 2.1 Requisiti

- Node.js 20 o superiore (consigliati 22/24).
- npm.
- Almeno 4 GB di RAM libera per immagini grandi; 8 GB consigliati.

### 2.2 Installazione

```bash
npm install
```

### 2.3 Sviluppo

```bash
npm run dev
```

Aprire l'indirizzo mostrato da Vite, normalmente `http://localhost:5173`.
La porta usata dai test E2E è `5199`; non è obbligatorio usarla in sviluppo.

### 2.4 Build di produzione

```bash
npm run build
npm run preview
```

`build` esegue prima il typecheck e poi Vite. L'output è in `dist/`.

### 2.5 Qualità e test

| Comando | Cosa fa |
| --- | --- |
| `npm run typecheck` | TypeScript senza emissione |
| `npm run lint` | ESLint su tutto il progetto |
| `npm test` | Vitest: 120 test |
| `npm run test:watch` | Vitest in watch |
| `npm run coverage` | copertura V8 |
| `npx playwright install chromium` | installa il browser per gli E2E |
| `npx playwright test` | 19 test end-to-end: modalità essenziale, desktop, mobile, AI, OSM simulato, elaborazione automatica, standard ISOM/ISSprOM e WCAG AA |
| `npm run check` | lint, typecheck, test e build in sequenza |
| `npm run desktop:dev` | avvia Vite e la finestra Electron |
| `npm run desktop:build` | build e installer Windows in `release/` |

### 2.6 Manuale PDF

La guida è disponibile in Markdown (`docs/TUTORIAL.md`) e in PDF
(`docs/Terrain-O-Manuale.pdf`). Per rigenerare il PDF:

```bash
node scripts/build-manual.mjs
```

---

## 3. Primo avvio

Alla prima apertura si entra nella **modalità essenziale**: mappa a tutta finestra e
solo tre azioni, **Carica**, **Esegui tutto** ed **Esporta**. Il pulsante
**Modalità avanzata** apre l'editor completo; **Essenziale** riporta alla schermata
minima. La scelta viene ricordata in `localStorage`.

La prima volta che si apre la modalità avanzata compare l'introduzione in quattro passi:

1. importa la sorgente e non modificarla;
2. l'automatico è sperimentale;
3. verifica solo con una dichiarazione;
4. esporta una bozza, non una carta da gara.

I pulsanti **Salta** e **Inizia a lavorare** chiudono l'introduzione e memorizzano la
scelta. Per rivederla: **Aiuto → Introduzione guidata**.

Senza immagine la modalità essenziale mostra **Carica un'ortofoto per iniziare**; il
pulsante **Carica** accetta JPG/PNG, world file e `.prj`. In modalità avanzata la scheda
**Inizia da un'ortofoto** aggiunge **Scegli file**, **Come funziona** e l'elenco dei
formati; gli strumenti che richiedono un'immagine restano disabilitati.

### 3.1 Cosa si vede all'avvio

- **Modalità essenziale**: header con marchio Terrain / O e pulsante **Modalità avanzata**;
  canvas a tutta finestra; barra inferiore con **Carica**, **Esegui tutto**, **Esporta**.
- **Modalità avanzata**: menu bar, options bar,
  palette strumenti verticale, dock sinistro (Progetto, OSM, DEM, Percorso), dock destro
  (Livelli, Elementi, Proprietà, Classificazione, Vettorizzazione, AI, Storia, Info,
  Navigatore) e status bar con coordinate, zoom, selezione, provenienza, autosalvataggio
  e memoria stimata.

---

## 4. Desktop, tablet e telefono

Il layout si adatta automaticamente in base a larghezza e tipo di puntatore.
L'attributo `data-device` sull'app vale `desktop`, `tablet` o `phone`.

| Larghezza | Modalità | Comportamento |
| --- | --- | --- |
| > 900 px | desktop | pannelli agganciati, palette verticale, menu orizzontale |
| 621–900 px | tablet | menu a foglio, pannelli drawer, palette inferiore |
| ≤ 620 px | telefono | come tablet, con chrome secondario ridotto |

### 4.1 Differenze mobile

- Il menu si apre con il pulsante hamburger e diventa un foglio verticale; ogni voce
  apre il proprio sottomenu in linea.
- I pannelli laterali sono drawer: si aprono con i pulsanti in alto a sinistra e a
  destra, si chiudono con la X, con il pulsante di collapse o toccando lo sfondo scuro.
- La palette strumenti è una rail orizzontale in basso, scorrevole con un dito.
- Le opzioni non essenziali (unità righelli, tolleranza) si nascondono sui telefoni;
  restano zoom, snap e griglia.
- Il righello sinistro e la minimappa sulla mappa si nascondono sui telefoni;
  la minimappa resta nel pannello Navigatore.
- La status bar mostra solo coordinate, zoom e provenienza.
- I toast diventano scuri e compatti, sopra la rail degli strumenti.
- Le aree sicure di iPhone (`env(safe-area-inset-bottom)`) sono rispettate.

### 4.2 Gesti touch

| Gesto | Effetto |
| --- | --- |
| Un dito che trascina con strumento Hand o su spazio vuoto | pan |
| Due dita | pinch zoom e pan del centro |
| Tap con strumento Area/Linea | aggiunge un vertice |
| Tap sul primo vertice | chiude l'area |
| Pulsante **Termina** nella barra di disegno | chiude area o linea |
| Tap con strumento Punto | aggiunge un controllo percorso |
| Tap con strumento Zoom | ingrandisce |
| Doppio tap | non usato: evita conflitti con lo zoom di sistema |
| Tap su un elemento con Selezione | seleziona |
| Shift non disponibile | la selezione multipla si fa da Elementi con tap ripetuti? No: usare il pannello Elementi e il filtro; su touch la multiselezione si ottiene con il lazo o con il marquee |

> Nota: su touch non esiste Shift. Per selezionare più elementi usare **Marquee** o
> **Lazo** dalla palette. Il pannello Elementi seleziona un elemento per volta.

---

## 5. La shell desktop

### 5.1 Menu bar

La barra superiore contiene il marchio **TERRAIN / O**, i menu e,
a destra, il nome del progetto e le icone Importa, Esporta, Aiuto.

#### File

| Voce | Scorciatoia | Effetto |
| --- | --- | --- |
| Nuovo progetto… | — | chiede conferma e crea un progetto vuoto; il precedente resta salvato |
| Apri immagine o progetto… | Ctrl+O | apre il selettore file multiplo |
| Salva ora | Ctrl+S | salva subito in IndexedDB |
| Esporta mappa e dati… | Ctrl+E | apre la finestra Esporta |
| Guida e scorciatoie | F1 | apre l'aiuto in-app |

#### Modifica

| Voce | Scorciatoia | Effetto |
| --- | --- | --- |
| Annulla | Ctrl+Z | torna allo stato precedente |
| Ripeti | Ctrl+Shift+Z | riapplica l'ultimo annullamento |
| Seleziona tutto | Ctrl+A | seleziona tutti gli elementi |
| Deseleziona | Ctrl+D | svuota la selezione |
| Duplica selezione | Ctrl+Shift+D | duplica con offset; la copia è non verificata |
| Elimina selezione | Del / Backspace | chiede conferma e elimina |

#### Visualizza

| Voce | Scorciatoia | Effetto |
| --- | --- | --- |
| Adatta alla vista | Ctrl+0 | fit dell'immagine nella vista |
| Zoom 100% | Ctrl+1 | riporta la scala a 1:1 |
| Ingrandisci | Ctrl+= | zoom +25% |
| Riduci | Ctrl+- | zoom −20% |
| Righelli | — | mostra/nasconde i righelli |
| Griglia | — | mostra/nasconde la griglia |
| Legenda | — | mostra/nasconde la legenda (spenta di default) |
| Minimappa | — | mostra/nasconde la minimappa sulla mappa |
| Mirino | — | mostra/nasconde il crosshair |
| Tema scuro / Tema chiaro | — | cambia il tema dell'interfaccia; la scelta è persistita |
| Pannello … | — | apre o porta in primo piano il pannello indicato |
| Reimposta layout pannelli | — | ripristina il layout di fabbrica |

#### Strumenti

| Voce | Tasto | Effetto |
| --- | --- | --- |
| Selezione oggetto | V | seleziona, sposta, modifica vertici, marquee su vuoto |
| Selezione rettangolare | M | marquee |
| Lazo | L | lazo libero o poligonale |
| Area | A | disegna un poligono chiuso |
| Linea | N | disegna una polilinea |
| Punto | P | aggiunge un controllo percorso |
| Sposta vista | H | pan |
| Zoom | Z | click +, Alt+click − |
| Contagocce | I | campiona colore |
| Testo | T | disabilitato in questa build |
| Calibra scala | C | calibrazione a due punti |

#### Classificazione

| Voce | Effetto |
| --- | --- |
| Apri pannello Classificazione | porta il pannello in primo piano |
| Esegui con i parametri correnti | avvia la classificazione con i parametri salvati |
| Annulla elaborazione | annulla il job in corso |
| Nascondi/Mostra livello classificazione | cambia la visibilità dell'overlay |

#### Vettorizzazione

| Voce | Effetto |
| --- | --- |
| Apri pannello Vettorizzazione | porta il pannello in primo piano |
| Genera aree (sostituisci automatiche) | esegue la pipeline e sostituisce le aree auto |
| Genera aree (aggiungi) | esegue e aggiunge alle aree esistenti |
| Annulla vettorizzazione | annulla il job |

#### AI

| Voce | Effetto |
| --- | --- |
| Apri pannello Riconoscimento AI | porta il pannello in primo piano |
| Elaborazione automatica completa | esegue tutti gli stadi: OSM, elementi, classificazione, vettorizzazione, AI, curve, fusione |
| Annulla elaborazione automatica | interrompe lo stadio in corso e conserva il lavoro già completato |
| Riconosci simboli (locale) | addestra il modello sui dati del progetto e genera aree e alberi automatici |
| Annulla riconoscimento | interrompe il worker e scarta il risultato |
| Unifica livello simboli | elimina i duplicati automatici dello stesso simbolo, senza toccare manuale e verificato |

#### OSM

| Voce | Effetto |
| --- | --- |
| Apri pannello OpenStreetMap | porta il pannello in primo piano |
| Scarica dati OSM (edifici, verde, acqua, viabilità) | interroga Overpass/API OSM |
| Genera elementi automatici da OSM | converte i dati grezzi in feature OSM automatiche |
| Rimuovi tracciati OSM dal progetto | svuota il livello grezzo |

#### Esporta

| Voce | Effetto |
| --- | --- |
| Esporta mappa e dati… | apre la finestra completa |
| GeoJSON… | apre la finestra; il download è nella sezione Cartografia |
| OOM / .omap… | apre la finestra; il download è nella sezione Cartografia |
| SVG… / PNG… / PDF… | apre la finestra sulla sezione Mappa |

Le voci disabilitate hanno tooltip **non disponibile in questa build**.

#### Aiuto

| Voce | Effetto |
| --- | --- |
| Guida e scorciatoie | aiuto completo e limiti |
| Introduzione guidata | rivede i quattro passi iniziali |
| Nota sulla bozza preliminare | apre la stessa guida con le avvertenze |

### 5.2 Options bar

La barra sotto il menu cambia con lo strumento attivo. Mostra sempre:

- **Snap**: aggancio ai vertici esistenti entro 10 px;
- **Griglia**: visibilità e aggancio alla griglia;
- **Passo**: dimensione della griglia in pixel, quando la griglia è attiva;
- **Unità righelli**: pixel, metri o gradi;
- **Zoom**: −, percentuale, +, Adatta;
- opzioni contestuali.

Opzioni contestuali:

| Strumento | Opzioni |
| --- | --- |
| Selezione, Marquee, Lazo | Tolleranza 1–24 px |
| Lazo | interruttore **Poligonale** |
| Linea | **Offset linea** e pulsante **Applica** alle linee selezionate |
| Contagocce | campione esadecimale, RGB e colore classificato |

Il pulsante **Applica** dell'offset sposta le linee selezionate parallelamente alla
geometria, di 0,5–20 px. È utile per creare un sentiero parallelo o una recinzione.

Con gli strumenti di selezione i tasti `[` e `]` riducono o aumentano la tolleranza;
con Linea variano l'offset di 0,5 px. Il valore aggiornato è visibile nell'options bar.

### 5.3 Palette strumenti

La palette è organizzata in gruppi:

- **Selezione**: V, M, L
- **Disegno**: A, N, P, T (T disabilitato)
- **Navigazione**: H, Z
- **Misura e campione**: C, I

Ogni icona ha tooltip con nome e scorciatoia. Lo strumento attivo ha sfondo elevato, icona arancione e
barra di accento. Gli strumenti che richiedono un'immagine sono disabilitati finché non
si importa una sorgente.

### 5.4 Canvas e righelli

Il canvas è ibrido: raster su canvas, vettoriale e controlli su SVG. Il canvas mostra:

- ortofoto e classificazione secondo visibilità e opacità dei livelli;
- elementi cartografici con bordi di provenienza;
- percorso e controlli;
- curva di livello;
- tracciati OSM grezzi;
- anteprima classificazione e anteprima vettoriale;
- handle, lazo, marquee, bozze, guide e mirino.

I righelli sono attivi per default. Il menu a tendina **Unità righelli** cambia tra:

- **pixel**: coordinate immagine;
- **metri**: solo se la scala è calibrata o georeferenziata, altrimenti mostra `—`;
- **gradi**: longitudine in alto, latitudine a sinistra.

I righelli mostrano un indicatore del cursore. La griglia è opzionale e ha passo 5, 10
o 25 px dal pannello Progetto, oppure un passo libero dall'options bar.

### 5.5 Dock e pannelli

I dock sono tre: sinistro, destro e inferiore. Ogni pannello ha una tab; il trascinamento
della tab su un altro dock lo sposta. Il bordo del dock è un resize handle. Il doppio
click sulla tab comprime il dock; la freccia nell'header lo comprime o espande.

Il layout viene salvato in `localStorage` con chiave `terrain-o/ui-layout/v1`.
Vengono ricordati: pannelli per dock, tab attiva, collapse, larghezze, righelli, unità,
legenda, mirino, options bar, tolleranza, lazo poligonale e offset linea.

### 5.6 Status bar

| Segmento | Informazione |
| --- | --- |
| Coordinate | x/y in pixel, lat/lon se georeferenziato, eventuale "fuori immagine" |
| Zoom | percentuale, metri per pixel, unità righelli |
| Strumento | nome dello strumento attivo, eventuale mirino |
| Selezione | numero di elementi e provenienza (auto / manuale / verificato / misto) |
| Salvataggio | salvato / salvataggio… / errore di salvataggio |
| Memoria | stima dello spazio IndexedDB usato |
| Avvertenza | bozza preliminare |

---


## 6. I pannelli

### 6.1 Progetto

Il pannello Progetto è il centro di controllo del documento.

- **Immagine sorgente**: anteprima, nome, dimensioni, indicazione che la sorgente
  non viene modificata dall'editor. I pulsanti **Sostituisci** e **Esporta** aprono
  rispettivamente il selettore file e la finestra di esportazione.
- **Georeferenziazione**: unità del world file (gradi o metri), origine della proiezione
  (WKT, EPSG:4326 assunto, gradi, non disponibile), coefficienti A/E/C/F, bbox WGS84,
  eventuale WKT espandibile ed elenco dei warning.
- **Scala e stampa**: metri per pixel, origine della scala (calibrazione manuale
  prioritaria, georeferenziazione, nessuna), dimensioni di stampa in mm alla scala
  selezionata, pulsante **Calibra 2 punti** o **Aggiungi misura**, **Rimuovi
  calibrazione**, scala di stampa 1:5000–1:25000, interruttore **Mostra freccia nord**.
- **Aggancio e griglia**: snap ai vertici esistenti, snap alla griglia, passo 5/10/25 px.
- **Livelli di provenienza**: quattro schede descrittive e link ai limiti del prodotto.
- **Progetti locali**: elenco dei progetti in IndexedDB, data, numero elementi, progetto
  aperto, elimina, **Nuovo progetto**, **Importa .json**, **Aggiorna**.
- **Spazio locale**: utilizzo e quota stimati, barra, avviso di quota esaurita,
  **Aggiorna stima spazio**.
- **Informazioni**: formato progetto, versione app, ultimo salvataggio, rinomina progetto.

### 6.2 Livelli

I livelli, dall'alto verso il basso, sono: Percorso e controlli, Elementi cartografici,
OSM (grezzo), Curve di livello, Classificazione, Immagine sorgente. Per ciascuno:

- icona occhio per visibilità;
- slider opacità 0–100%;
- trascinamento della riga per riordinare;
- frecce su/giù;
- conteggio e descrizione.

L'ordine è dal livello più alto al più basso. Il livello **Elementi cartografici**
mostra la descrizione "Tratteggiato automatico, pieno manuale, spunta verificato".

### 6.3 Elementi cartografici

- ricerca per nome, note, codice, tipo o etichetta;
- filtri **Tutti**, **Non verificati**, **Verificati**, **Automatici**, **Manuali**;
- elenco con pallino colore, nome, badge di verifica, tipo, pillola fonte
  (manuale, auto, OSM, GPX, DEM), ordine per i controlli;
- click seleziona, Shift+click aggiunge/toglie, doppio click seleziona e centra;
- pulsante bussola per centrare;
- **Mostra altri 200** quando l'elenco è lungo;
- **Deseleziona** in alto.

### 6.4 Proprietà

Con nulla selezionato mostra i suggerimenti e le statistiche del progetto.
Con un elemento selezionato:

- riga discreta **Origine: automatica / manuale / verificata**;
- **Tipo** (cambiabile tra i tipi compatibili con la geometria);
- **Nome**, **Note**;
- **Codice controllo** per i controlli;
- **Geometria** (numero vertici, lunghezza, area, coordinate);
- **Fonte**;
- per OSM: **Stato dati** e **ID OSM**;
- **Ordine percorso** per i controlli;
- **Stato** verificato/non verificato;
- **Storico verifiche** espandibile con data, azione, motivo e nota;
- **Dichiara verificato** / **Revoca verifica**;
- **Centra**, **Duplica**, **Sposta +10 px** e **−10 px** per le linee, **Elimina**.

Con selezione multipla: tipo comune, elenco dei primi otto elementi, stesse azioni
compatibili. La verifica multipla applica la stessa dichiarazione e la stessa nota a
ogni elemento selezionato.

### 6.5 Storia

Mostra il numero di passi indietro e avanti, lo stato corrente con data e numero di
elementi, le revisioni precedenti con data e conteggio. I pulsanti **Annulla** e
**Ripeti** hanno le stesse scorciatoie globali. La cronologia viene azzerata quando si
sostituisce l'immagine, perché cambia il sistema di coordinate.

### 6.6 Info

Mostra coordinate cursore in pixel, longitudine, latitudine, Web Mercator, risoluzione
m/px, unità world file, origine proiezione, zoom, numero elementi e colore campionato
con il contagocce (hex, RGB, alpha, coordinate, colore della classificazione).

### 6.7 Navigatore

Miniatura dell'immagine con rettangolo della vista. Click sulla miniatura per centrare.
Il pulsante in alto mostra/nasconde la minimappa sulla mappa. Il rettangolo chiaro
indica la vista corrente.

### 6.8 Altri pannelli

OSM, DEM, Percorso, Classificazione, Vettorizzazione e Riconoscimento AI sono descritti
nelle sezioni dedicate. Il pannello AI contiene il modello, i parametri degli alberi, la
pulizia morfologica, l'azione di unificazione e il report dell'ultimo riconoscimento.

---

## 7. Import e georeferenziazione

### 7.1 File accettati

- **Immagine**: JPG/JPEG o PNG, una sola per progetto.
- **World file**: `.jgw`, `.jpgw`, `.pgw`, `.pngw`, `.wld`, `.wjf`.
- **Proiezione**: `.prj` o `.jpg.aux` con WKT.
- **Progetto**: `.terrain-o.json`.
- **Waypoint**: `.gpx` dal pannello Percorso.

### 7.2 Come importare

1. **File → Apri immagine o progetto…** oppure `Ctrl+O`, oppure trascinare i file
   sul canvas, oppure **Scegli file** dalla scheda iniziale.
2. Selezionare insieme immagine, world file e `.prj`.
3. Attendere le fasi: decodifica, compressione, salvataggio in IndexedDB.
4. Se l'immagine supera 4096 px sul lato maggiore, confermare il ridimensionamento.
5. Se esiste già una sorgente, confermare la sostituzione.

L'immagine viene salvata come JPEG qualità 0,85 per contenere lo spazio locale. Se
viene ridimensionata, il world file e le coordinate degli elementi vengono ricalcolati;
la verifica degli elementi interessati viene revocata con nota storica.

### 7.3 World file

Il world file contiene sei coefficienti: A, D, B, E, C, F. Terrain / O usa la
trasformazione affine:

```text
x_world = A * x_pixel + B * y_pixel + C
y_world = D * x_pixel + E * y_pixel + F
```

Il world file può essere in gradi o in metri. Con gradi e proiezione assente viene
assunto WGS84 (EPSG:4326) e mostrato un warning: è un'assunzione, non una verifica.
Senza `.prj` la proiezione non è dichiarata e le misure metriche possono essere
imprecise.

### 7.4 Proiezione

- WKT da `.prj` o `.jpg.aux`: proiezione dichiarata.
- Gradi: WGS84.
- Metri senza WKT: coordinate locali; OSM e DEM restano disabilitati.
- Nessun world file: misure in pixel; OSM e DEM disabilitati; calibrazione manuale
  disponibile.

La bbox WGS84 è calcolata dall'immagine e serve a OSM, DEM, GeoJSON, GPX, KML e OMAP.

---

## 8. Calibrazione, scala e stampa

### 8.1 Calibrazione a due punti

1. Aprire Progetto → **Calibra 2 punti** oppure premere `C`.
2. Cliccare un primo dettaglio riconoscibile sull'ortofoto.
3. Cliccare un secondo dettaglio.
4. Inserire la distanza reale in metri nella finestra.
5. La scala viene applicata e lo strumento torna a Selezione.

Con **Aggiungi misura** si aggiungono altre coppie di punti. Con più misure la scala
viene stimata ai minimi quadrati. La calibrazione manuale ha priorità sulla
georeferenziazione per le misure operative. **Rimuovi calibrazione** ripristina la scala
geografica o i pixel.

### 8.2 Scala di stampa

La scala di stampa è il denominatore 1:N. Viene usata per:

- dimensioni fisiche del PDF e dell'SVG;
- barra metrica;
- unità OMAP (1/1000 mm);
- dimensioni della mappa in mm nel pannello Progetto.

La scala di stampa non cambia le coordinate né la bbox; cambia solo la resa fisica.

### 8.3 Standard carta

Nel pannello Progetto, accanto alla scala di stampa, il selettore **Standard carta**
sceglie la famiglia di simboli:

| Standard | Uso | Simboli nel file `.omap` |
| --- | --- | --- |
| ISOM 2017-2 | mappe di foresta | 191, con tabella colori ufficiale |
| ISSprOM 2019-2 | mappe sprint | 185, con tabella colori ufficiale |

Il cambio aggiorna i codici e le geometrie usati da canvas, legenda, Inspector ed
export. Non è solo un'etichetta: strada, sentiero e ruscello, per esempio, passano
rispettivamente da **503**, **505**, **304** a **501.17**, **505.1**, **305**.
Acqua ed edificio usano due oggetti complementari (riempimento + bordo) quando lo
standard li definisce come simboli combinati. Il set completo viene scritto nel file,
così OpenOrienteering Mapper mostra l'intera palette e non una base ridotta.

### 8.4 Nord

**Mostra freccia nord** disegna una freccia che indica l'orientamento della sorgente.
Non è un nord geografico verificato. Con world file ruotato la freccia può non
coincidere con il nord della proiezione.

---

## 9. Navigazione: zoom, pan, righelli

### 9.1 Zoom

- rotellina: zoom attorno al cursore;
- pinch a due dita: zoom attorno al centro delle dita;
- `Ctrl+0`: adatta l'immagine;
- `Ctrl+1`: 100%;
- `Ctrl+=` / `Ctrl++`: ingrandisci;
- `Ctrl+-`: riduci;
- strumento Zoom `Z`: click sinistro 1,35×, Alt+click 0,75×;
- pulsanti − / + / Adatta nell'options bar e controlli sul canvas.

Limiti: 2%–4000%. Lo zoom registra passi per la cronologia della vista, non per il
progetto.

### 9.2 Pan

- strumento Hand `H` e trascinamento;
- barra spaziatrice tenuta + trascinamento (temporaneo);
- tasto centrale o destro del mouse + trascinamento;
- due dita su touch;
- un dito su spazio vuoto quando lo strumento non è di disegno.

### 9.3 Righelli e griglia

I righelli mostrano tacche ogni 88 px di schermo, con valori in pixel, metri o gradi.
Il cursore è evidenziato da una linea. La griglia si attiva da **Visualizza → Griglia**
o dall'options bar; il passo si sceglie nel pannello Progetto (5/10/25 px) o
nell'options bar (2–500 px). Con snap alla griglia attivo i vertici si agganciano al
passo.

### 9.4 Mirino e legenda

**Visualizza → Mirino** mostra un crosshair a tutto canvas. **Visualizza → Legenda**
mostra un riquadro discreto in un angolo con aree, linee, punti, classi e stile di
provenienza. La legenda è spenta per default.

### 9.5 Tema chiaro e scuro

Il tema predefinito è quello scuro, pensato per lavorare con la mappa come unica
superficie luminosa. **Visualizza → Tema chiaro** passa a una scrivania carta
(canvas grigio chiaro, pannelli quasi bianchi, testo inchiostro) per la stampa, il
lavoro in luce diurna o la condivisione dello schermo: la mappa resta la
superficie più profonda e la cornice non la sovrasta. **Visualizza → Tema scuro** torna
al tema di campo. La scelta è salvata in `localStorage`
(`terrain-o/ui-theme/v1`) e viene applicata prima del primo paint, senza lampo
bianco all'avvio. La mappa mantiene gli stessi colori ISOM in entrambi i temi:
cambia solo la cornice, non il significato cartografico. Entrambi i temi sono
verificati WCAG AA (contrasto testo, icone e controlli) dai test Playwright con
axe.

---

## 10. Selezione

### 10.1 Selezione oggetto (V)

- click su un elemento: lo seleziona;
- click su spazio vuoto: deseleziona e avvia un marquee;
- trascinamento su un elemento: lo sposta;
- trascinamento su spazio vuoto: marquee;
- Shift+click: aggiunge o toglie dalla selezione;
- trascinamento di un vertice di un elemento selezionato: modifica la geometria;
- doppio click sul bordo di un elemento selezionato: inserisce un vertice.

La tolleranza di selezione è regolabile da 1 a 24 px nell'options bar. Un elemento
selezionato mostra handle circolari; con più elementi non vengono mostrati gli handle
di tutti per non affollare la mappa.

### 10.2 Selezione rettangolare (M)

Trascinare un rettangolo. Vengono selezionati gli elementi i cui bounds intersecano il
rettangolo. Shift mantiene la selezione precedente.

### 10.3 Lazo (L)

- **Lazo libero**: trascinare un contorno; al rilascio vengono selezionati gli elementi
  toccati.
- **Lazo poligonale**: attivare **Poligonale** nell'options bar; click per i vertici;
  click sul primo punto o `Invio` per chiudere; `Esc` annulla.
- Su touch il lazo poligonale si chiude toccando il primo punto.

### 10.4 Selezione multipla e deselezione

- `Ctrl+A`: tutti gli elementi;
- `Ctrl+D`: deseleziona;
- `Esc`: annulla il disegno o torna a Selezione; se non c'è nulla, deseleziona;
- pannello Elementi: click singolo, Shift+click per aggiungere/togliere.

---

## 11. Disegno

Tutti gli strumenti di disegno richiedono un'immagine sorgente. Se manca, la palette è
disabilitata e il comando da menu mostra "richiede un'immagine".

### 11.1 Area (A)

1. Premere `A`.
2. Cliccare i vertici in ordine.
3. Chiudere in uno dei modi:
   - cliccare il primo vertice;
   - doppio click;
   - premere `Invio`;
   - premere **Termina** nella barra di disegno.
4. `Esc` o **Annulla** scartano la bozza.

Servono almeno 3 vertici. L'area nasce come **Nuova area**, tipo **Bosco**, non
verificata. Il tipo si cambia dal pannello Proprietà. Con lo snap attivo i vertici si
agganciano ai vertici esistenti o alla griglia.

### 11.2 Linea (N)

1. Premere `N`.
2. Cliccare almeno 2 vertici.
3. Terminare con `Invio`, **Termina** o doppio click.
4. `Esc` annulla.

La linea nasce come **Nuova linea**, tipo **Sentiero**, non verificata. Per creare un
tracciato parallelo selezionare la linea e usare **Offset linea** nell'options bar
oppure **Sposta +10 px** / **−10 px** nel pannello Proprietà.

### 11.3 Punto (P)

Il tasto `P` attiva lo strumento Punto. Un click sulla mappa aggiunge un **controllo
percorso** non verificato, con codice successivo automatico. Non crea generici punti
decorativi: per partenza e arrivo usare il pannello Percorso.

### 11.4 Testo (T)

Il pulsante Testo è disabilitato in questa build e la voce di menu ha tooltip
"non disponibile in questa build". Non esiste ancora un tipo feature testo.

### 11.5 Snap e precisione

- **Snap** ai vertici: raggio 10 px sullo schermo.
- **Snap alla griglia**: passo scelto dall'utente.
- Il punto di aggancio è mostrato con un cerchio.
- La tolleranza di selezione non cambia lo snap.
- La griglia viene disegnata solo se il passo a schermo è almeno 7 px.

---

## 12. Modifica degli elementi

### 12.1 Spostare

Con Selezione attiva, trascinare un elemento selezionato. Il movimento è live e entra
nella cronologia come una modifica. Frecce: 1 px; Shift+frecce: 10 px. Ogni modifica
geometrica revoca la verifica.

### 12.2 Modificare un vertice

Selezionare un elemento, poi trascinare un handle circolare. Il vertice si aggancia se
lo snap è attivo. Al rilascio la geometria passa da `updateFeatureGeometry` e la
verifica viene revocata con nota storica.

### 12.3 Aggiungere un vertice

Doppio click sul bordo dell'elemento selezionato. Il nuovo vertice viene inserito sul
segmento più vicino al punto del click. Non è disponibile per i punti.

### 12.4 Eliminare, duplicare, cambiare tipo

- `Del` / `Backspace`: elimina la selezione con conferma.
- `Ctrl+Shift+D`: duplica la selezione con offset; la copia è non verificata.
- Pannello Proprietà → **Tipo**: cambia il tipo tra quelli compatibili con la geometria.
- **Duplica** nel pannello Proprietà ha lo stesso effetto della scorciatoia.
- I controlli duplicati ricevono un nuovo codice e un nuovo ordine.

### 12.5 Tolleranza e hit test

L'hit test usa la tolleranza dell'options bar (1–24 px) divisa per la scala corrente,
così la selezione resta comoda a ogni zoom. Per le aree il test include il bordo; per
le linee la distanza dal segmento; per i punti il raggio.

### 12.6 Cronologia

Ogni modifica chiama `commit`, che salva uno snapshot del progetto prima della modifica.
La cronologia è illimitata in memoria ma limitata dalla sessione; non viene salvata
come storia undo in IndexedDB. Il pannello Storia mostra le revisioni della sessione.

---

## 13. Verifica e provenienza

### 13.1 Dichiarare verificato

1. Selezionare uno o più elementi.
2. Aprire il pannello Proprietà.
3. Premere **Dichiara verificato**.
4. Spuntare la dichiarazione esplicita; la nota è facoltativa ma consigliata per
   descrivere cosa è stato controllato e quando.

La verifica è una dichiarazione personale, non una certificazione del software. Con più
elementi selezionati la stessa dichiarazione e la stessa nota vengono registrate su
ognuno.

### 13.2 Revoca

- **Revoca verifica** nel pannello Proprietà richiede conferma; il motivo registrato
  nello storico è la revoca manuale dell'utente.
- Qualsiasi modifica geometrica revoca automaticamente la verifica; la nota precedente
  resta nello storico con data e motivo.
- La revoca non elimina l'elemento e non cambia la sua provenienza di base.

### 13.3 Come si vede la provenienza

| Luogo | Indicazione |
| --- | --- |
| Canvas | bordo tratteggiato (auto), pieno (manuale), pieno + spunta (verificato) |
| Proprietà | riga "Origine: automatica / manuale / verificata" |
| Status bar | parola "auto" / "manuale" / "verificato" accanto alla selezione |
| Pannello Elementi | badge "verificato" / "non verificato" e pillola fonte |
| Legenda (opzionale) | tre campioni di bordo |

Non ci sono punti interrogativi, badge "sperimentale" fissi o banner rossi. Il pannello
Classificazione e quello Vettorizzazione hanno solo una riga grigia "Risultato
sperimentale" in alto.

### 13.4 Duplicazione e verifica

Una copia di un elemento verificato nasce **non verificata**. La duplicazione non copia
la nota di verifica come stato attivo; la copia è un nuovo elemento manuale.

---

## 14. Livelli

### 14.1 Visibilità

L'icona occhio mostra o nasconde il livello. La visibilità è salvata nel progetto e
viene rispettata da canvas, SVG, PDF e PNG. L'immagine sorgente può essere nascosta per
lavorare solo sulle geometrie.

### 14.2 Opacità

Lo slider va da 0 a 100%. L'opacità è applicata al livello nel canvas e negli export
vettoriali. La classificazione parte al 65%, l'OSM al 90%, le curve all'80%.

### 14.3 Ordine

L'ordine è dal più alto al più basso. Si può trascinare la riga o usare le frecce. Il
livello più alto copre i sottostanti. L'ordine è salvato nel progetto.

### 14.4 Lock

In questa build non esiste un lock di livello separato dalla visibilità. Per evitare
modifiche accidentali usare la selezione e il pannello Proprietà; la verifica non
blocca la modifica, la revoca.

---

## 15. Classificazione

### 15.1 Che cosa fa

La classificazione produce una mappa di etichette (0–4), una confidenza per pixel e un
overlay colorato. Non è riconoscimento semantico e non è machine learning: è una
pipeline interpretabile di colore, texture e segmentazione.

Classi:

| ID | Etichetta | Famiglia | Uso |
| --- | --- | --- | --- |
| 0 | Zona incerta | Altro | non classificato, sempre esplicito |
| 1 | Possibile vegetazione | Vegetazione | bosco, arbusto, prato, coltivo |
| 2 | Possibile terreno aperto | Aperto | prato, pascolo, terreno nudo |
| 3 | Possibile acqua | Acqua | stagno, corso, zona umida |
| 4 | Superficie artificiale | Antropico | edifici, strade, piazzali |

Le etichette dicono "possibile": non dichiarano percorribilità, copertura sotto gli
alberi, sicurezza o conformità.

### 15.2 Pipeline

1. **Preprocessing illuminante**: stima locale del bianco su tile con overlap 50%,
   bilanciamento locale, normalizzazione della luminanza.
2. **Spazio colore**: CIE L\*a\*b\*, LCh e HSV per ogni pixel.
3. **Feature multi-scala**: colore, LBP 3×3/5×5/7×7, varianza locale 5×5 e 9×9,
   densità di bordo con Sobel e soglia adattiva.
4. **Superpixel SLIC**: griglia iniziale configurabile, compattezza e iterazioni.
5. **Regole ISOM-aware**: decision tree con soglie L\*a\*b\*, texture e bordi;
   confidenza e punteggi per classe.
6. **Post-processing**: filtro di maggioranza, componenti minime, riempimento buchi.
7. **Output**: etichette, confidenza, overlay, statistiche.

Tutto gira in `classify.worker.ts`. L'anteprima usa una riduzione a 320 px sul lato
maggiore; l'applicazione usa l'immagine di lavoro fino a 2048 px sul lato maggiore e
risale alle coordinate dell'immagine.

### 15.3 Pannello Classificazione

In alto: riga discreta **Risultato sperimentale**.

- **Anteprima live**: ricalcolo debounced 340 ms sul worker.
- **Anteprima su mappa**: overlay semitrasparente non modificabile.
- Anteprima ridotta con didascalia.
- **Preprocessing locale**: dimensione tile 16–192 px, forza bilanciamento 0–100%.
- **Segmentazione SLIC**: dimensione superpixel 8–80 px, compattezza 2–40,
  iterazioni 1–10.
- **Soglie L\*a\*b\***: acqua b\* massimo, vegetazione a\* massimo, aperto b\* minimo,
  artificiale croma massimo.
- **Feature e pulizia**: peso texture, peso bordi, filtro maggioranza (3×3–15×15),
  componente minima in px², riempimento buchi.
- **Applica classificazione**, **Aggiorna anteprima**, **Annulla**, **Reimposta parametri**.
- Progress bar con fase e percentuale.
- **Ultimo risultato applicato**: dimensioni, data, statistiche per classe,
  mostra/nascondi livello.
- **Legenda classi** espandibile con avvertenza.
- **Preset**: nome, salva, carica, esporta JSON.

### 15.4 Parametri e valori predefiniti

| Parametro | Default | Intervallo | Effetto |
| --- | --- | --- | --- |
| Dimensione tile | 64 px | 16–192, step 8 | scala del bilanciamento illuminante |
| Forza bilanciamento | 85% | 0–100% | quanto correggere la dominante locale |
| Dimensione superpixel | 24 px | 8–80, step 2 | unità minima di classificazione |
| Compattezza SLIC | 12 | 2–40 | forma regolare vs aderenza ai bordi |
| Iterazioni SLIC | 4 | 1–10 | qualità della segmentazione |
| Acqua b\* max | −10 | −40…10 | quanto blu deve essere l'acqua |
| Vegetazione a\* max | −6 | −30…10 | quanto verde deve essere la vegetazione |
| Aperto b\* min | 18 | 0…60 | quanto giallo deve essere il terreno aperto |
| Artificiale croma max | 10 | 0…30 | quanto neutro deve essere l'antropico |
| Peso texture | 35% | 0–100% | importanza di LBP |
| Peso bordi | 25% | 0–100% | importanza della densità di bordo |
| Filtro maggioranza | 5×5 | 3×3–15×15 | pulizia del rumore |
| Componente minima | 48 px² | 0–400 | scarta componenti piccole |
| Riempi buchi | attivo | on/off | riempie aree chiuse |

### 15.5 Preset

Il nome predefinito è "Preset personale". **Salva** memorizza i parametri in
`localStorage` con chiave `terrain-o/classify-presets/v1`; **Esporta JSON** scarica
`terrain-o-preset-classificazione.json`. Il caricamento di un preset aggiorna i
parametri e l'anteprima.

### 15.6 Errori e annullamento

- Senza immagine: avviso "Importare prima un'immagine sorgente".
- Una nuova classificazione chiede conferma se ne esiste già una.
- **Annulla** aborta il worker e libera la coda.
- Se l'immagine cambia durante il calcolo, il risultato viene scartato.
- Un errore del worker compare come messaggio nel pannello; la UI resta utilizzabile.

### 15.7 Limiti

La classificazione non distingue bosco fitto da rado, non vede sotto la copertura, non
conosce la pendenza, non riconosce simboli o edifici con precisione catastale. Le
soglie sono globali per classe e possono sbagliare su ombre, vialetti, tetti colorati e
ortofoto con forte dominante. Per questo il risultato è sempre "sperimentale" e va
corretto a mano.

---

## 16. Vettorizzazione

### 16.1 Che cosa fa

Trasforma le maschere di classificazione in geometrie: contorni chiusi, fori corretti,
poligoni semplificati, bordi condivisi riconciliati, export GeoJSON e `.omap`. Non
modifica la classificazione: la legge e basta.

Otto moduli puri, tutti in `src/vectorize/`:

1. `maskReader.ts` — soglia di confidenza (default 0.6), padding virtuale a 0.
2. `contourExtractor.ts` — marching squares sui punti di mezzo dei lati, anelli chiusi.
3. `topology.ts` — annidamento, fori, even-odd, priorità ISOM.
4. `simplify.ts` — Chaikin + Douglas-Peucker con controllo di autointersezione.
5. `edgeReconcile.ts` — snapping dei nodi condivisi, nessun gap né overlap.
6. `filter.ts` — area minima, fori minimi, indice di forma per classe.
7. `export.ts` — bridge GeoJSON e `.omap` con controllo topologia.
8. `pipeline.ts` — orchestrazione, `AbortSignal`, eventi di progresso.

Il worker `vectorize.worker.ts` esegue la pipeline fuori dal main thread.

### 16.2 Pannello Vettorizzazione

Riga discreta **Risultato sperimentale** in alto.

- Soglia di confidenza 0–1, default 0.6, step 0.05.
- Iterazioni Chaikin 0–3, default 2.
- Tolleranza Douglas-Peucker in px, default 1.5.
- Area minima poligoni, default 100 px².
- Area minima fori, default 20 px².
- **Priorità gerarchica** (default attiva).
- **Riconciliazione bordi** (default attiva).
- **Anteprima live su mappa** (default spenta).
- **Annulla** per fermare un job in corso.
- Contatori **poligoni / fori / scartati**.
- **Valida topologia** con esito verde o elenco problemi.
- **Applica come livelli auto**.
- **Reimposta parametri**.
- **Preset**: nome, salva, esporta JSON.

### 16.3 Cosa significano i numeri

- **Poligoni**: regioni esterne prodotte dopo i filtri.
- **Fori**: anelli interni attribuiti a un poligono contenitore.
- **Scartati**: geometrie eliminate per area, forma o priorità gerarchica.
- Un contatore alto di scartati con pochi poligoni indica soglia di confidenza troppo
  alta o area minima troppo grande.

### 16.4 Validazione

**Valida topologia** controlla ogni geometria: anelli chiusi, almeno 4 punti, niente
autointersezioni, area non degenere, fori dentro il loro esterno e non sovrapposti.

- 0 problemi: messaggio verde "Topologia valida".
- Problemi: elenco con classe e motivo. L'export GeoJSON e `.omap` si blocca se trova
  problemi, indicando la feature responsabile.

### 16.5 Prestazioni

La pipeline è O(pixel) per la lettura maschere, O(perimetro) per i contorni e
O(n log n) per la semplificazione. Le immagini grandi vengono elaborate su worker; la UI
mostra l'avanzamento per stadio. Il benchmark `src/vectorize/benchmark.test.ts` copre
un'immagine 4000×4000 con 5 classi; il valore misurato è documentato nel README.

Smoke test manuale: importare un'ortofoto, classificare, aprire Vettorizzazione,
applicare, salvare GeoJSON e riaprirlo in QGIS.

### 16.6 Errori comuni

- "Nessuna classificazione": lanciare prima Classificazione.
- "Nessuna geometria": soglia di confidenza troppo alta, classi troppo sicure.
- "Poligoni scartati tutti": area minima sopra la dimensione reale delle regioni.
- "Geometrie con autointersezione": segnalare il caso, non forzare l'export.

### 16.7 Riconoscimento AI e livello simboli

Questa funzione è separata dalla classificazione a regole e produce elementi
**automatici**, mai verificati. Il pannello si apre da **AI → Apri pannello
Riconoscimento AI** oppure dalla scheda **AI** nel dock destro.

#### Come impara

Il modello è un random forest locale, deterministico, eseguito in un web worker. Lavora su
superpixel e su 12 descrittori: L\*a\*b\*, croma, texture LBP, densità e forza dei bordi,
area del segmento, riempimento, allungamento, contrasto con i segmenti vicini e varianza
locale. Le classi sono sei: non classificato, vegetazione, aperto, acqua, artificiale,
edificio.

Gli esempi hanno pesi diversi:

| Fonte | Peso | Note |
| --- | --- | --- |
| Area manuale | 3 | la supervisione più forte: l'utente l'ha disegnata |
| Area OSM | 0,5–1,1 | esterna, può essere arretrata o disallineata |
| Pseudo-etichetta dalle regole | 0,22–0,45 | solo dove manca un esempio vero; disattivabile |

Senza OSM e senza aree manuali il modello può comunque partire grazie alle
pseudo-etichette, ma impara soltanto ciò che le regole già sanno. Per un risultato
migliore disegna alcune aree rappresentative di edificio, bosco, acqua e aperto, oppure
importa OSM prima di lanciare il riconoscimento.

#### Parametri del pannello

| Controllo | Effetto |
| --- | --- |
| Pseudo-etichette dalle regole | usa le decisioni più sicure come esempi deboli |
| Rileva alberi isolati | attiva il rilevatore di chiome dentro la vegetazione |
| Sensibilità alberi | abbassa o alza la soglia del rilevatore (10–100%) |
| Max alberi | limite di punti generati (20–4000) |
| Pulizia confini | filtro di maggioranza 0–4 (0 = spento) |
| Area minima | scarta componenti sotto la soglia in px² |

**Riconosci simboli** mostra l'avanzamento per stadio: bilanciamento, feature,
superpixel, campioni, addestramento, classificazione, pulizia, vettorizzazione. **Annulla**
termina il worker e non applica nulla. Al termine il pannello mostra campioni, esempi
veri, classi, validazione holdout, aree, edifici, alberi e peso delle feature.

#### Cosa viene creato

- aree vettorizzate con la pipeline topologica esistente, compresa la classe edificio;
- punti **Albero isolato** rilevati sulle chiome;
- ogni elemento ha `source: 'ml'`, confidenza `mlConfidence` e bordo tratteggiato;
- nessun elemento è verificato e nessun flusso scrive coordinate fuori da
  `updateFeatureGeometry`.

La validazione holdout è un accordo su esempi esclusi dall'addestramento, non una misura
di accuratezza sul terreno. Un valore alto non autorizza a dichiarare verificato nulla.

#### Unificare il livello simboli

La fusione parte **automaticamente** al termine di **Riconosci simboli** e quando si
generano elementi OSM o vettoriali; **Unifica livello simboli** la riesegue a richiesta.
Confronta i simboli dello stesso tipo:

- per le aree bastano IoU ≥ 0,4 oppure contenimento ≥ 0,8;
- per i punti — alberi compresi — due simboli entro 6 px sono lo stesso simbolo;
- per le linee servono almeno il 70% del tracciato entro 3,5 px in entrambe le direzioni,
  con lunghezze confrontabili;
- vince il più affidabile: verificato → manuale/GPX → OSM → AI → vettorizzazione.

Gli elementi automatici eliminati vengono registrati in `mergedFrom` sul sopravvissuto.
Manuale e verificato non vengono mai rimossi né modificati: se due elementi protetti si
sovrappongono restano entrambi e il contatore **Conflitti protetti** lo segnala. La fusione
non modifica le coordinate e non tocca il percorso di revoca della verifica.

#### Elaborazione completa in un clic

**AI → Elaborazione automatica completa**, oppure **Esegui tutto** nella sezione
**Elaborazione completa** del pannello AI, esegue in sequenza:

1. download OSM, se l'immagine è georeferenziata e l'opzione è attiva;
2. generazione degli elementi OSM (edifici, alberi, acqua, verde, strade, sentieri);
3. classificazione con prior OSM;
4. vettorizzazione con la pipeline topologica;
5. riconoscimento AI con pseudo-etichette, edifici e alberi;
6. curve di livello DEM, se georeferenziata e attiva;
7. unificazione del livello simboli con deduplicazione di aree, linee e punti.

Ogni stadio usa i risultati del precedente. Se OSM o DEM non rispondono, o se manca la
georeferenziazione, lo stadio viene saltato o segnalato come avviso e la pipeline continua con
ciò che è disponibile. **Annulla** interrompe lo stadio in corso e conserva il lavoro già
completato. Il report finale mostra OSM, classificazione, aree vettoriali, simboli AI,
edifici, alberi, curve, duplicati uniti e simboli totali. Il risultato è sempre automatico:
non dichiara percorribilità, sicurezza, quota di precisione o conformità IOF.

#### Limiti e problemi comuni

- Non è una rete neurale pre-addestrata: non riconosce tutti i simboli ISOM, solo le classi
  previste e i punti albero.
- "Servono più esempi": disegna aree di classi diverse, importa OSM o attiva le
  pseudo-etichette.
- "Il modello vede una sola classe": aggiungi esempi di altre classi; con una sola classe
  il modello non può discriminare.
- Un edificio OSM arretrato prevale sull'AI durante l'unificazione: correggi o elimina
  l'elemento OSM, oppure disattiva la fusione per quel caso.
- Il punto albero è un candidato geometrico, non una certezza: verificalo sul campo.

---

## 17. Import / export, OSM, DEM, tracciato

### 17.1 Import immagine

1. **File → Apri immagine o progetto…**, `Ctrl+O`, oppure trascinare i file sul canvas.
2. Formati immagine: JPG/JPEG e PNG, uno per progetto.
3. Il world file (`.jgw`, `.jpgw`, `.pgw`, `.pngw`, `.wld`, `.wjf`) e la proiezione
   (`.prj`, `.jpg.aux`) possono essere selezionati insieme all'immagine.
4. La dimensione massima è 4096 px sul lato maggiore; oltre, l'immagine viene ridotta
   con conferma e world file, scala e coordinate vengono ricalcolati.
5. Un progetto `.terrain-o.json` sostituisce il progetto aperto dopo conferma.

La sorgente è immutabile: nessuno strumento di disegno la modifica.

### 17.2 Georeferenziazione

- **Georeferenziazione** nel pannello Progetto: EPSG, origine, dimensioni pixel,
  rotazione.
- Il sistema non dichiara mai il nord "verificato": la rotazione è un dato inserito.
- Senza georeferenziazione, le coordinate restano in pixel e l'export lo dichiara.

### 17.3 OSM

1. **OSM → Apri pannello OpenStreetMap** oppure tab **OSM**.
2. Premere **Importa da OSM** (o **Forza download** per ignorare la cache).
3. Overpass viene interrogata per **edifici, land use, acqua, parchi, strade, sentieri,
   barriere, ferrovie e alberi** nel bbox dell'immagine, in riquadri da 0,05° con cache
   locale di 24 ore. I multipoligoni sono ricomposti e i fori interni conservati.
4. **Genera elementi automatici** crea feature per edifici, alberi, acqua, bosco, arbusti, aree
   aperte, superfici artificiali, strade, sentieri, ruscelli e barriere. Sono elementi
   **automatici**, non verificati, con deduplicazione per ID OSM. Gli alberi OSM diventano
   punti **Albero isolato** e alimentano anche il prior di vegetazione. Il livello OSM grezzo
   viene nascosto dopo la generazione: resta visibile un solo livello di simboli, già
   deduplicato; riattivalo da Livelli per confrontare la fonte.
5. **Fusione automatica** esegue in un solo passaggio la generazione degli elementi e la
   classificazione con prior OSM. In alternativa, la classificazione usa i confini OSM
   come prior ogni volta che viene eseguita: il peso si regola nel pannello Classificazione.
   L'immagine resta la fonte primaria; il prior non dichiara mai un elemento verificato.
   Dopo la classificazione il pannello OSM mostra l'**accordo** complessivo, la copertura
   dell'immagine e l'accordo per vegetazione, aperto, acqua e artificiale. Le aree sotto il
   65% vengono elencate singolarmente: un clic seleziona l'elemento OSM generato. Un valore
   basso segnala OSM arretrato o disallineato e non corregge nulla automaticamente.
   L'elenco si filtra per **classe** (vegetazione, aperto, acqua, artificiale) e per **area
   minima** (100, 500 o 2.000 px²); **Azzera** riporta i filtri a tutte le aree. **Esporta
   CSV** salva solo le righe visibili, con nome, ID OSM, classe, accordo, area e stato di
   generazione; il file usa UTF-8 con BOM per aprirsi correttamente in Excel.
6. **Svuota** rimuove il livello OSM grezzo; **Annulla** ferma il download.

Se la rete manca o l'API risponde con errore, compare un messaggio nel pannello e nulla
viene applicato.

### 17.4 DEM

1. Aprire il pannello **Curve di livello** (tab **DEM** nella barra laterale).
2. Scegliere l'equidistanza (le direttrici sono ogni 5 equidistanze) e premere
   **Genera curve**.
3. Non si importa un DEM: l'app scarica tessere Terrarium pubbliche (AWS Terrain
   Tiles) sull'area georeferenziata e campiona una griglia 256×256.
4. **Annulla** ferma l'elaborazione; **Rimuovi curve** cancella il livello.
5. La quota è indicativa: non è un dato verificato né una misura di precisione.

### 17.5 Tracciato corso

1. Aprire il pannello **Percorso** (tab **Percorso**).
2. Aggiungere partenza, controlli e arrivo con lo strumento Punto, oppure importare un
   GPX con **Importa GPX**.
3. **Ottimizza controlli** riordina i controlli con nearest-neighbor + 2-opt; partenza
   e arrivo non vengono spostati.
4. Esportare in GPX o KML con i pulsanti dedicati.

Il tracciato è una bozza: non dichiara la validità del percorso né la conformità IOF.

### 17.6 Export

| Formato | Comando | Contenuto |
| --- | --- | --- |
| PNG | Esporta → PNG | mappa renderizzata con scala |
| PDF | Esporta → PDF | mappa vettoriale su pagina |
| SVG | Esporta → SVG | mappa vettoriale modificabile |
| GeoJSON | Esporta → GeoJSON | feature e classi, WGS84 se georeferenziato |
| `.omap` | Esporta → OMAP | OOM con set ufficiale ISOM o ISSprOM completo |
| GPX / KML | Esporta → GPX/KML | tracciato e punti |
| Progetto | File → Salva ora / Esporta | `.terrain-o.json` |
| Preset | pannelli | JSON |

Ogni export con geometrie esegue prima il controllo topologia. Le feature automatiche
escono sempre con `provenance: "auto"`, mai `"verified"`.

---

## 18. Il file .omap

### 18.1 Che cos'è

`.omap` è il formato XML di OpenOrienteering Mapper. Contiene simboli, colori, georeferenziazione
e oggetti. Terrain / O esporta gli oggetti prodotti dall'editor e allega il set ufficiale
completo scelto nel progetto: **ISOM 2017-2** (191 simboli) oppure **ISSprOM 2019-2**
(185 simboli). Le definizioni e le tabelle colori derivano dai set GPL-3.0 di
OpenOrienteering Mapper; vedi `NOTICE.md`.

### 18.2 Struttura prodotta

- Dichiarazione XML e versione del formato.
- note del progetto, avvertenza preliminare, data e scala dichiarata;
- `<georeferencing>` con punto di riferimento e sistema di riferimento;
- `<colors>` con la tabella colori ufficiale dello standard scelto;
- `<symbols>` con il set completo (191 ISOM o 185 ISSprOM) e gli stessi ID usati dagli oggetti;
- `<objects>` con le geometrie in unità 1/1000 mm: origine in alto a sinistra, x verso
  destra e y verso il basso, come i pixel dell'immagine;
- tag `<t>` con provenienza, stato di verifica, nome, note e ID OSM. La confidenza non
  fa parte del formato `.omap`.

### 18.3 Conversioni

- Pixel → millimetri: `mm = px × metriPerPixel × 1000 / scalaDiStampa`. Senza scala
  georeferenziata si usa 0,1 mm per pixel.
- Nessuna inversione dell'asse y: la mappa mantiene l'orientamento dell'immagine e la
  georeferenziazione applica il nord della proiezione.
- Le feature verificate restano verificate; quelle manuali restano manuali; quelle
  automatiche restano automatiche e non diventano mai verificate nell'export.

### 18.4 Apertura in OpenOrienteering Mapper

1. Aprire OOM.
2. **File → Apri** e selezionare il `.omap`.
3. Controllare scala e georeferenziazione.
4. Controllare che lo standard selezionato (ISOM o ISSprOM) corrisponda alla carta che si
   vuole produrre, poi verificare resa, scala e georeferenziazione. Il file dichiara la
   provenienza sperimentale.

### 18.5 Test e regressione

`src/io/exportOmap.test.ts` verifica XML ben formato, riferimento in alto a sinistra,
coordinate con y positiva come i pixel, presenza dei simboli e assenza di
`provenance: verified` per feature automatiche. `src/io/omapSymbols.test.ts`
verifica i codici IOF, il set completo (191/185), gli ID contigui, i colori e la
corrispondenza tra oggetto e definizione. `src/io/topologyCheck.test.ts` verifica i
controlli topologici.

---

## 19. Risoluzione dei problemi

### 19.1 La mappa è nera o vuota

- Verificare che l'immagine sia stata importata.
- Controllare i livelli: Sorgente visibile e non bloccato.
- Premere **Ctrl+0** per adattare la vista.
- Se l'immagine è enorme, attendere il caricamento in tile.

### 19.2 L'import immagine fallisce

- Formato non supportato: convertire in JPG o PNG.
- File oltre il limite: ridurre a 4096 px sul lato maggiore.
- File corrotto: riprovare con un'altra copia.
- Immagini non JPG/PNG: convertirle in JPG o PNG e importare il world file insieme al
  file convertito.

### 19.3 L'export `.omap` è vuoto

- Nessuna feature: disegnare o applicare la vettorizzazione.
- Nessun simbolo mappato: verificare i tipi nel pannello Proprietà.
- Export bloccato dalla topologia: correggere le feature indicate.

### 19.4 La classificazione è lenta

- Ridurre l'immagine di lavoro.
- Aumentare la dimensione dei superpixel.
- Ridurre le iterazioni SLIC.
- Disattivare l'anteprima live mentre si regolano altri parametri.

### 19.5 La vettorizzazione produce troppi poligoni

- Alzare l'area minima.
- Alzare la soglia di confidenza.
- Attivare la priorità gerarchica.
- Ridurre la tolleranza Douglas-Peucker.

### 19.6 Le scorciatoie non funzionano

- Il focus deve essere sull'area della mappa, non su un campo di testo.
- Su Mac usare Cmd invece di Ctrl.
- Se un campo è in editing, premere Esc per uscire.

### 19.7 Su mobile il layout è diverso

È previsto: sotto 900 px la shell passa a modalità compatta. I pannelli diventano
drawer, la palette è orizzontale, i menu sono a comparsa. Le funzioni restano le stesse.

---

## 20. Appendice

### 20.1 Tabelle di riferimento rapido

**Zoom**

| Azione | Scorciatoia |
| --- | --- |
| Adatta | Ctrl+0 |
| 100% | Ctrl+1 |
| Ingrandisci | Ctrl+= |
| Riduci | Ctrl+- |
| Zoom+ | Z, clic |
| Zoom− | Z, Alt+clic |

**Disegno**

| Strumento | Tasto | Chiusura |
| --- | --- | --- |
| Area | A | doppio clic / Invio / clic sul primo punto |
| Linea | N | doppio clic / Invio |
| Punto | P | clic |
| Testo | T | clic, poi digitare |

**Opzioni contestuali**

| Azione | Scorciatoia |
| --- | --- |
| Riduci tolleranza / offset | `[` |
| Aumenta tolleranza / offset | `]` |

**Modifica**

| Azione | Scorciatoia |
| --- | --- |
| Selezione | V |
| Marquee | M |
| Lazo | L |
| Seleziona tutto | Ctrl+A |
| Deseleziona | Ctrl+D |
| Elimina | Del / Backspace |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z / Ctrl+Y |
| Salva | Ctrl+S |

### 20.2 Glossario

- **Sorgente**: immagine raster importata, immutabile.
- **Auto**: elemento prodotto dalla classificazione, dal riconoscimento AI, dalla vettorizzazione, da OSM o dal DEM.
- **Manuale**: elemento disegnato o corretto dall’utente.
- **Verificato**: elemento dichiarato verificato dall'utente.
- **Superpixel**: regione omogenea usata come unità di classificazione.
- **LBP**: Local Binary Pattern, descrittore di texture.
- **SLIC**: Simple Linear Iterative Clustering, segmentazione in superpixel.
- **Chaikin**: smoothing che taglia gli angoli.
- **Douglas-Peucker**: semplificazione che rimuove vertici entro tolleranza.
- **Even-odd**: regola di riempimento per anelli annidati.
- **World file**: file di georeferenziazione di un raster.

### 20.3 Stato del progetto

| Componente | Stato |
| --- | --- |
| Shell UI | completo |
| Pannelli dockabili | completo |
| Strumenti disegno | completo |
| Classificazione | completo, sperimentale |
| Vettorizzazione | completo, sperimentale |
| Export GeoJSON / OMAP | completo con validazione |
| OSM | completo |
| DEM | completo |
| Corso | completo |
| Test unitari | completi |
| E2E | principali flussi + audit WCAG AA |
| Accessibilità | contrasto WCAG AA verificato con axe |
| Mobile | layout compatto |

### 20.4 Nota finale

Terrain / O è uno strumento di lavoro per bozze preliminari. Non sostituisce il rilievo
sul campo, non certifica la mappa e non dichiara la conformità IOF. La verifica è
sempre una dichiarazione esplicita dell'utente, e ogni modifica geometrica la revoca.

---

## 21. Qualità misurata

La pipeline non è verificata "a occhio". `src/classify/realistic.test.ts` costruisce
un'ortofoto sintetica 960×720 con verità a terra nota (bosco con 420 chiome, prato,
lago, stagno, strada, edificio, roccia, ombre) e misura:

- accuratezza complessiva e IoU per classe, su scena pulita e su una variante con
  ombra forte, sfocatura e grana;
- precisione e richiamo del rilevamento chiome, e assenza di rilevamenti sul bordo
  del bosco;
- copertura dell'area, errore d'area per classe, fori conservati, poligoni invalidi
  e vertici condivisi fra classi adiacenti.

Se un numero peggiora, il test fallisce e la CI si ferma. I valori attuali, il metodo
completo e i limiti sono in [QUALITY.md](QUALITY.md) (edizione inglese
[QUALITY.en.md](QUALITY.en.md)). Un audit end-to-end separato importa la stessa
scena nell'editor, esegue **Esegui tutto** e valida i file esportati: GeoJSON senza
anelli aperti né auto-intersezioni, OMAP con i simboli attesi, PNG e SVG completi.
