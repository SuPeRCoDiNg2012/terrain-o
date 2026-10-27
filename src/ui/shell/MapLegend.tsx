import { AREA_TYPES, LINE_TYPES, POINT_TYPES } from '../../model/constants';
import { featureStyle, projectStandard, symbolCode } from '../../model/mapSymbols';
import { useProjectStore } from '../../store/projectStore';
import { CLASS_COLORS } from '../../classify/classify';
import { Icon } from '../components/Icon';
import { useLayoutStore } from './layoutStore';

const AREA_KEYS = ['forest', 'thicket', 'open', 'water', 'building', 'artificial'];
const LINE_KEYS = ['path', 'road', 'stream', 'fence'];
const POINT_KEYS = ['tree', 'start', 'control', 'finish'];

export function MapLegend() {
  const visible = useLayoutStore((state) => state.legend);
  const setLegend = useLayoutStore((state) => state.setLegend);
  const standard = useProjectStore((state) => projectStandard(state.project));
  if (!visible) return null;
  const code = (type: string) => symbolCode(type, standard);

  return (
    <aside className="map-legend" aria-label="Legenda">
      <div className="map-legend-head">
        <strong>Legenda</strong>
        <button type="button" className="map-legend-close" onClick={() => setLegend(false)} aria-label="Chiudi legenda">
          <Icon name="x" size={12} />
        </button>
      </div>
      <div className="map-legend-group">
        <span className="map-legend-title">Aree</span>
        {AREA_KEYS.map((key) => {
          const spec = AREA_TYPES[key];
          if (!spec) return null;
          return (
            <span className="map-legend-item" key={key}>
              <i className="legend-swatch" style={{ background: spec.fill ?? spec.color, borderColor: spec.color }} />
              {spec.short}
              {code(key) && <span className="map-legend-code">{code(key)}</span>}
            </span>
          );
        })}
      </div>
      <div className="map-legend-group">
        <span className="map-legend-title">Linee</span>
        {LINE_KEYS.map((key) => {
          const spec = LINE_TYPES[key];
          if (!spec) return null;
          return (
            <span className="map-legend-item" key={key}>
              <i
                className="legend-line"
                style={{
                  background: 'transparent',
                  borderTop: `${Math.max(1, Math.min(3, featureStyle(key, standard).strokeWidth))}px ${featureStyle(key, standard).dash ? 'dashed' : 'solid'} ${featureStyle(key, standard).stroke}`,
                }}
              />
              {spec.short}
              {code(key) && <span className="map-legend-code">{code(key)}</span>}
            </span>
          );
        })}
      </div>
      <div className="map-legend-group">
        <span className="map-legend-title">Punti</span>
        {POINT_KEYS.map((key) => {
          const spec = POINT_TYPES[key];
          if (!spec) return null;
          return (
            <span className="map-legend-item" key={key}>
              <i className="legend-dot" style={{ background: spec.color }} />
              {spec.short}
              {code(key) && <span className="map-legend-code">{code(key)}</span>}
            </span>
          );
        })}
      </div>
      <div className="map-legend-group">
        <span className="map-legend-title">Classificazione</span>
        {[1, 2, 3, 4].map((id) => (
          <span className="map-legend-item" key={id}>
            <i className="legend-swatch" style={{ background: CLASS_COLORS[id as 1 | 2 | 3 | 4].css }} />
            {CLASS_COLORS[id as 1 | 2 | 3 | 4].label.replace('Possibile ', '')}
          </span>
        ))}
      </div>
      <div className="map-legend-provenance">
        <span><i className="legend-border dashed" /> automatico</span>
        <span><i className="legend-border solid" /> manuale</span>
        <span><i className="legend-border solid check" /> verificato</span>
      </div>
    </aside>
  );
}
