import { Modal } from './Modal';
import { Icon } from './Icon';
import { APP_VERSION, PRELIMINARY_WARNING, PROVENANCE_NOTES } from '../../model/constants';

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['V'], action: 'Selezione oggetto' },
  { keys: ['M'], action: 'Selezione rettangolare' },
  { keys: ['L'], action: 'Lazo (libero o poligonale)' },
  { keys: ['A'], action: 'Disegna area' },
  { keys: ['N'], action: 'Disegna linea' },
  { keys: ['P'], action: 'Aggiungi punto controllo' },
  { keys: ['H'], action: 'Sposta vista' },
  { keys: ['Z'], action: 'Zoom (Alt+clic riduce)' },
  { keys: ['I'], action: 'Contagocce' },
  { keys: ['C'], action: 'Calibra la scala con due punti' },
  { keys: ['F'], action: 'Centra sugli elementi selezionati' },
  { keys: ['Esc'], action: 'Annulla il disegno o torna a Selezione' },
  { keys: ['Invio'], action: 'Chiude l’area o termina la linea' },
  { keys: ['Canc'], action: 'Elimina la selezione, con conferma' },
  { keys: ['Frecce'], action: 'Sposta la selezione di 1 px' },
  { keys: ['Shift', 'Frecce'], action: 'Sposta la selezione di 10 px' },
  { keys: ['Spazio', 'trascina'], action: 'Pan temporaneo' },
  { keys: ['Ctrl', 'Z'], action: 'Annulla' },
  { keys: ['Ctrl', 'Shift', 'Z'], action: 'Ripeti (anche Ctrl+Y)' },
  { keys: ['Ctrl', 'A'], action: 'Seleziona tutti gli elementi' },
  { keys: ['Ctrl', 'D'], action: 'Deseleziona' },
  { keys: ['Ctrl', 'Shift', 'D'], action: 'Duplica la selezione (azzera la verifica)' },
  { keys: ['Ctrl', 'S'], action: 'Salva subito il progetto locale' },
  { keys: ['Ctrl', 'O'], action: 'Apri immagine o progetto' },
  { keys: ['Ctrl', 'E'], action: 'Apri la finestra di esportazione' },
  { keys: ['Ctrl', '0'], action: 'Adatta l’immagine alla vista' },
  { keys: ['Ctrl', '1'], action: 'Zoom 100%' },
  { keys: ['Ctrl', '+'], action: 'Ingrandisci' },
  { keys: ['Ctrl', '-'], action: 'Riduci' },
  { keys: ['F1'], action: 'Apri questo aiuto' },
];

export function HelpModal({
  onClose,
  onReplayOnboarding,
}: {
  onClose: () => void;
  onReplayOnboarding: () => void;
}) {
  return (
    <Modal
      title="Aiuto e limiti del prodotto"
      kicker={`Terrain / O · versione ${APP_VERSION}`}
      onClose={onClose}
      wide
      footer={
        <div className="help-footer">
          <button type="button" className="btn btn-ghost" onClick={onReplayOnboarding}>
            <Icon name="info" size={16} /> Rivedi l’introduzione
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Chiudi</button>
        </div>
      }
    >
      <div className="help-lead">
        <div className="help-lead-mark"><Icon name="shield" size={26} /></div>
        <div>
          <strong>La mappa prodotta è una bozza preliminare.</strong>
          <p>
            Terrain / O aiuta a interpretare un’ortofoto georeferenziata e a preparare una bozza di carta. Non dichiara
            percorribilità, vegetazione sotto copertura, sicurezza del terreno, quota di precisione, ostacoli non visibili,
            nord geografico verificato o conformità IOF.
          </p>
          <p className="tiny warning-text">{PRELIMINARY_WARNING}</p>
        </div>
      </div>

      <section className="help-section">
        <h3>I quattro livelli di provenienza</h3>
        <div className="help-provenance">
          {PROVENANCE_NOTES.map((note) => (
            <div key={note.label} className={`provenance-card tone-${note.tone}`}>
              <strong>{note.label}</strong>
              <p>{note.text}</p>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          La verifica è una dichiarazione esplicita dell’utente. Modificare la geometria di un elemento verificato revoca
          automaticamente la verifica e conserva la nota precedente nello storico, con data e motivo.
        </p>
      </section>

      <section className="help-section">
        <h3>Flusso di lavoro consigliato</h3>
        <ol className="help-steps">
          <li><strong>Importa</strong> JPG/PNG insieme a world file e .prj. Senza world file le misure restano in pixel.</li>
          <li><strong>Controlla la georeferenziazione</strong> nel pannello Progetto. Se manca la proiezione, la scala non è metrica.</li>
          <li><strong>Automatizza</strong> con AI → Elaborazione automatica completa: OSM, classificazione, vettorizzazione, AI, curve e livello simboli in un solo comando. Gli avvisi non bloccano il lavoro già completato.</li>
          <li><strong>Interpreta</strong> classificazione, AI, OSM e DEM come indizi sperimentali, non come verità.</li>
          <li><strong>Disegna e correggi</strong> aree, linee e percorso con snap ai vertici o alla griglia.</li>
          <li><strong>Verifica</strong> sul campo solo gli elementi che hai realmente controllato; dichiaralo nel pannello Proprietà.</li>
          <li><strong>Esporta</strong> PNG, SVG, PDF, OMAP, GeoJSON, GPX o KML. Controlla le avvertenze incluse.</li>
        </ol>
      </section>

      <section className="help-section">
        <h3>Scorciatoie da tastiera</h3>
        <div className="shortcut-grid">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action} className="shortcut-row">
              <span className="shortcut-keys">
                {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </span>
              <span>{shortcut.action}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          Su touch: pinch per zoom, trascinamento a due dita per il pan, tap singolo per selezionare o disegnare.
          Il doppio tap sulla mappa non è usato per evitare conflitti con lo zoom di sistema.
        </p>
      </section>

      <section className="help-section">
        <h3>Calibrazione, scala e coordinate</h3>
        <p className="small">
          Con world file e proiezione valida la scala è automatica. La calibrazione manuale a due punti è prioritaria; con
          più misure la scala è stimata ai minimi quadrati. Se non c’è né georeferenziazione né calibrazione, tutte le misure
          restano in pixel e questo è indicato nell’interfaccia, negli export e nei metadati.
        </p>
        <p className="tiny muted">
          Il nord mostrato è solo l’orientamento della sorgente. Le coordinate del cursore possono essere lette in pixel,
          WGS84 e EPSG:3857 quando la georeferenziazione è disponibile.
        </p>
      </section>

      <section className="help-section">
        <h3>Dati, formati e spazio locale</h3>
        <div className="help-columns">
          <div>
            <h4>Importazione</h4>
            <ul className="plain-list">
              <li>JPG/JPEG/PNG; ridimensionamento oltre 4096 px con conferma.</li>
              <li>World file .jgw, .jpgw, .pgw, .pngw, .wld.</li>
              <li>Proiezione da .prj o .jpg.aux (WKT).</li>
              <li>Progetti .terrain-o.json e waypoint GPX.</li>
            </ul>
          </div>
          <div>
            <h4>Esportazione</h4>
            <ul className="plain-list">
              <li>PNG 1×/2×/3× con barra metrica e attribuzioni.</li>
              <li>SVG vettoriale, PDF A4/A3.</li>
              <li>OMAP XML v9 (OpenOrienteering Mapper 0.9.x, simboli semplificati, incluso il punto albero AI).</li>
              <li>GeoJSON, GPX, KML e progetto .terrain-o.json.</li>
            </ul>
          </div>
        </div>
        <p className="tiny muted">
          I dati restano in IndexedDB sul dispositivo: nessun account, nessuna sincronizzazione, nessun caricamento
          dell’ortofoto su server. Immagine e classificazione sono archiviate separatamente dal progetto leggero.
          Esporta periodicamente il file di progetto: cancellare i dati del browser elimina anche i progetti locali.
        </p>
      </section>

      <section className="help-section">
        <h3>Fonti automatiche e limiti noti</h3>
        <ul className="plain-list">
          <li><strong>OSM</strong>: Overpass API, © OpenStreetMap contributors (ODbL). Dati potenzialmente incompleti o disallineati.</li>
          <li><strong>DEM</strong>: AWS Terrain Tiles (Mapzen Terrarium, circa 30 m). Quote indicative, non rilievo.</li>
          <li><strong>Classificazione</strong>: pipeline locale L*a*b* + superpixel SLIC + regole interpretabili con confidenza.</li>
          <li><strong>Riconoscimento AI</strong>: random forest locale addestrato su OSM, elementi manuali e pseudo-etichette; dipende dalla qualità degli esempi e non è una verità sul terreno. Il livello simboli unifica automaticamente AI, OSM e vettorizzazione — aree, linee e punti — senza toccare elementi manuali o verificati.</li>
          <li>Nessun import GeoTIFF, nessuna navigazione GPS, nessuna collaborazione in tempo reale.</li>
          <li>Nessuna garanzia di conformità agli standard IOF: i simboli OMAP sono una base semplificata.</li>
        </ul>
      </section>
    </Modal>
  );
}
