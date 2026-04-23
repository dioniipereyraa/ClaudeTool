// Exportal logo / mark. Refinement of the "E with horizontal bar" monogram.
// The bar visually becomes an arrow / pipe — the "puente" between surfaces.

function ExportalMark({ size = 48, bg, accent, ink, rounded = 0.24 }) {
  const r = size * rounded;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Exportal">
      <rect x="0" y="0" width="100" height="100" rx={r * 100 / size} fill={bg} />
      {/* E strokes */}
      <rect x="22" y="20" width="56" height="14" rx="2" fill={ink} />
      <rect x="22" y="20" width="14" height="60" rx="2" fill={ink} />
      <rect x="22" y="66" width="56" height="14" rx="2" fill={ink} />
      {/* Middle bar — the "portal" — accent color, slightly offset right, with arrowhead */}
      <g>
        <rect x="36" y="43" width="36" height="14" rx="2" fill={accent} />
        <path d={`M 72 50 L 82 50`} stroke={accent} strokeWidth="14" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function ExportalWordmark({ size = 20, color, accent }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: size * 0.28,
      fontSize: size, fontWeight: 700, letterSpacing: '-0.02em',
      color, fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
    }}>
      <ExportalMark size={size * 1.3} bg="transparent" accent={accent} ink={color} rounded={0.22} />
      <span>exportal</span>
    </span>
  );
}

Object.assign(window, { ExportalMark, ExportalWordmark });
