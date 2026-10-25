import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { DEM_ATTRIBUTION } from '../../model/constants';
import { confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { SectionTitle, InfoNote, ProgressBar } from './fields';
import { Icon } from './Icon';

const INTERVALS = [5, 10, 20, 25];

export function DemPanel() {
  const project = useProjectStore((state) => state.project);
  const job = useProjectStore((state) => state.demJob);
  const runDemContours = useProjectStore((state) => state.runDemContours);
  const cancelDemContours = useProjectStore((state) => state.cancelDemContours);
  const clearContours = useProjectStore((state) => state.clearContours);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);
  const [interval, setInterval] = useState(project.contourInterval || 10);

  const canGenerate = Boolean(project.imageBBox && project.image);
  const indexCount = project.contours.filter((contour) => contour.index).length;

  const generate = async () => {
    if (project.contours.length) {
      const ok = await confirmDialog({
        title: 'Sostituire le curve di livello?',
        body: 'Le curve attuali verranno sostituite da una nuova elaborazione DEM. L\'operazione entra nella cronologia undo.',
        confirmLabel: 'Rigenera curve',
      });
      if (!ok) return;
    }
    await runDemContours(interval);
  };

  const clear = async () => {
    const ok = await confirmDialog({
      title: 'Rimuovere le curve di livello?',
      body: 'Il livello curve verrà svuotato. Gli altri elementi non vengono toccati.',
      confirmLabel: 'Rimuovi curve',
      danger: true,
    });
    if (ok) {
      clearContours();
      toast('Curve di livello rimosse.', 'info');
    }
  };

  return (
    <div className="panel-content">
      <section className="panel-hero">
        <div className="eyebrow">Interpretazione automatica · DEM</div>
        <h2>Curve di livello</h2>
        <p className="tiny muted">
          DEM a tessere Terrarium (AWS Terrain Tiles), campionato su una griglia 256×256. Le curve sono ricostruite con marching squares,
          stitching union-find e semplificate. La quota è indicativa e non sostituisce un rilievo.
        </p>
      </section>

      <InfoNote tone="warning">
        Non usare queste curve per dichiarare altimetria di precisione, sicurezza o conformità IOF. Il DEM pubblico ha risoluzione limitata e può essere obsoleto.
      </InfoNote>

      {!canGenerate ? (
        <InfoNote tone="danger">
          Le curve richiedono un'immagine con georeferenziazione WGS84 valida. Il world file in soli metri senza .prj non è sufficiente.
        </InfoNote>
      ) : (
        <>
          <section className="panel-section">
            <SectionTitle icon="mountain">Elaborazione</SectionTitle>
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="contour-interval">Equidistanza</label>
                <select id="contour-interval" className="select-input" value={interval} onChange={(event) => setInterval(Number(event.target.value))}>
                  {INTERVALS.map((value) => <option key={value} value={value}>{value} m</option>)}
                </select>
              </div>
            </div>
            <div className="inline-actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => void generate()} disabled={job.running} data-testid="generate-dem">
                <Icon name="mountain" size={16} /> {project.contours.length ? 'Rigenera curve' : 'Genera curve'}
              </button>
              {job.running && <button type="button" className="btn btn-danger btn-small" onClick={cancelDemContours}>Annulla</button>}
            </div>
            {job.running && <ProgressBar percent={job.percent} label={job.phase} />}
            {job.error && <InfoNote tone="danger">{job.error}</InfoNote>}
            {job.result && <InfoNote tone="success">{job.result}</InfoNote>}
            <div className="data-list">
              <div><span>Curve presenti</span><strong>{project.contours.length}</strong></div>
              <div><span>Curve direttrici</span><strong>{indexCount}</strong></div>
              <div><span>Passo usato</span><strong>{project.contourInterval} m</strong></div>
            </div>
          </section>

          <section className="panel-section">
            <SectionTitle icon="layers" aside={<span className={`badge ${project.layers.contours.visible ? 'badge-verified' : 'badge-neutral'}`}>{project.layers.contours.visible ? 'visibile' : 'nascosto'}</span>}>
              Livello curve
            </SectionTitle>
            <div className="inline-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setLayerVisible('contours', !project.layers.contours.visible)}>
                {project.layers.contours.visible ? 'Nascondi livello' : 'Mostra livello'}
              </button>
              <button type="button" className="btn btn-ghost btn-small danger-hover" onClick={() => void clear()} disabled={!project.contours.length}>
                Rimuovi curve
              </button>
            </div>
            <p className="tiny muted">
              Le curve direttrici sono ogni 5 equidistanze. Le linee chiuse derivano da stitching e possono essere spezzate ai bordi del DEM o dell'immagine.
            </p>
          </section>

          <section className="panel-section">
            <SectionTitle icon="info">Attribuzione</SectionTitle>
            <p className="small">{DEM_ATTRIBUTION}.</p>
            <p className="tiny muted">
              Il client sceglie automaticamente lo zoom in base all'estensione per limitare le tessere richieste; le tessere sono memorizzate solo in memoria
              per la sessione corrente. Retry automatico su errori di rete.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
