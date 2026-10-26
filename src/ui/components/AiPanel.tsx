import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { DEFAULT_AI_OPTIONS } from '../../ai/recognize';
import { SectionTitle, InfoNote, ProgressBar, Toggle, SliderField, NumberField } from './fields';
import { Icon } from './Icon';
import { toast } from '../toastStore';

/**
 * AI recognition and symbol fusion.
 *
 * The panel stays deliberately quiet: one small line states that the result is
 * experimental, and everything else is parameters, counters and provenance.
 * No banner, no question mark, no claim of verification.
 */
export function AiPanel() {
  const project = useProjectStore((state) => state.project);
  const aiJob = useProjectStore((state) => state.aiJob);
  const classificationJob = useProjectStore((state) => state.classificationJob);
  const vectorJob = useProjectStore((state) => state.vectorJob);
  const osmJob = useProjectStore((state) => state.osmJob);
  const demJob = useProjectStore((state) => state.demJob);
  const autoJob = useProjectStore((state) => state.autoJob);
  const autoReport = useProjectStore((state) => state.autoReport);
  const runAiRecognition = useProjectStore((state) => state.runAiRecognition);
  const cancelAiRecognition = useProjectStore((state) => state.cancelAiRecognition);
  const runSymbolFusion = useProjectStore((state) => state.runSymbolFusion);
  const runAutomaticPipeline = useProjectStore((state) => state.runAutomaticPipeline);
  const cancelAutomaticPipeline = useProjectStore((state) => state.cancelAutomaticPipeline);

  const [autoFetchOsm, setAutoFetchOsm] = useState(true);
  const [autoContours, setAutoContours] = useState(true);
  const [pseudoLabels, setPseudoLabels] = useState(DEFAULT_AI_OPTIONS.pseudoLabels);
  const [detectTrees, setDetectTrees] = useState(DEFAULT_AI_OPTIONS.detectTrees);
  const [treeSensitivity, setTreeSensitivity] = useState(DEFAULT_AI_OPTIONS.treeSensitivity);
  const [maxTrees, setMaxTrees] = useState(DEFAULT_AI_OPTIONS.maxTrees);
  const [majorityWindow, setMajorityWindow] = useState(DEFAULT_AI_OPTIONS.majorityWindow);
  const [minComponentPx, setMinComponentPx] = useState(DEFAULT_AI_OPTIONS.minComponentPx);

  const pipelineBusy =
    autoJob.running || aiJob.running || classificationJob.running || vectorJob.running || osmJob.running || demJob.running;
  const meta = project.ai;
  const fusion = project.symbolFusion;
  const osmAreas = project.osmWays.length;
  const manualAreas = project.features.filter(
    (feature) => feature.kind === 'area' && (feature.source == null || feature.source === 'manual'),
  ).length;

  const run = async () => {
    const count = await runAiRecognition({
      pseudoLabels,
      detectTrees,
      treeSensitivity,
      maxTrees,
      majorityWindow,
      minComponentPx,
    });
    if (count) toast(`${count} simboli AI generati. Restano automatici e non verificati.`, 'info');
  };

  const runAuto = async () => {
    const report = await runAutomaticPipeline({ fetchOsm: autoFetchOsm, contours: autoContours });
    if (!report) {
      const error = useProjectStore.getState().autoJob.error;
      if (error) toast(error, 'error');
      return;
    }
    if (report.warnings.length) {
      toast(`Elaborazione completata con ${report.warnings.length} avvisi.`, 'info');
    } else {
      toast(`Elaborazione completa: ${report.totalFeatures} simboli nel livello unico.`, 'success');
    }
  };

  const fuse = () => {
    const removed = runSymbolFusion();
    if (removed) toast(`${removed} duplicati automatici rimossi dal livello simboli.`, 'success');
  };

  return (
    <div className="panel-content">
      <section className="panel-hero">
        <div className="eyebrow">Interpretazione automatica · AI</div>
        <h2>Riconoscimento e livello unico</h2>
        <p className="tiny muted">
          Un modello locale impara da OSM, dagli elementi manuali e dalle classificazioni ad alta confidenza.
          Riconosce copertura e chiome, poi unisce tutti i simboli in un unico livello senza duplicati sovrapposti.
        </p>
      </section>

      <p className="shell-note">Risultato sperimentale.</p>

      <section className="panel-section auto-pipeline">
        <SectionTitle icon="wand" aside={<span className="badge badge-auto">un solo clic</span>}>
          Elaborazione completa
        </SectionTitle>
        <p className="small">
          Esegue in sequenza: OSM (se georeferenziato), elementi automatici, classificazione,
          vettorizzazione, riconoscimento AI, curve di livello e unificazione del livello simboli.
          Gli elementi manuali e verificati non vengono mai modificati.
        </p>
        <Toggle
          label="Scarica anche OSM"
          checked={autoFetchOsm}
          onChange={setAutoFetchOsm}
          disabled={!project.imageBBox || !project.worldFile}
          description={project.imageBBox ? 'cache locale di 24 ore' : 'richiede una georeferenziazione'}
          testId="auto-fetch-osm"
        />
        <Toggle
          label="Genera anche le curve di livello"
          checked={autoContours}
          onChange={setAutoContours}
          disabled={!project.imageBBox}
          description={project.imageBBox ? 'DEM pubblico a circa 30 m' : 'richiede una georeferenziazione'}
          testId="auto-contours"
        />
        <div className="inline-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runAuto()}
            disabled={!project.image || pipelineBusy}
            data-testid="run-auto-pipeline"
          >
            <Icon name="wand" size={16} /> Esegui tutto
          </button>
          {autoJob.running && (
            <button type="button" className="btn btn-danger btn-small" onClick={cancelAutomaticPipeline}>
              Annulla
            </button>
          )}
        </div>
        {autoJob.running && <ProgressBar percent={autoJob.percent} label={autoJob.phase} />}
        {autoJob.error && <InfoNote tone="danger">{autoJob.error}</InfoNote>}
        {autoJob.result && <InfoNote tone="success">{autoJob.result}</InfoNote>}
        {autoReport && (
          <div className="data-list">
            <div><span>OSM</span><strong>{autoReport.osmWays} grezzi · {autoReport.osmFeatures} simboli</strong></div>
            <div><span>Classificazione</span><strong>{autoReport.classified ? autoReport.classificationSize : 'assente'}</strong></div>
            <div><span>Aree vettoriali</span><strong>{autoReport.polygons}</strong></div>
            <div><span>Simboli AI</span><strong>{autoReport.aiFeatures}</strong></div>
            <div><span>Edifici · alberi</span><strong>{autoReport.buildings} · {autoReport.trees}</strong></div>
            <div><span>Curve di livello</span><strong>{autoReport.contours}</strong></div>
            <div><span>Duplicati uniti</span><strong>{autoReport.fusedRemoved}</strong></div>
            <div><span>Simboli totali</span><strong>{autoReport.totalFeatures}</strong></div>
          </div>
        )}
        {autoReport && autoReport.warnings.length > 0 && (
          <InfoNote tone="warning">
            {autoReport.warnings.map((warning) => (
              <div key={warning} className="tiny">{warning}</div>
            ))}
          </InfoNote>
        )}
      </section>

      <section className="panel-section">
        <SectionTitle icon="wand" aside={<span className="badge badge-auto">locale</span>}>
          Modello
        </SectionTitle>
        <div className="data-list">
          <div><span>Aree OSM disponibili</span><strong>{osmAreas}</strong></div>
          <div><span>Aree manuali</span><strong>{manualAreas}</strong></div>
          <div><span>Pseudo-etichette</span><strong>{pseudoLabels ? 'attive' : 'spente'}</strong></div>
        </div>
        <Toggle
          label="Pseudo-etichette dalle regole"
          checked={pseudoLabels}
          onChange={setPseudoLabels}
          description="Usa le decisioni più sicure come esempi deboli quando mancano dati OSM o manuali."
        />
        <Toggle
          label="Rileva alberi isolati"
          checked={detectTrees}
          onChange={setDetectTrees}
          description="Cerca chiome individuali dentro la vegetazione e crea punti albero."
        />
        {detectTrees && (
          <>
            <SliderField
              label="Sensibilità alberi"
              value={treeSensitivity}
              min={0.1}
              max={1}
              step={0.05}
              onChange={setTreeSensitivity}
              display={`${Math.round(treeSensitivity * 100)}%`}
              reset={() => setTreeSensitivity(DEFAULT_AI_OPTIONS.treeSensitivity)}
            />
            <NumberField
              label="Max alberi"
              value={maxTrees}
              min={20}
              max={4000}
              step={20}
              onChange={setMaxTrees}
            />
          </>
        )}
        <SliderField
          label="Pulizia confini"
          value={majorityWindow}
          min={0}
          max={4}
          step={1}
          onChange={setMajorityWindow}
          display={majorityWindow === 0 ? 'off' : `${majorityWindow * 2 + 1}×${majorityWindow * 2 + 1}`}
          reset={() => setMajorityWindow(DEFAULT_AI_OPTIONS.majorityWindow)}
        />
        <NumberField
          label="Area minima"
          value={minComponentPx}
          min={4}
          max={400}
          step={4}
          onChange={setMinComponentPx}
          unit="px²"
        />
        <div className="inline-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => void run()}
            disabled={!project.image || aiJob.running}
            data-testid="run-ai"
          >
            <Icon name="wand" size={16} /> Riconosci simboli
          </button>
          {aiJob.running && (
            <button type="button" className="btn btn-danger btn-small" onClick={cancelAiRecognition}>
              Annulla
            </button>
          )}
        </div>
        {aiJob.running && <ProgressBar percent={aiJob.percent} label={aiJob.phase} />}
        {aiJob.error && <InfoNote tone="danger">{aiJob.error}</InfoNote>}
        {aiJob.result && <InfoNote tone="success">{aiJob.result}</InfoNote>}
        <p className="tiny muted">
          Il modello lavora in un worker, sul dispositivo. L’immagine non viene caricata su alcun server.
          Gli esempi OSM e manuali pesano più delle pseudo-etichette.
        </p>
      </section>

      <section className="panel-section">
        <SectionTitle icon="layers" aside={<span className="badge badge-auto">automatico</span>}>
          Livello simboli unico
        </SectionTitle>
        <p className="small">
          Unisce AI, OSM e vettorizzazione in un solo livello. La fusione viene eseguita automaticamente al termine
          del riconoscimento e quando si generano elementi OSM; il pulsante serve a rieseguirla. Elimina solo i
          duplicati automatici dello stesso simbolo (aree, linee e punti); elementi manuali e verificati non vengono
          mai modificati, e due elementi protetti sovrapposti restano entrambi.
        </p>
        <div className="inline-actions">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={fuse}
            disabled={!project.features.length || aiJob.running}
            data-testid="fuse-symbols"
          >
            <Icon name="layers" size={16} /> Unifica livello simboli
          </button>
        </div>
        {fusion && (
          <div className="data-list">
            <div><span>Prima / dopo</span><strong>{fusion.before} → {fusion.after}</strong></div>
            <div><span>Duplicati rimossi</span><strong>{fusion.removed}</strong></div>
            <div><span>Gruppi fusi</span><strong>{fusion.mergedGroups}</strong></div>
            <div><span>Conflitti protetti</span><strong>{fusion.protectedConflicts}</strong></div>
          </div>
        )}
        {fusion && Object.keys(fusion.byType).length > 0 && (
          <div className="shell-subhead">
            <Icon name="info" size={13} /> Simboli nel livello
          </div>
        )}
        {fusion && Object.entries(fusion.byType).length > 0 && (
          <div className="counter-row">
            {Object.entries(fusion.byType).map(([type, count]) => (
              <span key={type}>{type}: <strong>{count}</strong></span>
            ))}
          </div>
        )}
      </section>

      {meta && (
        <section className="panel-section">
          <SectionTitle icon="info">Ultimo riconoscimento</SectionTitle>
          <div className="data-list">
            <div><span>Campioni</span><strong>{meta.samples}</strong></div>
            <div><span>Da OSM / manuale</span><strong>{meta.labelledSamples}</strong></div>
            <div><span>Classi apprese</span><strong>{meta.classes}</strong></div>
            <div><span>Validazione holdout</span><strong>{meta.validation.toFixed(1)}%</strong></div>
            <div><span>Aree · edifici</span><strong>{meta.polygons} · {meta.buildings}</strong></div>
            <div><span>Alberi</span><strong>{meta.trees}</strong></div>
          </div>
          {meta.featureImportance.length > 0 && (
            <>
              <div className="shell-subhead"><Icon name="info" size={13} /> Peso delle feature</div>
              <div className="stats-block">
                {meta.featureImportance.map((item) => (
                  <div className="stat-row" key={item.name}>
                    <span className="stat-label">{item.name}</span>
                    <div className="stat-track">
                      <span style={{ width: `${Math.round(item.value * 100)}%`, background: '#4aa3d8' }} />
                    </div>
                    <span className="stat-value">{Math.round(item.value * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="tiny muted">
            La validazione misura l’accordo su esempi esclusi dall’addestramento, non la verità sul terreno.
            Gli elementi AI restano automatici e non verificati.
          </p>
        </section>
      )}

      <InfoNote>
        Percorribilità, vegetazione sotto copertura, sicurezza del terreno e conformità IOF non vengono dichiarate.
        Il riconoscimento è materia prima sperimentale da controllare sul campo.
      </InfoNote>
    </div>
  );
}
