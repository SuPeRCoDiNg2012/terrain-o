import { useEffect, useRef, useState } from 'react';
import { useProjectStore, type Tool } from '../../store/projectStore';
import { useLayoutStore } from './layoutStore';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../../model/constants';
import { Icon } from '../components/Icon';
import { useDevice } from '../useDevice';

export interface MenuBarProps {
  onOpenFilePicker: () => void;
  onOpenExport: () => void;
  onOpenHelp: () => void;
  onOpenOnboarding: () => void;
  onSaveNow: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  title?: string;
  separator?: boolean;
  checked?: boolean;
}

interface Menu {
  id: string;
  label: string;
  items: MenuItem[];
}

const MOD = 'Ctrl+';

export function MenuBar({ onOpenFilePicker, onOpenExport, onOpenHelp, onOpenOnboarding, onSaveNow }: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const device = useDevice();
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const pastLength = useProjectStore((state) => state.past.length);
  const futureLength = useProjectStore((state) => state.future.length);
  const jobRunning = useProjectStore((state) => state.classificationJob.running || state.vectorJob.running || state.osmJob.running);
  const activeTool = useProjectStore((state) => state.activeTool);
  const gridEnabled = useProjectStore((state) => state.gridEnabled);
  const minimapVisible = useProjectStore((state) => state.minimapVisible);
  const setTool = useProjectStore((state) => state.setTool);
  const setGridEnabled = useProjectStore((state) => state.setGridEnabled);
  const setMinimapVisible = useProjectStore((state) => state.setMinimapVisible);
  const fitImage = useProjectStore((state) => state.fitImage);
  const setView = useProjectStore((state) => state.setView);
  const view = useProjectStore((state) => state.view);
  const viewport = useProjectStore((state) => state.viewport);
  const select = useProjectStore((state) => state.select);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const duplicateSelected = useProjectStore((state) => state.duplicateSelected);
  const deleteSelected = useProjectStore((state) => state.deleteSelected);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const runClassification = useProjectStore((state) => state.runClassification);
  const cancelClassification = useProjectStore((state) => state.cancelClassification);
  const runVectorization = useProjectStore((state) => state.runVectorization);
  const cancelVectorization = useProjectStore((state) => state.cancelVectorization);
  const runOsmFetch = useProjectStore((state) => state.runOsmFetch);
  const convertOsmToFeatures = useProjectStore((state) => state.convertOsmToFeatures);
  const clearOsm = useProjectStore((state) => state.clearOsm);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);
  const newBlankProject = useProjectStore((state) => state.newBlankProject);

  const layout = useLayoutStore();
  const togglePanel = layout.togglePanel;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(null);
  const run = (action?: () => void) => () => {
    close();
    if (device.isMobile) setMobileOpen(false);
    action?.();
  };

  const toolItem = (id: Tool, label: string, shortcut: string, disabled = false, title?: string): MenuItem => ({
    label,
    shortcut,
    checked: activeTool === id,
    disabled,
    title,
    action: () => setTool(id),
  });

  const needsImage = !project.image;

  // Same confirmation as the Del/Backspace shortcut: a menu click must not be
  // the only destructive path that deletes without asking.
  const removeSelection = () => {
    if (!selection.length) return;
    void confirmDialog({
      title: selection.length === 1 ? 'Eliminare l’elemento selezionato?' : `Eliminare ${selection.length} elementi?`,
      body: 'L’operazione entra nella cronologia undo.',
      confirmLabel: 'Elimina',
      danger: true,
    }).then((ok) => {
      if (ok) deleteSelected();
    });
  };

  const zoomBy = (factor: number) => {
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const world = { x: (center.x - view.tx) / view.scale, y: (center.y - view.ty) / view.scale };
    const scale = Math.max(0.02, Math.min(40, view.scale * factor));
    setView({ scale, tx: center.x - world.x * scale, ty: center.y - world.y * scale }, true);
  };

  const newProject = () => {
    void confirmDialog({
      title: 'Creare un nuovo progetto?',
      body: 'Il progetto aperto resta salvato nell’archivio locale e potrà essere riaperto dal pannello Progetto.',
      confirmLabel: 'Nuovo progetto',
    }).then((ok) => {
      if (ok) newBlankProject();
    });
  };

  const defaultVectorOptions = () => {
    const applied = project.classification?.params;
    return {
      simplifyTolerance: 1.5,
      smoothIterations: 2,
      minAreaPx: 100,
      minHoleAreaPx: 20,
      confidenceThreshold: 0.6,
      hierarchyPriority: true,
      reconcileEdges: true,
      categories: [1, 2, 3, 4],
      fillHoles: applied?.fillHoles ?? true,
    };
  };

  const menus: Menu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Nuovo progetto…', action: newProject },
        { label: 'Apri immagine o progetto…', shortcut: MOD + 'O', action: onOpenFilePicker },
        { separator: true, label: '' },
        { label: 'Salva ora', shortcut: MOD + 'S', action: onSaveNow },
        { label: 'Esporta mappa e dati…', shortcut: MOD + 'E', action: onOpenExport },
        { separator: true, label: '' },
        { label: 'Guida e scorciatoie', shortcut: 'F1', action: onOpenHelp },
      ],
    },
    {
      id: 'edit',
      label: 'Modifica',
      items: [
        { label: 'Annulla', shortcut: MOD + 'Z', action: undo, disabled: pastLength === 0 },
        { label: 'Ripeti', shortcut: MOD + 'Shift+Z', action: redo, disabled: futureLength === 0 },
        { separator: true, label: '' },
        { label: 'Seleziona tutto', shortcut: MOD + 'A', action: () => select(project.features.map((feature) => feature.id)), disabled: !project.features.length },
        { label: 'Deseleziona', shortcut: MOD + 'D', action: clearSelection, disabled: !selection.length },
        { label: 'Duplica selezione', shortcut: MOD + 'Shift+D', action: duplicateSelected, disabled: !selection.length },
        { label: 'Elimina selezione', shortcut: 'Del', action: removeSelection, disabled: !selection.length },
      ],
    },
    {
      id: 'view',
      label: 'Visualizza',
      items: [
        { label: 'Adatta alla vista', shortcut: MOD + '0', action: fitImage },
        { label: 'Zoom 100%', shortcut: MOD + '1', action: () => zoomBy(1 / view.scale) },
        { label: 'Ingrandisci', shortcut: MOD + '=', action: () => zoomBy(1.25) },
        { label: 'Riduci', shortcut: MOD + '-', action: () => zoomBy(0.8) },
        { separator: true, label: '' },
        { label: 'Righelli', checked: layout.rulers, action: () => layout.setRulers(!layout.rulers) },
        { label: 'Griglia', checked: gridEnabled, action: () => setGridEnabled(!gridEnabled) },
        { label: 'Legenda', checked: layout.legend, action: () => layout.setLegend(!layout.legend) },
        { label: 'Minimappa', checked: minimapVisible, action: () => setMinimapVisible(!minimapVisible) },
        { label: 'Mirino', checked: layout.crosshair, action: () => layout.setCrosshair(!layout.crosshair) },
        { separator: true, label: '' },
        { label: 'Pannello Livelli', action: () => togglePanel('layers') },
        { label: 'Pannello Elementi cartografici', action: () => togglePanel('features') },
        { label: 'Pannello Proprietà', action: () => togglePanel('properties') },
        { label: 'Pannello Storia', action: () => togglePanel('history') },
        { label: 'Pannello Info', action: () => togglePanel('info') },
        { label: 'Pannello Navigatore', action: () => togglePanel('navigator') },
        { separator: true, label: '' },
        { label: 'Reimposta layout pannelli', action: () => layout.resetLayout() },
      ],
    },
    {
      id: 'tools',
      label: 'Strumenti',
      items: [
        toolItem('select', 'Selezione oggetto', 'V'),
        toolItem('marquee', 'Selezione rettangolare', 'M', needsImage, 'richiede un’immagine'),
        toolItem('lasso', 'Lazo', 'L', needsImage, 'richiede un’immagine'),
        toolItem('draw-area', 'Area', 'A', needsImage, 'richiede un’immagine'),
        toolItem('draw-line', 'Linea', 'N', needsImage, 'richiede un’immagine'),
        toolItem('draw-point', 'Punto', 'P', needsImage, 'richiede un’immagine'),
        { separator: true, label: '' },
        toolItem('pan', 'Sposta vista', 'H'),
        toolItem('zoom', 'Zoom', 'Z'),
        toolItem('eyedropper', 'Contagocce', 'I', needsImage, 'richiede un’immagine'),
        toolItem('text', 'Testo', 'T', true, 'non disponibile in questa build'),
        toolItem('calibrate', 'Calibra scala', 'C', needsImage, 'richiede un’immagine'),
      ],
    },
    {
      id: 'classification',
      label: 'Classificazione',
      items: [
        { label: 'Apri pannello Classificazione', action: () => togglePanel('classification') },
        {
          label: 'Esegui con i parametri correnti',
          action: () => void runClassification(project.classification?.params ?? DEFAULT_CLASSIFICATION_PARAMS),
          disabled: !project.image,
        },
        { label: 'Annulla elaborazione', action: cancelClassification, disabled: !jobRunning },
        {
          label: project.layers.classification.visible ? 'Nascondi livello classificazione' : 'Mostra livello classificazione',
          action: () => setLayerVisible('classification', !project.layers.classification.visible),
          disabled: !project.classification,
        },
      ],
    },
    {
      id: 'vectorize',
      label: 'Vettorizzazione',
      items: [
        { label: 'Apri pannello Vettorizzazione', action: () => togglePanel('vectorize') },
        {
          label: 'Genera aree (sostituisci automatiche)',
          action: () => void runVectorization(defaultVectorOptions(), 'replace'),
          disabled: !project.classification,
        },
        {
          label: 'Genera aree (aggiungi)',
          action: () => void runVectorization(defaultVectorOptions(), 'append'),
          disabled: !project.classification,
        },
        { label: 'Annulla vettorizzazione', action: cancelVectorization, disabled: !jobRunning },
      ],
    },
    {
      id: 'osm',
      label: 'OSM',
      items: [
        { label: 'Apri pannello OpenStreetMap', action: () => togglePanel('osm') },
        { label: 'Scarica strade e corsi d’acqua', action: () => void runOsmFetch(), disabled: !project.imageBBox },
        {
          label: 'Converti in elementi cartografici',
          action: () => {
            const count = convertOsmToFeatures();
            if (count) toast(`${count} tracciati OSM convertiti. Verificare sul campo.`, 'info');
          },
          disabled: !project.osmWays.length,
        },
        { label: 'Rimuovi tracciati OSM dal progetto', action: clearOsm, disabled: !project.osmWays.length },
      ],
    },
    {
      id: 'export',
      label: 'Esporta',
      items: [
        { label: 'Esporta mappa e dati…', shortcut: MOD + 'E', action: onOpenExport },
        { label: 'GeoJSON…', action: onOpenExport, disabled: !project.features.length },
        { label: 'OOM / .omap…', action: onOpenExport, disabled: !project.image },
        { label: 'SVG…', action: onOpenExport, disabled: !project.image },
        { label: 'PNG…', action: onOpenExport, disabled: !project.image },
        { label: 'PDF…', action: onOpenExport, disabled: !project.image },
      ],
    },
    {
      id: 'help',
      label: 'Aiuto',
      items: [
        { label: 'Guida e scorciatoie', shortcut: 'F1', action: onOpenHelp },
        { label: 'Introduzione guidata', action: onOpenOnboarding },
        { label: 'Nota sulla bozza preliminare', action: onOpenHelp },
      ],
    },
  ];

  return (
    <div className="menu-bar" ref={barRef} role="menubar" aria-label="Menu principale">
      <div className="menu-bar-brand" aria-label="Terrain / O">
        <span className="menu-bar-mark" aria-hidden="true">
          <Icon name="mountain" size={16} />
        </span>
        <span className="menu-bar-name">Terrain <em>/</em> O</span>
        <span className="menu-bar-draft">BOZZA PRELIMINARE</span>
      </div>

      <button
        type="button"
        className="menu-mobile-toggle"
        aria-label={mobileOpen ? 'Chiudi menu' : 'Apri menu'}
        aria-expanded={mobileOpen}
        aria-controls="main-menu-items"
        onClick={() => {
          setOpen(null);
          setMobileOpen((value) => !value);
        }}
      >
        <Icon name={mobileOpen ? 'x' : 'menu'} size={18} />
      </button>

      <nav id="main-menu-items" className={`menu-bar-items ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          type="button"
          className="menu-mobile-close"
          aria-label="Chiudi menu"
          onClick={() => {
            setOpen(null);
            setMobileOpen(false);
          }}
        >
          <Icon name="x" size={16} />
        </button>
        {menus.map((menu) => (
          <div className="menu-root" key={menu.id}>
            <button
              type="button"
              role="menuitem"
              className={`menu-trigger ${open === menu.id ? 'open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={open === menu.id}
              onClick={() => setOpen(open === menu.id ? null : menu.id)}
              onPointerEnter={() => {
                if (open) setOpen(menu.id);
              }}
            >
              {menu.label}
            </button>
            {open === menu.id && (
              <div className="menu-popup" role="menu" aria-label={menu.label}>
                {menu.items.map((item, index) =>
                  item.separator ? (
                    <div className="menu-sep" key={`sep-${index}`} role="separator" />
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      disabled={item.disabled}
                      title={item.disabled ? item.title ?? 'non disponibile in questa build' : item.title}
                      onClick={run(item.action)}
                    >
                      <span className="menu-check">{item.checked ? <Icon name="check" size={13} /> : null}</span>
                      <span className="menu-label">{item.label}</span>
                      {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {device.isMobile && mobileOpen && (
        <button
          type="button"
          className="menu-mobile-scrim"
          aria-label="Chiudi menu"
          onClick={() => {
            setOpen(null);
            setMobileOpen(false);
          }}
        />
      )}

      <div className="menu-bar-right">
        <span className="menu-bar-project truncate" title={project.name}>{project.name}</span>
        <button type="button" className="menu-icon-button" onClick={onOpenFilePicker} title="Importa (Ctrl+O)" aria-label="Importa">
          <Icon name="import" size={16} />
        </button>
        <button type="button" className="menu-icon-button" onClick={onOpenExport} title="Esporta (Ctrl+E)" aria-label="Esporta">
          <Icon name="export" size={16} />
        </button>
        <button type="button" className="menu-icon-button" onClick={onOpenHelp} title="Aiuto (F1)" aria-label="Aiuto">
          <Icon name="help" size={16} />
        </button>
      </div>
    </div>
  );
}
