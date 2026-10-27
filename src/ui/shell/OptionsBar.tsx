import type { CSSProperties } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../uiStore';
import { useLayoutStore, type RulerUnit } from './layoutStore';
import { useT } from '../../i18n';
import { Icon } from '../components/Icon';

const TOOL_NAMES: Record<string, string> = {
  select: 'Selezione oggetto',
  marquee: 'Selezione rettangolare',
  lasso: 'Lazo',
  pan: 'Sposta vista',
  zoom: 'Zoom',
  eyedropper: 'Contagocce',
  text: 'Testo',
  'draw-area': 'Area',
  'draw-line': 'Linea',
  'draw-point': 'Punto',
  calibrate: 'Calibra scala',
};

export function OptionsBar() {
  const activeTool = useProjectStore((state) => state.activeTool);
  const snapEnabled = useProjectStore((state) => state.snapEnabled);
  const gridEnabled = useProjectStore((state) => state.gridEnabled);
  const gridSize = useProjectStore((state) => state.gridSize);
  const setSnapEnabled = useProjectStore((state) => state.setSnapEnabled);
  const setGridEnabled = useProjectStore((state) => state.setGridEnabled);
  const setGridSize = useProjectStore((state) => state.setGridSize);
  const view = useProjectStore((state) => state.view);
  const viewport = useProjectStore((state) => state.viewport);
  const fitImage = useProjectStore((state) => state.fitImage);
  const setView = useProjectStore((state) => state.setView);
  const selection = useProjectStore((state) => state.selection);
  const offsetSelectedLines = useProjectStore((state) => state.offsetSelectedLines);
  const sampled = useUiStore((state) => state.sampledColor);
  const layout = useLayoutStore();
  const t = useT();

  const isSelection = activeTool === 'select' || activeTool === 'marquee' || activeTool === 'lasso';

  const zoomBy = (factor: number) => {
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const world = { x: (center.x - view.tx) / view.scale, y: (center.y - view.ty) / view.scale };
    const scale = Math.max(0.02, Math.min(40, view.scale * factor));
    setView({ scale, tx: center.x - world.x * scale, ty: center.y - world.y * scale }, true);
  };

  return (
    <div className="options-bar" role="toolbar" aria-label={t('Opzioni {tool}', { tool: t(TOOL_NAMES[activeTool] ?? activeTool) })}>
      <div className="options-tool-name">
        <strong>{t(TOOL_NAMES[activeTool] ?? activeTool)}</strong>
        <span className="options-hint">
          {activeTool === 'select' && t('clic seleziona, trascina sposta, shift aggiunge')}
          {activeTool === 'marquee' && t('trascina per selezionare un rettangolo')}
          {activeTool === 'lasso' && t(layout.lassoPolygon ? 'clic per i vertici, Invio chiude' : 'trascina un contorno libero')}
          {activeTool === 'pan' && t('trascina la vista, spazio temporaneo')}
          {activeTool === 'zoom' && t('clic ingrandisce, Alt+clic riduce')}
          {activeTool === 'eyedropper' && t('clic campiona il colore della mappa')}
          {activeTool === 'draw-area' && t('clic i vertici, Invio o doppio clic chiude')}
          {activeTool === 'draw-line' && t('clic i vertici, Invio termina')}
          {activeTool === 'draw-point' && t('clic per aggiungere un controllo')}
          {activeTool === 'calibrate' && t('due punti e una distanza nota')}
          {activeTool === 'text' && t('non disponibile in questa build')}
        </span>
      </div>

      <div className="options-divider" />

      <button
        type="button"
        className={`options-toggle ${snapEnabled ? 'on' : ''}`}
        aria-pressed={snapEnabled}
        onClick={() => setSnapEnabled(!snapEnabled)}
        title={t('Aggancia ai vertici esistenti')}
      >
        <Icon name="point" size={14} /> {t('Aggancia')}
      </button>
      <button
        type="button"
        className={`options-toggle ${gridEnabled ? 'on' : ''}`}
        aria-pressed={gridEnabled}
        onClick={() => setGridEnabled(!gridEnabled)}
        title={t('Mostra e aggancia la griglia')}
      >
        <Icon name="grid" size={14} /> {t('Griglia')}
      </button>
      {gridEnabled && (
        <label className="options-field">
          <span>{t('Passo')}</span>
          <input
            type="number"
            min={2}
            max={500}
            step={1}
            value={gridSize}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              if (Number.isFinite(next)) setGridSize(next);
            }}
            aria-label={t('Passo griglia in pixel')}
          />
          <span className="options-unit">px</span>
        </label>
      )}

      {isSelection && (
        <label className="options-field options-tolerance">
          <span>{t('Tolleranza')}</span>
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={layout.selectionTolerance}
            onChange={(event) => layout.setSelectionTolerance(Number(event.target.value))}
            aria-label={t('Tolleranza di selezione')}
            style={{ '--range-fill': `${((layout.selectionTolerance - 1) / 23) * 100}%` } as CSSProperties}
          />
          <span className="options-unit mono">{layout.selectionTolerance} px</span>
        </label>
      )}

      {activeTool === 'lasso' && (
        <button
          type="button"
          className={`options-toggle ${layout.lassoPolygon ? 'on' : ''}`}
          aria-pressed={layout.lassoPolygon}
          onClick={() => layout.setLassoPolygon(!layout.lassoPolygon)}
          title={t('Lazo poligonale: clicca i vertici e premi Invio')}
        >
          {t('Poligonale')}
        </button>
      )}

      {activeTool === 'draw-line' && (
        <div className="options-field">
          <span>{t('Offset linea')}</span>
          <input
            type="number"
            min={0.5}
            max={20}
            step={0.5}
            value={layout.lineOffset}
            onChange={(event) => layout.setLineOffset(Number(event.target.value))}
            aria-label={t('Offset linea in pixel')}
          />
          <button
            type="button"
            className="options-toggle"
            disabled={!selection.length}
            onClick={() => offsetSelectedLines(layout.lineOffset)}
            title={t('Sposta le linee selezionate parallelamente alla geometria')}
          >
            {t('Applica')}
          </button>
        </div>
      )}

      {activeTool === 'eyedropper' && (
        <div className="options-color">
          <span className="options-color-swatch" style={{ background: sampled?.hex ?? 'transparent' }} aria-hidden="true" />
          <span className="mono">{sampled ? sampled.hex : t('nessun campione')}</span>
          {sampled && <span className="mono muted">{sampled.r}, {sampled.g}, {sampled.b}</span>}
          {sampled?.classification && (
            <span className="options-color-class">
              <span className="options-color-swatch" style={{ background: sampled.classification.hex }} aria-hidden="true" />
              <span className="mono muted">{sampled.classification.hex}</span>
            </span>
          )}
        </div>
      )}

      <div className="options-spacer" />

      <label className="options-field options-rulers">
        <span>{t('Unità righelli')}</span>
        <select
          value={layout.rulerUnit}
          onChange={(event) => layout.setRulerUnit(event.target.value as RulerUnit)}
          aria-label={t('Unità dei righelli')}
        >
          <option value="px">{t('pixel')}</option>
          <option value="m">{t('metri')}</option>
          <option value="deg">{t('gradi')}</option>
        </select>
      </label>

      <div className="options-zoom">
        <button type="button" className="options-icon" onClick={() => zoomBy(1 / 1.25)} aria-label={t('Riduci zoom')} title={t('Riduci (Ctrl+-)')}>
          <Icon name="minus" size={14} />
        </button>
        <span className="mono options-zoom-value">{Math.round(view.scale * 100)}%</span>
        <button type="button" className="options-icon" onClick={() => zoomBy(1.25)} aria-label={t('Aumenta zoom')} title={t('Ingrandisci (Ctrl+=)')}>
          <Icon name="plus" size={14} />
        </button>
        <button type="button" className="options-icon" onClick={fitImage} title={t('Adatta alla vista (Ctrl+0)')} aria-label={t('Adatta alla vista')}>
          <Icon name="fit" size={14} />
        </button>
      </div>
    </div>
  );
}
