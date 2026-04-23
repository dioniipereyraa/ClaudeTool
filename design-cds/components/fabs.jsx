// FAB variants for claude.ai — three takes on the floating button.
// All accept the same `tokens` from useTokens + `ctaCopy` + optional `triggerSuccess`.

const { useState, useEffect, useRef } = React;

// ——— Shared success overlay ———————————————————————————————————————————
function SuccessPulse({ tokens, visible, messages = 47, ms = 340, onDone }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDone && onDone(), 2200);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10,
      background: tokens.surface, borderRadius: tokens.radiusLg,
      animation: 'expPop 320ms cubic-bezier(.2,1.2,.4,1) both',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22,
        background: tokens.accent, color: tokens.accentInk,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'expCheckIn 360ms cubic-bezier(.2,1.5,.3,1) both',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: 'expDraw 280ms 120ms cubic-bezier(.2,1,.4,1) forwards' }}/>
        </svg>
      </div>
      <div style={{ fontSize: tokens.fsSm, color: tokens.text, fontWeight: 600, letterSpacing: '-0.01em' }}>
        Enviado a VS Code
      </div>
      <div style={{ fontSize: tokens.fsXs, color: tokens.textDim, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
        {ms}ms · {messages} mensajes
      </div>
    </div>
  );
}

// ——— Variant A: Expanded card (current-style, refined) ———————————————
function FabExpanded({ tokens, ctaCopy = 'Exportar este chat', onExport }) {
  const [state, setState] = useState('idle'); // idle | sending | done
  const ms = useRef(0);
  const trigger = () => {
    if (state !== 'idle') return;
    setState('sending');
    const t0 = performance.now();
    setTimeout(() => {
      ms.current = Math.round(performance.now() - t0 + 280);
      setState('done');
      onExport && onExport();
    }, 580);
  };
  return (
    <div style={{
      position: 'relative',
      width: 280, padding: tokens.pad, borderRadius: tokens.radiusLg,
      background: tokens.surface, border: `1px solid ${tokens.line}`,
      boxShadow: '0 12px 32px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.12)',
      fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ExportalMark size={22} bg={tokens.surface2} accent={tokens.accent} ink={tokens.text} rounded={0.28}/>
        <span style={{ fontSize: tokens.fsSm, fontWeight: 600, color: tokens.text, letterSpacing: '-0.01em' }}>Exportal</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: tokens.fsXs, color: tokens.textDim }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: tokens.ok, boxShadow: `0 0 0 3px ${tokens.ok}22` }}/>
          VS Code
        </span>
      </div>
      <button onClick={trigger} disabled={state !== 'idle'} style={{
        width: '100%', padding: `${tokens.padSm + 2}px ${tokens.pad}px`,
        borderRadius: tokens.radius, border: 'none', cursor: state === 'idle' ? 'pointer' : 'default',
        background: tokens.accent, color: tokens.accentInk,
        fontSize: tokens.fsBase, fontWeight: 600, letterSpacing: '-0.01em',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'inherit', transition: 'transform 120ms, background 120ms',
      }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {state === 'sending' ? <SpinDot tokens={tokens}/> : <ArrowGlyph color={tokens.accentInk}/>}
        {state === 'sending' ? 'Enviando…' : ctaCopy}
      </button>
      <button style={{
        width: '100%', marginTop: 6, padding: `${tokens.padSm}px ${tokens.pad}px`,
        borderRadius: tokens.radius, border: `1px solid ${tokens.line}`,
        background: 'transparent', color: tokens.textDim,
        fontSize: tokens.fsSm, cursor: 'pointer', fontFamily: 'inherit',
      }}>Preparar export oficial</button>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10, fontSize: tokens.fsXs, color: tokens.textMute, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
        <KbdChip tokens={tokens}>⌥⇧E</KbdChip>
        <KbdChip tokens={tokens}>⌥⇧O</KbdChip>
      </div>
      <SuccessPulse tokens={tokens} visible={state === 'done'} onDone={() => setState('idle')} />
    </div>
  );
}

// ——— Variant B: Collapsed pill that expands on hover ————————————————
function FabCollapsed({ tokens, ctaCopy = 'Exportar', onExport }) {
  const [hover, setHover] = useState(false);
  const [state, setState] = useState('idle');
  const trigger = (e) => {
    e.stopPropagation();
    if (state !== 'idle') return;
    setState('sending');
    setTimeout(() => { setState('done'); onExport && onExport(); setTimeout(() => setState('idle'), 1800); }, 520);
  };
  const expanded = hover || state !== 'idle';
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={trigger}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: expanded ? `10px 16px 10px 12px` : `10px`,
        borderRadius: 999, cursor: 'pointer',
        background: tokens.accent, color: tokens.accentInk,
        boxShadow: '0 10px 28px rgba(0,0,0,0.28), 0 2px 4px rgba(0,0,0,0.14)',
        fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
        fontSize: tokens.fsBase, fontWeight: 600, letterSpacing: '-0.01em',
        transition: 'padding 220ms cubic-bezier(.2,.9,.3,1), transform 120ms',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}>
        {state === 'sending' ? <SpinDot tokens={tokens}/> : state === 'done' ? <CheckGlyph color={tokens.accentInk}/> : <ArrowGlyph color={tokens.accentInk}/>}
      </div>
      <span style={{
        maxWidth: expanded ? 200 : 0,
        opacity: expanded ? 1 : 0,
        transition: 'max-width 220ms cubic-bezier(.2,.9,.3,1), opacity 160ms',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        {state === 'sending' ? 'Enviando…' : state === 'done' ? 'Enviado · 340ms' : ctaCopy}
      </span>
    </div>
  );
}

// ——— Variant C: Ambient status orb + context menu ————————————————————
function FabAmbient({ tokens, ctaCopy = '→ Claude Code', onExport }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle');
  const trigger = () => {
    if (state !== 'idle') return;
    setState('sending');
    setTimeout(() => { setState('done'); onExport && onExport(); setOpen(false); setTimeout(() => setState('idle'), 1800); }, 560);
  };
  return (
    <div style={{ position: 'relative', display: 'inline-block', fontFamily: "'Inter Tight', Inter, system-ui, sans-serif" }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 58, right: 0,
          width: 240, padding: 6,
          background: tokens.surface, border: `1px solid ${tokens.line}`,
          borderRadius: tokens.radius,
          boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
          animation: 'expRise 180ms cubic-bezier(.2,1,.3,1) both',
        }}>
          <MenuItem tokens={tokens} label={ctaCopy} kbd="⌥⇧E" primary onClick={trigger}/>
          <MenuItem tokens={tokens} label="Preparar export oficial" kbd="⌥⇧O"/>
          <div style={{ height: 1, background: tokens.line, margin: '4px 6px' }}/>
          <MenuItem tokens={tokens} label="Ajustes" dim/>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 46, height: 46, borderRadius: 23, border: 'none', cursor: 'pointer',
          background: tokens.surface, color: tokens.text,
          boxShadow: '0 10px 28px rgba(0,0,0,0.28), 0 2px 4px rgba(0,0,0,0.14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
        <ExportalMark size={22} bg="transparent" accent={tokens.accent} ink={tokens.text} rounded={0.28}/>
        <span style={{
          position: 'absolute', top: 4, right: 4,
          width: 8, height: 8, borderRadius: 4,
          background: state === 'done' ? tokens.ok : tokens.accent,
          boxShadow: `0 0 0 3px ${state === 'done' ? tokens.ok : tokens.accent}33`,
          animation: 'expPulse 2.2s ease-in-out infinite',
        }}/>
      </button>
    </div>
  );
}

function MenuItem({ tokens, label, kbd, primary, dim, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '8px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
      background: primary ? tokens.accent : 'transparent',
      color: primary ? tokens.accentInk : (dim ? tokens.textDim : tokens.text),
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      fontSize: tokens.fsSm, fontWeight: primary ? 600 : 500, letterSpacing: '-0.01em',
      fontFamily: 'inherit', textAlign: 'left',
    }}
      onMouseEnter={e => { if (!primary) e.currentTarget.style.background = tokens.surface2; }}
      onMouseLeave={e => { if (!primary) e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{label}</span>
      {kbd && <span style={{
        fontSize: tokens.fsXs, fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        color: primary ? tokens.accentInk : tokens.textMute, opacity: primary ? 0.7 : 1,
      }}>{kbd}</span>}
    </button>
  );
}

// ——— Glyphs ————————————————————————————————————————————————————————
function ArrowGlyph({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h14M13 6l6 6-6 6"/>
    </svg>
  );
}
function CheckGlyph({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}
function SpinDot({ tokens }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'expSpin 800ms linear infinite' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.25"/>
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  );
}
function KbdChip({ tokens, children }) {
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 4,
      background: tokens.surface2, border: `1px solid ${tokens.line}`,
      color: tokens.textDim, fontSize: tokens.fsXs,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    }}>{children}</span>
  );
}

Object.assign(window, { FabExpanded, FabCollapsed, FabAmbient, SuccessPulse, ArrowGlyph, CheckGlyph, SpinDot, KbdChip });
