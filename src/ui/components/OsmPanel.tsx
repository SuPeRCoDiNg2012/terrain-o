import { useProjectStore } from '../../store/projectStore';
import { OSM_ATTRIBUTION } from '../../model/constants';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { SectionTitle, InfoNote, ProgressBar } from './fields';
import { Icon } from './Icon';

export function OsmPanel() {
  const project = useProjectStore((state) => state.project);
  const job = useProjectStore((state) => state.osmJob);
  const runOsmFetch = useProjectStore((state) => state.runOsmFetch);
  const cancelOsmFetch = useProjectStore((state) => state.cancelOsmFetch);
  const convertOsmToFeatures = useProjectStore((state) => state.convertOsmToFeatures);
  const clearOsm = useProjectStore((state) => state.clearOsm);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);

  const canFetch = Boolean(project.imageBBox && project.worldFile);
  const highwayCount = project.osmWays.filter((way) => way.kind === 'highway').length;
  const waterCount = project.osmWays.filter((way) => way.kind === 'waterway').length;
  const convertedCount = project.features.filter((f) => f.source === 'osm').length;

  const importOsm = async (force: boolean) => {
    await runOsmFetch({ force });
    const state = useProjectStore.getState().osmJob;
    if (state.result) toast(state.result, state.percent === 100 ? 'success' : 'info');
  };

  const clear = async () => {
    const ok = await confirmDialog({
      title: 'Rimuovere i dati OSM grezzi?',
      body: 'Il livello OSM verrà svuotato. Gli elementi già convertiti in elementi cartografici restano nel progetto con la loro provenienza OSM.',
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
        <h2>Strade e corsi d'acqua</h2>
        <p className="tiny muted">
          Overpass API viene interrogata solo per strade e corsi d'acqua nel bbox dell'immagine. I dati sono memorizzati in cache per bbox e impronta di georeferenziazione.
        </p>
      </section>

      <InfoNote tone="warning">
        I tracciati OSM sono sperimentali, possono essere incompleti o disallineati e non sono stati verificati sul campo.
      </InfoNote>

      {!canFetch ? (
        <InfoNote tone="danger">
          OSM richiede un'immagine georeferenziata con world file valido e proiezione riconosciuta. Senza bbox WGS84 la funzione è disattivata.
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
              Cache locale per bbox valida 24 ore. In caso di errore vengono provati automaticamente i mirror globali
              Overpass (overpass-api.de, overpass.kumi.systems) e, come ultima risorsa, l’API cartografica ufficiale
              OpenStreetMap: nessun mirror regionale può restituire un’area vuota per errore.
            </p>
          </section>

          <section className="panel-section">
            <SectionTitle icon="layers" aside={<span className={`badge ${project.layers.osm.visible ? 'badge-verified' : 'badge-neutral'}`}>{project.layers.osm.visible ? 'visibile' : 'nascosto'}</span>}>
              Livello OSM
            </SectionTitle>
            <div className="data-list">
              <div><span>Tracciati grezzi</span><strong>{project.osmWays.length}</strong></div>
              <div><span>Strade</span><strong>{highwayCount}</strong></div>
              <div><span>Corsi d'acqua</span><strong>{waterCount}</strong></div>
              <div><span>Convertiti</span><strong>{convertedCount}</strong></div>
            </div>
            <div className="inline-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => convertOsmToFeatures()} disabled={!project.osmWays.length}>
                <Icon name="line" size={16} /> Converti in elementi
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setLayerVisible('osm', !project.layers.osm.visible)}>
                {project.layers.osm.visible ? 'Nascondi livello' : 'Mostra livello'}
              </button>
              <button type="button" className="btn btn-ghost btn-small danger-hover" onClick={() => void clear()} disabled={!project.osmWays.length}>
                Svuota
              </button>
            </div>
            <p className="tiny muted">
              Conversione: path/footway/track/bridleway/cycleway → sentiero; primary/secondary/trunk/motorway/residential → strada; waterway → ruscello.
              Gli elementi già convertiti non vengono duplicati (deduplicazione per ID OSM). La conversione aggiunge elementi automatici
              non verificati: nessuna percorribilità viene dichiarata automaticamente.
            </p>
          </section>

          <section className="panel-section">
            <SectionTitle icon="info">Attribuzione e limiti</SectionTitle>
            <p className="small">{OSM_ATTRIBUTION}. Dati disponibili sotto licenza ODbL.</p>
            <p className="tiny muted">
              Nessuna garanzia su completezza, accessibilità o percorribilità. Il layer OSM grezzo non è un elemento verificato e non viene incluso
              automaticamente nelle verifiche di progetto.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
