import type { CSSProperties } from 'react';
import {
  BookOpen,
  BoxSelect,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Compass,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  GripVertical,
  Grid3x3,
  Hand,
  History,
  Image,
  Info,
  Layers,
  Lasso,
  Map,
  Menu,
  TriangleAlert,
  MousePointer2,
  Mountain,
  MoreHorizontal,
  Pentagon,
  Pipette,
  Plus,
  Minus,
  Redo2,
  RefreshCw,
  Route,
  Ruler,
  Scan,
  Search,
  ShieldCheck,
  Spline,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
  X,
  ZoomIn,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type IconName =
  | 'select'
  | 'pan'
  | 'area'
  | 'line'
  | 'point'
  | 'calibrate'
  | 'undo'
  | 'redo'
  | 'fit'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'copy'
  | 'image'
  | 'wand'
  | 'map'
  | 'mountain'
  | 'route'
  | 'check'
  | 'alert'
  | 'info'
  | 'x'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'import'
  | 'export'
  | 'help'
  | 'menu'
  | 'layers'
  | 'search'
  | 'eye'
  | 'eyeOff'
  | 'shield'
  | 'compass'
  | 'chevronDown'
  | 'chevronRight'
  | 'grip'
  | 'refresh'
  | 'marquee'
  | 'lasso'
  | 'zoom'
  | 'eyedropper'
  | 'text'
  | 'ruler'
  | 'grid'
  | 'history'
  | 'navigator'
  | 'more';

/**
 * Semantic editor names mapped to Lucide line icons: 24x24 grid, stroke
 * 1.5px, round caps — precise, never playful. The font-based icon set is
 * gone; this renders real SVG so weight and colour follow currentColor.
 */
const glyphs: Record<IconName, LucideIcon> = {
  select: MousePointer2,
  pan: Hand,
  area: Pentagon,
  line: Spline,
  point: CircleDot,
  calibrate: Ruler,
  undo: Undo2,
  redo: Redo2,
  fit: Scan,
  plus: Plus,
  minus: Minus,
  trash: Trash2,
  copy: Copy,
  image: Image,
  wand: Wand2,
  map: Map,
  mountain: Mountain,
  route: Route,
  check: Check,
  alert: TriangleAlert,
  info: Info,
  x: X,
  up: ChevronUp,
  down: ChevronDown,
  left: ChevronLeft,
  right: ChevronRight,
  import: Download,
  export: Upload,
  help: BookOpen,
  menu: Menu,
  layers: Layers,
  search: Search,
  eye: Eye,
  eyeOff: EyeOff,
  shield: ShieldCheck,
  compass: Compass,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  grip: GripVertical,
  refresh: RefreshCw,
  marquee: BoxSelect,
  lasso: Lasso,
  zoom: ZoomIn,
  eyedropper: Pipette,
  text: Type,
  ruler: Ruler,
  grid: Grid3x3,
  history: History,
  navigator: Focus,
  more: MoreHorizontal,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, className, style }: IconProps) {
  const Component = glyphs[name];
  return (
    <span
      className={`icon ${className ?? ''}`.trim()}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
      data-icon={name}
    >
      <Component size={size} strokeWidth={1.5} />
    </span>
  );
}
