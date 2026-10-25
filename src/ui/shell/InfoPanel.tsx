import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../uiStore';
import { metersPerPixel } from '../../geo/projection';
import { worldFileUnits } from '../../geo/worldfile';
import { Icon } from '../components/Icon';

function num(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function InfoPanel() {
  const cursor = useUiStore((state) => state.cursor);
  const sampled = useUiStore((state) => state.sampledColor);
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const view = useProjectStore((state) => state.view);
  const mpp = metersPerPixel(project);
  const units = project.worldFile ? worldFileUnits(project.worldFile) : null;

  return (
    <div className="shell-panel">
      <div className="shell-panel-head">
        <h3>Informazioni</h3>
        <span className="tiny muted mono">{Math.round(view.scale * 100)}%</span>
      </div>

      <dl className="info-grid">
        <dt>Cursore X</dt>
        <dd className="mono">{cursor ? `${num(cursor.px, 2)} px` : '—'}</dd>
        <dt>Cursore Y</dt>
        <dd className="mono">{cursor ? `${num(cursor.py, 2)} px` : '—'}</dd>
        <dt>Longitudine</dt>
        <dd className="mono">{num(cursor?.lon, 7)}</dd>
        <dt>Latitudine</dt>
        <dd className="mono">{num(cursor?.lat, 7)}</dd>
        <dt>Web Mercator</dt>
        <dd className="mono">
          {cursor?.mercator ? `${num(cursor.mercator[0], 1)}, ${num(cursor.mercator[1], 1)}` : '—'}
        </dd>
        <dt>Risoluzione</dt>
        <dd className="mono">{mpp ? `${num(mpp, mpp < 1 ? 3 : 2)} m/px` : 'non georeferenziata'}</dd>
        <dt>Unità world file</dt>
        <dd>{units === 'degrees' ? 'gradi' : units === 'meters' ? 'metri' : 'assenti'}</dd>
        <dt>Proiezione</dt>
        <dd className="truncate" title={project.projectionWKT ?? 'nessuna'}>
          {project.projectionSource === 'wkt' ? 'WKT dichiarato' : project.projectionSource === 'degrees' || project.projectionSource === 'assumed-wgs84' ? 'WGS 84' : 'locale'}
        </dd>
        <dt>Zoom</dt>
        <dd className="mono">{Math.round(view.scale * 100)}%</dd>
        <dt>Selezione</dt>
        <dd>{selection.length ? `${selection.length} di ${project.features.length} elementi` : `nessuna (${project.features.length} elementi)`}</dd>
      </dl>

      <div className="shell-subhead">
        <Icon name="eyedropper" size={14} /> Colore campionato
      </div>
      {sampled ? (
        <div className="sampled-color">
          <span className="sampled-swatch" style={{ background: sampled.hex }} aria-hidden="true" />
          <div>
            <strong className="mono">{sampled.hex}</strong>
            <div className="tiny mono muted">RGB {sampled.r}, {sampled.g}, {sampled.b} · A {sampled.a}</div>
            <div className="tiny mono muted">px {num(sampled.x, 1)}, {num(sampled.y, 1)}</div>
            {sampled.classification && (
              <div className="sampled-classification">
                <span className="sampled-swatch" style={{ background: sampled.classification.hex }} aria-hidden="true" />
                <span className="tiny mono muted">classificazione {sampled.classification.hex}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="shell-note">Usa il contagocce (I) per leggere un colore dalla mappa.</p>
      )}
    </div>
  );
}
