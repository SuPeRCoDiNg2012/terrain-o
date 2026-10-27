# Terrain / O

Desktop and mobile editor for **preliminary orienteering map drafts** built from
georeferenced orthophotos.

> **PRELIMINARY DRAFT — not valid for competition.**
> Terrain / O never declares runnability, vegetation under canopy, terrain safety,
> survey-grade elevation, a verified geographic north or IOF compliance. Every
> automatic interpretation is experimental raw material until a person checks it
> in the field.

The complete function-by-function, key-by-key manual is in
[docs/TUTORIAL.en.md](docs/TUTORIAL.en.md); the printable PDF is
[docs/Terrain-O-Manual-EN.pdf](docs/Terrain-O-Manual-EN.pdf).
The Italian edition is [README.md](README.md) and
[docs/TUTORIAL.md](docs/TUTORIAL.md).

---

## 1. Quick start

Requirements: Node.js 20+ (22/24 recommended) and npm.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit + Vite build into dist/
npm run preview      # preview the production build
```

Quality commands:

```bash
npm run typecheck
npm run lint
npm test             # Vitest
npx playwright test  # end-to-end desktop, mobile and WCAG AA
npm run check        # lint + typecheck + test + build
```

Install the Playwright browser once with `npx playwright install chromium`.

---

## 2. What it does

- Opens in an **essential workspace**: the full-window map with only **Load**,
  **Run everything** and **Export**. Every other control lives behind **Advanced mode**,
  and **Essential** returns to the three-action screen. The choice persists in
  `localStorage` (`terrain-o/ui-mode/v1`).
- Imports JPG/PNG orthophotos together with `.jgw/.jpgw/.pgw/.pngw/.wld` world
  files and `.prj`/`.aux` projections. The source image is stored read-only.
- Measures in pixels, in metres (georeferencing or two-point calibration) and in
  WGS84/EPSG:3857 when a projection is available.
- Draws and edits areas, lines, points and orienteering courses with snapping,
  marquee/lasso selection and full undo/redo.
- Classifies the orthophoto with an interpretable pipeline: local illumination
  correction, CIE L\\*a\\*b\\*, LBP texture, SLIC superpixels, ISOM-aware decision
  rules, confidence maps and morphological cleanup. OSM polygons and lines can act as a
  per-superpixel prior; imagery keeps precedence when it is decisive.
- Vectorizes classified masks with marching squares, topology building,
  Chaikin smoothing, Douglas–Peucker simplification, edge reconciliation and
  spurious-geometry filtering.
- Runs a local, explainable AI recognizer: a random forest over superpixel features learns
  from OSM, manual geometry and high-confidence rules, separates buildings from other
  artificial surfaces, detects individual tree crowns and writes experimental `ml` features.
  Automatic symbol fusion merges AI, OSM, vectorized and manual output into one layer without
  duplicate overlapping areas, lines or points, while never touching manual or verified
  geometry.
- Imports OSM buildings, land cover, water, roads, paths, barriers, railways and trees
  (Overpass) plus public DEM contour lines, and uses OSM boundaries as a classification prior.
  Automatic fusion can generate the OSM features and reclassify in one action, then reports
  overall and per-family agreement between OSM and the final labels. Areas below 65%
  agreement are listed individually and can be selected from the panel. The list filters by
  family and minimum area, and the visible rows export to CSV with OSM id, class, agreement,
  area and generation state.
- Exports PNG (1×/2×/3×), SVG, PDF A4/A3, OMAP XML v9 with the official
  ISOM 2017-2 or ISSprOM 2019-2 symbol set, GeoJSON, GPX, KML and the project
  file `.terrain-o.json`.
- Works offline: projects, images and classifications live in IndexedDB. No
  account and no server upload.

---

## 3. Provenance model

Four levels always remain distinct:

| Level | How it is shown | Meaning |
| --- | --- | --- |
| Source image | no vector border (raster) | original orthophoto, never edited |
| Automatic | thin dashed border | experimental interpretation |
| Manual | thin solid border | drawn or corrected by hand, unverified |
| Verified | thin solid border + small ✓ | explicit field declaration by the user |

Editing the geometry of a verified feature revokes verification automatically.
The application never grants verification on its own.

The quiet UI rule: no question marks and no permanent experimental banners. The
word *experimental* appears once at the top of the Classification/Vectorization
panels, as provenance text in the Properties panel, and as one word in the status
bar. The legend is opt-in (View → Legend) and off by default.

---

## 4. Interface

- Menu bar: **File, Edit, View, Tools, Classification, Vectorization, AI, OSM,
  Export, Help**. Dropdowns are rendered in a body-level portal so they cannot be
  clipped by the workspace.
- Contextual options bar for the active tool (snap, grid, tolerance, line offset,
  ruler units, zoom).
- Vertical tool palette with Lucide line icons, grouped by category.
- Dockable panels with drag-and-drop, resize handles, collapse and persisted
  layout (`terrain-o/ui-layout/v1`): Project, Layers, Features, Properties,
  Classification, Vectorization, AI recognition, History, Info, Navigator, OSM, DEM,
  Course.
- Status bar: cursor coordinates, zoom, scale, active tool, selection and its
  provenance, autosave state, storage estimate.
- Language switch **IT / EN** in the menu bar. Italian is the default; the choice
  is stored locally and applied to the document language.
- Phone/tablet layout with a drawer shell, a menu sheet and a bottom tool rail.

---

## 5. Keyboard reference

| Key | Action |
| --- | --- |
| `V` | Object selection |
| `M` | Rectangular selection |
| `L` | Lasso (freehand or polygon) |
| `A` | Draw area |
| `N` | Draw line |
| `P` | Add control point |
| `H` | Pan |
| `Z` | Zoom (Alt+click zooms out) |
| `I` | Eyedropper |
| `C` | Calibrate scale with two points |
| `F` | Centre on selection |
| `Esc` | Cancel current operation / back to selection |
| `Enter` | Close area or finish line |
| `Del` / `Backspace` | Delete selection (with confirmation) |
| Arrows | Nudge selection by 1 px (`Shift`: 10 px) |
| `Space` + drag | Temporary pan |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo (`Ctrl+Y` also redoes) |
| `Ctrl+A` / `Ctrl+D` | Select all / deselect |
| `Ctrl+Shift+D` | Duplicate selection (verification reset) |
| `Ctrl+S` | Save the local project now |
| `Ctrl+O` / `Ctrl+E` | Import / export |
| `Ctrl+0`, `Ctrl+1`, `Ctrl+±` | Fit, 100 %, zoom steps |
| `[` / `]` | Selection tolerance or line offset |
| `F1` | Open help |

---

## 6. Classification and vectorization

Both run in web workers with progress, cooperative cancellation and a 300 ms
debounced live preview. Classification never vectorizes and vectorization never
classifies.

- Classification stages: local illumination → L\\*a\\*b\\*/LCh → multi-scale
  features → SLIC superpixels → interpretable ISOM-aware rules with confidence →
  majority filter, connected components and hole filling.
- Vectorization modules: mask reader (0.6 confidence default), marching-squares
  contour extractor, topology (holes, nested islands), simplification with
  topology checks, adjacent-edge reconciliation, spurious-geometry filter and a
  validated export bridge. GeoJSON properties always carry
  `provenance: "auto"`, never `verified`.

Feature extraction is allocation-free per pixel: linear-light LUT for L\*a\*b\*,
separable 5×5 variance over a replicated border, and LBP/Sobel reading the same
buffer without clamped samplers. The majority filter slides horizontal and
vertical class counts (constant cost per pixel), connected components use a
two-pass label map, and confidence, statistics and the overlay share one pass.
Contour tracing uses a typed edge graph, integer direction turns, numeric vertex
keys and linear-time collinear cleanup; validation sweeps segment bounding
boxes instead of testing every pair.

Tuning panels expose every parameter, a live overlay, presets in localStorage,
a geometry counter and a topology validator.

### AI recognition and symbol layer

The **AI recognition** panel adds a machine-learning path separate from the rule pipeline.
A deterministic 28-tree random forest runs in a web worker on 12 superpixel features
(L\*a\*b\*, chroma, LBP texture, edge density/strength, area, fill, aspect, neighbour
contrast, local variance). It predicts six classes: unclassified, vegetation, open, water,
artificial and **building**.

- **Training examples** come from OSM areas and manual polygons. OSM labels weigh
  0.5–1.1, manual labels 3. High-confidence rule decisions can be added as weak
  pseudo-labels (0.22–0.45) and can be switched off. Without OSM or manual areas the model
  still runs, but it only learns the rules: a starting point, not ground truth.
- **Holdout validation** excludes part of the examples and reports agreement, not real-world
  accuracy. Feature importances and sample counts are shown in the panel.
- **Trees**: a crown detector (difference of local means, local maxima, non-maximum
  suppression) creates *Isolated tree* points inside vegetation, with adjustable sensitivity
  and cap.
- **Output**: vectorized areas (class 5 = building) and tree points, all `source: 'ml'`,
  with `mlConfidence` and a dashed automatic border. Nothing from the AI path can be
  verified automatically.

**One symbol layer.** Fusion merges AI, OSM, vectorized and manual symbols into one ordered
layer. It runs automatically after AI recognition and whenever OSM or vector features are
generated; *Unify symbol layer* re-runs it on demand. Two symbols of the same type that
overlap (IoU ≥ 0.4 or containment ≥ 0.8 for areas, ≤ 6 px for points, ≥ 70% within 3.5 px
for lines) collapse to the most trustworthy one: verified, then manual/GPX, then OSM, then
AI, then vectorization. Removed automatic ids are recorded in `mergedFrom` on the survivor.
Manual and verified features are never removed or modified; two overlapping protected
features are both kept and reported as a conflict. The fusion pass never rewrites geometry
and does not touch the `updateFeatureGeometry` path.

**One-click complete processing.** **AI → Run the complete automatic pipeline** (or **Run
everything** in the AI panel) runs OSM download, automatic feature generation, classification
with the OSM prior, vectorization, AI recognition, contour lines and symbol-layer fusion in
sequence. If an external source is unavailable (offline, image not georeferenced) that stage
is skipped or reported as a warning and the pipeline continues with local data; manual and
verified geometry is never touched. The panel reports counts per stage, merged duplicates
and the final symbol total; the result remains automatic and unverified.

Declared limit: this is not a pre-trained neural network and it does not recognize every
ISOM symbol. It recognizes land cover, buildings and trees with the quality of the examples
available. It remains experimental material to check in the field, never a statement about
trafficability or IOF conformity.

### IOF symbols and map standard

The **Project → Scale and print** panel exposes **Map standard**: **ISOM
2017-2** for forest maps and **ISSprOM 2019-2** for sprint maps. The selector
changes the codes, geometry and colours used by the canvas, legend, inspector
and `.omap` export; it is not a cosmetic label.

Codes follow the IOF specifications and the official OpenOrienteering Mapper
definitions: forest **405**, open land **401**, dense vegetation **410**, water
**301** (fill **301.1** plus bank **301.4** in ISOM, **301.6** in ISSprOM),
building **521** (**521.3** plus **521.4** in ISSprOM), paved area **501**, road
**503** (ISSprOM **501.17**), footpath **505** (ISSprOM **505.1**), stream
**304** (ISSprOM **305**), fence **516**, isolated tree **417**, start **701**,
control **703**, finish **706**, control number **704**, contour **101**, index
contour **102**. The export includes the complete set: **191 ISOM symbols** or
**185 ISSprOM symbols**, with the official colour tables, so Mapper opens the
map with the full palette rather than a reduced base. Water, paved areas and
sprint buildings are exported as fill plus companion outline objects so holes
remain correct. Definitions derive from OpenOrienteering Mapper's GPL-3.0
symbol sets; see [NOTICE.md](NOTICE.md).

---

## 7. Tests and benchmarks

- 120 Vitest unit/integration tests, including golden synthetic orthophotos,
  random forest, tree detection, AI training labels, automatic pipeline
  orchestration and symbol fusion, OSM multipolygon/semantic/prior fusion,
  property-based vectorization invariants, IndexedDB repair and a 4000×4000
  benchmark.
- 19 Playwright tests cover the essential workspace, the desktop shell, menus and keyboard, language
  persistence, import (including a database left broken by an early build),
  classification preview, vectorization, local AI recognition, one-click
  processing, mocked OSM building/tree import, verification revocation, OMAP
  export in both ISOM and ISSprOM standards, mobile drawers and WCAG AA contrast.
- Current benchmark on the development machine: **≈ 3.0–5.0 s** for a 4000×4000
  image with four classes (threshold: 15 s).
- Classification of a 2048×2048 synthetic scene takes **≈ 1.2 s** in the staged
  profiler (was ≈ 2.9 s before this optimization pass).

---

## 8. Project layout

```text
src/
  classify/     illumination, colour space, features, SLIC, rules, morphology, worker
  ai/           random forest, training labels, tree detector, symbol fusion, worker
  vectorize/    masks, contours, topology, simplify, reconcile, filter, export, worker
  render/       canvas scene, provenance styling
  ui/           shell (menu, options, palette, dock, status), panels, map stage
  store/        Zustand project store (geometry writes go through updateFeatureGeometry)
  io/           import/export (PNG, SVG, PDF, OMAP, GeoJSON, GPX, KML, project file)
  geo/          projection and world file handling
  model/        types, schema (Zod), constants and IOF symbol catalogue
  i18n/         Italian/English copy
docs/           manuals (IT/EN) and PDF editions
e2e/            Playwright specs and fixtures
scripts/        manual PDF builder and UI audit helpers
```

---

## 9. Known limits

No GeoTIFF import, no GPS navigation, no real-time collaboration. The OMAP
symbol set is complete, but the editor only generates the classes supported by
classification, AI, OSM and manual drawing; a cartographer must still review
the result in OpenOrienteering Mapper. OSM and DEM data can be incomplete or misaligned; OSM
fusion produces automatic, unverified hypotheses and never declares runnability,
vegetation under canopy or IOF compliance. Automatic results are experimental;
only an explicit field declaration makes a feature verified.
