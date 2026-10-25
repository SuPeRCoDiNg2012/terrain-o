import { useProjectStore } from '../../store/projectStore';
import { Icon } from '../components/Icon';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function HistoryPanel() {
  const past = useProjectStore((state) => state.past);
  const future = useProjectStore((state) => state.future);
  const project = useProjectStore((state) => state.project);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);

  const steps = [...past].reverse().slice(0, 40);

  return (
    <div className="shell-panel">
      <div className="shell-panel-head">
        <h3>Cronologia</h3>
        <div className="shell-actions">
          <button type="button" className="tiny-button" onClick={undo} disabled={!past.length} title="Annulla (Ctrl+Z)">
            <Icon name="undo" size={14} /> Annulla
          </button>
          <button type="button" className="tiny-button" onClick={redo} disabled={!future.length} title="Ripeti (Ctrl+Shift+Z)">
            <Icon name="redo" size={14} /> Ripeti
          </button>
        </div>
      </div>

      <p className="shell-note">
        {past.length} passi indietro · {future.length} passi avanti. Ogni modifica geometrica resta nella cronologia.
      </p>

      <ol className="history-list" aria-label="Stati precedenti">
        <li className="history-item current">
          <span className="history-dot" aria-hidden="true" />
          <div className="history-copy">
            <strong>Stato corrente</strong>
            <span className="mono">{formatTime(project.updatedAt)} · {project.features.length} elementi</span>
          </div>
        </li>
        {steps.map((state, index) => (
          <li className="history-item" key={`${state.updatedAt}-${index}`}>
            <span className="history-dot" aria-hidden="true" />
            <div className="history-copy">
              <strong>Revisione −{index + 1}</strong>
              <span className="mono">{formatTime(state.updatedAt)} · {state.features.length} elementi</span>
            </div>
          </li>
        ))}
      </ol>

      {future.length > 0 && (
        <p className="shell-note">
          Sono disponibili {future.length} revisioni annullate: “Ripeti” le riapplica in ordine.
        </p>
      )}
    </div>
  );
}
