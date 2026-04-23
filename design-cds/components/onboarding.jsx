// Onboarding — unified flow across VS Code + Chrome companion.
// Shown as two side-by-side "devices" forming a bridge.

function OnboardingVsCode({ tokens, token = 'fac10eb669fd1bd14b66a2e8c0ff12a3b91d4e5c7a8f9012d345ef67890ab123', step = 1 }) {
  return (
    <div style={{
      width: 520, borderRadius: tokens.radiusLg, overflow: 'hidden',
      background: tokens.surface, border: `1px solid ${tokens.line}`,
      fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
      boxShadow: '0 20px 60px rgba(0,0,0,0.32)',
    }}>
      {/* titlebar mimicking VS Code */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: tokens.surface2, borderBottom: `1px solid ${tokens.line}`,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#ED6A5E' }}/>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#F5BF4F' }}/>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#61C554' }}/>
        </div>
        <div style={{ fontSize: tokens.fsXs, color: tokens.textMute, marginLeft: 8 }}>Visual Studio Code</div>
      </div>
      <div style={{ padding: `${tokens.pad + 6}px ${tokens.pad + 8}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <ExportalMark size={28} bg={tokens.surface2} accent={tokens.accent} ink={tokens.text} rounded={0.28}/>
          <div>
            <div style={{ fontSize: tokens.fsLg, fontWeight: 700, color: tokens.text, letterSpacing: '-0.02em' }}>
              Conectá tu navegador
            </div>
            <div style={{ fontSize: tokens.fsXs, color: tokens.textDim }}>
              Un paso y exportás chats con un click.
            </div>
          </div>
        </div>

        {/* step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: tokens.fsXs, color: tokens.textDim, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
          <StepDot tokens={tokens} active={step >= 1}/> VS Code
          <div style={{ flex: 1, height: 1, background: tokens.line, margin: '0 4px' }}/>
          <StepDot tokens={tokens} active={step >= 2}/> Chrome
          <div style={{ flex: 1, height: 1, background: tokens.line, margin: '0 4px' }}/>
          <StepDot tokens={tokens} active={step >= 3}/> Listo
        </div>

        {/* token card */}
        <div style={{
          padding: tokens.pad, borderRadius: tokens.radius,
          background: tokens.surface2, border: `1px dashed ${tokens.lineStrong}`,
        }}>
          <div style={{ fontSize: tokens.fsXs, color: tokens.textDim, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Token de emparejamiento
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: `${tokens.padSm + 2}px ${tokens.pad}px`,
            background: tokens.surface, borderRadius: tokens.radius - 2,
            border: `1px solid ${tokens.line}`,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: tokens.fsSm, color: tokens.text, letterSpacing: '0.02em',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {token}
            </span>
            <button style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: tokens.accent, color: tokens.accentInk,
              fontSize: tokens.fsXs, fontWeight: 700, fontFamily: 'inherit',
              letterSpacing: '0.02em',
            }}>COPIAR</button>
          </div>
          <div style={{ fontSize: tokens.fsXs, color: tokens.textMute, marginTop: 8, lineHeight: 1.5 }}>
            Se copia y Chrome lo detecta automáticamente al abrir el companion. Se mantiene en tu máquina — nada se envía por la red.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button style={{
            padding: '8px 14px', borderRadius: tokens.radius,
            background: 'transparent', color: tokens.textDim,
            border: `1px solid ${tokens.line}`, cursor: 'pointer',
            fontSize: tokens.fsSm, fontFamily: 'inherit',
          }}>Luego</button>
          <button style={{
            padding: '8px 16px', borderRadius: tokens.radius,
            background: tokens.accent, color: tokens.accentInk, border: 'none', cursor: 'pointer',
            fontSize: tokens.fsSm, fontWeight: 600, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            Abrir Chrome
            <ArrowGlyph color={tokens.accentInk}/>
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingChrome({ tokens, state = 'detected', token = 'fac10eb669fd1bd14b66a2e8c0ff12a3b91d4e5c7a8f9012d345ef67890ab123' }) {
  const paired = state === 'paired';
  const detected = state === 'detected';
  return (
    <div style={{
      width: 420, borderRadius: tokens.radiusLg, overflow: 'hidden',
      background: tokens.surface, border: `1px solid ${tokens.line}`,
      fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
      boxShadow: '0 20px 60px rgba(0,0,0,0.32)',
    }}>
      {/* chrome-like header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: tokens.surface2, borderBottom: `1px solid ${tokens.line}`,
      }}>
        <ExportalMark size={22} bg={tokens.bg} accent={tokens.accent} ink={tokens.text} rounded={0.28}/>
        <div style={{ fontSize: tokens.fsSm, fontWeight: 600, color: tokens.text, letterSpacing: '-0.01em' }}>
          Exportal Companion
        </div>
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '2px 8px', borderRadius: 999,
          background: paired ? `${tokens.ok}22` : `${tokens.accent}22`,
          color: paired ? tokens.ok : tokens.accent,
          fontSize: tokens.fsXs, fontWeight: 600,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }}/>
          {paired ? 'Emparejado' : detected ? 'Token detectado' : 'Esperando…'}
        </span>
      </div>

      <div style={{ padding: tokens.pad + 4 }}>
        <div style={{ fontSize: tokens.fsLg, fontWeight: 700, color: tokens.text, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {paired ? '¡Listo!' : detected ? 'Encontramos tu token' : 'Pegá el token de VS Code'}
        </div>
        <div style={{ fontSize: tokens.fsXs, color: tokens.textDim, marginBottom: 14 }}>
          {paired
            ? 'Ya podés exportar cualquier chat de claude.ai a VS Code con un click.'
            : detected
              ? 'Lo copiaste desde VS Code hace un momento. Confirmá y listo.'
              : 'Copialo desde la paleta de comandos: Exportal: Show bridge pairing token.'}
        </div>

        {/* token field */}
        <div style={{
          padding: `${tokens.padSm + 2}px ${tokens.pad}px`,
          background: tokens.surface2, borderRadius: tokens.radius,
          border: `1px solid ${detected ? tokens.accent : tokens.line}`,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: tokens.fsSm, color: tokens.text, letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          position: 'relative',
        }}>
          {detected && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `linear-gradient(90deg, transparent, ${tokens.accent}22, transparent)`,
              animation: 'expShimmer 1.8s ease-in-out infinite',
            }}/>
          )}
          {paired || detected ? token : '64 caracteres hexadecimales'}
        </div>

        <button style={{
          width: '100%', marginTop: 10, padding: `${tokens.padSm + 2}px ${tokens.pad}px`,
          borderRadius: tokens.radius, border: 'none', cursor: 'pointer',
          background: paired ? tokens.surface2 : tokens.accent,
          color: paired ? tokens.text : tokens.accentInk,
          fontSize: tokens.fsBase, fontWeight: 600, letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'inherit',
        }}>
          {paired ? <><CheckGlyph color={tokens.ok}/> Todo conectado</> : <>Emparejar <ArrowGlyph color={tokens.accentInk}/></>}
        </button>

        <div style={{ marginTop: 14, padding: tokens.padSm + 2, borderRadius: tokens.radius, background: tokens.surface2, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tokens.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: tokens.fsXs, color: tokens.textDim, lineHeight: 1.5 }}>
            <b style={{ color: tokens.text }}>Local-first.</b> El puente corre en <code style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: tokens.text }}>127.0.0.1</code>. Nada sale de tu máquina.
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({ tokens, active }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: 4,
      background: active ? tokens.accent : tokens.line,
      boxShadow: active ? `0 0 0 3px ${tokens.accent}33` : 'none',
    }}/>
  );
}

// Bridge visualization — both devices connected
function OnboardingBridge({ tokens }) {
  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 80,
      padding: 40, background: tokens.bg, borderRadius: tokens.radiusLg,
    }}>
      <OnboardingVsCode tokens={tokens} step={3}/>
      <div style={{ position: 'relative', width: 120, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="120" height="80" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="bridgeG" x1="0" x2="1">
              <stop offset="0%" stopColor={tokens.accent} stopOpacity="0"/>
              <stop offset="50%" stopColor={tokens.accent} stopOpacity="1"/>
              <stop offset="100%" stopColor={tokens.accent} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <line x1="0" y1="40" x2="120" y2="40" stroke={tokens.line} strokeWidth="2" strokeDasharray="4 4"/>
          <line x1="0" y1="40" x2="120" y2="40" stroke="url(#bridgeG)" strokeWidth="2" style={{ animation: 'expDash 2s linear infinite' }}/>
        </svg>
        <div style={{
          position: 'relative', padding: '6px 12px', borderRadius: 999,
          background: tokens.surface, border: `1px solid ${tokens.lineStrong}`,
          fontSize: tokens.fsXs, color: tokens.textDim,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        }}>127.0.0.1</div>
      </div>
      <OnboardingChrome tokens={tokens} state="paired"/>
    </div>
  );
}

Object.assign(window, { OnboardingVsCode, OnboardingChrome, OnboardingBridge, StepDot });
