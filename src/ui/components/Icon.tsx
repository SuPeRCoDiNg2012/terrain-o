import type { CSSProperties } from 'react';

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
 * Semantic names used by the editor mapped to the Material Symbols glyph
 * names. The font is subset to exactly these glyphs (see /public/fonts), so
 * the bundle stays tiny and works offline.
 */
const glyphs: Record<IconName, string> = {
  select: 'arrow_selector_tool',
  pan: 'pan_tool',
  area: 'pentagon',
  line: 'polyline',
  point: 'radio_button_checked',
  calibrate: 'straighten',
  undo: 'undo',
  redo: 'redo',
  fit: 'fit_screen',
  plus: 'add',
  minus: 'remove',
  trash: 'delete',
  copy: 'content_copy',
  image: 'image',
  wand: 'auto_fix_high',
  map: 'map',
  mountain: 'landscape',
  route: 'route',
  check: 'check',
  alert: 'warning',
  info: 'info',
  x: 'close',
  up: 'expand_less',
  down: 'expand_more',
  left: 'chevron_left',
  right: 'chevron_right',
  import: 'download',
  export: 'upload',
  help: 'menu_book',
  menu: 'menu',
  layers: 'layers',
  search: 'search',
  eye: 'visibility',
  eyeOff: 'visibility_off',
  shield: 'verified_user',
  compass: 'explore',
  chevronDown: 'expand_more',
  chevronRight: 'chevron_right',
  grip: 'drag_indicator',
  refresh: 'refresh',
  marquee: 'crop_free',
  lasso: 'gesture',
  zoom: 'zoom_in',
  eyedropper: 'colorize',
  text: 'title',
  ruler: 'square_foot',
  grid: 'grid_on',
  history: 'history',
  navigator: 'center_focus_strong',
  more: 'more_horiz',
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, className, style }: IconProps) {
  return (
    <span
      className={`material-symbols-rounded icon ${className ?? ''}`.trim()}
      style={{ fontSize: size, width: size, height: size, ...style }}
      aria-hidden="true"
      data-icon={name}
    >
      {glyphs[name]}
    </span>
  );
}
