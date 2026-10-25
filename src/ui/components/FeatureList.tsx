import { useEffect, useMemo, useState } from 'react';
import type { Feature } from '../../model/types';
import { useProjectStore } from '../../store/projectStore';
import { typeSpec } from '../../model/constants';
import { Icon } from './Icon';

type Filter = 'all' | 'unverified' | 'verified' | 'auto' | 'manual';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tutti' },
  { id: 'unverified', label: 'Non verificati' },
  { id: 'verified', label: 'Verificati' },
  { id: 'auto', label: 'Automatici' },
  { id: 'manual', label: 'Manuali' },
];

function sourceLabel(feature: Feature): string {
  if (feature.source === 'osm') return 'OSM';
  if (feature.source === 'vector') return 'auto';
  if (feature.source === 'gpx') return 'GPX';
  if (feature.source === 'dem') return 'DEM';
  return 'manuale';
}

export function FeatureList() {
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const select = useProjectStore((state) => state.select);
  const toggleSelect = useProjectStore((state) => state.toggleSelect);
  const focusSelection = useProjectStore((state) => state.focusSelection);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(200);

  useEffect(() => setLimit(200), [query, filter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return project.features.filter((feature) => {
      if (filter === 'verified' && !feature.verified) return false;
      if (filter === 'unverified' && feature.verified) return false;
      if (filter === 'auto' && !(feature.source === 'vector' || feature.source === 'osm')) return false;
      if (filter === 'manual' && feature.source !== 'manual' && feature.source !== 'gpx') return false;
      if (!q) return true;
      const spec = typeSpec(feature.type);
      return (
        feature.name.toLowerCase().includes(q) ||
        feature.notes.toLowerCase().includes(q) ||
        (feature.code ?? '').toLowerCase().includes(q) ||
        spec.label.toLowerCase().includes(q) ||
        feature.type.toLowerCase().includes(q)
      );
    });
  }, [project.features, query, filter]);

  const counts = {
    all: project.features.length,
    verified: project.features.filter((f) => f.verified).length,
    unverified: project.features.filter((f) => !f.verified).length,
    auto: project.features.filter((f) => f.source === 'vector' || f.source === 'osm').length,
    manual: project.features.filter((f) => f.source === 'manual' || f.source === 'gpx').length,
  };

  const visible = filtered.slice(0, limit);

  return (
    <section className="panel-section feature-panel" aria-labelledby="features-heading">
      <div className="section-title">
        <h3 id="features-heading"><Icon name="search" size={16} /> Elementi <span className="count-pill">{project.features.length}</span></h3>
        {selection.length > 0 && (
          <button type="button" className="text-link" onClick={() => select([])}>Deseleziona</button>
        )}
      </div>
      <label className="search-field">
        <span className="sr-only">Cerca elementi</span>
        <Icon name="search" size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca nome, codice, tipo…" />
        {query && (
          <button type="button" className="icon-button" aria-label="Cancella ricerca" onClick={() => setQuery('')}>
            <Icon name="x" size={13} />
          </button>
        )}
      </label>
      <div className="filter-row" role="group" aria-label="Filtra elementi">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter-chip ${filter === item.id ? 'active' : ''}`}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label} <span>{counts[item.id]}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="tiny muted empty-list">{project.features.length ? 'Nessun elemento corrisponde ai filtri.' : 'Nessun elemento cartografico. Usa gli strumenti area/linea/punto.'}</p>
      ) : (
        <>
          <ul className="feature-list" aria-label="Elenco elementi">
            {visible.map((feature) => {
              const spec = typeSpec(feature.type);
              const selected = selection.includes(feature.id);
              const label = feature.type === 'control' && feature.code
                ? `${spec.label} ${feature.code}`
                : feature.name || spec.label;
              return (
                <li key={feature.id}>
                  <div className={`feature-row ${selected ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="feature-select"
                      aria-pressed={selected}
                      onClick={(event) => {
                        if (event.shiftKey) toggleSelect(feature.id);
                        else select([feature.id]);
                      }}
                      onDoubleClick={() => {
                        select([feature.id]);
                        focusSelection();
                      }}
                      title="Click per selezionare, Shift+click per multiselezione, doppio click per centrare"
                    >
                      <span className={`feature-swatch swatch-${feature.kind}`} style={{ background: spec.fill ?? spec.color, borderColor: spec.color }} aria-hidden="true" />
                      <span className="feature-copy">
                        <span className="feature-title-line">
                          <strong>{label}</strong>
                          {feature.verified
                            ? <span className="badge badge-verified">verificato</span>
                            : <span className="badge badge-unverified">non verificato</span>}
                        </span>
                        <span className="feature-meta">
                          <span>{spec.label}</span>
                          <span className={`source-pill source-${feature.source ?? 'manual'}`}>{sourceLabel(feature)}</span>
                          {feature.type === 'control' && feature.order != null && <span>ord. {feature.order}</span>}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button feature-focus"
                      aria-label={`Centra ${label}`}
                      title="Centra sulla mappa"
                      onClick={() => {
                        select([feature.id]);
                        requestAnimationFrame(() => focusSelection());
                      }}
                    >
                      <Icon name="compass" size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length > limit && (
            <button type="button" className="btn btn-ghost btn-small full-width" onClick={() => setLimit(limit + 200)}>
              Mostra altri {Math.min(200, filtered.length - limit)} di {filtered.length}
            </button>
          )}
          <p className="tiny muted">
            Shift+click per selezione multipla. La selezione non modifica lo stato di verifica.
          </p>
        </>
      )}
    </section>
  );
}
