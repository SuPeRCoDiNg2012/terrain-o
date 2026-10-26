import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../uiStore';
import { useLayoutStore } from './layoutStore';
import { metersPerPixel } from '../../geo/projection';
import { featureProvenance, provenanceWord } from '../../render/provenance';
import { useLocale, useT } from '../../i18n';
import { Icon } from '../components/Icon';

const TOOL_LABELS: Record<string, string> = {
  select: 'Selezione',
  marquee: 'Marquee',
  lasso: 'Lazo',
  pan: 'Sposta vista',
  zoom: 'Zoom',
  eyedropper: 'Contagocce',
  text: 'Testo',
  'draw-area': 'Area',
  'draw-line': 'Linea',
  'draw-point': 'Punto',
  calibrate: 'Calibra',
};

function fmt(value: number | null | undefined, digits: number, locale: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(locale === 'it' ? 'it-IT' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function memoryLabel(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export function StatusBar() {
  const cursor = useUiStore((state) => state.cursor);
  const project = useProjectStore((state) => state.project);
  const view = useProjectStore((state) => state.view);
  const selection = useProjectStore((state) => state.selection);
  const activeTool = useProjectStore((state) => state.activeTool);
  const saveState = useProjectStore((state) => state.saveState);
  const saveError = useProjectStore((state) => state.saveError);
  const storage = useProjectStore((state) => state.storage);
  const autoJob = useProjectStore((state) => state.autoJob);
  const layout = useLayoutStore();
  const locale = useLocale();
  const t = useT();
  const mpp = metersPerPixel(project);

  const selectedFeatures = project.features.filter((feature) => selection.includes(feature.id));
  const provenanceSet = new Set(selectedFeatures.map((feature) => featureProvenance(feature)));
  const provenance =
    provenanceSet.size === 1 && selectedFeatures.length
      ? t(provenanceWord([...provenanceSet][0]))
      : provenanceSet.size > 1
        ? t('misto')
        : null;

  const saveLabel =
    saveState === 'saving' ? t('salvataggio…') : saveState === 'error' ? t('errore di salvataggio') : saveState === 'saved' ? t('salvato') : t('dati locali');

  return (
    <footer className="status-bar status-bar-pro" aria-label={t('Barra di stato')}>
      <div className="status-segment coords">
        <Icon name="compass" size={12} />
        {cursor ? (
          <>
            <span className="mono">x {fmt(cursor.px, 1, locale)} · y {fmt(cursor.py, 1, locale)} px</span>
            {cursor.lon != null && cursor.lat != null && (
              <span className="mono status-secondary">{fmt(cursor.lat, 6, locale)}, {fmt(cursor.lon, 6, locale)}</span>
            )}
            {!cursor.insideImage && <span className="status-muted">{t('fuori immagine')}</span>}
          </>
        ) : (
          <span className="status-muted">{t('sposta il puntatore sulla mappa')}</span>
        )}
      </div>

      <div className="status-segment">
        <span className="status-label">Zoom</span>
        <span className="mono">{Math.round(view.scale * 100)}%</span>
        <span className="status-divider" />
        <span className="mono">{mpp ? `${fmt(mpp, mpp < 1 ? 3 : 2, locale)} m/px` : t('pixel')}</span>
        <span className="status-divider" />
        <span>{layout.rulers ? `${t('righelli')} ${t(layout.rulerUnit === 'px' ? 'pixel' : layout.rulerUnit === 'm' ? 'metri' : 'gradi')}` : t('righelli off')}</span>
      </div>

      <div className="status-segment">
        <span className="status-label">{t('Strumento')}</span>
        <span>{t(TOOL_LABELS[activeTool] ?? activeTool)}</span>
        {layout.crosshair && <span className="status-muted">{t('Mirino')}</span>}
      </div>

      <div className="status-segment">
        <span className="status-label">{t('Selezione')}</span>
        <span>{selection.length ? t(selection.length === 1 ? '{n} elemento' : '{n} elementi', { n: selection.length }) : t('nessuna')}</span>
        {provenance && (
          <>
            <span className="status-divider" />
            <span className={`status-provenance provenance-${provenance}`}>{provenance}</span>
          </>
        )}
      </div>

      <div className="status-spacer" />

      {autoJob.running && (
        <div className="status-segment status-auto" title={autoJob.phase}>
          <Icon name="wand" size={12} />
          <span>{autoJob.phase}</span>
          <span className="mono">{Math.round(autoJob.percent)}%</span>
        </div>
      )}

      <div className={`status-segment status-save status-${saveState}`} title={saveError ?? t('Salvataggio automatico in IndexedDB')}>
        <span className="status-dot" aria-hidden="true" />
        <span>{saveLabel}</span>
      </div>
      <div className="status-segment status-muted" title={t('Spazio stimato occupato dal progetto locale')}>
        <Icon name="layers" size={12} /> {memoryLabel(storage?.usage)}
      </div>
      <div className="status-segment status-muted">
        <Icon name="shield" size={12} /> {t('bozza preliminare')}
      </div>
    </footer>
  );
}
