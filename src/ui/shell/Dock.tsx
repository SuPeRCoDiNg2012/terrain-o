import { useCallback, useRef, useState } from 'react';
import { PANEL_LABELS, useLayoutStore, type DockSide, type PanelId } from './layoutStore';
import { useUiStore } from '../uiStore';
import { useDevice } from '../useDevice';
import { useT } from '../../i18n';
import { Icon } from '../components/Icon';
import { ProjectPanel } from '../components/ProjectPanel';
import { LayersPanel } from '../components/LayersPanel';
import { FeatureList } from '../components/FeatureList';
import { Inspector } from '../components/Inspector';
import { ClassificationPanel } from '../components/ClassificationPanel';
import { AiPanel } from '../components/AiPanel';
import { OsmPanel } from '../components/OsmPanel';
import { DemPanel } from '../components/DemPanel';
import { CoursePanel } from '../components/CoursePanel';
import { VectorizePanel } from './VectorizePanel';
import { HistoryPanel } from './HistoryPanel';
import { InfoPanel } from './InfoPanel';
import { NavigatorPanel } from './NavigatorPanel';

export interface DockCallbacks {
  onOpenFilePicker: () => void;
  onImportProjectFile: (file: File) => void;
  onOpenExport: () => void;
  onOpenHelp: () => void;
}

interface DockProps extends DockCallbacks {
  side: DockSide;
  mobileOpen?: boolean;
}

const PANEL_DRAG_TYPE = 'application/x-terrain-panel';

export function Dock({ side, mobileOpen = false, onOpenFilePicker, onImportProjectFile, onOpenExport, onOpenHelp }: DockProps) {
  const panels = useLayoutStore((state) => state[side]);
  const active = useLayoutStore((state) => state.active[side]);
  const collapsed = useLayoutStore((state) => state.collapsed[side]);
  const width = useLayoutStore((state) => state.widths[side]);
  const setActive = useLayoutStore((state) => state.setActive);
  const toggleCollapsed = useLayoutStore((state) => state.toggleCollapsed);
  const setWidth = useLayoutStore((state) => state.setWidth);
  const movePanel = useLayoutStore((state) => state.movePanel);
  const setLeftOpen = useUiStore((state) => state.setLeftOpen);
  const setRightOpen = useUiStore((state) => state.setRightOpen);
  const device = useDevice();
  const t = useT();
  const [dropTarget, setDropTarget] = useState(false);
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const dockRef = useRef<HTMLElement>(null);

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = useLayoutStore.getState().widths[side];
      const onMove = (move: PointerEvent) => {
        if (side === 'left') setWidth('left', startWidth + (move.clientX - startX));
        else if (side === 'right') setWidth('right', startWidth - (move.clientX - startX));
        else setWidth('bottom', startWidth - (move.clientY - startY));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('resizing-panel');
      };
      document.body.classList.add('resizing-panel');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [setWidth, side],
  );

  const renderPanel = (panel: PanelId, hidden: boolean) => {
    const content = (() => {
      switch (panel) {
        case 'project':
          return (
            <ProjectPanel
              onOpenFilePicker={onOpenFilePicker}
              onImportProjectFile={onImportProjectFile}
              onOpenExport={onOpenExport}
              onOpenHelp={onOpenHelp}
            />
          );
        case 'layers':
          return <LayersPanel />;
        case 'features':
          return <FeatureList />;
        case 'properties':
          return <Inspector />;
        case 'classification':
          return <ClassificationPanel active={!hidden} />;
        case 'vectorize':
          return <VectorizePanel />;
        case 'ai':
          return <AiPanel />;
        case 'history':
          return <HistoryPanel />;
        case 'info':
          return <InfoPanel />;
        case 'navigator':
          return <NavigatorPanel />;
        case 'osm':
          return <OsmPanel />;
        case 'dem':
          return <DemPanel />;
        case 'course':
          return <CoursePanel />;
        default:
          return null;
      }
    })();

    return (
      <div
        key={panel}
        role="tabpanel"
        id={`dock-panel-${side}-${panel}`}
        aria-labelledby={`dock-tab-${side}-${panel}`}
        className="dock-pane"
        hidden={hidden}
      >
        <div className="dock-pane-scroll">{content}</div>
      </div>
    );
  };

  if (collapsed) {
    return (
      <aside
        className={`dock dock-${side} collapsed`}
        aria-label={t('Area pannelli {side}', { side: t(side === 'left' ? 'sinistra' : side === 'right' ? 'destra' : 'inferiore') })}
        style={side === 'bottom' ? undefined : { width: 38 }}
      >
        <button
          type="button"
          className="dock-collapsed-label"
          onClick={() => toggleCollapsed(side)}
          title={t('Espandi pannello')}
          aria-label={t('Espandi pannello')}
        >
          <Icon name="chevronRight" size={14} />
          <span>{t(side === 'left' ? 'Progetto' : side === 'right' ? 'Proprietà' : 'Storia')}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={dockRef}
      className={`dock dock-${side} ${panels.length === 0 ? 'empty' : ''} ${dropTarget ? 'drop-target' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label={t('Area pannelli {side}', { side: t(side === 'left' ? 'sinistra' : side === 'right' ? 'destra' : 'inferiore') })}
      style={panels.length === 0 ? undefined : side === 'bottom' ? { height: width } : { width }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(PANEL_DRAG_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget(true);
        }
      }}
      onDragLeave={(event) => {
        if (!dockRef.current?.contains(event.relatedTarget as Node)) setDropTarget(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropTarget(false);
        const panel = event.dataTransfer.getData(PANEL_DRAG_TYPE) as PanelId;
        if (panel) movePanel(panel, side);
      }}
    >
      <div className="dock-resizer" onPointerDown={startResize} role="separator" aria-orientation={side === 'bottom' ? 'horizontal' : 'vertical'} title={t('Trascina per ridimensionare')} />

      <div className="dock-head" hidden={panels.length === 0}>
        <div className="dock-tabs" role="tablist" aria-orientation="horizontal">
          {panels.map((panel) => (
            <button
              key={panel}
              type="button"
              id={`dock-tab-${side}-${panel}`}
              role="tab"
              aria-selected={active === panel}
              aria-controls={`dock-panel-${side}-${panel}`}
              tabIndex={active === panel ? 0 : -1}
              draggable
              className={`dock-tab ${active === panel ? 'active' : ''} ${dragging === panel ? 'dragging' : ''}`}
              title={`${t(PANEL_LABELS[panel].label)} — ${t('trascina per spostare il pannello')}`}
              onClick={() => setActive(side, panel)}
              onDoubleClick={() => toggleCollapsed(side)}
              onDragStart={(event) => {
                setDragging(panel);
                document.body.classList.add('dragging-panel');
                event.dataTransfer.setData(PANEL_DRAG_TYPE, panel);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragging(null);
                document.body.classList.remove('dragging-panel');
              }}
            >
              {t(PANEL_LABELS[panel].short)}
            </button>
          ))}
        </div>
        {device.isMobile && side !== 'bottom' && (
          <button
            type="button"
            className="dock-mobile-close"
            onClick={() => (side === 'left' ? setLeftOpen(false) : setRightOpen(false))}
            title={t('Chiudi pannello')}
            aria-label={t('Chiudi pannello')}
          >
            <Icon name="x" size={15} />
          </button>
        )}
        <button type="button" className="dock-collapse" onClick={() => toggleCollapsed(side)} title={t('Comprimi pannello')} aria-label={t('Comprimi pannello')}>
          <Icon name={side === 'bottom' ? 'down' : side === 'left' ? 'left' : 'right'} size={13} />
        </button>
      </div>

      <div className="dock-body">
        {panels.map((panel) => renderPanel(panel, panel !== active))}
        {panels.length === 0 && (
          <p className="shell-note dock-empty">
            {t(side === 'bottom' ? 'Rilascia qui un pannello per agganciarlo in basso.' : 'Trascina qui un pannello per agganciarlo.')}
          </p>
        )}
      </div>
    </aside>
  );
}
