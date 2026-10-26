import { useEffect, useRef, useState } from 'react';
import type { ClassificationParams } from '../../model/types';
import { useProjectStore } from '../../store/projectStore';
import {
  DEFAULT_CLASSIFICATION_PARAMS,
  CLASSIFICATION_STATS_LABELS,
} from '../../model/constants';
import { CLASS_COLORS } from '../../classify/classify';
import { previewClassification } from '../../classify/service';
import { useUiStore } from '../uiStore';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { SectionTitle, InfoNote, ProgressBar, StatBar, SliderField, Toggle } from './fields';
import { Icon } from './Icon';

const PRESETS_KEY = 'terrain-o/classify-presets/v1';

interface PreviewState {
  dataURL: string;
  stats?: { unc: number; veg: number; open: number; water: number; art: number };
  loading: boolean;
  error: string | null;
}

function withDefaults(params: ClassificationParams): ClassificationParams {
  return { ...DEFAULT_CLASSIFICATION_PARAMS, ...params };
}

export function ClassificationPanel({ active = true }: { active?: boolean }) {
  const project = useProjectStore((state) => state.project);
  const sourceImage = useProjectStore((state) => state.sourceImage);
  const labels = useProjectStore((state) => state.classificationLabels);
  const job = useProjectStore((state) => state.classificationJob);
  const runClassification = useProjectStore((state) => state.runClassification);
  const cancelClassification = useProjectStore((state) => state.cancelClassification);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);

  const [params, setParams] = useState<ClassificationParams>(withDefaults(project.classification?.params ?? DEFAULT_CLASSIFICATION_PARAMS));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [livePreview, setLivePreview] = useState(true);
  const [previewOnMap, setPreviewOnMap] = useState(true);
  const setClassificationPreview = useUiStore((state) => state.setClassificationPreview);
  const [presets, setPresets] = useState<Array<{ name: string; params: ClassificationParams }>>([]);
  const [presetName, setPresetName] = useState('Preset personale');
  const previewAbort = useRef<AbortController | null>(null);
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    const classification = project.classification;
    if (!classification || classification.assetId === appliedRef.current) return;
    appliedRef.current = classification.assetId;
    setParams(withDefaults(classification.params));
  }, [project.classification]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ name: string; params: ClassificationParams }>;
        if (Array.isArray(parsed)) setPresets(parsed.filter((item) => item?.name && item?.params));
      }
    } catch {
      // Presets are optional.
    }
  }, []);

  useEffect(() => () => previewAbort.current?.abort(), []);
  useEffect(() => () => setClassificationPreview(null), [setClassificationPreview]);

  useEffect(() => {
    if (!active || !previewOnMap || !preview?.dataURL) {
      setClassificationPreview(null);
      return;
    }
    setClassificationPreview(preview.dataURL);
  }, [active, preview?.dataURL, previewOnMap, setClassificationPreview]);

  const update = <K extends keyof ClassificationParams>(key: K, value: ClassificationParams[K]) => {
    setParams((previous) => ({ ...previous, [key]: value }));
  };

  const doPreview = async () => {
    if (!sourceImage) {
      toast('Importare prima un’immagine sorgente.', 'warning');
      return;
    }
    previewAbort.current?.abort();
    const controller = new AbortController();
    previewAbort.current = controller;
    setPreview({ dataURL: '', loading: true, error: null });
    try {
      const result = await previewClassification(sourceImage, params, controller.signal, project.osmWays);
      if (controller.signal.aborted) return;
      setPreview({ dataURL: result.dataURL, stats: result.stats, loading: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setPreview({ dataURL: '', loading: false, error: error instanceof Error ? error.message : 'Anteprima non riuscita.' });
    }
  };

  useEffect(() => {
    // The dock keeps every panel mounted; without this guard importing an
    // image would start a classification preview (and paint it on the map)
    // even when the user never opened this tab.
    if (!active) {
      previewAbort.current?.abort();
      return;
    }
    if (!livePreview || !sourceImage) return;
    const timer = window.setTimeout(() => void doPreview(), 340);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, params, livePreview, sourceImage, project.osmWays]);

  const start = async () => {
    if (!sourceImage) {
      toast('Importare prima un’immagine sorgente.', 'warning');
      return;
    }
    if (project.classification) {
      const ok = await confirmDialog({
        title: 'Ricalcolare la classificazione?',
        body: 'La classificazione corrente verrà sostituita. L’immagine sorgente non viene modificata.',
        confirmLabel: 'Ricalcola',
      });
      if (!ok) return;
    }
    previewAbort.current?.abort();
    await runClassification(params);
  };

  const savePreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const next = [...presets.filter((item) => item.name !== name), { name, params }];
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      toast(`Preset “${name}” salvato.`, 'success');
    } catch {
      toast('Preset non salvato: spazio locale esaurito.', 'warning');
    }
  };

  const exportPresets = () => {
    const blob = new Blob([JSON.stringify({ presets }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'terrain-o-preset-classificazione.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const value = <K extends keyof ClassificationParams>(key: K, fallback: number): number =>
    (params[key] as number | undefined) ?? fallback;

  return (
    <div className="shell-panel">
      <div className="shell-panel-head">
        <h3>Classificazione</h3>
      </div>
      <p className="tiny muted experimental-line">Risultato sperimentale</p>

      <p className="shell-note">
        Bilanciamento locale dell’illuminazione, colore L*a*b*, superpixel SLIC, regole interpretabili e pulizia morfologica. Non è riconoscimento semantico.
      </p>

      <Toggle label="Anteprima live" checked={livePreview} onChange={setLivePreview} description="Ricalcolo debounced sul worker" />
      <Toggle label="Anteprima su mappa" checked={previewOnMap} onChange={setPreviewOnMap} description="Sovrapposizione semitrasparente, non modificabile" />

      {project.osmWays.length > 0 && (
        <>
          <SectionTitle icon="map">Integrazione OSM</SectionTitle>
          <Toggle
            label="Usa OSM come prior"
            checked={params.osmPriorEnabled ?? true}
            onChange={(next) => update('osmPriorEnabled', next)}
            description={`${project.osmWays.length} elementi disponibili`}
          />
          <SliderField
            label="Peso del prior OSM"
            value={value('osmPriorWeight', 0.55)}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(value('osmPriorWeight', 0.55) * 100)}%`}
            onChange={(next) => update('osmPriorWeight', next)}
            reset={() => update('osmPriorWeight', 0.55)}
          />
          <p className="shell-note">
            I confini OSM orientano solo i pixel ambigui: l’immagine resta la fonte primaria e nessun elemento diventa verificato.
          </p>
        </>
      )}

      {preview?.loading && <ProgressBar percent={45} label="Anteprima" />}
      {preview?.error && <p className="field-error">{preview.error}</p>}
      {preview?.dataURL && (
        <figure className="classification-preview">
          <img src={preview.dataURL} alt="Anteprima della classificazione sperimentale" />
          <figcaption className="tiny muted">Anteprima ridotta · i parametri non sono ancora applicati</figcaption>
        </figure>
      )}

      <SectionTitle icon="wand">Preprocessing locale</SectionTitle>
      <SliderField label="Dimensione tile" value={value('tileSize', 64)} min={16} max={192} step={8} display={`${value('tileSize', 64)} px`} onChange={(next) => update('tileSize', next)} reset={() => update('tileSize', 64)} />
      <SliderField label="Forza bilanciamento" value={value('localBalance', 0.85)} min={0} max={1} step={0.05} display={`${Math.round(value('localBalance', 0.85) * 100)}%`} onChange={(next) => update('localBalance', next)} reset={() => update('localBalance', 0.85)} />

      <SectionTitle icon="layers">Segmentazione SLIC</SectionTitle>
      <SliderField label="Dimensione superpixel" value={value('superpixelSize', 24)} min={8} max={80} step={2} display={`${value('superpixelSize', 24)} px`} onChange={(next) => update('superpixelSize', next)} reset={() => update('superpixelSize', 24)} />
      <SliderField label="Compattezza" value={value('slicCompactness', 12)} min={2} max={40} step={1} onChange={(next) => update('slicCompactness', next)} reset={() => update('slicCompactness', 12)} />
      <SliderField label="Iterazioni" value={value('slicIterations', 4)} min={1} max={10} step={1} onChange={(next) => update('slicIterations', next)} reset={() => update('slicIterations', 4)} />

      <SectionTitle icon="eyedropper">Soglie L*a*b*</SectionTitle>
      <SliderField label="Acqua: b* massimo" value={value('waterBMax', -10)} min={-40} max={10} step={1} onChange={(next) => update('waterBMax', next)} reset={() => update('waterBMax', -10)} />
      <SliderField label="Vegetazione: a* massimo" value={value('vegAMax', -6)} min={-30} max={10} step={1} onChange={(next) => update('vegAMax', next)} reset={() => update('vegAMax', -6)} />
      <SliderField label="Aperto: b* minimo" value={value('openBMin', 18)} min={0} max={60} step={1} onChange={(next) => update('openBMin', next)} reset={() => update('openBMin', 18)} />
      <SliderField label="Artificiale: croma massima" value={value('artChromaMax', 10)} min={0} max={30} step={1} onChange={(next) => update('artChromaMax', next)} reset={() => update('artChromaMax', 10)} />

      <SectionTitle icon="grid">Feature e pulizia</SectionTitle>
      <SliderField label="Peso texture" value={value('textureWeight', 0.35)} min={0} max={1} step={0.05} display={`${Math.round(value('textureWeight', 0.35) * 100)}%`} onChange={(next) => update('textureWeight', next)} reset={() => update('textureWeight', 0.35)} />
      <SliderField label="Peso bordi" value={value('edgeWeight', 0.25)} min={0} max={1} step={0.05} display={`${Math.round(value('edgeWeight', 0.25) * 100)}%`} onChange={(next) => update('edgeWeight', next)} reset={() => update('edgeWeight', 0.25)} />
      <SliderField label="Filtro maggioranza" value={value('majorityWindow', 2)} min={1} max={7} step={1} display={`${value('majorityWindow', 2) * 2 + 1}×${value('majorityWindow', 2) * 2 + 1}`} onChange={(next) => update('majorityWindow', next)} reset={() => update('majorityWindow', 2)} />
      <SliderField label="Componente minima" value={value('minComponentPx', 48)} min={0} max={400} step={8} display={`${value('minComponentPx', 48)} px²`} onChange={(next) => update('minComponentPx', next)} reset={() => update('minComponentPx', 48)} />
      <Toggle label="Riempi buchi chiusi" checked={params.fillHoles ?? true} onChange={(next) => update('fillHoles', next)} />

      <div className="button-row">
        <button type="button" className="btn btn-primary btn-small" onClick={() => void start()} disabled={!sourceImage || job.running}>
          Applica classificazione
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void doPreview()} disabled={!sourceImage || job.running}>
          Aggiorna anteprima
        </button>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-ghost btn-small" onClick={cancelClassification} disabled={!job.running}>Annulla</button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => setParams(withDefaults(DEFAULT_CLASSIFICATION_PARAMS))}
        >
          Reimposta parametri
        </button>
      </div>

      {job.running && <ProgressBar percent={job.percent} label={job.phase} />}
      {job.error && <p className="field-error">{job.error}</p>}
      {job.result && <p className="shell-note">{job.result}</p>}

      {project.classification && (
        <>
          <SectionTitle icon="layers">Ultimo risultato applicato</SectionTitle>
          <p className="shell-note">
            {project.classification.width}×{project.classification.height} px · {new Date(project.classification.createdAt).toLocaleString('it-IT')}
          </p>
          <div className="stats-block">
            {CLASSIFICATION_STATS_LABELS.map((entry) => (
              <StatBar key={entry.key} label={entry.label} value={project.classification?.stats[entry.key] ?? 0} color={entry.color} />
            ))}
          </div>
          {project.classification.osmAgreement && (
            <p className="shell-note">
              Accordo OSM: {project.classification.osmAgreement.overall.toFixed(1)}% sui pixel con prior
              ({project.classification.osmAgreement.covered.toFixed(1)}% dell’immagine).
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setLayerVisible('classification', !project.layers.classification.visible)}
            >
              {project.layers.classification.visible ? 'Nascondi livello' : 'Mostra livello'}
            </button>
          </div>
          {labels && (
            <p className="shell-note">
              Etichette disponibili per la vettorizzazione: apri il pannello Vettorizzazione.
            </p>
          )}
        </>
      )}

      <details className="details">
        <summary>Legenda classi</summary>
        <div className="legend-list">
          {[1, 2, 3, 4, 0].map((id) => {
            const entry = CLASS_COLORS[id as 0 | 1 | 2 | 3 | 4];
            return (
              <div className="legend-row" key={id}>
                <i className="legend-swatch" style={{ background: entry.css }} />
                <span>{entry.label}</span>
              </div>
            );
          })}
        </div>
        <InfoNote>
          Le classi descrivono ciò che è visibile nell’ortofoto. Percorribilità, vegetazione sotto copertura e sicurezza del terreno non sono dichiarate.
        </InfoNote>
      </details>

      <div className="shell-subhead"><Icon name="grip" size={13} /> Preset</div>
      <div className="preset-row">
        <input className="text-input" value={presetName} onChange={(event) => setPresetName(event.target.value)} aria-label="Nome preset classificazione" />
        <button type="button" className="btn btn-secondary btn-small" onClick={savePreset}>Salva</button>
      </div>
      {presets.length > 0 && (
        <div className="preset-row">
          <select
            className="text-input"
            defaultValue=""
            aria-label="Carica preset classificazione"
            onChange={(event) => {
              const preset = presets.find((item) => item.name === event.target.value);
              if (preset) setParams(withDefaults(preset.params));
              event.target.value = '';
            }}
          >
            <option value="" disabled>Carica preset…</option>
            {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-small" onClick={exportPresets}>Esporta JSON</button>
        </div>
      )}
    </div>
  );
}
