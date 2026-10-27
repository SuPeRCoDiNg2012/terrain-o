import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { LayerId } from '../../model/types';
import { useProjectStore } from '../../store/projectStore';
import { LAYER_DEFS } from '../../model/constants';
import { translate, useLocale, useT } from '../../i18n';
import { Icon } from './Icon';

function layerCount(id: LayerId, project: ReturnType<typeof useProjectStore.getState>['project'], locale: 'it' | 'en'): string {
  const tr = (source: string, vars?: Record<string, string | number>) => translate(locale, source, vars);
  if (id === 'source') return project.image ? tr('1 immagine') : tr('nessuna');
  if (id === 'classification') return project.classification ? `${project.classification.width}×${project.classification.height}` : tr('assente');
  if (id === 'contours') return tr('{n} curve', { n: project.contours.length });
  if (id === 'osm') return tr('{n} elementi OSM', { n: project.osmWays.length });
  if (id === 'features') {
    return tr('{n} elementi', {
      n: project.features.filter(
        (f) => f.kind !== 'point' || !['start', 'control', 'finish'].includes(f.type),
      ).length,
    });
  }
  return tr('{n} punti', { n: project.features.filter((f) => f.kind === 'point' && ['start', 'control', 'finish'].includes(f.type)).length });
}

export function LayersPanel() {
  const project = useProjectStore((state) => state.project);
  const setLayerVisible = useProjectStore((state) => state.setLayerVisible);
  const setLayerOpacity = useProjectStore((state) => state.setLayerOpacity);
  const reorderLayer = useProjectStore((state) => state.reorderLayer);
  const [dragging, setDragging] = useState<LayerId | null>(null);
  const [dragOver, setDragOver] = useState<LayerId | null>(null);
  const t = useT();
  const locale = useLocale();

  const display = [...project.layerOrder].reverse();
  const handleDrop = (target: LayerId) => {
    if (!dragging || dragging === target) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const without = project.layerOrder.filter((id) => id !== dragging);
    const targetIndex = without.indexOf(target);
    if (targetIndex >= 0) reorderLayer(dragging, targetIndex);
    setDragging(null);
    setDragOver(null);
  };

  return (
    <section className="panel-section layers-panel" aria-labelledby="layers-heading">
      <div className="section-title">
        <h3 id="layers-heading"><Icon name="layers" size={16} /> {t('Livelli')}</h3>
        <span className="tiny muted">{t('trascina o usa le frecce')}</span>
      </div>
      <p className="tiny muted">
        {t("L'ordine è dal livello più alto al più basso. Ogni livello mantiene visibilità e opacità nel progetto.")}
      </p>
      <ul className="layer-list">
        {display.map((id, displayIndex) => {
          const definition = LAYER_DEFS[id];
          const layer = project.layers[id];
          const actualIndex = project.layerOrder.indexOf(id);
          return (
            <li
              key={id}
              className={`layer-row ${layer.visible ? '' : 'layer-hidden'} ${dragging === id ? 'dragging' : ''} ${dragOver === id ? 'drag-over' : ''}`}
              draggable
              onDragStart={(event) => {
                setDragging(id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(id);
              }}
              onDragLeave={() => setDragOver((current) => current === id ? null : current)}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(id);
              }}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}
            >
              <span className="layer-grip" aria-hidden="true" title={t('Trascina per riordinare')}>
                <Icon name="grip" size={15} />
              </span>
              <button
                type="button"
                className="icon-button layer-eye"
                onClick={() => setLayerVisible(id, !layer.visible)}
                aria-pressed={layer.visible}
                aria-label={t(layer.visible ? 'Nascondi livello {name}' : 'Mostra livello {name}', { name: t(definition.label) })}
              >
                <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={17} />
              </button>
              <div className="layer-copy">
                <div className="layer-title-line">
                  <strong>{t(definition.label)}</strong>
                </div>
                <span className="tiny muted">{layerCount(id, project, locale)} · {t(definition.hint)}</span>
                <div className="layer-opacity">
                  <label htmlFor={`opacity-${id}`} className="sr-only">{t('Opacità {name}', { name: t(definition.label) })}</label>
                  <input
                    id={`opacity-${id}`}
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(layer.opacity * 100)}
                    onChange={(event) => setLayerOpacity(id, Number(event.target.value) / 100)}
                    style={{ '--range-fill': `${Math.round(layer.opacity * 100)}%` } as CSSProperties}
                  />
                  <span className="mono tiny">{Math.round(layer.opacity * 100)}%</span>
                </div>
              </div>
              <div className="layer-order-buttons">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => reorderLayer(id, actualIndex + 1)}
                  disabled={actualIndex === project.layerOrder.length - 1}
                  aria-label={t('Porta {name} più in alto', { name: t(definition.label) })}
                  title={t('Sposta più in alto')}
                >
                  <Icon name="up" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => reorderLayer(id, actualIndex - 1)}
                  disabled={actualIndex === 0}
                  aria-label={t('Porta {name} più in basso', { name: t(definition.label) })}
                  title={t('Sposta più in basso')}
                >
                  <Icon name="down" size={14} />
                </button>
              </div>
              <span className="sr-only">{t('Livello {n} dall’alto', { n: displayIndex + 1 })}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
