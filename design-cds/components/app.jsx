// Main app: design canvas presenting all Exportal variants

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "citrus",
  "mode": "dark",
  "density": "cozy",
  "ctaCopy": "Exportar este chat"
}/*EDITMODE-END*/;

function useTweaks() {
  const [t, setT] = React.useState(() => {
    try { const s = localStorage.getItem('exp_tweaks'); if (s) return { ...TWEAKS_DEFAULTS, ...JSON.parse(s) }; } catch {}
    return TWEAKS_DEFAULTS;
  });
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const onMsg = (e) => {
      if (!e.data) return;
      if (e.data.type === '__activate_edit_mode') setVisible(true);
      if (e.data.type === '__deactivate_edit_mode') setVisible(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const update = (patch) => {
    const next = { ...t, ...patch };
    setT(next);
    try { localStorage.setItem('exp_tweaks', JSON.stringify(next)); } catch {}
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  };
  return { tweaks: t, setTweak: update, visible };
}

function TweaksPanel({ tweaks, setTweak, visible, tokens }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 9999,
      width: 260, padding: 14, borderRadius: 12,
      background: tokens.surface, border: `1px solid ${tokens.line}`,
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
      color: tokens.text, fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: tokens.accent }}/>
        <b style={{ letterSpacing: '-0.01em' }}>Tweaks</b>
      </div>
      <TLabel>Paleta</TLabel>
      <TRow>
        {['ember','citrus','violet'].map(k => (
          <TChip key={k} active={tweaks.palette === k} onClick={() => setTweak({palette: k})} tokens={tokens}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: PALETTES[k].dark.accent, marginRight: 6, display: 'inline-block' }}/>
            {PALETTES[k].name.split(' ')[1]}
          </TChip>
        ))}
      </TRow>
      <TLabel>Tema</TLabel>
      <TRow>
        {['dark','light'].map(m => (
          <TChip key={m} active={tweaks.mode === m} onClick={() => setTweak({mode: m})} tokens={tokens}>{m}</TChip>
        ))}
      </TRow>
      <TLabel>Densidad</TLabel>
      <TRow>
        {['cozy','compact'].map(d => (
          <TChip key={d} active={tweaks.density === d} onClick={() => setTweak({density: d})} tokens={tokens}>{d}</TChip>
        ))}
      </TRow>
      <TLabel>Copy del CTA</TLabel>
      <TRow>
        {['Exportar este chat','Enviar a VS Code','→ Claude Code'].map(c => (
          <TChip key={c} active={tweaks.ctaCopy === c} onClick={() => setTweak({ctaCopy: c})} tokens={tokens} small>{c}</TChip>
        ))}
      </TRow>
    </div>
  );
}
const TLabel = ({children}) => <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5, margin: '10px 0 6px' }}>{children}</div>;
const TRow = ({children}) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>;
const TChip = ({active, onClick, children, tokens, small}) => (
  <button onClick={onClick} style={{
    padding: small ? '4px 8px' : '5px 10px', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${active ? tokens.accent : tokens.line}`,
    background: active ? `${tokens.accent}22` : 'transparent',
    color: active ? tokens.accent : tokens.textDim,
    fontSize: small ? 11 : 12, fontFamily: 'inherit',
  }}>{children}</button>
);

function App() {
  const { tweaks, setTweak, visible } = useTweaks();
  const tokens = useTokens({ paletteKey: tweaks.palette, mode: tweaks.mode, density: tweaks.density });

  // Apply background
  React.useEffect(() => {
    document.body.style.background = tokens.bg;
    document.body.style.color = tokens.text;
  }, [tokens.bg, tokens.text]);

  return (
    <>
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={visible} tokens={tokens}/>

      <DesignCanvas title="Exportal — sistema de diseño" subtitle="Rediseño del FAB, onboarding unificado, identidad y promo. Activá Tweaks arriba a la derecha.">

        {/* 1. IDENTITY */}
        <DCSection id="identity" title="01 · Identidad" description="La marca: monograma, wordmark y variaciones en contexto.">
          <DCArtboard id="mark-set" label="Monograma — en 3 tamaños" width={560} height={240}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, background: tokens.bg }}>
              <ExportalMark size={128} bg={tokens.surface} accent={tokens.accent} ink={tokens.text} rounded={0.26}/>
              <ExportalMark size={72} bg={tokens.surface} accent={tokens.accent} ink={tokens.text} rounded={0.26}/>
              <ExportalMark size={40} bg={tokens.surface} accent={tokens.accent} ink={tokens.text} rounded={0.28}/>
              <ExportalMark size={20} bg={tokens.surface} accent={tokens.accent} ink={tokens.text} rounded={0.32}/>
            </div>
          </DCArtboard>

          <DCArtboard id="wordmark" label="Wordmark" width={560} height={160}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tokens.bg }}>
              <ExportalWordmark size={44} color={tokens.text} accent={tokens.accent}/>
            </div>
          </DCArtboard>

          <DCArtboard id="palette" label="Paleta activa" width={560} height={160}>
            <PaletteSwatch tokens={tokens}/>
          </DCArtboard>
        </DCSection>

        {/* 2. FAB VARIANTS */}
        <DCSection id="fab" title="02 · FAB en claude.ai" description="Tres tomas del botón flotante. Hacé click para ver el momento de éxito.">
          <DCArtboard id="fab-expanded" label="A · Expandido con atajos" width={960} height={620}>
            <ClaudeChatMock tokens={tokens} dim={true}>
              <FabExpanded tokens={tokens} ctaCopy={tweaks.ctaCopy}/>
            </ClaudeChatMock>
          </DCArtboard>

          <DCArtboard id="fab-collapsed" label="B · Pill que se expande al hover" width={960} height={620}>
            <ClaudeChatMock tokens={tokens} dim={true}>
              <FabCollapsed tokens={tokens} ctaCopy={tweaks.ctaCopy}/>
            </ClaudeChatMock>
          </DCArtboard>

          <DCArtboard id="fab-ambient" label="C · Ambient orb con menú" width={960} height={620}>
            <ClaudeChatMock tokens={tokens} dim={true}>
              <FabAmbient tokens={tokens} ctaCopy={tweaks.ctaCopy}/>
            </ClaudeChatMock>
          </DCArtboard>
        </DCSection>

        {/* 3. ONBOARDING */}
        <DCSection id="onboarding" title="03 · Onboarding unificado" description="Pairing como una experiencia continua entre VS Code y Chrome.">
          <DCArtboard id="onb-vscode" label="VS Code — token con copy inteligente" width={620} height={500}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: tokens.bg, padding: 20 }}>
              <OnboardingVsCode tokens={tokens}/>
            </div>
          </DCArtboard>

          <DCArtboard id="onb-chrome-detected" label="Chrome — token detectado del clipboard" width={520} height={500}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: tokens.bg, padding: 20 }}>
              <OnboardingChrome tokens={tokens} state="detected"/>
            </div>
          </DCArtboard>

          <DCArtboard id="onb-chrome-paired" label="Chrome — emparejado" width={520} height={500}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: tokens.bg, padding: 20 }}>
              <OnboardingChrome tokens={tokens} state="paired"/>
            </div>
          </DCArtboard>

          <DCArtboard id="onb-bridge" label="Vista de sistema — el puente completo" width={1260} height={560}>
            <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
              <OnboardingBridge tokens={tokens}/>
            </div>
          </DCArtboard>
        </DCSection>

        {/* 4. SUCCESS MOMENT */}
        <DCSection id="success" title="04 · Momento de éxito" description="Feedback sutil: check animado + tiempo + cantidad de mensajes.">
          <DCArtboard id="success-toast" label="Toast — listo en Xms" width={560} height={300}>
            <SuccessToastDemo tokens={tokens}/>
          </DCArtboard>
          <DCArtboard id="success-states" label="Estados: idle · enviando · listo" width={920} height={300}>
            <StatesRow tokens={tokens}/>
          </DCArtboard>
        </DCSection>

        {/* 5. CHROME WEB STORE */}
        <DCSection id="promo" title="05 · Chrome Web Store" description="Hero del listing y el tile promocional 440×280.">
          <DCArtboard id="promo-hero" label="Hero 1280×800" width={1280} height={800}>
            <PromoHero tokens={tokens}/>
          </DCArtboard>
          <DCArtboard id="promo-tile" label="Tile pequeño 440×300" width={440} height={300}>
            <PromoTile tokens={tokens}/>
          </DCArtboard>
        </DCSection>

      </DesignCanvas>
    </>
  );
}

// ——— Helper artboards ——————————————————————————————————————————————
function PaletteSwatch({ tokens }) {
  const swatches = [
    { label: 'bg', v: tokens.bg },
    { label: 'surface', v: tokens.surface },
    { label: 'surface2', v: tokens.surface2 },
    { label: 'text', v: tokens.text },
    { label: 'accent', v: tokens.accent },
    { label: 'ok', v: tokens.ok },
  ];
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: tokens.bg, padding: 24, gap: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>
      {swatches.map(s => (
        <div key={s.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ flex: 1, background: s.v, borderRadius: 8, border: `1px solid ${tokens.line}` }}/>
          <div style={{ color: tokens.textDim, display: 'flex', justifyContent: 'space-between' }}>
            <span>{s.label}</span>
            <span style={{ color: tokens.textMute }}>{String(s.v).slice(0, 9)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SuccessToastDemo({ tokens }) {
  const [k, setK] = React.useState(0);
  return (
    <div style={{ width: '100%', height: '100%', background: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'relative', width: 260, height: 160 }} key={k}>
        <SuccessPulse tokens={tokens} visible={true} messages={47} ms={340} onDone={() => {}}/>
      </div>
      <button onClick={() => setK(k + 1)} style={{
        position: 'absolute', bottom: 16, right: 16,
        padding: '6px 12px', borderRadius: 6,
        background: tokens.surface2, color: tokens.textDim, border: `1px solid ${tokens.line}`,
        fontSize: 11, fontFamily: "'JetBrains Mono', ui-monospace, monospace", cursor: 'pointer',
      }}>replay</button>
    </div>
  );
}

function StatesRow({ tokens }) {
  return (
    <div style={{ width: '100%', height: '100%', background: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <StateFrame tokens={tokens} label="idle"><FabCollapsed tokens={tokens} ctaCopy="Exportar"/></StateFrame>
      <StateFrame tokens={tokens} label="sending">
        <div style={{ padding: '10px 16px 10px 12px', borderRadius: 999, background: tokens.accent, color: tokens.accentInk, display: 'inline-flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif" }}>
          <SpinDot tokens={tokens}/> Enviando…
        </div>
      </StateFrame>
      <StateFrame tokens={tokens} label="done">
        <div style={{ padding: '10px 16px 10px 12px', borderRadius: 999, background: tokens.ok, color: '#fff', display: 'inline-flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif" }}>
          <CheckGlyph color="#fff"/> Enviado · 340ms
        </div>
      </StateFrame>
    </div>
  );
}
function StateFrame({ tokens, label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {children}
      <div style={{ fontSize: 11, color: tokens.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
