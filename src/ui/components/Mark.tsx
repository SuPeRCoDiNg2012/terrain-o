interface MarkProps {
  size?: number;
  className?: string;
}

/**
 * The Terrain / O symbol: a single closed contour line — the O — crossed at
 * the top-right by the signal slash. Organic, topographic, readable small.
 * The contour takes currentColor, the slash is always signal-500.
 */
export function Mark({ size = 24, className }: MarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M24 5.5 C34.2 5 42.5 13.6 42 24.6 C41.5 34.4 33.4 42.6 23 42 C13.4 41.4 5.5 33.4 6 22.9 C6.5 13.4 14.6 6 24 5.5 Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M30.5 13.5 L 42 2" stroke="#e4562a" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
