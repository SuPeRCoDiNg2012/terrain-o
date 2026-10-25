import type { Feature, Point } from '../../model/types';
import { PROVENANCE_STYLES, featureProvenance } from '../../render/provenance';

export interface ScreenGridLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PreviewPath {
  id: string;
  d: string;
}

interface CanvasStageOverlayProps {
  viewport: { width: number; height: number };
  /** World → screen transform owned by the stage; the overlay never guesses it. */
  worldToScreen: (point: Point) => Point;
  gridLines: ScreenGridLine[];
  previewPaths: PreviewPath[];
  lasso: Point[];
  selectedFeatures: Feature[];
  draft: Point[];
  draftPreview: Point[];
  draftKind: 'area' | 'line' | null;
  closeHint: boolean;
  hoverPoint: Point | null;
  rubber: { start: Point; end: Point } | null;
  calibrationStart: Point | null;
  cursorScreen: Point | null;
}

/**
 * Vector half of the hybrid renderer: handles, marquee, lasso, guides, draft
 * geometry and the live vectorization preview. Raster content stays in the
 * canvas below, so this layer only carries crisp, screen-resolution vectors.
 *
 * Provenance is never conveyed by colour alone: each handle group is tagged with
 * the provenance level, and the outline helpers read the single source of truth
 * in `render/provenance.ts` (dashed = automatic, solid = manual, plus a tick for
 * verified geometry).
 */
export function CanvasStageOverlay({
  viewport,
  worldToScreen,
  gridLines,
  previewPaths,
  lasso,
  selectedFeatures,
  draft,
  draftPreview,
  draftKind,
  closeHint,
  hoverPoint,
  rubber,
  calibrationStart,
  cursorScreen,
}: CanvasStageOverlayProps) {
  const lassoScreen = lasso.map(worldToScreen);

  return (
    <svg className="map-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true">
      {gridLines.length > 0 && (
        <g className="map-grid">
          {gridLines.map((line) => (
            <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </g>
      )}
      {previewPaths.map((region) => (
        <path key={region.id} d={region.d} className="vector-preview" fillRule="evenodd" />
      ))}
      {lassoScreen.length > 1 && (
        <g className="lasso-shape">
          <polygon points={lassoScreen.map((point) => `${point.x},${point.y}`).join(' ')} />
          <polyline points={lassoScreen.map((point) => `${point.x},${point.y}`).join(' ')} />
        </g>
      )}
      {(selectedFeatures.length === 1 ? selectedFeatures : []).map((feature) =>
        feature.coords.map((point, index) => {
          const screen = worldToScreen(point);
          const provenance = PROVENANCE_STYLES[featureProvenance(feature)];
          return (
            <circle
              key={`${feature.id}-${index}`}
              cx={screen.x}
              cy={screen.y}
              r={feature.kind === 'point' ? 6.5 : 5}
              className={`vertex-handle provenance-${featureProvenance(feature)}`}
              data-provenance={featureProvenance(feature)}
              data-dashed={provenance.dashed ? 'true' : 'false'}
            />
          );
        }),
      )}
      {draftPreview.length > 1 && (
        <polyline
          points={draftPreview
            .map((point) => {
              const screen = worldToScreen(point);
              return `${screen.x},${screen.y}`;
            })
            .join(' ')}
          className="draft-line"
        />
      )}
      {draftKind === 'area' && draftPreview.length > 2 && closeHint && (
        <polygon
          points={draftPreview
            .map((point) => {
              const screen = worldToScreen(point);
              return `${screen.x},${screen.y}`;
            })
            .join(' ')}
          className="draft-fill"
        />
      )}
      {draft.map((point, index) => {
        const screen = worldToScreen(point);
        return <circle key={index} cx={screen.x} cy={screen.y} r={index === 0 ? 6 : 4} className={`draft-point ${index === 0 ? 'first' : ''}`} />;
      })}
      {hoverPoint && draft.length > 0 && (
        <circle cx={worldToScreen(hoverPoint).x} cy={worldToScreen(hoverPoint).y} r={3.5} className="snap-point" />
      )}
      {rubber && (
        <rect
          x={Math.min(worldToScreen(rubber.start).x, worldToScreen(rubber.end).x)}
          y={Math.min(worldToScreen(rubber.start).y, worldToScreen(rubber.end).y)}
          width={Math.abs(worldToScreen(rubber.end).x - worldToScreen(rubber.start).x)}
          height={Math.abs(worldToScreen(rubber.end).y - worldToScreen(rubber.start).y)}
          className="rubber-band"
        />
      )}
      {calibrationStart && (
        <>
          <circle cx={worldToScreen(calibrationStart).x} cy={worldToScreen(calibrationStart).y} r={7} className="calibration-marker" />
          {hoverPoint && (
            <line
              x1={worldToScreen(calibrationStart).x}
              y1={worldToScreen(calibrationStart).y}
              x2={worldToScreen(hoverPoint).x}
              y2={worldToScreen(hoverPoint).y}
              className="calibration-line"
            />
          )}
        </>
      )}
      {cursorScreen && (
        <g className="map-crosshair">
          <line x1={cursorScreen.x} y1={0} x2={cursorScreen.x} y2={viewport.height} />
          <line x1={0} y1={cursorScreen.y} x2={viewport.width} y2={cursorScreen.y} />
        </g>
      )}
    </svg>
  );
}
