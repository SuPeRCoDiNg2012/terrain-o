import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from './uiStore';
import { useLayoutStore } from './shell/layoutStore';
import { useDevice } from './useDevice';
import { confirmDialog, alertDialog } from './dialogStore';
import { toast } from './toastStore';
import { ONBOARDING_KEY, Onboarding } from './components/Onboarding';
import { MapStage } from './components/MapStage';
import { ExportModal } from './components/ExportModal';
import { HelpModal } from './components/HelpModal';
import { DialogHost } from './components/DialogHost';
import { ToastHost } from './components/ToastHost';
import { MenuBar } from './shell/MenuBar';
import { OptionsBar } from './shell/OptionsBar';
import { ToolPalette } from './shell/ToolPalette';
import { Dock } from './shell/Dock';
import { StatusBar } from './shell/StatusBar';
import { Icon } from './components/Icon';
import { ImportCancelledError, importImageFiles } from '../io/importProject';
import { importProjectFile } from '../io/projectFile';
import { saveProject } from '../persistence/db';
import { translate, useLocaleStore } from '../i18n';

function initialOnboarding(): boolean {
  try {
    return !localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return true;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore sconosciuto.';
}

export function App() {
  const project = useProjectStore((state) => state.project);
  const hydrated = useProjectStore((state) => state.hydrated);
  const loadError = useProjectStore((state) => state.loadError);
  const saveState = useProjectStore((state) => state.saveState);
  const saveError = useProjectStore((state) => state.saveError);
  const init = useProjectStore((state) => state.init);
  const adoptProject = useProjectStore((state) => state.adoptProject);
  const clearLoadError = useProjectStore((state) => state.clearLoadError);
  const setSaveState = useProjectStore((state) => state.setSaveState);
  const setTool = useProjectStore((state) => state.setTool);
  const nudgeSelection = useProjectStore((state) => state.nudgeSelection);
  const deleteSelected = useProjectStore((state) => state.deleteSelected);
  const focusSelection = useProjectStore((state) => state.focusSelection);
  const fitImage = useProjectStore((state) => state.fitImage);
  const leftOpen = useUiStore((state) => state.leftOpen);
  const rightOpen = useUiStore((state) => state.rightOpen);
  const setLeftOpen = useUiStore((state) => state.setLeftOpen);
  const setRightOpen = useUiStore((state) => state.setRightOpen);
  const optionsBar = useLayoutStore((state) => state.optionsBar);
  const device = useDevice();
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'Terrain / O — Bozza preliminare');
  }, [locale]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFocus, setExportFocus] = useState<string | undefined>(undefined);
  const [helpOpen, setHelpOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(initialOnboarding);
  const [importPhase, setImportPhase] = useState<string | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);
  const savedUpdatedAtRef = useRef<string | null>(null);
  const hydratedOnceRef = useRef(false);
  const latestProjectRef = useRef(project);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  latestProjectRef.current = project;

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void init();
  }, [init]);

  useEffect(() => {
    if (!hydrated || hydratedOnceRef.current) return;
    hydratedOnceRef.current = true;
    savedUpdatedAtRef.current = useProjectStore.getState().project.updatedAt;
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!project.image && project.features.length === 0) return;
    if (project.updatedAt === savedUpdatedAtRef.current) return;
    setSaveState('saving');
    const snapshot = project;
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(snapshot);
        savedUpdatedAtRef.current = snapshot.updatedAt;
        if (latestProjectRef.current.updatedAt === snapshot.updatedAt) setSaveState('saved');
      } catch (error) {
        setSaveState('error', `Salvataggio locale non riuscito: ${messageOf(error)}`);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project, hydrated, setSaveState]);

  useEffect(() => {
    const onPageHide = () => {
      const state = useProjectStore.getState();
      if (!state.hydrated || !state.project.image) return;
      if (state.project.updatedAt === savedUpdatedAtRef.current) return;
      void saveProject(state.project, { backup: false }).catch(() => undefined);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  const saveNow = useCallback(async () => {
    const snapshot = useProjectStore.getState().project;
    setSaveState('saving');
    try {
      await saveProject(snapshot);
      savedUpdatedAtRef.current = snapshot.updatedAt;
      setSaveState('saved');
      toast('Progetto salvato localmente.', 'success');
    } catch (error) {
      setSaveState('error', `Salvataggio locale non riuscito: ${messageOf(error)}`);
      toast('Salvataggio non riuscito: esporta il progetto per non perdere il lavoro.', 'error');
    }
  }, [setSaveState]);

  const retrySave = useCallback(async () => {
    setRetryingSave(true);
    try {
      await saveNow();
    } finally {
      setRetryingSave(false);
    }
  }, [saveNow]);

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const asConfirm = useCallback(
    (request: { title: string; body: string; confirmLabel?: string }) =>
      confirmDialog({
        title: request.title,
        body: request.body,
        confirmLabel: request.confirmLabel,
        danger: request.title.toLowerCase().includes('sostituire'),
      }),
    [],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || importPhase) return;
      const jsonFile = files.find((file) => /\.json$/i.test(file.name));
      try {
        if (jsonFile) {
          if (files.length > 1) toast('Importazione progetto: gli altri file selezionati sono stati ignorati.', 'warning');
          setImportPhase('Lettura del progetto');
          const imported = await importProjectFile(jsonFile);
          adoptProject(imported.project, imported.sourceImage, imported.classificationImage, imported.labels);
          setImportPhase(null);
          toast('Progetto importato e validato.', 'success');
          for (const warning of imported.warnings) toast(warning, 'warning');
          return;
        }

        setImportPhase('Preparazione immagine');
        const prepared = await importImageFiles(
          files,
          useProjectStore.getState().project.image ? useProjectStore.getState().project : null,
          asConfirm,
          (phase) => setImportPhase(phase),
        );
        adoptProject(prepared.project, prepared.sourceImage);
        setImportPhase(null);
        toast(
          translate(localeRef.current, 'Immagine {w}×{h} px importata.', {
            w: prepared.project.image?.width ?? 0,
            h: prepared.project.image?.height ?? 0,
          }),
          'success',
        );
        for (const warning of prepared.warnings) toast(warning, 'warning');
      } catch (error) {
        setImportPhase(null);
        if (error instanceof ImportCancelledError) {
          toast('Importazione annullata: il progetto aperto non è stato modificato.', 'info');
          return;
        }
        await alertDialog('Importazione non riuscita', `${messageOf(error)}\n\nIl progetto attualmente aperto non è stato modificato.`);
      }
    },
    [adoptProject, asConfirm, importPhase],
  );

  const zoomAtCenter = useCallback((factor: number) => {
    const state = useProjectStore.getState();
    const { view, viewport } = state;
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const world = { x: (center.x - view.tx) / view.scale, y: (center.y - view.ty) / view.scale };
    const scale = Math.max(0.02, Math.min(40, view.scale * factor));
    state.setView({ scale, tx: center.x - world.x * scale, ty: center.y - world.y * scale }, true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('.dialog-backdrop')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Menu navigation owns the keyboard while a dropdown is open: otherwise
      // ArrowDown would nudge features and Delete could destroy the selection
      // behind the menu.
      if (document.querySelector('.menu-popup') || target?.closest('.menu-bar')) return;
      const state = useProjectStore.getState();
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        state.redo();
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        void saveNow();
        return;
      }
      if (mod && key === 'o') {
        event.preventDefault();
        openFilePicker();
        return;
      }
      if (mod && key === 'e') {
        event.preventDefault();
        setExportOpen(true);
        return;
      }
      if (mod && key === 'a') {
        event.preventDefault();
        state.select(state.project.features.map((feature) => feature.id));
        return;
      }
      if (mod && key === 'd' && event.shiftKey) {
        event.preventDefault();
        state.duplicateSelected();
        return;
      }
      if (mod && key === 'd') {
        event.preventDefault();
        state.clearSelection();
        return;
      }
      if (mod && (event.key === '0' || event.key === '1' || event.key === '=' || event.key === '+' || event.key === '-')) {
        event.preventDefault();
        if (event.key === '0') state.fitImage();
        else if (event.key === '1') zoomAtCenter(1 / state.view.scale);
        else if (event.key === '-' ) zoomAtCenter(0.8);
        else zoomAtCenter(1.25);
        return;
      }
      if (mod) return;

      // Contextual sizing with the bracket keys: tolerance for the selection
      // tools, parallel offset for the line tool. Same values shown in the
      // options bar, so the change is visible immediately.
      if (event.key === '[' || event.key === ']') {
        const layout = useLayoutStore.getState();
        const direction = event.key === ']' ? 1 : -1;
        if (state.activeTool === 'select' || state.activeTool === 'marquee' || state.activeTool === 'lasso') {
          event.preventDefault();
          layout.setSelectionTolerance(Math.min(24, Math.max(1, layout.selectionTolerance + direction)));
          return;
        }
        if (state.activeTool === 'draw-line') {
          event.preventDefault();
          const next = Math.round((layout.lineOffset + direction * 0.5) * 2) / 2;
          layout.setLineOffset(Math.min(20, Math.max(0.5, next)));
          return;
        }
      }

      if (event.key === 'F1') {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!state.selection.length) return;
        event.preventDefault();
        void confirmDialog({
          title: state.selection.length === 1 ? 'Eliminare l’elemento selezionato?' : `Eliminare ${state.selection.length} elementi?`,
          body: 'L’operazione entra nella cronologia undo.',
          confirmLabel: 'Elimina',
          danger: true,
        }).then((ok) => {
          if (ok) deleteSelected();
        });
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (!state.selection.length) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        nudgeSelection(dx, dy);
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        focusSelection();
        return;
      }
      const tools: Record<string, Parameters<typeof setTool>[0]> = {
        v: 'select',
        m: 'marquee',
        l: 'lasso',
        a: 'draw-area',
        n: 'draw-line',
        p: 'draw-point',
        h: 'pan',
        z: 'zoom',
        i: 'eyedropper',
        c: 'calibrate',
      };
      if (tools[key]) {
        event.preventDefault();
        // Drawing, measuring and sampling need a source image; without one
        // they would select a tool that cannot do anything.
        if (['m', 'l', 'a', 'n', 'p', 'i', 'c'].includes(key) && !state.project.image) return;
        setTool(tools[key]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, fitImage, focusSelection, nudgeSelection, openFilePicker, saveNow, setTool, zoomAtCenter]);

  if (!hydrated) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-mark"><Icon name="mountain" size={36} /></div>
        <strong>Terrain / O</strong>
        <span>Recupero dei dati locali…</span>
      </div>
    );
  }

  return (
    <div
      className="app-shell pro-shell"
      data-testid="app-shell"
      data-device={device.mode}
      data-touch={device.isTouch ? 'true' : 'false'}
    >
      <MenuBar
        onOpenFilePicker={openFilePicker}
        onOpenExport={(focus) => {
          setExportFocus(focus);
          setExportOpen(true);
        }}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenOnboarding={() => setOnboardingOpen(true)}
        onSaveNow={() => void saveNow()}
      />

      {(loadError || saveState === 'error') && (
        <div className="app-banner" role="alert">
          <Icon name="alert" size={16} />
          <div className="app-banner-copy">
            <strong>{saveState === 'error' ? 'Salvataggio locale non riuscito' : 'Avviso'}</strong>
            <span>{saveState === 'error' ? saveError : loadError}</span>
          </div>
          {saveState === 'error' ? (
            <>
              <button type="button" className="btn btn-primary btn-small" onClick={() => void retrySave()} disabled={retryingSave}>
                {retryingSave ? 'Salvataggio…' : 'Riprova'}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setExportOpen(true)}>Esporta ora</button>
            </>
          ) : (
            <button type="button" className="icon-button" aria-label="Chiudi avviso" onClick={clearLoadError}>
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
      )}

      {importPhase && (
        <div className="import-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{importPhase}…</span>
          <span className="tiny muted">La sostituzione della sorgente richiede conferma.</span>
        </div>
      )}

      <div className="pro-body">
        <ToolPalette />
        <div className="editor-column">
          {optionsBar && <OptionsBar />}
          <div className="editor-center">
            <Dock
              side="left"
              mobileOpen={leftOpen}
              onOpenFilePicker={openFilePicker}
              onImportProjectFile={(file) => void handleFiles([file])}
              onOpenExport={() => setExportOpen(true)}
              onOpenHelp={() => setHelpOpen(true)}
            />
            <main className="map-column">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.jgw,.jpgw,.pgw,.pngw,.wld,.wjf,.prj,.aux,application/json,image/jpeg,image/png"
                className="sr-only"
                aria-label="Seleziona file da importare: ortofoto, world file, proiezione o progetto JSON"
                data-testid="file-input"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = '';
                  if (files.length) void handleFiles(files);
                }}
              />
              <MapStage onFiles={(files) => void handleFiles(files)} onOpenFilePicker={openFilePicker} onOpenHelp={() => setHelpOpen(true)} />
            </main>
            <Dock
              side="right"
              mobileOpen={rightOpen}
              onOpenFilePicker={openFilePicker}
              onImportProjectFile={(file) => void handleFiles([file])}
              onOpenExport={() => setExportOpen(true)}
              onOpenHelp={() => setHelpOpen(true)}
            />
          </div>
          <Dock
            side="bottom"
            onOpenFilePicker={openFilePicker}
            onImportProjectFile={(file) => void handleFiles([file])}
            onOpenExport={() => setExportOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
          />
        </div>
      </div>
      <StatusBar />

      <button
        type="button"
        className="mobile-panel-button mobile-left"
        onClick={() => {
          setLeftOpen(true);
          setRightOpen(false);
        }}
        aria-label="Apri pannello progetto"
      >
        <Icon name="menu" size={18} />
      </button>
      <button
        type="button"
        className="mobile-panel-button mobile-right"
        onClick={() => {
          setRightOpen(true);
          setLeftOpen(false);
        }}
        aria-label="Apri pannello livelli"
      >
        <Icon name="layers" size={18} />
      </button>

      {device.isMobile && (leftOpen || rightOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Chiudi i pannelli laterali"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}

      {onboardingOpen && <Onboarding onClose={() => setOnboardingOpen(false)} />}
      {helpOpen && (
        <HelpModal
          onClose={() => setHelpOpen(false)}
          onReplayOnboarding={() => {
            setHelpOpen(false);
            setOnboardingOpen(true);
          }}
        />
      )}
      {exportOpen && (
        <ExportModal
          initialFocus={exportFocus}
          onClose={() => {
            setExportOpen(false);
            setExportFocus(undefined);
          }}
        />
      )}
      <DialogHost />
      <ToastHost />
    </div>
  );
}
