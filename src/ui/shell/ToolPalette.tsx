import type { Tool } from '../../store/projectStore';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import { Icon, type IconName } from '../components/Icon';

interface ToolSpec {
  id: Tool;
  label: string;
  shortcut: string;
  icon: IconName;
  disabled?: boolean;
  hint?: string;
}

const GROUPS: Array<{ label: string; tools: ToolSpec[] }> = [
  {
    label: 'Selezione',
    tools: [
      { id: 'select', label: 'Selezione oggetto', shortcut: 'V', icon: 'select' },
      { id: 'marquee', label: 'Selezione rettangolare', shortcut: 'M', icon: 'marquee' },
      { id: 'lasso', label: 'Lazo', shortcut: 'L', icon: 'lasso' },
    ],
  },
  {
    label: 'Disegno',
    tools: [
      { id: 'draw-area', label: 'Area', shortcut: 'A', icon: 'area' },
      { id: 'draw-line', label: 'Linea', shortcut: 'N', icon: 'line' },
      { id: 'draw-point', label: 'Punto', shortcut: 'P', icon: 'point' },
      { id: 'text', label: 'Testo', shortcut: 'T', icon: 'text', disabled: true, hint: 'non disponibile in questa build' },
    ],
  },
  {
    label: 'Navigazione',
    tools: [
      { id: 'pan', label: 'Sposta vista', shortcut: 'H', icon: 'pan' },
      { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: 'zoom' },
    ],
  },
  {
    label: 'Misura e campione',
    tools: [
      { id: 'calibrate', label: 'Calibra scala', shortcut: 'C', icon: 'calibrate' },
      { id: 'eyedropper', label: 'Contagocce', shortcut: 'I', icon: 'eyedropper' },
    ],
  },
];

export function ToolPalette() {
  const activeTool = useProjectStore((state) => state.activeTool);
  const setTool = useProjectStore((state) => state.setTool);
  const hasImage = useProjectStore((state) => Boolean(state.project.image));
  const t = useT();

  return (
    <div className="tool-palette" role="toolbar" aria-label={t('Palette strumenti')} aria-orientation="vertical">
      <div className="tool-palette-grip" aria-hidden="true">
        <Icon name="grip" size={14} />
      </div>
      {GROUPS.map((group) => (
        <div className="tool-group-block" key={group.label} role="group" aria-label={t(group.label)}>
          <span className="tool-group-label">{t(group.label)}</span>
          {group.tools.map((tool) => {
            const disabled = tool.disabled || ((tool.id === 'calibrate' || tool.id === 'draw-area' || tool.id === 'draw-line' || tool.id === 'draw-point' || tool.id === 'marquee' || tool.id === 'lasso' || tool.id === 'eyedropper') && !hasImage);
            return (
              <button
                key={tool.id}
                type="button"
                className={`palette-tool ${activeTool === tool.id ? 'active' : ''}`}
                aria-pressed={activeTool === tool.id}
                aria-label={t(tool.label)}
                title={`${t(tool.label)} (${tool.shortcut})${disabled ? ` — ${t(tool.hint ?? 'richiede un’immagine')}` : ''}`}
                disabled={disabled}
                onClick={() => setTool(tool.id)}
                data-testid={`tool-${tool.id}`}
              >
                <Icon name={tool.icon} size={18} />
                <span className="palette-tool-key" aria-hidden="true">{tool.shortcut}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
