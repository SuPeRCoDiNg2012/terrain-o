import type { SVGProps } from 'react';

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

const paths: Record<IconName, React.ReactNode> = {
  select: <path d="M5 3l14 8-6 1.8L10.5 19 5 3z" />,
  pan: (
    <path d="M7.5 12V6.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V11m0-3a1.5 1.5 0 013 0v6.5c0 3.5-2 6-5.5 6S5.5 18 5.5 15v-4a1.5 1.5 0 013 0" />
  ),
  area: <path d="M4 5l8-2 8 5-2 11-10 1L4 12V5z" />,
  line: <path d="M4 19c4-2 5-12 8-12s4 8 8 6" />,
  point: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  calibrate: (
    <>
      <path d="M4 18L18 4M8 4H4v4M16 20h4v-4" />
      <circle cx="8" cy="16" r="1.5" />
      <circle cx="16" cy="8" r="1.5" />
    </>
  ),
  undo: <path d="M9 7L4 12l5 5M4 12h8a6 6 0 016 6" />,
  redo: <path d="M15 7l5 5-5 5M20 12h-8a6 6 0 00-6 6" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4V4h11v1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="M4 18l5-6 4 4 3-3 4 5" />
    </>
  ),
  wand: <path d="M15 4l1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1zM4 20L16 8l2 2L6 22l-2-2zM6 4l.6 1.4L8 6l-1.4.6L6 8l-.6-1.4L4 6l1.4-.6L6 4z" />,
  map: <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15" />,
  mountain: <path d="M3 20l7-13 4 7 2-3 5 9H3zM10 9l2 3" />,
  route: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5v3A4.5 4.5 0 0010.5 16H15a3 3 0 010 6h-1" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  alert: <path d="M12 3l9 17H3L12 3zM12 9v5M12 17.5v.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  up: <path d="M6 14l6-6 6 6" />,
  down: <path d="M6 10l6 6 6-6" />,
  left: <path d="M14 6l-6 6 6 6" />,
  right: <path d="M10 6l6 6-6 6" />,
  import: <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  export: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  help: (
    <>
      <path d="M4 5h5.5A2.5 2.5 0 0112 7.5V19a2.5 2.5 0 00-2.5-2.5H4V5z" />
      <path d="M20 5h-5.5A2.5 2.5 0 0012 7.5V19a2.5 2.5 0 012.5-2.5H20V5z" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: <path d="M3 3l18 18M10.5 6.2A11 11 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-3 3.7M6.2 7.7A17 17 0 002 12s3.5 6 10 6a10 10 0 004-.8M9.9 9.9a3 3 0 004.2 4.2" />,
  shield: <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3zM8.5 12l2.5 2.5L16 9" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8l-2.5 5.5L8 16l2.5-5.5L16 8z" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  grip: <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />,
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />,
  marquee: (
    <>
      <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" strokeDasharray="2 2" />
      <rect x="9" y="9" width="6" height="6" />
    </>
  ),
  lasso: (
    <>
      <ellipse cx="11" cy="9" rx="7" ry="4.4" strokeDasharray="3 2" />
      <path d="M11 13.4c0 3.2 1.4 5.2 3.6 6.6" />
      <circle cx="15.4" cy="20.4" r="1.1" />
    </>
  ),
  zoom: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16l5 5M8 10.5h5M10.5 8v5" />
    </>
  ),
  eyedropper: (
    <>
      <path d="M15 4l5 5M18 3l3 3-3 3-8.5 8.5L5 19l1.5-4.5L15 6l3-3z" />
      <path d="M5 19l-2 2" />
    </>
  ),
  text: <path d="M5 6V4h14v2M12 4v16M8 20h8" />,
  ruler: (
    <>
      <path d="M3 16L16 3l5 5L8 21l-5-5z" />
      <path d="M8 11l2 2M11 8l2 2M14 5l2 2" />
    </>
  ),
  grid: <path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />,
  history: <path d="M4 5v5h5M4.5 10a8 8 0 1 1 1 7M12 8v4l3 2" />,
  navigator: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h4v4H7z" />
    </>
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
