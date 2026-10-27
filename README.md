# Terrain / O

Editor desktop e mobile per **bozze preliminari di mappe di orienteering** a partire da ortofoto georeferenziate.

> **Bozza preliminare — non atta alla gara.**
> Terrain / O non dichiara percorribilità, vegetazione sotto copertura, sicurezza del terreno,
> quota di precisione, nord geografico verificato o conformità IOF. Ogni interpretazione
> automatica è materia prima sperimentale finché una persona non la verifica sul campo.

Il manuale completo, funzione per funzione e tasto per tasto, è in
[docs/TUTORIAL.md](docs/TUTORIAL.md); la versione PDF stampabile è
[docs/Terrain-O-Manuale.pdf](docs/Terrain-O-Manuale.pdf).
English edition: [README.en.md](README.en.md) and
[docs/TUTORIAL.en.md](docs/TUTORIAL.en.md).
L'interfaccia si passa da italiano a inglese con il pulsante **IT/EN** nella barra
dei menu.

---

## 1. Avvio rapido

Requisiti: Node.js 20+ (consigliato 22/24) e npm.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit + build Vite in dist/
npm run preview      # anteprima del build
```

Comandi di qualità:

```bash
npm run typecheck
npm run lint
npm test             # Vitest, 120 test
npx playwright test  # 19 test end-to-end (essenziale + desktop + mobile + lingua + AI + auto + OSM + simboli + WCAG AA)
npm run check        # lint + typecheck + test + build
```

I browser Playwright vanno installati una volta con `npx playwright install chromium`.

---

## 2. Cosa c'è

### Interfaccia

- **Modalità essenziale predefinita**: mappa a tutta finestra con solo **Carica**,
  **Esegui tutto** ed **Esporta**. Tutto il resto si apre da **Modalità avanzata** e si
  richiude da **Essenziale**; la scelta è persistita in `localStorage`
  (`terrain-o/ui-mode/v1`).
- Shell desktop completa (modalità avanzata): menu bar, options bar contestuale, palette
  strumenti, canvas raster + overlay SVG, dock laterali/inferiore, status bar.
- Pannelli agganciabili e trascinabili: Progetto, OSM, DEM, Percorso, Livelli, Elementi,
  Proprietà, Classificazione, Vettorizzazione, Riconoscimento AI, Storia, Info, Navigatore.
- Layout persistito in `localStorage` (`terrain-o/ui-layout/v1`) e ripristinabile da
  **Visualizza → Reimposta layout pannelli**.
- Tema scuro coerente, density compatta, font tabellare per coordinate e valori.
- Zoom fluido, pan, righelli px/m/gradi, griglia, snap, mirino, legenda opzionale
  (spenta per default), minimappa.
- **Versione mobile/tablet automatica** (`src/ui/useDevice.ts`): sotto 900 px il menu diventa
  un foglio, i pannelli diventano drawer laterali con scrim, la palette strumenti una rail
  inferiore orizzontale e la status bar si compatta. Sotto 620 px si nascondono righello
  sinistro e minimappa; i controlli restano raggiungibili. Il canvas supporta pinch zoom,
  pan a un dito e disegno touch.

### Provenienza

Quattro livelli sempre distinti:

| Livello | Come nasce | Bordo nel canvas |
| --- | --- | --- |
| Sorgente | ortofoto importata | raster, nessun bordo |
| Automatico | classificazione, AI, OSM, DEM, vettorizzazione | tratteggio sottile neutro |
| Manuale | geometria disegnata/corretta dall'utente | linea piena sottile |
| Verificato | dichiarazione esplicita dell'utente | linea piena + spunta ✓ |

La provenienza non usa mai un punto interrogativo. Non esistono badge "sperimentale" fissi
sulla mappa: l'informazione compare solo come riga discreta nel pannello Proprietà e come
parola nella status bar. La modifica di una geometria verificata revoca la verifica nel
percorso `updateFeatureGeometry` dello store; nessun nuovo flusso scrive coordinate senza
passare da lì.

### Classificazione

Pipeline locale in `src/classify/`:

1. bilanciamento illuminante per tile con overlap;
2. conversione CIE L\*a\*b\*/LCh e HSV;
3. feature multi-scala (colore, LBP, varianza, densità di bordo);
4. superpixel SLIC;
5. regole ISOM-aware interpretabili con confidenza per pixel;
6. filtro di maggioranza, componenti minime, riempimento buchi;
7. output: etichette + confidenza + overlay, consumati dalla vettorizzazione.

La riduzione di lavoro usa il lato **più lungo** dell’immagine (non quello più corto), quindi
una foto panoramica non viene più compressa inutilmente; il canvas di estrazione viene
disegnato già alla risoluzione di lavoro, evitando buffer RGBA da centinaia di MB. Il
riempimento buchi opera sull’intera area chiusa (non solo sulle prime righe), e la confidenza
combina margine del classificatore, accordo locale e qualità dell’illuminazione.

Il calcolo delle feature è privo di allocazioni per pixel: L\*a\*b\* usa una LUT lineare,
la varianza 5×5 è un box filter separabile su un bordo replicato di 2 px, LBP e Sobel
leggono lo stesso buffer senza sampler con clamp. Il filtro di maggioranza usa finestre
scorrevoli orizzontali e verticali (costo costante per pixel invece di O(r²)), le componenti
connesse usano una mappa di etichette a due passate, e confidenza, statistiche e overlay
condividono un’unica passata. L’illuminazione precalcola indici e pesi bilineari.

Tutto gira in un web worker con progressi e cancellazione cooperativa. Il pannello espone
tutti i parametri, anteprima live debounced, preset locali esportabili in JSON e legenda classi.

**Fusione OSM.** Quando nel progetto ci sono dati OpenStreetMap, la classificazione li usa
come prior per superpixel: edifici, acqua, bosco, aree aperte, strade e sentieri orientano i
pixel ambigui, mentre un’immagine netta mantiene la precedenza. Il peso è regolabile nel
pannello Classificazione. I confini OSM non dichiarano mai un elemento verificato.

### Riconoscimento AI e livello simboli

Il pannello **Riconoscimento AI** aggiunge un modello di machine learning locale, distinto
dalla pipeline a regole e sempre marcato come sperimentale.

- **Modello**: random forest deterministico su 28 alberi, addestrato in un web worker. Ogni
  superpixel produce 12 feature (L\*a\*b\*, croma, texture LBP, densità e forza dei bordi,
  area, riempimento, allungamento, contrasto con i vicini, varianza locale). Le classi sono
  sei: non classificato, vegetazione, aperto, acqua, artificiale, **edificio**.
- **Esempi**: le aree OSM e gli elementi disegnati a mano sono etichette forti (peso
  rispettivamente 0,5–1,1 e 3). Le regole ad alta confidenza diventano pseudo-etichette
  deboli (peso 0,22–0,45) e si possono disattivare. Senza OSM né aree manuali il modello
  funziona comunque, ma impara solo dalle regole: è una base di partenza, non una verità.
- **Validazione**: una quota di esempi viene esclusa dall’addestramento e usata per
  riportare un accordo holdout, non un’accuratezza reale sul terreno. Il pannello mostra
  anche il peso delle feature e il numero di campioni.
- **Alberi**: un rilevatore di chiome (differenza di medie locali, massimi locali e
  soppressione non massima) crea punti **Albero isolato** dentro la vegetazione. La
  sensibilità e il numero massimo sono regolabili.
- **Output**: aree vettorizzate con la stessa pipeline topologica (classi 1–5, edificio
  incluso) e punti albero, tutti con `source: 'ml'`, confidenza `mlConfidence` e bordo
  tratteggiato. Nessun elemento AI è verificato.

**Livello simboli unico.** La fusione raccoglie AI, OSM, vettorizzazione e manuale in
un’unica lista ordinata. Viene eseguita automaticamente al termine del riconoscimento AI e
quando si generano elementi OSM o vettoriali; **Unifica livello simboli** la riesegue su
richiesta. Quando due simboli dello stesso tipo si sovrappongono (IoU ≥ 0,4 oppure
contenimento ≥ 0,8 per le aree, distanza ≤ 6 px per i punti, sovrapposizione ≥ 70% entro
3,5 px per le linee) resta il più affidabile: verificato, poi manuale/GPX, poi OSM, poi AI,
poi vettorizzazione. Gli elementi automatici eliminati vengono annotati in `mergedFrom` sul
sopravvissuto. Manuale e verificato non vengono **mai** rimossi o modificati: se due
elementi protetti si sovrappongono restano entrambi e il pannello riporta il conflitto.
La fusione non riscrive coordinate e non tocca il percorso `updateFeatureGeometry`.

**Elaborazione completa in un clic.** Il comando **AI → Elaborazione automatica completa**
(o **Esegui tutto** nel pannello AI) esegue in sequenza download OSM, generazione degli
elementi, classificazione con prior OSM, vettorizzazione, riconoscimento AI, curve di livello
e unificazione del livello simboli. Se una fonte esterna non è disponibile (rete assente,
immagine non georeferenziata) lo stadio viene saltato o segnalato come avviso e la pipeline
prosegue con i dati locali; manuale e verificato non vengono mai toccati. Al termine il
pannello mostra il conteggio per stadio, i duplicati uniti e il totale dei simboli; il
risultato resta sempre automatico e non verificato.

Limite dichiarato: non è una rete neurale pre-addestrata e non riconosce ogni simbolo ISOM.
Riconosce copertura, edifici e alberi con la qualità degli esempi disponibili; per questo
resta materia prima da controllare, non una dichiarazione di percorribilità o conformità IOF.

### OpenStreetMap e fusione automatica

L’import OSM interroga Overpass per edifici, `landuse`, `natural`, `leisure`, `amenity`,
barriere, ferrovie, strade, corsi d’acqua e alberi, con fallback all’API OSM ufficiale e cache
locale di 24 ore. I multipoligoni sono ricomposti in anelli chiusi; i fori interni (cortili,
radure) sono conservati.

- **Genera elementi automatici** crea feature per edifici, acqua, bosco, arbusti, aree aperte,
superfici artificiali, strade, sentieri, ruscelli e barriere. Sono sempre `source: 'osm'`,
`verified: false`, con bordo tratteggiato e deduplicazione per ID OSM.
- **Fusione automatica** esegue in un solo passaggio la generazione degli elementi e la
classificazione con prior OSM.
- Dopo la classificazione il pannello mostra l’**accordo OSM**: percentuale complessiva,
 copertura dell’immagine e accordo per vegetazione, aperto, acqua e artificiale. Un valore
 basso segnala OSM arretrato o disallineato; non viene corretto automaticamente.
- Le aree con accordo sotto il 65% vengono elencate singolarmente; un clic seleziona
 l’elemento OSM generato e lo porta in vista.
- L’elenco è filtrabile per famiglia (vegetazione, aperto, acqua, artificiale) e per area
 minima; le righe visibili si esportano in CSV con nome, ID OSM, classe, accordo, area e
 stato di generazione.
- Gli alberi OSM diventano punti **Albero isolato** automatici e alimentano anche il prior di vegetazione.
- Dopo la generazione il livello OSM grezzo viene nascosto: resta visibile un unico livello di simboli, con
  gli elementi automatici già deduplicati. Riattivalo da Livelli quando serve confrontare la fonte.
- La classificazione usa gli stessi confini come prior, quindi la vettorizzazione produce
geometrie più coerenti senza duplicare il lavoro manuale.
- Le feature OSM esistenti non vengono sovrascritte: una correzione o una verifica manuale
resta intatta anche dopo un nuovo download.

### Vettorizzazione

Pipeline pura in `src/vectorize/`, riscritta da zero:

- `maskReader` → maschere per classe con soglia di confidenza;
- `contourExtractor` → marching squares su griglia continua, anelli chiusi; grafo di archi
  tipizzato con intestazioni per vertice, direzioni intere al posto di `atan2`, chiavi
  numeriche e rimozione dei vertici collineari in tempo lineare;
- `topology` → gerarchia esterno/foro/isole annidate e priorità ISOM; containment con
  bounding box e controllo auto-intersezioni a sweep invece di O(n²);
- `sharedSimplify` / `simplify` → Chaikin + Douglas-Peucker con controllo auto-intersezioni;
  la cache dei tratti condivisi è **orientata**: ogni anello ripercorre il confine nel proprio
  verso, senza invertire il tratto semplificato dell’anello precedente;
- `edgeReconcile` → snapping dei confini condivisi, nessun gap/overlap; i vertici dello
  stesso anello non vengono fusi tra loro e i nodi propri non vengono inseriti sui propri
  segmenti;
- `filter` → area minima per poligono e foro;
- `export` → GeoJSON con `provenance: 'auto'`, mai `verified`;
- `pipeline` + worker → orchestrazione con progressi e `AbortSignal`.

Ogni poligono porta la confidenza media dei propri pixel (campionamento stratificato),
non quella dell'intera classe. Il pannello Vettorizzazione mostra poligoni/fori/scartati,
anteprima live, validazione topologica, preset e applicazione come livelli automatici.
GeoJSON e OMAP eseguono un pre-check topologico e bloccano l'export indicando la feature
problematica.

### Simboli IOF e standard carta

Il pannello **Progetto → Scala e stampa** espone **Standard carta**:
**ISOM 2017-2** per la foresta e **ISSprOM 2019-2** per lo sprint. Il selettore
cambia i codici, le geometrie e i colori dei simboli usati da canvas, legenda,
Inspector ed export `.omap`; non è un'etichetta cosmetica.

I codici sono quelli delle specifiche IOF e delle definizioni ufficiali di
OpenOrienteering Mapper: bosco **405**, terreno aperto **401**, vegetazione
fitta **410**, acqua **301** (fill **301.1** + sponda **301.4** in ISOM,
**301.6** in ISSprOM), edificio **521** (**521.3** + **521.4** in ISSprOM),
superficie pavimentata **501**, strada **503** (ISSprOM **501.17**), sentiero
**505** (ISSprOM **505.1**), ruscello **304** (ISSprOM **305**), recinzione
**516**, albero isolato **417**, partenza **701**, controllo **703**, arrivo
**706**, numero controllo **704**, curva **101**, direttrice **102**.
L'export include il set completo: **191 simboli ISOM** oppure **185 simboli
ISSprOM**, con le rispettive tabelle colori ufficiali, così Mapper apre la
mappa con l'intera palette e non con una base ridotta. Acqua, superfici
pavimentate ed edifici sprint sono esportati come riempimento + bordo
complementare, così i fori restano corretti. Le definizioni sono
derivate dai set GPL-3.0 di OpenOrienteering Mapper: vedi [NOTICE.md](NOTICE.md).

### Export

- PNG 1×/2×/3×, SVG vettoriale, PDF A4/A3.
- OMAP/OpenOrienteering Mapper XML v9 con set ufficiali ISOM 2017-2 o
  ISSprOM 2019-2, selezionabile nel progetto.
- GeoJSON (WGS84 se georeferenziato, altrimenti pixel con metadati espliciti).
- GPX del percorso e KML, solo con georeferenziazione WGS84.
- Progetto `.terrain-o.json` con immagine, classificazione, feature e cronologia.

**Orientamento OMAP.** Le coordinate OOM crescono verso destra e verso il basso, come i
pixel dell'immagine; il punto di riferimento è l'angolo superiore sinistro. Il transform
di OOM (`Georeferencing::updateTransformation`, `scale(scale, -scale)`) nega solo la
northing proiettata. Il vecchio export negava anche la y dell'immagine e produceva la mappa
verticalmente ribaltata: ora un test unitario e un test E2E bloccano la regressione.

---

## 3. Architettura

```text
src/
  model/          tipi Zod, costanti ISOM, catalogo simboli, feature, progetto
  store/          Zustand: progetto, vista, selezione, undo/redo, job
  geo/            world file, proiezioni proj4, pixel ↔ WGS84, aree/distanze
  io/             import/export progetto, OMAP, GeoJSON, SVG, PNG, PDF, GPX/KML
  render/         scene canvas, provenance, minimappa, compositing export
  classify/       pipeline, regole, SLIC, worker, protocollo
  ai/             random forest, etichette di training, rilevamento alberi, fusione simboli
  vectorize/      pipeline vettoriale, moduli puri, worker, test property-based
  osm/            Overpass + API OSM, cache IndexedDB, semantica, prior e conversione feature
  dem/            terrain tiles AWS, curve di livello
  edit/           hit-test, snapping, geometria
  persistence/    IndexedDB (idb), asset, autosave
  ui/             App, shell professionale, pannelli, componenti, hook device
e2e/              test Playwright desktop/mobile
docs/             manuale utente MD + PDF
```

Rendering ibrido: `CanvasStage` (dentro `MapStage.tsx`) disegna raster e feature su canvas;
`CanvasStageOverlay.tsx` disegna in SVG handle, marquee, lazo, bozze, guide e anteprima
vettoriale. Lo stile di provenienza è centralizzato in `render/provenance.ts` ed è usato da
canvas, SVG, status bar e inspector.

---

## 4. Prestazioni misurate

Benchmark incluso nella suite (`src/vectorize/benchmark.test.ts`):

| Prova | Hardware/ambiente | Risultato |
| --- | --- | --- |
| Vettorizzazione 4000×4000, 4 classi + non classificato, confini sinusoidali | Windows, Node 24, Vitest/jsdom, singolo thread | **≈3,0–5,0 s**, 17 poligoni, 0 fori, 0 scartati (limite 15 s) |
| Classificazione 2048×2048, scena sintetica con gradiente e rumore, parametri di default | Windows, Node 24, profilo a stadi fuori dalla suite | **≈1,2 s** (era ≈2,9 s prima dell’ottimizzazione); feature in ≈0,34 s, SLIC ≈0,44 s |

Il limite richiesto di 15 s è rispettato con ampio margine. La classificazione e la vettorizzazione
in app girano in worker e non bloccano il thread UI; immagini molto grandi vengono ridotte
per la classificazione e risalite in coordinate immagine.

---

## 5. Test

- `npm test`: **120 test** su 20 file (classificazione, scene golden, vettorizzazione,
  integrazione pipeline, property-based fast-check, random forest, rilevamento alberi,
  etichette AI, orchestrazione automatica, fusione simboli, schema progetto, OSM e fusione,
  OMAP/IOF, pre-check topologico, riparazione IndexedDB, benchmark).
- `npx playwright test`: **19 test E2E**:
  1. shell desktop, avvertenza bozza, assenza di marker `?`, legenda spenta;
  2. menu desktop, comandi e navigazione da tastiera;
  3. finestra ridotta e cambio lingua IT/EN persistito dopo il reload;
  4. import in un database IndexedDB lasciato rotto da una build precedente;
  5. nessuna anteprima di classificazione finché il pannello non viene aperto;
  6. import → classificazione → vettorizzazione → validazione topologica;
  7. riconoscimento AI locale → unificazione del livello simboli;
  8. elaborazione completa in un clic → report per stadio e livello simboli;
  9. pipeline automatica con OSM simulato → edificio e albero importati e unificati;
  10. verifica dichiarata → modifica geometria → revoca automatica → undo;
  11. import → disegno area → export OMAP con riferimento in alto a sinistra e y positiva;
  12. cambio a ISSprOM → export con set sprint completo (185 simboli, sentiero 505.1);
  13. shell mobile: riconoscimento telefono, menu a foglio, drawer, rail strumenti;
  14. audit WCAG AA con axe su shell, pannelli principali e finestra Esporta.
- `npm run typecheck`, `npm run lint`, `npm run build`: puliti.

---

## 6. Formati e compatibilità

- Immagini: JPG/PNG; world file `.jgw`, `.jpgw`, `.pgw`, `.pngw`, `.wld`, `.wjf`; `.prj` opzionale.
- Progetto: JSON versionato (`terrain-o/1.0`) con migrazione Zod.
- OSM: Overpass (due mirror globali) con fallback all'API OSM ufficiale; cache 24 h in IndexedDB;
  edifici, land cover, acqua, viabilità, barriere, ferrovie, alberi e multipoligoni.
- DEM: AWS Terrain Tiles (Terrarium), quota indicativa.
- OMAP: XML v9 con set ufficiali ISOM 2017-2 (191 simboli) o ISSprOM 2019-2 (185 simboli);
  l'apertura in Mapper 0.9.x e la resa a stampa vanno comunque verificate manualmente.
- Il set simboli è completo, ma non ogni classe ISOM viene generata automaticamente: l'editor
  produce le classi supportate da classificazione, AI, OSM e disegno manuale.

---

## 7. Limiti espliciti

- Le classi a regole sono **possibili** classi cromatiche; il riconoscimento AI è un modello
  locale che dipende dagli esempi e resta comunque un’ipotesi, non una verità sul terreno.
- La quota DEM è indicativa e può essere obsoleta; non è sicurezza del terreno.
- OSM è un dato di terze parti, può essere incompleto o arretrato. La fusione automatica è
  un’ipotesi di lavoro: non dichiara percorribilità, vegetazione sotto copertura o conformità IOF.
- Nessun export è una carta da gara o una dichiarazione IOF.
- La verifica è solo una dichiarazione dell'utente, non una certificazione del software.
- La legenda è opzionale e spenta per default; la mappa resta pulita finché non la si cerca.

---

## 8. Documentazione

- [docs/TUTORIAL.md](docs/TUTORIAL.md) — manuale completo in italiano.
- [docs/Terrain-O-Manuale.pdf](docs/Terrain-O-Manuale.pdf) — stessa guida impaginata per la stampa.
- Rigenerare il PDF dopo una modifica al manuale: `npm run manual:pdf` (usa il Chromium di Playwright).
- Aiuto in-app: **F1** oppure **Aiuto → Guida e scorciatoie**.
