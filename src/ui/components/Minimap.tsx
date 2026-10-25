import { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { get2d } from '../../render/canvas';
import { useUiStore } from '../uiStore';

const MAP_W = 172;
const MAP_H = 118;

export function Minimap({ onClose }: { onClose?: () => void }) {
  const project = useProjectStore((state) => state.project);
  const sourceImage = useProjectStore((state) => state.sourceImage);
  const view = useProjectStore((state) => state.view);
  const viewport = useProjectStore((state) => state.viewport);
  const setView = useProjectStore((state) => state.setView);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setCursor = useUiStore((state) => state.setCursor);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project.image) return;
    canvas.width = MAP_W * 2;
    canvas.height = MAP_H * 2;
    const ctx = get2d(canvas);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = '#d9d4c7';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    const scale = Math.min(MAP_W / project.image.width, MAP_H / project.image.height);
    const offsetX = (MAP_W - project.image.width * scale) / 2;
    const offsetY = (MAP_H - project.image.height * scale) / 2;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    if (sourceImage) ctx.drawImage(sourceImage, 0, 0, project.image.width, project.image.height);
    else {
      ctx.fillStyle = '#d9d4c7';
      ctx.fillRect(0, 0, project.image.width, project.image.height);
    }
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.5 / scale;
    const viewWorld = {
      x: -view.tx / view.scale,
      y: -view.ty / view.scale,
      w: viewport.width / view.scale,
      h: viewport.height / view.scale,
    };
    ctx.strokeRect(viewWorld.x, viewWorld.y, viewWorld.w, viewWorld.h);
    ctx.fillStyle = 'rgba(14,165,233,0.12)';
    ctx.fillRect(viewWorld.x, viewWorld.y, viewWorld.w, viewWorld.h);
    ctx.restore();
  }, [project.image, project.layerOrder, sourceImage, view, viewport]);

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
        <span>Minimappa</span>
        {onClose && (
          <button type="button" className="icon-button" aria-label="Nascondi minimappa" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        style={{ width: MAP_W, height: MAP_H }}
        onClick={(event) => jump(event.clientX, event.clientY)}
        aria-label="Minimappa: clicca per centrare la vista"
        role="img"
      />
    </div>
  );
}
