# Terrain / O

Editor desktop e mobile per **bozze preliminari di mappe di orienteering** a partire da ortofoto georeferenziate.

> **BOZZA PRELIMINARE — non atta alla gara.**
> Terrain / O non dichiara percorribilità, vegetazione sotto copertura, sicurezza del terreno,
> quota di precisione, nord geografico verificato o conformità IOF. Ogni interpretazione
> automatica è materia prima sperimentale finché una persona non la verifica sul campo.

Il manuale completo, funzione per funzione e tasto per tasto, è in
[docs/TUTORIAL.md](docs/TUTORIAL.md); la versione PDF stampabile è
[docs/Terrain-O-Manuale.pdf](docs/Terrain-O-Manuale.pdf).

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
npm test             # Vitest, 64 test
npx playwright test  # 6 test end-to-end (desktop + mobile + WCAG AA)
npm run check        # lint + typecheck + test + build
```

I browser Playwright vanno installati una volta con `npx playwright install chromium`.

---

## 2. Cosa c'è

### Interfaccia

- Shell desktop professionale: menu bar, options bar contestuale, palette strumenti,
  canvas raster + overlay SVG, dock laterali/inferiore, status bar.
- Pannelli agganciabili e trascinabili: Progetto, OSM, DEM, Percorso, Livelli, Elementi,
  Proprietà, Classificazione, Vettorizzazione, Storia, Info, Navigatore.
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
| Automatico | classificazione, OSM, DEM, vettorizzazione | tratteggio sottile neutro |
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

Tutto gira in un web worker con progressi e cancellazione cooperativa. Il pannello espone
tutti i parametri, anteprima live debounced, preset locali esportabili in JSON e legenda classi.

### Vettorizzazione

Pipeline pura in `src/vectorize/`, riscritta da zero:

- `maskReader` → maschere per classe con soglia di confidenza;
- `contourExtractor` → marching squares su griglia continua, anelli chiusi;
- `topology` → gerarchia esterno/foro/isole annidate e priorità ISOM;
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

### Export

- PNG 1×/2×/3×, SVG vettoriale, PDF A4/A3.
- OMAP/OpenOrienteering Mapper XML v9 con simboli ISOM semplificati.
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
  model/          tipi Zod, costanti ISOM, feature, progetto
  store/          Zustand: progetto, vista, selezione, undo/redo, job
  geo/            world file, proiezioni proj4, pixel ↔ WGS84, aree/distanze
  io/             import/export progetto, OMAP, GeoJSON, SVG, PNG, PDF, GPX/KML
  render/         scene canvas, provenance, minimappa, compositing export
  classify/       pipeline, regole, SLIC, worker, protocollo
  vectorize/      pipeline vettoriale, moduli puri, worker, test property-based
  osm/            Overpass + API OSM, cache IndexedDB, conversione feature
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
| Vettorizzazione 4000×4000, 4 classi + non classificato, confini sinusoidali | Windows, Node 24, Vitest/jsdom, singolo thread | **≈3,1–3,6 s** (3.083–3.556 ms nelle misure), 17 poligoni, 0 fori, 0 scartati |

Il limite richiesto di 15 s è rispettato con margine. La classificazione e la vettorizzazione
in app girano in worker e non bloccano il thread UI; immagini molto grandi vengono ridotte
per la classificazione e risalite in coordinate immagine.

---

## 5. Test

- `npm test`: **64 test** su 9 file (classificazione, scene golden, vettorizzazione,
  integrazione pipeline, property-based fast-check, OSM, OMAP, pre-check topologico,
  benchmark).
- `npx playwright test`: **6 test E2E**:
  1. shell desktop, avvertenza bozza, assenza di marker `?`, legenda spenta;
  2. import → classificazione → vettorizzazione → validazione topologica;
  3. verifica dichiarata → modifica geometria → revoca automatica → undo;
  4. import → disegno area → export OMAP con riferimento in alto a sinistra e y positiva;
  5. shell mobile: riconoscimento telefono, menu a foglio, drawer, rail strumenti;
  6. audit WCAG AA con axe su shell, pannelli principali e finestra Esporta.
- `npm run typecheck`, `npm run lint`, `npm run build`: puliti.

---

## 6. Formati e compatibilità

- Immagini: JPG/PNG; world file `.jgw`, `.jpgw`, `.pgw`, `.pngw`, `.wld`, `.wjf`; `.prj` opzionale.
- Progetto: JSON versionato (`terrain-o/1.0`) con migrazione Zod.
- OSM: Overpass (due mirror globali) con fallback all'API OSM ufficiale; cache 24 h in IndexedDB.
- DEM: AWS Terrain Tiles (Terrarium), quota indicativa.
- OMAP: XML v9, simboli ISOM semplificati; l'apertura in Mapper 0.9.x va verificata manualmente.
- OMAP non include i simboli ISOM reali completi (TODO P0 del brief): è una bozza tecnica.

---

## 7. Limiti espliciti

- Le classi sono **possibili** classi cromatiche, non riconoscimento semantico.
- La quota DEM è indicativa e può essere obsoleta; non è sicurezza del terreno.
- OSM è un dato di terze parti, può essere incompleto o arretrato.
- Nessun export è una carta da gara o una dichiarazione IOF.
- La verifica è solo una dichiarazione dell'utente, non una certificazione del software.
- La legenda è opzionale e spenta per default; la mappa resta pulita finché non la si cerca.

---

## 8. Documentazione

- [docs/TUTORIAL.md](docs/TUTORIAL.md) — manuale completo in italiano.
- [docs/Terrain-O-Manuale.pdf](docs/Terrain-O-Manuale.pdf) — stessa guida impaginata per la stampa.
- Rigenerare il PDF dopo una modifica al manuale: `npm run manual:pdf` (usa il Chromium di Playwright).
- Aiuto in-app: **F1** oppure **Aiuto → Guida e scorciatoie**.
