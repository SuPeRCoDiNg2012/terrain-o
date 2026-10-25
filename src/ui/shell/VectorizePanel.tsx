import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../uiStore';
import { vectorizeLabelsDetailed } from '../../vectorize/service';
import { validateRegions } from '../../vectorize/topology';
import { DEFAULT_VECTORIZE_OPTIONS, type VectorizeOptions } from '../../vectorize/types';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { ProgressBar, SliderField, Toggle } from '../components/fields';
import { Icon } from '../components/Icon';

const PRESETS_KEY = 'terrain-o/vectorize-presets/v1';

interface Preset {
  name: string;
  options: VectorizeOptions;
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Preset[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === 'string' && item.options) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    toast('Preset non salvato: spazio locale esaurito.', 'warning');
  }
}

export function VectorizePanel() {
  const project = useProjectStore((state) => state.project);
  const labels = useProjectStore((state) => state.classificationLabels);
  const confidence = useProjectStore((state) => state.classificationConfidence);
  const job = useProjectStore((state) => state.vectorJob);
  const runVectorization = useProjectStore((state) => state.runVectorization);
  const cancelVectorization = useProjectStore((state) => state.cancelVectorization);
  const setVectorPreview = useUiStore((state) => state.setVectorPreview);
  const pushToast = toast;

  const [options, setOptions] = useState<VectorizeOptions>(DEFAULT_VECTORIZE_OPTIONS);
  const [preview, setPreview] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewPercent, setPreviewPercent] = useState(0);
  const [previewPhase, setPreviewPhase] = useState('Anteprima');
  const [counts, setCounts] = useState({ polygons: 0, holes: 0, discarded: 0, invalid: 0, ms: 0 });
  const [issues, setIssues] = useState<string[]>([]);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [presetName, setPresetName] = useState('Preset personale');
  const abortRef = useRef<AbortController | null>(null);

  const classification = project.classification;
  const scaleX = classification && project.image ? project.image.width / classification.width : 1;
  const scaleY = classification && project.image ? project.image.height / classification.height : 1;

  const set = <K extends keyof VectorizeOptions>(key: K, value: VectorizeOptions[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => setVectorPreview(null), [setVectorPreview]);

  const runPreview = useMemo(
    () => async (signal: AbortSignal) => {
      if (!labels || !classification) return;
      setPreviewing(true);
      try {
        const result = await vectorizeLabelsDetailed(
          labels,
          classification.width,
          classification.height,
          options,
          {
            signal,
            preview: true,
            onProgress: (percent, phase) => {
              setPreviewPercent(percent);
              setPreviewPhase(phase);
            },
          },
          confidence,
        );
        if (signal.aborted) return;
        setVectorPreview(
          result.regions.map((region) => ({
            type: region.featureType,
            coords: region.coords.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })),
            holes: region.holes.map((hole) => hole.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }))),
          })),
        );
        setCounts({
          polygons: result.stats.polygons,
          holes: result.stats.holes,
          discarded: result.stats.discarded,
          invalid: result.stats.invalid,
          ms: result.stats.elapsedMs,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        pushToast(error instanceof Error ? error.message : 'Anteprima di vettorizzazione non riuscita.', 'error');
      } finally {
        setPreviewing(false);
      }
    },
    [labels, confidence, classification, options, scaleX, scaleY, setVectorPreview, pushToast],
  );

  useEffect(() => {
    if (!preview) {
      setVectorPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void runPreview(controller.signal);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [preview, runPreview, setVectorPreview]);

  const validate = async () => {
    if (!labels || !classification) return;
    try {
      const result = await vectorizeLabelsDetailed(
        labels,
        classification.width,
        classification.height,
        options,
        { preview: true },
        confidence,
      );
      const problems = validateRegions(result.regions);
      setIssues(problems.slice(0, 20));
      pushToast(
        problems.length === 0
          ? `Topologia valida: ${result.regions.length} geometrie, ${result.stats.holes} fori.`
          : `${problems.length} problemi di topologia rilevati.`,
        problems.length === 0 ? 'success' : 'warning',
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Validazione non riuscita.', 'error');
    }
  };

  const apply = async (mode: 'replace' | 'append') => {
    if (!labels) {
      pushToast('Eseguire prima una classificazione completa.', 'warning');
      return;
    }
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'Sostituire le aree automatiche?',
        body: 'Le geometrie con provenienza automatica verranno sostituite. Elementi manuali, OSM e percorso non vengono toccati.',
        confirmLabel: 'Sostituisci',
        danger: true,
      });
      if (!ok) return;
    }
    const started = performance.now();
    await runVectorization(options, mode);
    const auto = useProjectStore.getState().project.features.filter((feature) => feature.source === 'vector');
    setCounts({
      polygons: auto.length,
      holes: auto.reduce((sum, feature) => sum + (feature.holes?.length ?? 0), 0),
      discarded: 0,
      invalid: 0,
      ms: Math.round(performance.now() - started),
    });
  };

  const persistPreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const next = [...presets.filter((item) => item.name !== name), { name, options }];
    setPresets(next);
    savePresets(next);
    pushToast(`Preset “${name}” salvato.`, 'success');
  };

  const exportPreset = () => {
    const blob = new Blob([JSON.stringify({ presets }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'terrain-o-preset-vettorizzazione.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell-panel">
      <div className="shell-panel-head">
        <h3>Vettorizzazione</h3>
      </div>
      <p className="tiny muted experimental-line">Risultato sperimentale</p>

      <p className="shell-note">
        Contorni tracciati sui limiti delle etichette, semplificati e riconciliati. La gerarchia ISOM decide solo la priorità fra classi, non la verità sul terreno.
      </p>

      {!classification && <p className="shell-note">Disponibile dopo una classificazione.</p>}

      <div className="counter-row">
        <span><strong className="mono">{counts.polygons}</strong> poligoni</span>
        <span><strong className="mono">{counts.holes}</strong> fori</span>
        <span><strong className="mono">{counts.discarded}</strong> scartati</span>
        {counts.ms > 0 && <span className="muted"><strong className="mono">{counts.ms}</strong> ms</span>}
      </div>

      <SliderField label="Soglia confidenza" value={options.confidenceThreshold} min={0.3} max={0.95} step={0.05} display={options.confidenceThreshold.toFixed(2)} onChange={(value) => set('confidenceThreshold', value)} />
      <SliderField label="Iterazioni Chaikin" value={options.smoothIterations} min={0} max={3} step={1} onChange={(value) => set('smoothIterations', value)} />
      <SliderField label="Tolleranza Douglas-Peucker" value={options.simplifyTolerance} min={0.2} max={6} step={0.1} display={`${options.simplifyTolerance.toFixed(1)} px`} onChange={(value) => set('simplifyTolerance', value)} />
      <SliderField label="Area minima poligono" value={options.minAreaPx} min={0} max={2000} step={10} display={`${options.minAreaPx} px²`} onChange={(value) => set('minAreaPx', value)} />
      <SliderField label="Area minima foro" value={options.minHoleAreaPx} min={0} max={500} step={5} display={`${options.minHoleAreaPx} px²`} onChange={(value) => set('minHoleAreaPx', value)} />

      <Toggle label="Priorità gerarchica ISOM" checked={options.hierarchyPriority} onChange={(value) => set('hierarchyPriority', value)} description="A parità di confidenza vince la classe più specifica" />
      <Toggle label="Riconciliazione bordi" checked={options.reconcileEdges} onChange={(value) => set('reconcileEdges', value)} description="Nessun gap o overlap fra regioni adiacenti" />
      <Toggle label="Anteprima live su mappa" checked={preview} onChange={setPreview} description="Overlay semitrasparente, annullabile" />

      {previewing && <ProgressBar percent={previewPercent} label={previewPhase} />}

      <div className="button-row">
        <button type="button" className="btn btn-primary btn-small" onClick={() => void apply('replace')} disabled={!labels || job.running || !classification}>
          Applica come livelli auto
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void apply('append')} disabled={!labels || job.running || !classification}>
          Aggiungi
        </button>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-ghost btn-small" onClick={cancelVectorization} disabled={!job.running}>
          Annulla
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => void validate()} disabled={!labels}>
          Valida topologia
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => {
            setOptions(DEFAULT_VECTORIZE_OPTIONS);
            setIssues([]);
            setCounts({ polygons: 0, holes: 0, discarded: 0, invalid: 0, ms: 0 });
          }}
        >
          Reimposta parametri
        </button>
      </div>

      {job.running && <ProgressBar percent={job.percent} label={job.phase} />}
      {job.error && <p className="field-error">{job.error}</p>}
      {job.result && <p className="shell-note">{job.result}</p>}

      {issues.length > 0 && (
        <div className="issue-list">
          <strong>{issues.length} problemi</strong>
          <ul>
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      <div className="shell-subhead"><Icon name="grip" size={13} /> Preset</div>
      <div className="preset-row">
        <input className="text-input" value={presetName} onChange={(event) => setPresetName(event.target.value)} aria-label="Nome preset" />
        <button type="button" className="btn btn-secondary btn-small" onClick={persistPreset}>Salva</button>
      </div>
      {presets.length > 0 && (
        <div className="preset-row">
          <select
            className="text-input"
            defaultValue=""
            aria-label="Carica preset"
            onChange={(event) => {
              const preset = presets.find((item) => item.name === event.target.value);
              if (preset) {
                setOptions({ ...DEFAULT_VECTORIZE_OPTIONS, ...preset.options });
                pushToast(`Preset “${preset.name}” caricato.`, 'info');
              }
              event.target.value = '';
            }}
          >
            <option value="" disabled>Carica preset…</option>
            {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-small" onClick={exportPreset}>Esporta JSON</button>
        </div>
      )}
    </div>
  );
}
