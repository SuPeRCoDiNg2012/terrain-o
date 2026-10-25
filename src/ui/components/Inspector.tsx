import type { Feature } from '../../model/types';
import { selectCourseFeatures, useProjectStore } from '../../store/projectStore';
import {
  AREA_TYPES,
  LINE_TYPES,
  POINT_TYPES,
  typeSpec,
} from '../../model/constants';
import {
  featureAreaMeters,
  featureLengthMeters,
  formatMeters,
} from '../../geo/projection';
import { askVerification, confirmDialog } from '../dialogStore';
import { toast } from '../toastStore';
import { featureProvenance, provenanceText } from '../../render/provenance';
import { DebouncedTextField } from './fields';
import { Icon } from './Icon';

const SOURCE_LABEL: Record<NonNullable<Feature['source']>, string> = {
  manual: 'disegnato a mano',
  osm: 'OpenStreetMap',
  vector: 'classificazione automatica',
  gpx: 'import GPX',
  dem: 'DEM',
};

function typesForKind(kind: Feature['kind']): Record<string, { label: string }> {
  if (kind === 'area') return AREA_TYPES;
  if (kind === 'line') return LINE_TYPES;
  return POINT_TYPES;
}

function typeOptionsFor(kind: Feature['kind']): Array<{ value: string; label: string }> {
  return Object.entries(typesForKind(kind)).map(([value, spec]) => ({ value, label: spec.label }));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatArea(value: number | null): string {
  if (value == null) return 'area in pixel';
  if (value < 10_000) return `${Math.round(value).toLocaleString('it-IT')} m²`;
  return `${(value / 10_000).toFixed(2)} ha`;
}

function geometrySummary(feature: Feature, project: Parameters<typeof featureLengthMeters>[0]): string {
  if (feature.kind === 'point') {
    const p = feature.coords[0];
    return `punto a ${p.x.toFixed(1)}, ${p.y.toFixed(1)} px`;
  }
  if (feature.kind === 'line') {
    const length = featureLengthMeters(project, feature);
    return `${feature.coords.length} vertici · ${length == null ? 'lunghezza in pixel' : formatMeters(length)}`;
  }
  const area = featureAreaMeters(project, feature);
  const holes = feature.holes?.length ? ` · ${feature.holes.length} buchi` : '';
  return `${feature.coords.length} vertici${holes} · ${formatArea(area)}`;
}

export function Inspector() {
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const select = useProjectStore((state) => state.select);
  const updateFeatureFields = useProjectStore((state) => state.updateFeatureFields);
  const verifyFeatures = useProjectStore((state) => state.verifyFeatures);
  const revokeVerification = useProjectStore((state) => state.revokeVerification);
  const deleteSelected = useProjectStore((state) => state.deleteSelected);
  const duplicateSelected = useProjectStore((state) => state.duplicateSelected);
  const batchSetType = useProjectStore((state) => state.batchSetType);
  const offsetSelectedLines = useProjectStore((state) => state.offsetSelectedLines);
  const focusSelection = useProjectStore((state) => state.focusSelection);

  const selected = project.features.filter((feature) => selection.includes(feature.id));
  const single = selected.length === 1 ? selected[0] : null;
  const allSameKind = selected.length > 0 && selected.every((feature) => feature.kind === selected[0].kind);
  const kind = allSameKind ? selected[0].kind : null;
  const allVerified = selected.length > 0 && selected.every((feature) => feature.verified);
  const anyVerified = selected.some((feature) => feature.verified);
  const course = selectCourseFeatures(project);
  const courseIndex = single ? course.findIndex((feature) => feature.id === single.id) : -1;
  const provenance = single ? featureProvenance(single) : null;

  const declareVerification = async () => {
    if (!selected.length) return;
    const choice = await askVerification(selected.map((feature) => feature.name || typeSpec(feature.type).label));
    if (!choice) return;
    verifyFeatures(selected.map((feature) => feature.id), choice.note.trim());
    toast(
      selected.length === 1 ? 'Verifica dichiarata e registrata nello storico.' : `${selected.length} elementi dichiarati verificati.`,
      'success',
    );
  };

  const revoke = async () => {
    if (!selected.length) return;
    const confirmed = await confirmDialog({
      title: 'Revocare la verifica?',
      body:
        'La verifica tornerà a “non verificato”. La nota precedente e la data restano nello storico dell’elemento. ' +
        'La revoca è una registrazione manuale: non cancella il fatto che l’elemento sia stato controllato in passato.',
      confirmLabel: 'Revoca verifica',
      danger: true,
    });
    if (!confirmed) return;
    revokeVerification(selected.map((feature) => feature.id), 'Revoca manuale dell’utente');
    toast('Verifica revocata: lo storico conserva la nota precedente.', 'info');
  };

  const remove = async () => {
    if (!selected.length) return;
    const confirmed = await confirmDialog({
      title: selected.length === 1 ? 'Eliminare l’elemento?' : `Eliminare ${selected.length} elementi?`,
      body: 'La rimozione entra nella cronologia undo e può essere annullata finché non ricarichi la pagina. Ogni storico di verifica resta solo nel progetto corrente.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (confirmed) {
      deleteSelected();
      toast('Elementi eliminati.', 'info');
    }
  };

  if (!selected.length) {
    return (
      <section className="panel-section inspector-panel" aria-labelledby="inspector-empty-heading">
        <div className="section-title">
          <h3 id="inspector-empty-heading"><Icon name="info" size={16} /> Proprietà</h3>
        </div>
        <div className="inspector-empty">
          <div className="inspector-empty-mark"><Icon name="select" size={25} /></div>
          <p className="small">Nessun elemento selezionato.</p>
          <p className="tiny muted">
            Seleziona un elemento sulla mappa o nell’elenco. Shift+click per la selezione multipla; trascina uno spazio
            vuoto per il rettangolo di selezione. Doppio click su un vertice di un elemento selezionato per aggiungerne uno.
          </p>
          <ul className="shortcut-list compact-shortcuts">
            <li><kbd>V</kbd> seleziona</li>
            <li><kbd>A</kbd> area</li>
            <li><kbd>N</kbd> linea</li>
            <li><kbd>P</kbd> punto</li>
            <li><kbd>F</kbd> centra</li>
            <li><kbd>F1</kbd> aiuto</li>
          </ul>
          {project.features.length > 0 && (
            <div className="inspector-project-stats">
              <span><strong>{project.features.length}</strong> elementi</span>
              <span><strong>{project.features.filter((f) => f.verified).length}</strong> verificati</span>
              <span><strong>{project.features.filter((f) => f.source === 'vector' || f.source === 'osm').length}</strong> automatici</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="panel-section inspector-panel" aria-labelledby="inspector-heading" data-testid="inspector">
      <div className="section-title">
        <h3 id="inspector-heading"><Icon name={kind === 'area' ? 'area' : kind === 'line' ? 'line' : 'point'} size={16} /> Proprietà</h3>
        <span className="badge badge-neutral">{selected.length} selezionati</span>
      </div>

      {selected.length > 1 && (
        <div className="inspector-multi">
          <p className="tiny muted">Operazioni applicate a tutti gli elementi selezionati. I tipi vengono cambiati solo se compatibili con la geometria.</p>
          {kind && (
            <label className="field">
              <span className="field-label">Tipo comune</span>
              <select
                className="select-input"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    batchSetType(event.target.value);
                    event.target.value = '';
                  }
                }}
              >
                <option value="">Cambia tipo…</option>
                {typeOptionsFor(kind).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {single && (
        <div className="inspector-fields">
          <p className="provenance-line">
            {provenance ? provenanceText(provenance) : 'Origine: manuale'}
          </p>
          {single.verified && single.verifiedNote && (
            <p className="tiny muted">Nota di verifica: {single.verifiedNote}</p>
          )}

          <label className="field">
            <span className="field-label">Tipo</span>
            <select
              className="select-input"
              value={single.type}
              onChange={(event) => updateFeatureFields(single.id, { type: event.target.value })}
              data-testid="inspector-type"
            >
              {typeOptionsFor(single.kind).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <DebouncedTextField
            label="Nome"
            value={single.name}
            onCommit={(value) => updateFeatureFields(single.id, { name: value })}
            testId="inspector-name"
          />
          {single.type === 'control' && (
            <DebouncedTextField
              label="Codice controllo"
              value={single.code ?? ''}
              onCommit={(value) => updateFeatureFields(single.id, { code: value.slice(0, 12) })}
              placeholder="es. 101"
              testId="inspector-code"
            />
          )}
          <DebouncedTextField
            label="Note"
            value={single.notes}
            onCommit={(value) => updateFeatureFields(single.id, { notes: value })}
            multiline
            rows={3}
            placeholder="Annotazioni di rilievo, dubbi, fonte…"
            testId="inspector-notes"
          />

          <div className="inspector-meta">
            <div><span>Geometria</span><strong>{geometrySummary(single, project)}</strong></div>
            <div><span>Fonte</span><strong>{SOURCE_LABEL[single.source ?? 'manual']}</strong></div>
            {single.source === 'osm' && <div><span>Stato dati</span><strong>automatico, non verificato</strong></div>}
            {single.osmId != null && <div><span>ID OSM</span><strong className="mono">{single.osmId}</strong></div>}
            {single.type === 'control' && (
              <div><span>Ordine percorso</span><strong>{courseIndex >= 0 ? courseIndex : '—'}</strong></div>
            )}
            <div><span>Stato</span><strong>{single.verified ? 'verificato' : 'non verificato'}</strong></div>
          </div>

          {single.history.length > 0 && (
            <details className="details verification-history">
              <summary>Storico verifiche ({single.history.length})</summary>
              <ul>
                {[...single.history].reverse().map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className={`history-action history-${event.action}`}>
                      {event.action === 'verified' ? 'Verifica' : 'Revoca'}
                    </span>
                    <span className="tiny muted">{formatDate(event.at)} · {event.reason}</span>
                    {event.note && <span className="tiny">{event.note}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {selected.length > 1 && (
        <div className="inspector-selection-list">
          <p className="tiny muted">Selezione multipla: modifica nome e note singolarmente dall’elenco.</p>
          <ul>
            {selected.slice(0, 8).map((feature) => (
              <li key={feature.id}>
                <button type="button" className="text-link" onClick={() => select([feature.id])}>
                  {feature.name || typeSpec(feature.type).label}
                </button>
                <span className="tiny muted">{feature.verified ? 'verificato' : 'non verificato'}</span>
              </li>
            ))}
            {selected.length > 8 && <li className="tiny muted">+{selected.length - 8} altri</li>}
          </ul>
        </div>
      )}

      <div className="inspector-actions">
        {!allVerified && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => void declareVerification()} data-testid="verify-button">
            Dichiara verificato
          </button>
        )}
        {anyVerified && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void revoke()} data-testid="revoke-button">
            Revoca verifica
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={() => focusSelection()}>
          <Icon name="fit" size={15} /> Centra
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => duplicateSelected()} disabled={selected.some((f) => f.type === 'start' || f.type === 'finish')}>
          <Icon name="copy" size={15} /> Duplica
        </button>
        {kind === 'line' && (
          <>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => offsetSelectedLines(10)} title="Sposta il tracciato selezionato di 10 px per creare un sentiero parallelo">
              Sposta +10 px
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => offsetSelectedLines(-10)} title="Sposta il tracciato selezionato di −10 px per creare un sentiero parallelo">
              Sposta −10 px
            </button>
          </>
        )}
        <button type="button" className="btn btn-danger btn-small" onClick={() => void remove()} data-testid="delete-feature">
          <Icon name="trash" size={15} /> Elimina
        </button>
      </div>

      <p className="tiny muted">
        La verifica è una dichiarazione personale e viene revocata da qualsiasi modifica geometrica.
      </p>
    </section>
  );
}
