// Chrome Web Store promo tiles — the hero shot + small tile + marquee

function PromoHero({ tokens, subtitle = 'Exportá chats de Claude al editor, sin fricción.' }) {
  return (
    <div style={{
      position: 'relative', width: 1280, height: 800,
      background: tokens.bg, overflow: 'hidden',
      fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
    }}>
      {/* background grid */}
      <svg width="1280" height="800" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke={tokens.line} strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="1280" height="800" fill="url(#grid)"/>
      </svg>
      {/* glow */}
      <div style={{
        position: 'absolute', right: -200, top: -200, width: 700, height: 700,
        background: `radial-gradient(circle, ${tokens.accent}33, transparent 60%)`,
        filter: 'blur(40px)',
      }}/>

      {/* content */}
      <div style={{ position: 'absolute', left: 80, top: 110, maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <ExportalMark size={56} bg={tokens.surface} accent={tokens.accent} ink={tokens.text} rounded={0.26}/>
          <div style={{ fontSize: 36, fontWeight: 700, color: tokens.text, letterSpacing: '-0.03em' }}>exportal</div>
        </div>
        <h1 style={{
          fontSize: 72, lineHeight: 1.02, fontWeight: 700, letterSpacing: '-0.04em',
          color: tokens.text, margin: '0 0 20px',
        }}>
          De <span style={{
            background: tokens.surface, padding: '2px 14px', borderRadius: 14,
            border: `1px solid ${tokens.line}`,
          }}>claude.ai</span><br/>
          a <span style={{ color: tokens.accent }}>Claude Code</span>.<br/>
          <span style={{ color: tokens.textDim, fontWeight: 600 }}>Un click.</span>
        </h1>
        <p style={{ fontSize: 20, color: tokens.textDim, lineHeight: 1.5, margin: '0 0 28px', maxWidth: 480 }}>
          {subtitle} Local-first, sin cuentas, sin servidores. El puente corre en tu máquina.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 999,
            background: tokens.accent, color: tokens.accentInk,
            fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em',
          }}>
            <ArrowGlyph color={tokens.accentInk}/> Exportar este chat
          </div>
          <KbdChip tokens={tokens}>⌥⇧E</KbdChip>
        </div>
      </div>

      {/* right side — layered screenshots */}
      <div style={{
        position: 'absolute', right: 60, top: 140,
        transform: 'rotate(-3deg)',
      }}>
        <OnboardingChrome tokens={tokens} state="paired"/>
      </div>
      <div style={{
        position: 'absolute', right: 220, top: 400,
        transform: 'rotate(2deg)',
      }}>
        <FabExpanded tokens={tokens}/>
      </div>

      {/* footer micro-badges */}
      <div style={{
        position: 'absolute', left: 80, bottom: 60,
        display: 'flex', gap: 10, alignItems: 'center',
        fontSize: 13, color: tokens.textMute,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}>
        <span>v0.4</span>
        <span>·</span>
        <span>MIT</span>
        <span>·</span>
        <span>Zero network</span>
        <span>·</span>
        <span>Chrome ≥ 116</span>
      </div>
    </div>
  );
}

function PromoTile({ tokens, size = 440 }) {
  return (
    <div style={{
      position: 'relative', width: size, height: size * 0.6818, // 440x300
      background: tokens.bg, overflow: 'hidden', borderRadius: 6,
      fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 85% 20%, ${tokens.accent}22, transparent 55%)`,
      }}/>
      <div style={{ position: 'absolute', left: 24, top: 26 }}>
        <ExportalMark size={32} bg={tokens.surface} accent={tokens.accent} ink={tokens.text} rounded={0.28}/>
      </div>
      <div style={{ position: 'absolute', left: 24, top: 74, right: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: tokens.text, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          claude.ai<br/>
          <span style={{ color: tokens.accent }}>→ Claude Code</span>
        </div>
        <div style={{ fontSize: 13, color: tokens.textDim, marginTop: 10, maxWidth: 280 }}>
          Exportá cualquier chat a VS Code con un click. Local-first.
        </div>
      </div>
      <div style={{ position: 'absolute', right: 20, bottom: 20 }}>
        <div style={{
          padding: '8px 14px', borderRadius: 999,
          background: tokens.accent, color: tokens.accentInk,
          fontSize: 13, fontWeight: 600, display: 'inline-flex', gap: 6, alignItems: 'center',
        }}>
          <ArrowGlyph color={tokens.accentInk}/> un click
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PromoHero, PromoTile });
