import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { InfoNote } from './fields';
import {
  DEM_ATTRIBUTION,
  OSM_ATTRIBUTION,
  PRELIMINARY_WARNING,
  typeSpec,
} from '../../model/constants';
import { canvasToBlob, composeProjectPng } from '../../io/exportPng';
import { exportProjectPdf } from '../../io/exportPdf';
import { exportProjectSvg } from '../../io/exportSvg';
import { downloadBlob, downloadText, safeFilename } from '../../render/canvas';
import type { RenderImages } from '../../render/scene';

function ExportButton({
  id,
  label,
  hint,
  disabled,
  busy,
  onClick,
}: {
  id: string;
  label: string;
  hint: string;
  disabled?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="export-option"
      disabled={disabled || busy}
      onClick={onClick}
      data-testid={id}
    >
      <span className="export-option-icon"><Icon name="export" size={17} /></span>
      <span className="export-option-copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className="export-option-state">{busy ? 'Preparazione…' : 'Scarica'}</span>
    </button>
  );
}

export function ExportModal({ onClose, initialFocus }: { onClose: () => void; initialFocus?: string }) {
  const project = useProjectStore((state) => state.project);
  const sourceImage = useProjectStore((state) => state.sourceImage);
  const classificationImage = useProjectStore((state) => state.classificationImage);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Choosing "SVG…" or "PNG…" in the Exporta menu must land on that export,
  // not at the top of a generic dialog: otherwise the menu looks dead.
  useEffect(() => {
    if (!initialFocus) return;
    const target = document.querySelector<HTMLElement>(`[data-testid="${initialFocus}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.classList.add('export-option-focus');
    const timer = window.setTimeout(() => target.classList.remove('export-option-focus'), 2200);
    return () => window.clearTimeout(timer);
  }, [initialFocus]);

  const images: RenderImages = { source: sourceImage, classification: classificationImage };
  const hasImage = Boolean(project.image && sourceImage);
  const georeferenced = Boolean(project.imageBBox);
  const hasCourse = project.features.some((f) => f.kind === 'point' && ['start', 'control', 'finish'].includes(f.type));
  const hasFeatures = project.features.length > 0;
  const objectKinds = new Map<string, number>();
  for (const feature of project.features) {
    const key = typeSpec(feature.type).label;
    objectKinds.set(key, (objectKinds.get(key) ?? 0) + 1);
  }
  const base = safeFilename(project.name);

  async function run(id: string, fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy(id);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Esportazione non riuscita.');
    } finally {
      setBusy(null);
    }
  }

  const exportPng = (multiplier: number) =>
    run(`png-${multiplier}`, async () => {
      if (!hasImage) throw new Error('Importare un’immagine sorgente prima di esportare.');
      const canvas = composeProjectPng(project, images, { multiplier });
      const blob = await canvasToBlob(canvas, 'image/png');
      downloadBlob(blob, `${base}-x${multiplier}.png`);
    });

  const exportSvg = () =>
    run('svg', async () => {
      if (!hasImage) throw new Error('Importare un’immagine sorgente prima di esportare.');
      downloadText(exportProjectSvg(project, images), `${base}.svg`, 'image/svg+xml');
    });

  const exportPdf = (format: 'a4' | 'a3') =>
    run(`pdf-${format}`, async () => {
      if (!hasImage) throw new Error('Importare un’immagine sorgente prima di esportare.');
      const blob = await exportProjectPdf(project, images, format);
      downloadBlob(blob, `${base}-${format.toUpperCase()}.pdf`);
    });

  const exportOmap = () =>
    run('omap', async () => {
      const { exportProjectOmap } = await import('../../io/exportOmap');
      downloadText(exportProjectOmap(project, images), `${base}.omap`, 'application/xml');
    });

  const exportGeoJson = () =>
    run('geojson', async () => {
      const { exportProjectGeoJson } = await import('../../io/exportGeoJson');
      downloadText(exportProjectGeoJson(project), `${base}.geojson`, 'application/geo+json');
    });

  const exportGpx = () =>
    run('gpx', async () => {
      const { exportCourseGpx } = await import('../../io/exportGpxKml');
      downloadText(exportCourseGpx(project), `${base}-percorso.gpx`, 'application/gpx+xml');
    });

  const exportKml = () =>
    run('kml', async () => {
      const { exportProjectKml } = await import('../../io/exportGpxKml');
      downloadText(exportProjectKml(project), `${base}.kml`, 'application/vnd.google-earth.kml+xml');
    });

  const exportProject = () =>
    run('project', async () => {
      const { buildProjectFile, projectFileToJSON } = await import('../../io/projectFile');
      const file = await buildProjectFile(project);
      const blob = new Blob([projectFileToJSON(file)], { type: 'application/json' });
      downloadBlob(blob, `${base}.terrain-o.json`);
    });

  return (
    <Modal
      title="Esporta"
      kicker="Bozza preliminare · dati locali"
      onClose={onClose}
      wide
      footer={
        <div className="export-footer">
          <span className="tiny muted">
            Ogni file porta con sé l’avvertenza di bozza e le attribuzioni OSM/DEM quando presenti.
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Chiudi</button>
        </div>
      }
    >
      {!hasImage && (
        <InfoNote tone="warning">
          Nessuna immagine sorgente: gli export cartografici sono disattivati. Puoi comunque esportare il progetto leggero
          e i dati vettoriali disponibili.
        </InfoNote>
      )}
      {error && <InfoNote tone="danger">{error}</InfoNote>}
      {done && <InfoNote tone="success">File pronto: il download è stato avviato dal browser.</InfoNote>}

      <div className="export-summary">
        <div>
          <span className="eyebrow">Progetto</span>
          <strong>{project.name}</strong>
          <span className="tiny muted">
            {project.image ? `${project.image.width}×${project.image.height} px · ` : ''}
            {project.calibration ? `scala manuale ${project.calibration.mPerPx.toFixed(3)} m/px` : georeferenced ? 'scala da georeferenziazione' : 'misure in pixel'}
          </span>
        </div>
        <div className="export-counts">
          <span><strong>{project.features.length}</strong> elementi</span>
          <span><strong>{project.features.filter((f) => f.verified).length}</strong> verificati</span>
          {project.classification && <span><strong>1</strong> classificazione</span>}
          {project.contours.length > 0 && <span><strong>{project.contours.length}</strong> curve</span>}
        </div>
      </div>

      <section className="export-group">
        <h3>Mappa</h3>
        <p className="tiny muted">La mappa intera, non solo la vista corrente. La barra metrica compare se la scala è calibrata o georeferenziata.</p>
        <div className="export-grid">
          {[1, 2, 3].map((multiplier) => (
            <ExportButton
              key={multiplier}
              id={`export-png-${multiplier}`}
              label={`PNG ${multiplier}×`}
              hint={multiplier === 1 ? 'risoluzione nativa' : multiplier === 2 ? 'doppia risoluzione' : 'tripla risoluzione (limiti di memoria)'}
              disabled={!hasImage}
              busy={busy === `png-${multiplier}`}
              onClick={() => void exportPng(multiplier)}
            />
          ))}
          <ExportButton
            id="export-svg"
            label="SVG vettoriale"
            hint="geometrie reali, raster incorporati, scala fisica"
            disabled={!hasImage}
            busy={busy === 'svg'}
            onClick={() => void exportSvg()}
          />
          <ExportButton
            id="export-pdf-a4"
            label="PDF A4"
            hint="mappa, legenda, avvertenze e attribuzioni"
            disabled={!hasImage}
            busy={busy === 'pdf-a4'}
            onClick={() => void exportPdf('a4')}
          />
          <ExportButton
            id="export-pdf-a3"
            label="PDF A3"
            hint="stampa più grande, stessa composizione"
            disabled={!hasImage}
            busy={busy === 'pdf-a3'}
            onClick={() => void exportPdf('a3')}
          />
        </div>
      </section>

      <section className="export-group">
        <h3>Cartografia e dati</h3>
        <div className="export-grid">
          <ExportButton
            id="export-omap"
            label="OMAP (OpenOrienteering Mapper)"
            hint={`XML v9 · ${project.features.length} oggetti · simboli ISOM semplificati`}
            disabled={!hasImage}
            busy={busy === 'omap'}
            onClick={() => void exportOmap()}
          />
          <ExportButton
            id="export-geojson"
            label="GeoJSON"
            hint={georeferenced ? 'WGS84 con proprietà di verifica' : 'coordinate in pixel: non è un overlay geografico'}
            disabled={!hasFeatures}
            busy={busy === 'geojson'}
            onClick={() => void exportGeoJson()}
          />
          <ExportButton
            id="export-gpx"
            label="GPX del percorso"
            hint="waypoint e rotta; richiede georeferenziazione WGS84"
            disabled={!georeferenced || !hasCourse}
            busy={busy === 'gpx'}
            onClick={() => void exportGpx()}
          />
          <ExportButton
            id="export-kml"
            label="KML per Google Earth"
            hint="aree, linee e percorso; richiede georeferenziazione"
            disabled={!georeferenced || !hasFeatures}
            busy={busy === 'kml'}
            onClick={() => void exportKml()}
          />
          <ExportButton
            id="export-project"
            label="Progetto .terrain-o.json"
            hint="formato documentato · include immagine e classificazione"
            disabled={!project.image}
            busy={busy === 'project'}
            onClick={() => void exportProject()}
          />
        </div>
      </section>

      {objectKinds.size > 0 && (
        <section className="export-group">
          <h3>Contenuto degli elementi</h3>
          <div className="export-tags">
            {[...objectKinds.entries()].map(([label, count]) => (
              <span key={label} className="badge badge-neutral">{label} · {count}</span>
            ))}
          </div>
        </section>
      )}

      <section className="export-group export-warnings">
        <h3>Avvertenze incluse nei file</h3>
        <p className="small">{PRELIMINARY_WARNING}</p>
        <p className="tiny muted">
          {project.osmWays.length > 0 ? OSM_ATTRIBUTION : 'Nessun dato OSM nel progetto.'}
          {' · '}
          {project.contours.length > 0 ? DEM_ATTRIBUTION : 'Nessuna curva DEM nel progetto.'}
        </p>
        <p className="tiny muted">
          L’esportazione OMAP è una bozza tecnica: i simboli ISOM sono semplificati e non sostituiscono la simbolizzazione
          approvata da un cartografo. L’apertura in OpenOrienteering Mapper 0.9.x va verificata manualmente sul file generato.
        </p>
      </section>
    </Modal>
  );
}
