// Design tokens + palettes + density + theme for Exportal
// Exposed on window for cross-script access.

const PALETTES = {
  ember: {
    name: 'Midnight Ember',
    dark: {
      bg: '#0B0D1F',
      surface: '#121635',
      surface2: '#1A1E44',
      line: 'rgba(255,255,255,0.08)',
      lineStrong: 'rgba(255,255,255,0.14)',
      text: '#F3F2EE',
      textDim: 'rgba(243,242,238,0.62)',
      textMute: 'rgba(243,242,238,0.38)',
      accent: '#FF7A45',
      accentHover: '#FF8F5E',
      accentInk: '#0B0D1F',
      ok: '#4ADE80',
      err: '#F87171',
    },
    light: {
      bg: '#F5F3EE',
      surface: '#FFFFFF',
      surface2: '#EDEAE2',
      line: 'rgba(11,13,31,0.10)',
      lineStrong: 'rgba(11,13,31,0.18)',
      text: '#0B0D1F',
      textDim: 'rgba(11,13,31,0.62)',
      textMute: 'rgba(11,13,31,0.40)',
      accent: '#EA5A1E',
      accentHover: '#D44A10',
      accentInk: '#FFFFFF',
      ok: '#0A8A3D',
      err: '#C2322A',
    },
  },
  citrus: {
    name: 'Graphite Citrus',
    dark: {
      bg: '#0A0B0D',
      surface: '#111315',
      surface2: '#181A1D',
      line: 'rgba(255,255,255,0.07)',
      lineStrong: 'rgba(255,255,255,0.13)',
      text: '#F2F3F0',
      textDim: 'rgba(242,243,240,0.60)',
      textMute: 'rgba(242,243,240,0.36)',
      accent: '#D4FF3A',
      accentHover: '#E4FF5C',
      accentInk: '#0A0B0D',
      ok: '#86EFAC',
      err: '#FCA5A5',
    },
    light: {
      bg: '#F7F7F4',
      surface: '#FFFFFF',
      surface2: '#ECECE6',
      line: 'rgba(10,11,13,0.10)',
      lineStrong: 'rgba(10,11,13,0.18)',
      text: '#0A0B0D',
      textDim: 'rgba(10,11,13,0.60)',
      textMute: 'rgba(10,11,13,0.38)',
      accent: '#536C00',
      accentHover: '#435700',
      accentInk: '#FBFFEC',
      ok: '#0A8A3D',
      err: '#C2322A',
    },
  },
  violet: {
    name: 'Dusk Violet',
    dark: {
      bg: '#0E0A1F',
      surface: '#1A1035',
      surface2: '#241748',
      line: 'rgba(255,255,255,0.08)',
      lineStrong: 'rgba(255,255,255,0.14)',
      text: '#F3F0FA',
      textDim: 'rgba(243,240,250,0.62)',
      textMute: 'rgba(243,240,250,0.38)',
      accent: '#B79BFF',
      accentHover: '#C9B3FF',
      accentInk: '#0E0A1F',
      ok: '#86EFAC',
      err: '#FCA5A5',
    },
    light: {
      bg: '#F5F2FA',
      surface: '#FFFFFF',
      surface2: '#EAE4F4',
      line: 'rgba(14,10,31,0.10)',
      lineStrong: 'rgba(14,10,31,0.18)',
      text: '#1A0F2E',
      textDim: 'rgba(26,15,46,0.62)',
      textMute: 'rgba(26,15,46,0.40)',
      accent: '#6B3FE0',
      accentHover: '#5A30C8',
      accentInk: '#FFFFFF',
      ok: '#0A8A3D',
      err: '#C2322A',
    },
  },
};

const DENSITY = {
  cozy: {
    fsXs: 11, fsSm: 13, fsBase: 14, fsMd: 15, fsLg: 18, fsXl: 22, fsXxl: 28,
    pad: 16, padSm: 10, gap: 10, radius: 10, radiusLg: 14,
  },
  compact: {
    fsXs: 10, fsSm: 12, fsBase: 13, fsMd: 14, fsLg: 16, fsXl: 20, fsXxl: 26,
    pad: 12, padSm: 8, gap: 8, radius: 8, radiusLg: 12,
  },
};

function useTokens({ paletteKey = 'ember', mode = 'dark', density = 'cozy' }) {
  const p = PALETTES[paletteKey] || PALETTES.ember;
  const m = p[mode] || p.dark;
  const d = DENSITY[density] || DENSITY.cozy;
  return { ...m, ...d, paletteName: p.name, mode, density };
}

// Expose
Object.assign(window, { PALETTES, DENSITY, useTokens });
