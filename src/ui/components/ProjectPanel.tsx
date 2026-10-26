import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '../../model/types';
import { useProjectStore } from '../../store/projectStore';
import {
  deleteProject,
  estimateStorage,
  listProjects,
} from '../../persistence/db';
import { formatBytes } from '../../render/canvas';
import { metersPerPixel } from '../../geo/projection';
import { worldFileUnits } from '../../geo/worldfile';
import { APP_VERSION, PRINT_SCALES, PROVENANCE_NOTES } from '../../model/constants';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { useUiStore } from '../uiStore';
import { useLocale, useT } from '../../i18n';
import { DebouncedTextField, InfoNote, SectionTitle, Toggle } from './fields';
import { Icon } from './Icon';

interface ProjectPanelProps {
  onOpenFilePicker: () => void;
  onImportProjectFile: (file: File) => void;
  onOpenExport: () => void;
  onOpenHelp: () => void;
}

function dateLabel(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ProjectPanel({ onOpenFilePicker, onImportProjectFile, onOpenExport, onOpenHelp }: ProjectPanelProps) {
  const project = useProjectStore((state) => state.project);
  const sourceImage = useProjectStore((state) => state.sourceImage);
  const storage = useProjectStore((state) => state.storage);
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt);
  const saveError = useProjectStore((state) => state.saveError);
  const setStorage = useProjectStore((state) => state.setStorage);
  const setPrintScale = useProjectStore((state) => state.setPrintScale);
  const setShowNorth = useProjectStore((state) => state.setShowNorth);
  const setName = useProjectStore((state) => state.setName);
  const clearCalibration = useProjectStore((state) => state.clearCalibration);
  const setTool = useProjectStore((state) => state.setTool);
  const newBlankProject = useProjectStore((state) => state.newBlankProject);
  const loadProjectById = useProjectStore((state) => state.loadProjectById);
  const snapEnabled = useProjectStore((state) => state.snapEnabled);
  const setSnapEnabled = useProjectStore((state) => state.setSnapEnabled);
  const gridEnabled = useProjectStore((state) => state.gridEnabled);
  const setGridEnabled = useProjectStore((state) => state.setGridEnabled);
  const gridSize = useProjectStore((state) => state.gridSize);
  const setGridSize = useProjectStore((state) => state.setGridSize);
  const setLeftOpen = useUiStore((state) => state.setLeftOpen);
  const t = useT();
  const locale = useLocale();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const mpp = metersPerPixel(project);
  const calibration = project.calibration;
  const paperWidth = project.image && mpp ? (mpp * project.image.width * 1000) / project.printScale : null;
  const paperHeight = project.image && mpp ? (mpp * project.image.height * 1000) / project.printScale : null;

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch {
      toast('Impossibile leggere l\'elenco dei progetti locali.', 'warning');
    }
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const estimate = await estimateStorage();
      setStorage(estimate);
    } catch {
      setStorage({ usage: 0, quota: 0, supported: false });
    }
  }, [setStorage]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects, lastSavedAt]);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage, lastSavedAt]);

  useEffect(() => {
    // Clear a stale quota warning after a successful save as well.
    setQuotaError(saveError ?? null);
  }, [saveError]);

  const chooseCalibration = () => {
    if (!project.image) {
      toast('Importare prima un\'immagine sorgente.', 'warning');
      return;
    }
    setTool('calibrate');
    setLeftOpen(false);
    toast('Clicca due punti sull\'ortofoto, poi inserisci la distanza reale in metri.', 'info');
  };

  const removeCalibration = async () => {
    const ok = await confirmDialog({
      title: 'Rimuovere la calibrazione manuale?',
      body: 'Le misure torneranno alla scala automatica della georeferenziazione, se disponibile, oppure ai pixel.',
      confirmLabel: 'Rimuovi calibrazione',
      danger: true,
    });
    if (ok) {
      clearCalibration();
      toast('Calibrazione rimossa.', 'info');
    }
  };

  const handleNewProject = async () => {
    const ok = await confirmDialog({
      title: 'Creare un nuovo progetto?',
      body: 'Il progetto corrente resta salvato localmente e potrà essere riaperto dall\'elenco. La vista e la selezione verranno azzerate.',
      confirmLabel: 'Nuovo progetto',
    });
    if (ok) {
      newBlankProject();
      toast('Nuovo progetto creato. Importa un\'ortofoto per iniziare.', 'info');
    }
  };

  const openProject = async (id: string) => {
    if (id === project.id) {
      toast('Il progetto è già aperto.', 'info');
      return;
    }
    const ok = await confirmDialog({
      title: 'Aprire un altro progetto?',
      body: 'Il progetto corrente è salvato automaticamente in locale. Potrai riaprirlo dallo stesso elenco.',
      confirmLabel: 'Apri progetto',
    });
    if (!ok) return;
    try {
      const loaded = await loadProjectById(id);
      if (loaded) {
        toast('Progetto aperto.', 'success');
        void refreshProjects();
      } else {
        toast('Impossibile aprire il progetto selezionato.', 'error');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Impossibile aprire il progetto selezionato.', 'error');
    }
  };

  const removeProject = async (summary: ProjectSummary) => {
    const isCurrent = summary.id === project.id;
    const ok = await confirmDialog({
      title: `Eliminare “${summary.name}”?`,
      body: isCurrent
        ? 'Il progetto aperto e i suoi asset locali verranno eliminati. L\'operazione non è reversibile: esporta prima il file .terrain-o.json se vuoi conservarlo.'
        : 'Il progetto salvato e i suoi asset locali verranno eliminati. L\'operazione non è reversibile.',
      confirmLabel: 'Elimina progetto',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProject(summary.id);
      if (isCurrent) newBlankProject();
      toast('Progetto eliminato.', 'info');
      void refreshProjects();
      void refreshStorage();
    } catch {
      toast('Eliminazione non riuscita.', 'error');
    }
  };

  const quotaPercent = storage?.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  return (
    <div className="panel-content">
      <section className="panel-hero">
        <div className="eyebrow">{t('Progetto locale')}</div>
        <h2>{project.name}</h2>
        <p className="tiny muted">{t('Nessun account. Dati in IndexedDB sul dispositivo; il progetto non viene sincronizzato.')}</p>
      </section>

      <section className="panel-section">
        <SectionTitle icon="image" aside={<span className="badge badge-source">{t('Sorgente')}</span>}>{t('Immagine sorgente')}</SectionTitle>
        {project.image ? (
          <div className="image-card">
            {sourceImage ? (
              <img src={sourceImage.src} alt={t('Anteprima {name}', { name: project.image.name })} className="image-thumb" />
            ) : (
              <div className="image-thumb placeholder"><Icon name="image" /></div>
            )}
            <div className="image-card-body">
              <strong className="truncate" title={project.image.name}>{project.image.name}</strong>
              <span className="tiny muted">
                {project.image.width} × {project.image.height} px
                {project.image.originalWidth !== project.image.width ? ` · originale ${project.image.originalWidth}×${project.image.originalHeight}` : ''}
              </span>
              <span className="tiny muted">{t("Salvata come JPEG q.85 · non modificata dall'editor")}</span>
              <div className="inline-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={onOpenFilePicker} data-testid="replace-image">
                  <Icon name="import" size={15} /> {t('Sostituisci')}
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={onOpenExport}>
                  <Icon name="export" size={15} /> {t('Esporta')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="dropzone" onClick={onOpenFilePicker}>
            <Icon name="image" size={26} />
            <strong>{t('Importa ortofoto')}</strong>
            <span>JPG/PNG + world file + .prj</span>
            <span className="tiny muted">{t('La sorgente resta non modificabile.')}</span>
          </button>
        )}
        {project.image && (
          <p className="tiny muted">
            {t("La compressione JPEG è applicata solo per contenere lo spazio locale. Le geometrie restano riferite ai pixel dell'immagine importata.")}
          </p>
        )}
      </section>

      <section className="panel-section">
        <SectionTitle icon="map" aside={
          <span className={`badge ${project.imageBBox ? 'badge-verified' : 'badge-warning'}`}>
            {t(project.imageBBox ? 'georeferenziata' : 'pixel')}
          </span>          }>{t('Georeferenziazione')}</SectionTitle>
        {project.worldFile ? (
          <div className="data-list">
            <div><span>World file</span><strong className="mono">{t(worldFileUnits(project.worldFile) === 'degrees' ? 'gradi' : 'metri')}</strong></div>
            <div><span>{t('Proiezione')}</span><strong>
              {project.projectionSource === 'wkt' ? t('WKT da .prj')
                : project.projectionSource === 'assumed-wgs84' ? t('EPSG:4326 assunto')
                  : project.projectionSource === 'degrees' ? t('WGS84 (gradi)')
                    : t('non disponibile')}
            </strong></div>
            <div className="mono tiny">A {project.worldFile.A.toPrecision(8)} · E {project.worldFile.E.toPrecision(8)}</div>
            <div className="mono tiny">C {project.worldFile.C.toPrecision(10)} · F {project.worldFile.F.toPrecision(10)}</div>
            {project.imageBBox && (
              <div className="bbox-line">
                <span>BBox WGS84</span>
                <code>
                  {project.imageBBox.west.toFixed(6)}, {project.imageBBox.south.toFixed(6)} —{' '}
                  {project.imageBBox.east.toFixed(6)}, {project.imageBBox.north.toFixed(6)}
                </code>
              </div>
            )}
          </div>
        ) : (
          <InfoNote tone="warning">
            {t('Nessuna georeferenziazione: le misure sono in pixel. Le funzioni OSM e DEM restano disattivate.')}
          </InfoNote>
        )}
        {project.geoWarnings.length > 0 && (
          <ul className="warning-list">
            {project.geoWarnings.map((warning, index) => (
              <li key={index}><Icon name="alert" size={14} /> {t(warning)}</li>
            ))}
          </ul>
        )}
        {project.projectionWKT && (
          <details className="details">
            <summary>{t('WKT della proiezione')}</summary>
            <pre className="code-block">{project.projectionWKT.slice(0, 1200)}</pre>
          </details>
        )}
      </section>

      <section className="panel-section">
        <SectionTitle icon="calibrate" aside={
          <span className={`badge ${calibration ? 'badge-verified' : 'badge-neutral'}`}>
            {calibration
              ? calibration.method === 'least-squares'
                ? t('{n} misure', { n: 1 + (calibration.extraSamples?.length ?? 0) })
                : t('2 punti')
              : t('non calibrata')}
          </span>
        }>{t('Scala e stampa')}</SectionTitle>
        <div className="data-list">
          <div><span>{t('Scala operativa')}</span><strong>{mpp ? `${mpp.toFixed(mpp < 1 ? 3 : 2)} m/px` : t('misure in pixel')}</strong></div>
          <div><span>{t('Origine scala')}</span><strong>{t(calibration ? 'calibrazione manuale (prioritaria)' : mpp ? 'georeferenziazione' : 'nessuna')}</strong></div>
          {paperWidth != null && paperHeight != null && (
            <div><span>{t('Stampa 1:{scale}', { scale: project.printScale })}</span><strong>{paperWidth.toFixed(1)} × {paperHeight.toFixed(1)} mm</strong></div>
          )}
        </div>
        <div className="inline-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={chooseCalibration} disabled={!project.image} data-testid="calibrate-button">
            <Icon name="calibrate" size={16} /> {t(calibration ? 'Aggiungi misura' : 'Calibra 2 punti')}
          </button>
          {calibration && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void removeCalibration()}>
              {t('Rimuovi calibrazione')}
            </button>
          )}
        </div>
        <p className="tiny muted">
          {t('Con più misure la scala viene stimata ai minimi quadrati. Se non calibri e non sei georeferenziato, tutte le misure restano in pixel.')}
        </p>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="print-scale">{t('Scala di stampa')}</label>
            <select id="print-scale" className="select-input" value={project.printScale} onChange={(event) => setPrintScale(Number(event.target.value))}>
              {PRINT_SCALES.map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}
            </select>
          </div>
        </div>
        <Toggle
          label={t('Mostra freccia nord')}
          checked={project.showNorth}
          onChange={setShowNorth}
          description={t("Indica solo l'orientamento della sorgente, non un nord geografico verificato.")}
        />
      </section>

      <section className="panel-section">
        <SectionTitle icon="wand">{t('Aggancio e griglia')}</SectionTitle>
        <Toggle label={t('Snap ai vertici esistenti')} checked={snapEnabled} onChange={setSnapEnabled} description={t('Raggio 10 px sullo schermo.')} />
        <Toggle label={t('Snap alla griglia')} checked={gridEnabled} onChange={setGridEnabled} />
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="grid-size">{t('Passo griglia')}</label>
            <select id="grid-size" className="select-input" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} disabled={!gridEnabled}>
              {![5, 10, 25].includes(gridSize) && <option value={gridSize}>{gridSize} px</option>}
              <option value={5}>5 px</option>
              <option value={10}>10 px</option>
              <option value={25}>25 px</option>
            </select>
          </div>
        </div>
      </section>

      <section className="panel-section">
        <SectionTitle icon="shield">{t('Livelli di provenienza')}</SectionTitle>
        <div className="provenance-cards">
          {PROVENANCE_NOTES.map((note) => (
            <div key={note.label} className={`provenance-card tone-${note.tone}`}>
              <strong>{t(note.label)}</strong>
              <p>{t(note.text)}</p>
            </div>
          ))}
        </div>
        <button type="button" className="text-link" onClick={onOpenHelp}>
          {t('Limiti del prodotto e criteri di utilizzo →')}
        </button>
      </section>

      <section className="panel-section">
        <SectionTitle icon="layers" aside={
          <button type="button" className="text-link" onClick={() => void refreshProjects()}>{t('Aggiorna')}</button>
        }>{t('Progetti locali')}</SectionTitle>
        <div className="project-list">
          {projects.length === 0 && <p className="tiny muted">{t('Nessun progetto salvato. Un progetto compare qui dopo il primo import.')}</p>}
          {projects.map((summary) => (
            <div key={summary.id} className={`project-row ${summary.id === project.id ? 'current' : ''}`}>
              <button type="button" className="project-open" onClick={() => void openProject(summary.id)}>
                <span className="project-row-name">{summary.name}</span>
                <span className="tiny muted">{dateLabel(summary.updatedAt, locale)} · {t('{n} elementi', { n: summary.featureCount })}</span>
              </button>
              {summary.id === project.id && <span className="badge badge-source">{t('aperto')}</span>}
              <button type="button" className="icon-button danger-hover" aria-label={t('Elimina {name}', { name: summary.name })} onClick={() => void removeProject(summary)}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="inline-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleNewProject()}>
            <Icon name="plus" size={15} /> {t('Nuovo progetto')}
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => jsonInputRef.current?.click()}>
            <Icon name="import" size={15} /> {t('Importa .json')}
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,.terrain-o.json,application/json"
            aria-label={t('Importa un file di progetto terrain-o.json')}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportProjectFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="panel-section">
        <SectionTitle icon="shield" aside={<span className="badge badge-neutral">IndexedDB</span>}>{t('Spazio locale')}</SectionTitle>
        {storage?.supported ? (
          <>
            <div className="storage-line">
              <span>{t('{size} usati', { size: formatBytes(storage.usage) })}</span>
              <span className="muted">{t('su {size}', { size: formatBytes(storage.quota) })}</span>
            </div>
            <div className="storage-track"><span style={{ width: `${quotaPercent}%` }} /></div>
            <p className="tiny muted">
              {t("Immagine e classificazione sono in store separati: l'autosalvataggio riscrive solo il progetto leggero. Se lo spazio finisce, esporta il progetto e libera i progetti non usati.")}
            </p>
          </>
        ) : (
          <p className="tiny muted">{t('Stima dello spazio non disponibile in questo browser. Il salvataggio locale resta attivo.')}</p>
        )}
        {(quotaError || saveError) && (
          <InfoNote tone="danger">
            {quotaError || saveError}
            <button type="button" className="text-link" onClick={onOpenExport}>{t('Esporta ora il progetto →')}</button>
          </InfoNote>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={() => void refreshStorage()}>
          {t('Aggiorna stima spazio')}
        </button>
      </section>

      <section className="panel-section">
        <SectionTitle icon="help">{t('Informazioni')}</SectionTitle>
        <div className="data-list">
          <div><span>{t('Formato progetto')}</span><strong className="mono">terrain-o/1.0</strong></div>
          <div><span>{t('Versione app')}</span><strong className="mono">{APP_VERSION}</strong></div>
          <div>
            <span>{t('Ultimo salvataggio')}</span>
            <strong>{lastSavedAt ? dateLabel(lastSavedAt, locale) : t(project.image || project.features.length ? 'autosalvataggio locale attivo' : 'nessun dato')}</strong>
          </div>
        </div>
        <DebouncedTextField label={t('Rinomina progetto')} value={project.name} onCommit={setName} />
      </section>
    </div>
  );
}
