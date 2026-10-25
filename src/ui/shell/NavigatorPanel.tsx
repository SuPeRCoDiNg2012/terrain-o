import { useProjectStore } from '../../store/projectStore';
import { Minimap } from '../components/Minimap';

export function NavigatorPanel() {
  const project = useProjectStore((state) => state.project);
  const minimapVisible = useProjectStore((state) => state.minimapVisible);
  const setMinimapVisible = useProjectStore((state) => state.setMinimapVisible);

  return (
    <div className="shell-panel">
      <div className="shell-panel-head">
        <h3>Navigatore</h3>
        <button
          type="button"
          className="tiny-button"
          onClick={() => setMinimapVisible(!minimapVisible)}
          aria-pressed={minimapVisible}
        >
          {minimapVisible ? 'Nascondi sulla mappa' : 'Mostra sulla mappa'}
        </button>
      </div>
      {project.image ? (
        <div className="navigator-frame">
          <Minimap />
        </div>
      ) : (
        <p className="shell-note">Importa un’immagine per attivare il navigatore.</p>
      )}
      <p className="shell-note">
        Il rettangolo chiaro indica la vista corrente. Clicca la miniatura per centrare la mappa.
      </p>
    </div>
  );
}
