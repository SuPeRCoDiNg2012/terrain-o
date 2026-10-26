import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { OSM_ATTRIBUTION } from '../../model/constants';
import {
  OSM_CONTRAST_CLASS_LABELS,
  filterOsmContrasts,
  osmContrastsToCsv,
  type OsmContrastClassKey,
} from '../../osm/contrasts';
import { downloadText, safeFilename } from '../../render/canvas';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { summarizeOsmWays } from '../../osm/convert';
import { SectionTitle, InfoNote, ProgressBar, StatBar } from './fields';
import { Icon } from './Icon';

export function OsmPanel() {
  const project = useProjectStore((state) => state.project);
  const job = useProjectStore((state) => state.osmJob);
  const runOsmFetch = useProjectStore((state) => state.runOsmFetch);
  const cancelOsmFetch = useProjectStore((state) => state.cancelOsmFetch);
  const convertOsmToFeatures = useProjectStore((state) => state.convertOsmToFeatures);
  const clearOsm = useProjectStore((state) => state.clearOsm);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);
  const runOsmFusion = useProjectStore((state) => state.runOsmFusion);
  const classificationJob = useProjectStore((state) => state.classificationJob);
  const select = useProjectStore((state) => state.select);
  const focusSelection = useProjectStore((state) => state.focusSelection);
  const [contrastClass, setContrastClass] = useState<OsmContrastClassKey | 'all'>('all');
  const [contrastMinArea, setContrastMinArea] = useState(0);

  const canFetch = Boolean(project.imageBBox && project.worldFile);
  const summary = summarizeOsmWays(project.osmWays);
  const countOf = (semantic: string) => summary.counts.find((item) => item.semantic === semantic)?.count ?? 0;
  const convertedCount = project.features.filter((f) => f.source === 'osm').length;
  const agreement = project.classification?.osmAgreement;
  const contrasts = project.classification?.osmContrasts ?? [];
  const visibleContrasts = filterOsmContrasts(contrasts, {
    classKey: contrastClass,
    minAreaPx: contrastMinArea,
  });
  const generatedOsmIds = new Set(
    project.features
      .filter((feature) => feature.source === 'osm' && feature.osmId != null)
      .map((feature) => feature.osmId as number),
  );
  const hasContrastFilter = contrastClass !== 'all' || contrastMinArea > 0;

  const importOsm = async (force: boolean) => {
    await runOsmFetch({ force });
    const state = useProjectStore.getState().osmJob;
    if (state.result) toast(state.result, state.percent === 100 ? 'success' : 'info');
  };

  const generate = () => {
    const count = convertOsmToFeatures();
    if (count) toast(`${count} elementi automatici generati da OSM.`, 'success');
  };

  const fusion = async () => {
    if (!project.image) {
      generate();
      return;
    }
    if (project.classification) {
      const ok = await confirmDialog({
        title: 'Ricalcolare la classificazione con il prior OSM?',
        body: 'La classificazione corrente verrà sostituita. I confini OSM guideranno solo i pixel ambigui; l’immagine resta la fonte primaria.',
        confirmLabel: 'Esegui fusione',
      });
      if (!ok) return;
    }
    const result = await runOsmFusion();
    if (result.features) toast(`${result.features} elementi automatici generati da OSM.`, 'success');
    if (result.classified) toast('Classificazione aggiornata con il prior OSM.', 'success');
  };

  const selectContrast = (osmId: number) => {
    const feature = project.features.find((item) => item.source === 'osm' && item.osmId === osmId);
    if (!feature) return;
    select([feature.id]);
    focusSelection();
  };

  const exportContrasts = () => {
    if (!visibleContrasts.length) return;
    const csv = osmContrastsToCsv(visibleContrasts, { generatedIds: generatedOsmIds });
    // The BOM lets Excel open accented names correctly.
    downloadText(
      `\ufeff${csv}`,
      `${safeFilename(project.name) || 'terrain-o'}-osm-contrasti.csv`,
      'text/csv',
    );
    toast(`Report OSM esportato: ${visibleContrasts.length} aree.`, 'success');
  };

  const clear = async () => {
    const ok = await confirmDialog({
      title: 'Rimuovere i dati OSM grezzi?',
      body: 'Il livello OSM verrà svuotato. Gli elementi già convertiti restano nel progetto con la loro provenienza OSM.',
      confirmLabel: 'Svuota livello OSM',
      danger: true,
    });
    if (ok) {
      clearOsm();
      toast('Livello OSM grezzo svuotato.', 'info');
    }
  };

  return (
    <div className="panel-content">
      <section className="panel-hero">
        <div className="eyebrow">Interpretazione automatica · OSM</div>
        <h2>Edifici, verde, acqua e viabilità</h2>
        <p className="tiny muted">
          Un’unica interrogazione Overpass raccoglie edifici, land use, acqua, parchi, strade, sentieri, barriere,
          ferrovie e alberi nel bbox dell’immagine. I dati sono memorizzati in cache per bbox e georeferenziazione.
        </p>
      </section>

      <InfoNote tone="warning">
        I dati OSM sono sperimentali, possono essere incompleti o disallineati e non sono stati verificati sul campo.
        La fusione automatica non dichiara percorribilità, vegetazione sotto copertura né sicurezza del terreno.
      </InfoNote>

      {!canFetch ? (
        <InfoNote tone="danger">
          OSM richiede un’immagine georeferenziata con world file valido e proiezione riconosciuta. Senza bbox WGS84 la funzione è disattivata.
        </InfoNote>
      ) : (
        <>
          <section className="panel-section">
            <SectionTitle icon="map" aside={<span className="badge badge-auto">cache locale</span>}>Importazione</SectionTitle>
            <div className="data-list">
              <div><span>BBox</span><strong className="mono tiny">
                {project.imageBBox!.west.toFixed(4)}, {project.imageBBox!.south.toFixed(4)} — {project.imageBBox!.east.toFixed(4)}, {project.imageBBox!.north.toFixed(4)}
              </strong></div>
              <div><span>Batch</span><strong>riquadri da 0,05° (max 25)</strong></div>
              <div><span>Alberi</span><strong>max 2500 per riquadro · 15000 totali</strong></div>
            </div>
            <div className="inline-actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => void importOsm(false)} disabled={job.running} data-testid="fetch-osm">
                <Icon name="import" size={16} /> {project.osmWays.length ? 'Aggiorna OSM' : 'Importa da OSM'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => void importOsm(true)}
                disabled={job.running}
                title="Ignora la cache e interroga nuovamente Overpass"
                data-testid="fetch-osm-force"
              >
                <Icon name="refresh" size={16} /> Forza download
              </button>
              {job.running && <button type="button" className="btn btn-danger btn-small" onClick={cancelOsmFetch}>Annulla</button>}
            </div>
            {job.running && <ProgressBar percent={job.percent} label={job.phase} />}
            {job.error && <InfoNote tone="danger">{job.error}</InfoNote>}
            {job.result && <InfoNote tone={job.percent === 100 ? 'success' : 'info'}>{job.result}</InfoNote>}
            <p className="tiny muted">
              Cache locale valida 24 ore. In caso di errore vengono provati i mirror globali Overpass e, come ultima
              risorsa, l’API cartografica ufficiale OpenStreetMap. I multipoligoni sono ricomposti in anelli chiusi,
              con i fori interni conservati.
            </p>
          </section>

          <section className="panel-section">
            <SectionTitle icon="layers" aside={<span className={`badge ${project.layers.osm.visible ? 'badge-verified' : 'badge-neutral'}`}>{project.layers.osm.visible ? 'visibile' : 'nascosto'}</span>}>
              Livello OSM
            </SectionTitle>
            <div className="data-list">
              <div><span>Elementi grezzi</span><strong>{summary.total}</strong></div>
              <div><span>Edifici</span><strong>{countOf('building')}</strong></div>
              <div><span>Verde e aree aperte</span><strong>{countOf('forest') + countOf('scrub') + countOf('open')}</strong></div>
              <div><span>Acqua</span><strong>{countOf('water') + countOf('wetland')}</strong></div>
              <div><span>Strade e sentieri</span><strong>{countOf('road') + countOf('path')}</strong></div>
              <div><span>Alberi</span><strong>{summary.trees}</strong></div>
              <div><span>Convertiti</span><strong>{convertedCount}</strong></div>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => void fusion()}
                disabled={!summary.total || classificationJob.running}
                title="Genera gli elementi OSM e aggiorna la classificazione con il prior"
              >
                <Icon name="wand" size={16} /> Fusione automatica
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={generate} disabled={!summary.convertible}>
                <Icon name="layers" size={16} /> Genera elementi automatici
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setLayerVisible('osm', !project.layers.osm.visible)}>
                {project.layers.osm.visible ? 'Nascondi livello' : 'Mostra livello'}
              </button>
              <button type="button" className="btn btn-ghost btn-small danger-hover" onClick={() => void clear()} disabled={!project.osmWays.length}>
                Svuota
              </button>
            </div>
            <p className="tiny muted">
              La fusione crea elementi automatici per edifici, alberi, acqua, bosco, arbusti, aree aperte, superfici
              artificiali, strade, sentieri, ruscelli e barriere. Il livello OSM grezzo viene nascosto dopo la
              generazione, così resta visibile un solo livello di simboli; riattivalo da Livelli se ti serve.
              Gli elementi già presenti non vengono duplicati né sovrascritti.
            </p>
          </section>

          <section className="panel-section">
            <SectionTitle icon="wand" aside={<span className="badge badge-auto">prior</span>}>Fusione con la classificazione</SectionTitle>
            <p className="small">
              Quando esegui la classificazione, i confini OSM vengono usati come prior: aiutano a risolvere i pixel
              ambigui, ma non sostituiscono l’immagine. Il peso è regolabile nel pannello Classificazione.
            </p>
            <div className="data-list">
              <div><span>Aree usabili come prior</span><strong>{summary.areas}</strong></div>
              <div><span>Linee usabili come prior</span><strong>{summary.lines}</strong></div>
              <div><span>Elementi convertibili</span><strong>{summary.convertible}</strong></div>
            </div>
            {classificationJob.running && <ProgressBar percent={classificationJob.percent} label={classificationJob.phase} />}
            {classificationJob.error && <InfoNote tone="danger">{classificationJob.error}</InfoNote>}
            <p className="tiny muted">
              Il bordo degli elementi generati resta tratteggiato: sono interpretazioni automatiche, non elementi
              verificati. La dichiarazione di verifica resta un’azione manuale nel pannello Proprietà.
            </p>
          </section>

          {project.classification && (
            <section className="panel-section">
              <SectionTitle icon="info" aside={<span className="badge badge-auto">OSM</span>}>Accordo con l’ultima classificazione</SectionTitle>
              {agreement ? (
                <>
                  <div className="data-list">
                    <div><span>Accordo complessivo</span><strong>{agreement.overall.toFixed(1)}%</strong></div>
                    <div><span>Pixel coperti da prior</span><strong>{agreement.covered.toFixed(1)}%</strong></div>
                    <div><span>Pixel con prior</span><strong>{agreement.priorPixels.toLocaleString('it-IT')}</strong></div>
                  </div>
                  <div className="stats-block">
                    <StatBar label="Vegetazione" value={agreement.byClass.veg} color="#3f8f4b" />
                    <StatBar label="Aperto" value={agreement.byClass.open} color="#c8a93c" />
                    <StatBar label="Acqua" value={agreement.byClass.water} color="#3b82b8" />
                    <StatBar label="Artificiale" value={agreement.byClass.art} color="#8e8e8e" />
                  </div>
                  {contrasts.length ? (
                    <>
                      <div className="shell-subhead"><Icon name="info" size={13} /> Aree OSM in contrasto</div>
                      <div className="contrast-filters">
                        <label>
                          <span>Classe</span>
                          <select
                            className="select-input"
                            value={contrastClass}
                            onChange={(event) => setContrastClass(event.target.value as OsmContrastClassKey | 'all')}
                            aria-label="Filtra le aree in contrasto per classe"
                          >
                            <option value="all">Tutte</option>
                            {(Object.keys(OSM_CONTRAST_CLASS_LABELS) as OsmContrastClassKey[]).map((key) => (
                              <option key={key} value={key}>{OSM_CONTRAST_CLASS_LABELS[key]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Area minima</span>
                          <select
                            className="select-input"
                            value={contrastMinArea}
                            onChange={(event) => setContrastMinArea(Number(event.target.value))}
                            aria-label="Filtra le aree in contrasto per dimensione"
                          >
                            <option value={0}>Qualsiasi</option>
                            <option value={100}>≥ 100 px²</option>
                            <option value={500}>≥ 500 px²</option>
                            <option value={2000}>≥ 2.000 px²</option>
                          </select>
                        </label>
                      </div>
                      <div className="contrast-toolbar">
                        <span className="tiny muted">
                          {visibleContrasts.length} di {contrasts.length} aree
                        </span>
                        <div className="shell-actions">
                          {hasContrastFilter && (
                            <button
                              type="button"
                              className="tiny-button"
                              onClick={() => {
                                setContrastClass('all');
                                setContrastMinArea(0);
                              }}
                            >
                              Azzera
                            </button>
                          )}
                          <button
                            type="button"
                            className="tiny-button"
                            onClick={exportContrasts}
                            disabled={!visibleContrasts.length}
                            title="Esporta le aree visibili in un file CSV"
                            data-testid="export-osm-contrasts"
                          >
                            <Icon name="export" size={12} /> Esporta CSV
                          </button>
                        </div>
                      </div>
                      {visibleContrasts.length ? (
                        <div className="contrast-list">
                          {visibleContrasts.map((item) => {
                            const feature = project.features.find(
                              (candidate) => candidate.source === 'osm' && candidate.osmId === item.osmId,
                            );
                            return (
                              <button
                                key={item.osmId}
                                type="button"
                                className="contrast-row"
                                onClick={() => selectContrast(item.osmId)}
                                disabled={!feature}
                                title={feature ? 'Seleziona l’elemento generato' : 'Elemento non ancora generato'}
                              >
                                <span>{item.name}</span>
                                <strong>{item.agreement.toFixed(1)}%</strong>
                                <span className="tiny muted">
                                  {item.label} · {item.areaPx.toLocaleString('it-IT')} px
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="tiny muted">Nessuna area corrisponde ai filtri selezionati.</p>
                      )}
                    </>
                  ) : (
                    <p className="tiny muted">Nessuna area OSM con accordo sotto la soglia minima.</p>
                  )}
                  <p className="tiny muted">
                    Accordo calcolato solo sui pixel con un prior significativo. Un valore basso segnala OSM arretrato
                    o disallineato rispetto all’ortofoto: non viene corretto né dichiarato automaticamente.
                  </p>
                </>
              ) : (
                <p className="tiny muted">
                  Esegui una classificazione con prior OSM per generare il report di accordo.
                </p>
              )}
            </section>
          )}

          <section className="panel-section">
            <SectionTitle icon="info">Attribuzione e limiti</SectionTitle>
            <p className="small">{OSM_ATTRIBUTION}. Dati disponibili sotto licenza ODbL.</p>
            <p className="tiny muted">
              Nessuna garanzia su completezza, accessibilità o percorribilità. Il livello OSM grezzo e gli elementi
              derivati non sono verificati e non vengono inclusi automaticamente nelle verifiche di progetto.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
