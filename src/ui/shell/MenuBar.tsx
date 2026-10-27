import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore, type Tool } from '../../store/projectStore';
import { useLayoutStore, type PanelId } from './layoutStore';
import { useUiStore } from '../uiStore';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../../model/constants';
import { Icon } from '../components/Icon';
import { Mark } from '../components/Mark';
import { useDevice } from '../useDevice';
import { useT, useLocaleStore } from '../../i18n';
import { useThemeStore } from '../themeStore';

export type ExportFocus = 'export-geojson' | 'export-omap' | 'export-svg' | 'export-png-1' | 'export-pdf-a4';

export interface MenuBarProps {
  onOpenFilePicker: () => void;
  onOpenExport: (focus?: ExportFocus) => void;
  onOpenHelp: () => void;
  onOpenOnboarding: () => void;
  onSaveNow: () => void;
  onEnterEssential: () => void;
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

interface AnchorRect {
  left: number;
  top: number;
  width: number;
}

export function MenuBar({ onOpenFilePicker, onOpenExport, onOpenHelp, onOpenOnboarding, onSaveNow, onEnterEssential }: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [shift, setShift] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const barRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const device = useDevice();
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const pastLength = useProjectStore((state) => state.past.length);
  const futureLength = useProjectStore((state) => state.future.length);
  const classificationRunning = useProjectStore((state) => state.classificationJob.running);
  const vectorRunning = useProjectStore((state) => state.vectorJob.running);
  const aiRunning = useProjectStore((state) => state.aiJob.running);
  const autoRunning = useProjectStore((state) => state.autoJob.running);
  const osmRunning = useProjectStore((state) => state.osmJob.running);
  const demRunning = useProjectStore((state) => state.demJob.running);
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
  const runAiRecognition = useProjectStore((state) => state.runAiRecognition);
  const cancelAiRecognition = useProjectStore((state) => state.cancelAiRecognition);
  const runSymbolFusion = useProjectStore((state) => state.runSymbolFusion);
  const runAutomaticPipeline = useProjectStore((state) => state.runAutomaticPipeline);
  const cancelAutomaticPipeline = useProjectStore((state) => state.cancelAutomaticPipeline);
  const runOsmFetch = useProjectStore((state) => state.runOsmFetch);
  const convertOsmToFeatures = useProjectStore((state) => state.convertOsmToFeatures);
  const clearOsm = useProjectStore((state) => state.clearOsm);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);
  const newBlankProject = useProjectStore((state) => state.newBlankProject);

  const layout = useLayoutStore();
  const togglePanel = layout.togglePanel;

  // Opening a panel from the menu must actually reveal it: on a phone the
  // drawer is off-canvas, so activating the tab alone looked like a no-op.
  const showPanel = (panel: PanelId) => {
    const state = useLayoutStore.getState();
    const side = state.left.includes(panel)
      ? 'left'
      : state.right.includes(panel)
        ? 'right'
        : state.bottom.includes(panel)
          ? 'bottom'
          : 'right';
    togglePanel(panel);
    if (device.isMobile) {
      if (side === 'left') useUiStore.getState().setLeftOpen(true);
      else if (side === 'right') useUiStore.getState().setRightOpen(true);
    }
    setMobileOpen(false);
  };

  const close = () => {
    setOpen(null);
    setAnchor(null);
  };

  const openMenu = (menuId: string, trigger?: HTMLElement | null) => {
    const element =
      trigger ?? barRef.current?.querySelector<HTMLElement>(`[data-menu-trigger="${menuId}"]`) ?? null;
    const rect = element?.getBoundingClientRect();
    if (!rect) return;
    // The popup is rendered in a portal with fixed coordinates, so it can
    // never be clipped by the shell, the nav or a stacking context created by
    // the menu bar itself. That was the "dead top bar" failure in the desktop
    // window: the DOM had the menu, but the workspace painted over it.
    setAnchor({ left: rect.left, top: rect.bottom + 3, width: rect.width });
    setShift(0);
    setOpen(menuId);
  };

  // Keep the portal inside the viewport horizontally, and close it when the
  // window changes shape: fixed coordinates captured at open time would drift.
  useLayoutEffect(() => {
    if (!open) return;
    const popup = popupRef.current;
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 8);
    if (overflow > 0) setShift((current) => current - overflow);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (barRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Focus can sit on <body> when a keyboard menu switch replaced the
      // focused popup item. Escape must still return focus to the trigger.
      barRef.current
        ?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${open}"]`)
        ?.focus();
      close();
    };
    const onResize = () => close();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open]);

  const focusMenuItem = (menuId: string, position: 'first' | 'last' = 'first') => {
    window.setTimeout(() => {
      const popup = popupRef.current;
      if (!popup || popup.dataset.menuPopup !== menuId) return;
      const items = [...popup.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)')];
      // A menu can legitimately have every command disabled (Modifica on an
      // empty project). Focus the popup itself so keyboard users are not
      // dropped back onto the document body.
      if (!items.length) {
        popup.focus();
        return;
      }
      (position === 'last' ? items[items.length - 1] : items[0]).focus();
    }, 0);
  };

  const focusTrigger = (menuId: string) => {
    barRef.current?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${menuId}"]`)?.focus();
  };

  const moveMenu = (menuId: string, delta: number) => {
    const index = menus.findIndex((menu) => menu.id === menuId);
    if (index < 0) return;
    const next = menus[(index + delta + menus.length) % menus.length];
    openMenu(next.id);
    focusMenuItem(next.id);
  };
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
        { label: 'Esporta mappa e dati…', shortcut: MOD + 'E', action: () => onOpenExport() },
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
        { label: 'Tema scuro', checked: theme === 'dark', action: () => setTheme('dark') },
        { label: 'Tema chiaro', checked: theme === 'light', action: () => setTheme('light') },
        { separator: true, label: '' },
        { label: 'Pannello Livelli', action: () => showPanel('layers') },
        { label: 'Pannello Elementi cartografici', action: () => showPanel('features') },
        { label: 'Pannello Proprietà', action: () => showPanel('properties') },
        { label: 'Pannello Storia', action: () => showPanel('history') },
        { label: 'Pannello Info', action: () => showPanel('info') },
        { label: 'Pannello Navigatore', action: () => showPanel('navigator') },
        { separator: true, label: '' },
        { label: 'Reimposta layout pannelli', action: () => layout.resetLayout() },
        { separator: true, label: '' },
        { label: 'Modalità essenziale', action: onEnterEssential },
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
        { label: 'Apri pannello Classificazione', action: () => showPanel('classification') },
        {
          label: 'Esegui con i parametri correnti',
          action: () => void runClassification(project.classification?.params ?? DEFAULT_CLASSIFICATION_PARAMS),
          disabled: !project.image,
        },
        { label: 'Annulla elaborazione', action: cancelClassification, disabled: !classificationRunning },
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
        { label: 'Apri pannello Vettorizzazione', action: () => showPanel('vectorize') },
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
        { label: 'Annulla vettorizzazione', action: cancelVectorization, disabled: !vectorRunning },
      ],
    },
    {
      id: 'ai',
      label: 'AI',
      items: [
        { label: 'Apri pannello Riconoscimento AI', action: () => showPanel('ai') },
        {
          label: 'Elaborazione automatica completa',
          action: () => {
            void runAutomaticPipeline().then((report) => {
              if (!report) {
                const error = useProjectStore.getState().autoJob.error;
                if (error) toast(error, 'error');
                return;
              }
              if (report.warnings.length) toast(`Elaborazione completata con ${report.warnings.length} avvisi.`, 'info');
              else toast(`Elaborazione completa: ${report.totalFeatures} simboli nel livello unico.`, 'success');
            });
          },
          disabled: !project.image || autoRunning || classificationRunning || vectorRunning || aiRunning || osmRunning || demRunning,
          title: project.image ? 'Un solo comando: OSM, classificazione, vettorizzazione, AI, curve e livello unico' : 'richiede un’immagine',
        },
        { label: 'Annulla elaborazione automatica', action: cancelAutomaticPipeline, disabled: !autoRunning },
        { separator: true, label: '' },
        {
          label: 'Riconosci simboli (locale)',
          action: () => void runAiRecognition(),
          disabled: !project.image || aiRunning,
          title: project.image ? undefined : 'richiede un’immagine',
        },
        { label: 'Annulla riconoscimento', action: cancelAiRecognition, disabled: !aiRunning },
        { separator: true, label: '' },
        {
          label: 'Unifica livello simboli',
          action: () => {
            const removed = runSymbolFusion();
            if (removed) toast(`${removed} duplicati automatici rimossi dal livello simboli.`, 'success');
          },
          disabled: !project.features.length,
        },
      ],
    },
    {
      id: 'osm',
      label: 'OSM',
      items: [
        { label: 'Apri pannello OpenStreetMap', action: () => showPanel('osm') },
        { label: 'Scarica dati OSM (edifici, verde, acqua, viabilità)', action: () => void runOsmFetch(), disabled: !project.imageBBox },
        {
          label: 'Genera elementi automatici da OSM',
          action: () => {
            const count = convertOsmToFeatures();
            if (count) toast(`${count} elementi automatici generati da OSM. Non verificati.`, 'info');
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
        { label: 'Esporta mappa e dati…', shortcut: MOD + 'E', action: () => onOpenExport() },
        { label: 'GeoJSON…', action: () => onOpenExport('export-geojson'), disabled: !project.features.length },
        { label: 'OOM / .omap…', action: () => onOpenExport('export-omap'), disabled: !project.image },
        { label: 'SVG…', action: () => onOpenExport('export-svg'), disabled: !project.image },
        { label: 'PNG…', action: () => onOpenExport('export-png-1'), disabled: !project.image },
        { label: 'PDF…', action: () => onOpenExport('export-pdf-a4'), disabled: !project.image },
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

  const activeMenu = menus.find((menu) => menu.id === open) ?? null;

  return (
    <div className="menu-bar" ref={barRef} role="menubar" aria-label={t('Menu principale')}>        <div className="menu-bar-brand" aria-label="Terrain / O">
          <span className="menu-bar-mark" aria-hidden="true">
            <Mark size={16} />
          </span>
          <span className="menu-bar-name">
            <span className="wm-a">Terrain</span>
            <span className="wm-slash">/</span>
            <span className="wm-o">O</span>
          </span>
        </div>

      <button
        type="button"
        className="menu-mobile-toggle"
        aria-label={t(mobileOpen ? 'Chiudi menu' : 'Apri menu')}
        aria-expanded={mobileOpen}
        aria-controls="main-menu-items"
        onClick={() => {
          close();
          setMobileOpen((value) => !value);
        }}
      >
        <Icon name={mobileOpen ? 'x' : 'menu'} size={18} />
      </button>

      <nav id="main-menu-items" className={`menu-bar-items ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          type="button"
          className="menu-mobile-close"
          aria-label={t('Chiudi menu')}
          onClick={() => {
            close();
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
              data-menu-trigger={menu.id}
              onClick={(event) => {
                if (open === menu.id) close();
                else openMenu(menu.id, event.currentTarget);
              }}
              onPointerEnter={(event) => {
                if (open && open !== menu.id) openMenu(menu.id, event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openMenu(menu.id, event.currentTarget);
                  focusMenuItem(menu.id);
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  openMenu(menu.id, event.currentTarget);
                  focusMenuItem(menu.id, 'last');
                  return;
                }
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveMenu(menu.id, event.key === 'ArrowRight' ? 1 : -1);
                }
              }}
            >
              {t(menu.label)}
            </button>
          </div>
        ))}
      </nav>

      {activeMenu && anchor &&
        createPortal(
          <div
            ref={popupRef}
            className="menu-popup"
            role="menu"
            aria-label={t(activeMenu.label)}
            data-menu-popup={activeMenu.id}
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: anchor.top,
              left: Math.max(8, Math.min(anchor.left, window.innerWidth - 272)) + shift,
              maxHeight: `calc(100vh - ${anchor.top + 8}px)`,
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                // Move focus out BEFORE unmounting the popup: closing with
                // focus still inside sends it to <body>.
                focusTrigger(activeMenu.id);
                close();
                return;
              }
              if (event.key === 'Tab') {
                close();
                return;
              }
              const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)')];
              if (!items.length) return;
              const active = document.activeElement as HTMLButtonElement | null;
              const index = active ? items.indexOf(active) : -1;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                items[(index + 1 + items.length) % items.length].focus();
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                items[(index - 1 + items.length) % items.length].focus();
                return;
              }
              if (event.key === 'Home') {
                event.preventDefault();
                items[0].focus();
                return;
              }
              if (event.key === 'End') {
                event.preventDefault();
                items[items.length - 1].focus();
                return;
              }
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                moveMenu(activeMenu.id, event.key === 'ArrowRight' ? 1 : -1);
                return;
              }
            }}
          >
            {activeMenu.items.map((item, index) =>
              item.separator ? (
                <div className="menu-sep" key={`sep-${index}`} role="separator" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  disabled={item.disabled}
                  title={item.disabled ? t(item.title ?? 'non disponibile in questa build') : item.title ? t(item.title) : undefined}
                  onClick={run(item.action)}
                >
                  <span className="menu-check">{item.checked ? <Icon name="check" size={13} /> : null}</span>
                  <span className="menu-label">{t(item.label)}</span>
                  {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}

      {device.isMobile && mobileOpen && (
        <button
          type="button"
          className="menu-mobile-scrim"
          aria-label="Chiudi menu"
        onClick={() => {
          close();
          setMobileOpen(false);
        }}
        />
      )}

      <div className="menu-bar-right">
        <span className="menu-bar-project truncate" title={project.name}>{project.name}</span>
        <button
          type="button"
          className="menu-mode-button"
          onClick={onEnterEssential}
          title={t('Torna alla modalità essenziale')}
          data-testid="enter-essential"
        >
          <Icon name="fit" size={13} />
          <span>{t('Essenziale')}</span>
        </button>
        <button
          type="button"
          className="menu-lang"
          onClick={() => setLocale(locale === 'it' ? 'en' : 'it')}
          title={locale === 'it' ? 'Switch to English' : 'Passa all’italiano'}
          aria-label={locale === 'it' ? 'Switch to English' : 'Passa all’italiano'}
        >
          {locale.toUpperCase()}
        </button>
        <button type="button" className="menu-icon-button" onClick={onOpenFilePicker} title={t('Importa (Ctrl+O)')} aria-label={t('Importa')}>
          <Icon name="import" size={16} />
        </button>
        <button type="button" className="menu-icon-button" onClick={() => onOpenExport()} title={t('Esporta (Ctrl+E)')} aria-label={t('Esporta')}>
          <Icon name="export" size={16} />
        </button>
        <button type="button" className="menu-icon-button" onClick={onOpenHelp} title={t('Aiuto (F1)')} aria-label={t('Aiuto')}>
          <Icon name="help" size={16} />
        </button>
      </div>
    </div>
  );
}
