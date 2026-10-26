import { useEffect, useRef, useState } from 'react';
import type { Feature } from '../../model/types';
import { selectCourseFeatures, useProjectStore } from '../../store/projectStore';
import { distanceBetween, formatMeters, wgs84ToPixel } from '../../geo/projection';
import { parseGpx } from '../../io/importGpx';
import { exportCourseGpx, exportProjectKml } from '../../io/exportGpxKml';
import { downloadText, safeFilename } from '../../render/canvas';
import { typeSpec } from '../../model/constants';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { SectionTitle, InfoNote, Toggle } from './fields';
import { Icon } from './Icon';

function CourseCodeInput({ feature }: { feature: Feature }) {
  const updateFeatureFields = useProjectStore((state) => state.updateFeatureFields);
  const [value, setValue] = useState(feature.code ?? '');

  // Keep the field in sync with undo/redo and GPX imports; otherwise the
  // input would keep showing a code that no longer belongs to the element.
  useEffect(() => {
    setValue(feature.code ?? '');
  }, [feature.code]);

  return (
    <input
      className="course-code-input"
      value={value}
      onChange={(event) => setValue(event.target.value.slice(0, 12))}
      onBlur={() => {
        if (value !== (feature.code ?? '')) updateFeatureFields(feature.id, { code: value });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
      }}
      aria-label={`Codice ${feature.name}`}
      placeholder="cod."
    />
  );
}

export function CoursePanel() {
  const project = useProjectStore((state) => state.project);
  const view = useProjectStore((state) => state.view);
  const viewport = useProjectStore((state) => state.viewport);
  const addCoursePoint = useProjectStore((state) => state.addCoursePoint);
  const moveCoursePoint = useProjectStore((state) => state.moveCoursePoint);
  const optimizeCourse = useProjectStore((state) => state.optimizeCourse);
  const setCourseLinesVisible = useProjectStore((state) => state.setCourseLinesVisible);
  const addGpxWaypoints = useProjectStore((state) => state.addGpxWaypoints);
  const select = useProjectStore((state) => state.select);
  const focusSelection = useProjectStore((state) => state.focusSelection);
  const deleteSelected = useProjectStore((state) => state.deleteSelected);
  const selection = useProjectStore((state) => state.selection);
  const gpxInputRef = useRef<HTMLInputElement>(null);

  const features = selectCourseFeatures(project);
  const controls = features.filter((f) => f.type === 'control');
  const start = features.find((f) => f.type === 'start');
  const finish = features.find((f) => f.type === 'finish');

  const centerPoint = () => {
    const width = project.image?.width ?? 1;
    const height = project.image?.height ?? 1;
    const x = (viewport.width / 2 - view.tx) / view.scale;
    const y = (viewport.height / 2 - view.ty) / view.scale;
    return { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) };
  };

  const add = (type: 'start' | 'control' | 'finish') => {
    if (!project.image) {
      toast('Importare prima un\'immagine sorgente.', 'warning');
      return;
    }
    addCoursePoint(type, centerPoint());
  };

  const deletePoint = async (feature: Feature) => {
    const ok = await confirmDialog({
      title: `Eliminare ${typeSpec(feature.type).label}?`,
      body: 'Il punto percorso verrà rimosso. Se è un controllo, i successivi mantengono il loro codice; l\'ordine viene ricompattato.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (ok) {
      // Select only after confirmation: cancelling must not steal the current
      // selection from under the user.
      select([feature.id]);
      deleteSelected();
    }
  };

  const hasMeasure = Boolean(project.calibration || project.imageBBox);

  const importGpx = async (file: File) => {
    if (!project.imageBBox) {
      toast('GPX richiede una georeferenziazione WGS84.', 'warning');
      return;
    }
    try {
      const waypoints = parseGpx(await file.text());
      const converted: Array<{ point: { x: number; y: number }; name: string; code?: string }> = [];
      let skipped = 0;
      for (const waypoint of waypoints) {
        const pixel = wgs84ToPixel(project, waypoint.lon, waypoint.lat);
        if (
          !pixel ||
          !project.image ||
          pixel.x < 0 ||
          pixel.y < 0 ||
          pixel.x > project.image.width ||
          pixel.y > project.image.height
        ) {
          skipped++;
          continue;
        }
        converted.push({ point: pixel, name: waypoint.name, code: waypoint.code });
      }
      if (!converted.length) {
        toast('Nessun waypoint GPX ricade nell\'immagine corrente.', 'warning');
        return;
      }
      const count = addGpxWaypoints(converted);
      toast(`Importati ${count} waypoint GPX${skipped ? ` (${skipped} fuori immagine)` : ''}.`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import GPX non riuscito.', 'error');
    }
  };

  const downloadGpx = () => {
    try {
      downloadText(exportCourseGpx(project), `${safeFilename(project.name)}-percorso.gpx`, 'application/gpx+xml');
      toast('GPX del percorso esportato.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export GPX non riuscito.', 'error');
    }
  };

  const downloadKml = () => {
    try {
      downloadText(exportProjectKml(project), `${safeFilename(project.name)}.kml`, 'application/vnd.google-earth.kml+xml');
      toast('KML esportato.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export KML non riuscito.', 'error');
    }
  };

  let cumulative = 0;
  const distances = features.map((feature, index) => {
    if (index === 0) return 0;
    const segment = distanceBetween(project, features[index - 1].coords[0], feature.coords[0]);
    cumulative += segment ?? 0;
    return cumulative;
  });

  return (
    <div className="panel-content">
      <section className="panel-hero">
        <div className="eyebrow">Percorso e controlli</div>
        <h2>Tracciato geometrico</h2>
        <p className="tiny muted">
          La lunghezza è la somma dei segmenti tra i punti, mai una dichiarazione di percorribilità o di tempo di gara.
        </p>
      </section>

      <InfoNote tone="warning">
        Nessun controllo è verificato automaticamente. La verifica richiede una dichiarazione esplicita sul campo.
      </InfoNote>

      <section className="panel-section">
        <SectionTitle icon="route" aside={<span className="badge badge-source">{features.length} punti</span>}>Aggiungi punti</SectionTitle>
        <div className="course-add-grid">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => add('start')} disabled={Boolean(start)}>
            <Icon name="point" size={15} /> Partenza
          </button>
          <button type="button" className="btn btn-primary btn-small" onClick={() => add('control')} data-testid="add-control">
            <Icon name="plus" size={15} /> Controllo
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => add('finish')} disabled={Boolean(finish)}>
            <Icon name="point" size={15} /> Arrivo
          </button>
        </div>
        {!project.image && <p className="tiny muted">Serve un'immagine sorgente.</p>}
        <Toggle label="Mostra linee di collegamento" checked={project.course.showLines} onChange={setCourseLinesVisible} />
      </section>

      <section className="panel-section">
        <SectionTitle icon="route" aside={<span className={`badge ${hasMeasure ? 'badge-verified' : 'badge-warning'}`}>{hasMeasure ? 'misure metriche' : 'misure in pixel'}</span>}>
          Sequenza
        </SectionTitle>
        {features.length === 0 ? (
          <p className="tiny muted">Nessun punto percorso. Aggiungi partenza, controlli e arrivo.</p>
        ) : (
          <ol className="course-list">
            {features.map((feature, index) => {
              const spec = typeSpec(feature.type);
              const selected = selection.includes(feature.id) && selection.length === 1;
              return (
                <li key={feature.id} className={`course-row ${selected ? 'selected' : ''}`}>
                  <span className="course-order">
                    {feature.type === 'start' ? 'S' : feature.type === 'finish' ? 'F' : index}
                  </span>
                  <span className={`course-dot type-${feature.type}`} aria-hidden="true" />
                  <div className="course-main">
                    <div className="course-line">
                      <button type="button" className="course-name" onClick={() => { select([feature.id]); focusSelection(); }}>
                        {spec.label}
                        {feature.type === 'control' && feature.code ? ` · ${feature.code}` : ''}
                      </button>
                      {feature.verified && <span className="badge badge-verified">verificato</span>}
                    </div>
                    <div className="course-meta">
                      {feature.type === 'control' && <CourseCodeInput feature={feature} />}
                      <span className="tiny muted">
                        {hasMeasure ? `progressiva ${formatMeters(distances[index])}` : `${distances[index].toFixed(0)} px`}
                      </span>
                      {feature.source === 'gpx' && <span className="badge badge-neutral">GPX</span>}
                    </div>
                  </div>
                  <div className="course-row-actions">
                    {feature.type === 'control' && (
                      <>
                        <button type="button" className="icon-button" aria-label="Sposta controllo su" disabled={!controls.length || controls[0].id === feature.id} onClick={() => moveCoursePoint(feature.id, -1)}>
                          <Icon name="up" size={14} />
                        </button>
                        <button type="button" className="icon-button" aria-label="Sposta controllo giù" disabled={!controls.length || controls[controls.length - 1].id === feature.id} onClick={() => moveCoursePoint(feature.id, 1)}>
                          <Icon name="down" size={14} />
                        </button>
                      </>
                    )}
                    <button type="button" className="icon-button danger-hover" aria-label={`Elimina ${spec.label}`} onClick={() => void deletePoint(feature)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="course-summary">
          <div><span>Lunghezza geometrica</span><strong>{hasMeasure ? formatMeters(distanceSum(features, project)) : `${distanceSum(features, project).toFixed(0)} px`}</strong></div>
          <div><span>Controlli</span><strong>{controls.length}</strong></div>
          <div><span>Verificati</span><strong>{features.filter((feature) => feature.verified).length} / {features.length}</strong></div>
        </div>
        <p className="tiny muted">
          {hasMeasure ? 'Somma dei segmenti tra punti consecutivi. Non include dislivello, vegetazione o ostacoli.' : 'Nessuna calibrazione/georeferenziazione: distanze in pixel.'}
        </p>
      </section>

      <section className="panel-section">
        <SectionTitle icon="wand">Ottimizzazione ordine</SectionTitle>
        <div className="inline-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => { optimizeCourse(); toast('Ordine controlli ottimizzato con nearest-neighbor + 2-opt.', 'success'); }} disabled={controls.length < 3}>
            <Icon name="route" size={15} /> Ottimizza controlli
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => gpxInputRef.current?.click()}>
            <Icon name="import" size={15} /> Importa GPX
          </button>
          <input
            ref={gpxInputRef}
            type="file"
            accept=".gpx,application/gpx+xml"
            aria-label="Importa waypoint da un file GPX"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importGpx(file);
              event.target.value = '';
            }}
          />
        </div>
        <p className="tiny muted">
          L'ottimizzazione non cambia le coordinate né lo stato di verifica, solo l'ordine dei controlli. L'import GPX aggiunge waypoint come controlli non verificati.
        </p>
      </section>

      <section className="panel-section">
        <SectionTitle icon="export">Export rapido percorso</SectionTitle>
        <div className="inline-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={downloadGpx} disabled={!features.length || !project.imageBBox}>
            <Icon name="export" size={15} /> GPX
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={downloadKml} disabled={!features.length || !project.imageBBox}>
            <Icon name="export" size={15} /> KML
          </button>
        </div>
        <p className="tiny muted">
          GPX e KML richiedono coordinate WGS84. La legenda con codici e distanze progressive è visibile sopra e inclusa nel PDF.
        </p>
      </section>
    </div>
  );
}

function distanceSum(features: Feature[], project: Parameters<typeof distanceBetween>[0]): number {
  let total = 0;
  for (let index = 1; index < features.length; index++) {
    total += distanceBetween(project, features[index - 1].coords[0], features[index].coords[0]) ?? 0;
  }
  return total;
}
