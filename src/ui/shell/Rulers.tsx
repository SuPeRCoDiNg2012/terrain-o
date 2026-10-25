import { useMemo } from 'react';
import type { Project } from '../../model/types';
import type { ViewState } from '../../store/projectStore';
import type { CursorInfo } from '../uiStore';
import { metersPerPixel, pixelToWgs84 } from '../../geo/projection';
import type { RulerUnit } from './layoutStore';

interface RulersProps {
  view: ViewState;
  viewport: { width: number; height: number };
  project: Project;
  unit: RulerUnit;
  cursor: CursorInfo | null;
}

const STEP_PX = 88;

function formatValue(value: number, unit: RulerUnit): string {
  if (!Number.isFinite(value)) return '';
  if (unit === 'deg') return value.toFixed(4);
  const abs = Math.abs(value);
  if (unit === 'm') return abs >= 100 ? value.toFixed(0) : abs >= 10 ? value.toFixed(1) : value.toFixed(2);
  return abs >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function Rulers({ view, viewport, project, unit, cursor }: RulersProps) {
  const mpp = metersPerPixel(project);
  const ticks = useMemo(() => {
    const top: Array<{ screen: number; label: string }> = [];
    const left: Array<{ screen: number; label: string }> = [];
    if (viewport.width < 10 || viewport.height < 10) return { top, left };

    for (let screen = 0; screen <= viewport.width; screen += STEP_PX) {
      const worldX = (screen - view.tx) / view.scale;
      let label = '';
      if (unit === 'px') label = formatValue(worldX, 'px');
      else if (unit === 'm') label = mpp ? formatValue(worldX * mpp, 'm') : '—';
      else {
        const geo = pixelToWgs84(project, { x: worldX, y: (viewport.height / 2 - view.ty) / view.scale });
        label = geo ? formatValue(geo[0], 'deg') : '—';
      }
      top.push({ screen, label });
    }

    for (let screen = 0; screen <= viewport.height; screen += STEP_PX) {
      const worldY = (screen - view.ty) / view.scale;
      let label = '';
      if (unit === 'px') label = formatValue(worldY, 'px');
      else if (unit === 'm') label = mpp ? formatValue(worldY * mpp, 'm') : '—';
      else {
        const geo = pixelToWgs84(project, { x: (viewport.width / 2 - view.tx) / view.scale, y: worldY });
        label = geo ? formatValue(geo[1], 'deg') : '—';
      }
      left.push({ screen, label });
    }
    return { top, left };
  }, [mpp, project, unit, view.scale, view.tx, view.ty, viewport.height, viewport.width]);

  const cursorX = cursor ? cursor.px * view.scale + view.tx : null;
  const cursorY = cursor ? cursor.py * view.scale + view.ty : null;

  return (
    <>
      <div className="ruler ruler-top" aria-hidden="true">
        <span className="ruler-corner">{unit === 'px' ? 'px' : unit === 'm' ? 'm' : 'deg'}</span>
        {ticks.top.map((tick) => (
          <span className="ruler-tick ruler-tick-x" key={`t-${tick.screen}`} style={{ left: tick.screen }}>
            <i />
            <b>{tick.label}</b>
          </span>
        ))}
        {cursorX != null && <span className="ruler-cursor ruler-cursor-x" style={{ left: cursorX }} />}
      </div>
      <div className="ruler ruler-left" aria-hidden="true">
        {ticks.left.map((tick) => (
          <span className="ruler-tick ruler-tick-y" key={`l-${tick.screen}`} style={{ top: tick.screen }}>
            <i />
            <b>{tick.label}</b>
          </span>
        ))}
        {cursorY != null && <span className="ruler-cursor ruler-cursor-y" style={{ top: cursorY }} />}
      </div>
    </>
  );
}
