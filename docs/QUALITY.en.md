# Terrain / O — Measured pipeline quality

**Version 0.7.0 · Preliminary draft**

Italian edition: [QUALITY.md](QUALITY.md).

This document records the numbers the classification, vectorization, recognition
and fusion pipeline is verified against. They are not estimates: every value
comes from a test that runs in CI (`npm run test`) and fails if the result gets
worse.

## Why a synthetic scene

A real orthophoto has no per-pixel ground truth, so nothing can be measured
repeatably on it. `src/test/orthophoto.ts` generates a deterministic 960×720
scene containing the hard cases of a real survey:

- forest with 420 individually painted crowns, radial shading and texture;
- meadow with mowing bands, fine noise and grain;
- lake and pond with sinusoidal glints (the pond is the only enclosed hole);
- asphalt road crossing the forest, with coarse aggregate;
- building with a roof ridge and a hard cast shadow;
- pale, speckled rock outcrop;
- soft shadow over a third of the scene.

Every pixel carries the class the photograph actually shows, and every crown has
its coordinate. The `hardenScene` variant adds two 3×3 blur passes, a hard 45%
exposure shadow and a sinusoidal exposure falloff: the "real optics" version the
classifier has to survive.

## What the test measures

`src/classify/realistic.test.ts` checks four things.

### 1. Per-class accuracy

| Scene | Accuracy | Vegetation IoU | Open IoU | Water IoU | Artificial IoU |
| --- | --- | --- | --- | --- | --- |
| Clean | 99.9% | 0.998 | 0.999 | 1.000 | 0.999 |
| Shadow + blur + grain | 99.5% | 0.99 | 0.99 | 0.999 | 0.995 |

The test thresholds are 99% (clean) and 98.5% (hard), with a minimum IoU of 0.97
and 0.95. The hard case drove the rule rewrite: before the fix accuracy fell to
81.9%, with 124,513 shadowed meadow pixels read as vegetation.

### 2. Tree detection

| Metric | Value | Test threshold |
| --- | --- | --- |
| Crowns detected | 418 of 420 expected | — |
| Precision (within 9 px) | 0.742 | > 0.68 |
| Recall | 0.738 | > 0.65 |
| Detections on the forest outline | 0 | none within 1.2× scale |

The detector uses a signed difference of means at three scales, a ring test and
the distance from the vegetation boundary. It remains an experimental detector:
points are always editable and never verified automatically.

### 3. Vectorization topology and coverage

| Metric | Value |
| --- | --- |
| Polygons | 10 |
| Rings in total | 11 |
| Holes preserved | 1 (the pond) |
| Invalid polygons | 0 |
| Discarded polygons | 0 |
| Area covered relative to the frame | 99.97% |
| Per-class area error | < 2% |
| Duplicated vertices in rings | 0 |
| Vertices shared by adjacent polygons | 148 |

The test requires invalid = 0, discarded = 0, coverage > 99.5%, per-class area
error < 2% and at least 50 shared vertices: two adjacent classes must share one
boundary, not two similar ones.

### 4. Real exports

The end-to-end audit imports the scene as PNG + world file, runs **Run all**,
then downloads GeoJSON, OMAP, PNG and SVG. On the exported GeoJSON:

| Check | Result |
| --- | --- |
| Unclosed rings | 0 |
| Self-intersections | 0 |
| Duplicated consecutive vertices | 0 |
| Rings with fewer than 4 coordinates | 0 |
| Covered area relative to the frame | 99.97% |
| OMAP | 191 symbols, 686 objects, 686 coordinate blocks |
| PNG | 1032×956 px, with title, north arrow, legend and warning |
| SVG | 11 vector elements, embedded raster |

Audit artefacts (screenshots, exports, report) live in `screenshots/audit/` and
are not committed.

## What changed in this version

- **Hue-based rules instead of the a\* axis**: vegetation/open separation uses
  the Lab hue angle (green 130–190°, yellow/olive 78–125°), so shadowed meadow is
  no longer read as forest. Built surfaces gained a rule for warm roofs, which
  previously fell into "open" or "uncertain".
- **Wider local balancing**: the maximum gain goes from 1.6× to 2.6×, because
  real shadow sits at 0.3–0.5 exposure.
- **Recalibrated confidence**: it combines evidence and separation from the
  runner-up; the vectorizer threshold drops to 0.45 and no longer deletes pixels
  the classifier decided (12.6% of the frame used to vanish from the masks).
- **Repairing edge reconciliation**: a self-intersecting ring is reverted on its
  own instead of discarding the whole pass. Invalid polygons went from 25 to 0
  and shared boundaries are genuinely shared.
- **Fixed contour extractor**: an already-walked edge no longer aborts the walk,
  so inner rings are not lost.
- **Crowns**: signed multi-scale difference of means, ring test, boundary
  distance and scale-aware non-maximum suppression.

## Reproducing

```bash
npm run test          # includes src/classify/realistic.test.ts
npm run check         # lint + types + tests + build
npx playwright test   # UI flows, AI, mocked OSM, exports, WCAG AA
```

## Limits

- The synthetic scene is hard but it is not fieldwork: it does not replace a survey.
- Classification remains experimental raw material. The program never declares
  runnability, vegetation under canopy, terrain safety, elevation accuracy,
  invisible obstacles, a verified grid north or IOF compliance.
- Crown detection is a detector, not a census: false positives and missed crowns
  remain possible and must be corrected by hand.
- OSM and DEM depend on external services; the audit excludes them to stay
  reproducible and offline.
