import { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { get2d } from '../../render/canvas';
import { useUiStore } from '../uiStore';
import { useThemeStore } from '../themeStore';
import { useT } from '../../i18n';
import { Icon } from './Icon';

const MAP_W = 172;
const MAP_H = 118;

export function Minimap({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const project = useProjectStore((state) => state.project);
  const sourceImage = useProjectStore((state) => state.sourceImage);
  const view = useProjectStore((state) => state.view);
  const viewport = useProjectStore((state) => state.viewport);
  const setView = useProjectStore((state) => state.setView);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setCursor = useUiStore((state) => state.setCursor);
  // The minimap samples theme colours from the DOM when it draws, so it must
  // repaint when the theme changes and not only when the view moves.
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project.image) return;
    canvas.width = MAP_W * 2;
    canvas.height = MAP_H * 2;
    const ctx = get2d(canvas);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    // Il fondo della minimappa segue il tema: la vecchia carta beige era
    // l'ultima tinta fuori palette rimasta nell'interfaccia.
    const tokens = getComputedStyle(document.documentElement);
    const canvasColor = tokens.getPropertyValue('--surface-canvas').trim() || '#11171d';
    const accent = tokens.getPropertyValue('--map-accent').trim() || '#6cbde9';
    const accentFill = tokens.getPropertyValue('--map-accent-fill').trim() || 'rgba(108,189,233,0.12)';
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    const scale = Math.min(MAP_W / project.image.width, MAP_H / project.image.height);
    const offsetX = (MAP_W - project.image.width * scale) / 2;
    const offsetY = (MAP_H - project.image.height * scale) / 2;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    if (sourceImage) ctx.drawImage(sourceImage, 0, 0, project.image.width, project.image.height);
    else {
      ctx.fillStyle = canvasColor;
      ctx.fillRect(0, 0, project.image.width, project.image.height);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 / scale;
    const viewWorld = {
      x: -view.tx / view.scale,
      y: -view.ty / view.scale,
      w: viewport.width / view.scale,
      h: viewport.height / view.scale,
    };
    ctx.strokeRect(viewWorld.x, viewWorld.y, viewWorld.w, viewWorld.h);
    ctx.fillStyle = accentFill;
    ctx.fillRect(viewWorld.x, viewWorld.y, viewWorld.w, viewWorld.h);
    ctx.restore();
  }, [project.image, project.layerOrder, sourceImage, view, viewport, theme]);

  if (!project.image) return null;

  const jump = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * MAP_W;
    const py = ((clientY - rect.top) / rect.height) * MAP_H;
    const scale = Math.min(MAP_W / project.image!.width, MAP_H / project.image!.height);
    const offsetX = (MAP_W - project.image!.width * scale) / 2;
    const offsetY = (MAP_H - project.image!.height * scale) / 2;
    const worldX = (px - offsetX) / scale;
    const worldY = (py - offsetY) / scale;
    setView(
      {
        scale: view.scale,
        tx: viewport.width / 2 - worldX * view.scale,
        ty: viewport.height / 2 - worldY * view.scale,
      },
      true,
    );
    setCursor(null);
  };

  return (
    <div className="minimap" data-stage-interactive>
      <div className="minimap-header">
        <span>{t('Minimappa')}</span>
        {onClose && (
          <button type="button" className="icon-button" aria-label={t('Nascondi minimappa')} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        style={{ width: MAP_W, height: MAP_H }}
        onClick={(event) => jump(event.clientX, event.clientY)}
        aria-label={t('Minimappa: clicca per centrare la vista')}
        role="img"
      />
    </div>
  );
}
