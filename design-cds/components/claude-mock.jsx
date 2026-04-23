// Mock of claude.ai chat page — backdrop for showing the FAB in context

function ClaudeChatMock({ tokens, children, dim = true }) {
  return (
    <div style={{
      position: 'relative', width: 900, height: 560,
      background: dim ? '#1A1815' : '#FAF9F6',
      color: dim ? '#F2EEE4' : '#2C2B28',
      borderRadius: 12, overflow: 'hidden',
      fontFamily: "Styrene A, 'Inter Tight', Inter, system-ui, sans-serif",
      border: '1px solid rgba(0,0,0,0.2)',
    }}>
      {/* top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        borderBottom: dim ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
        fontSize: 13,
      }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, background: '#D97757' }}/>
        <span style={{ fontWeight: 600 }}>Claude</span>
        <span style={{ opacity: 0.4, marginLeft: 8 }}>Chat sobre exportar sesiones de Claude Code</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 12, background: dim ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}/>
          <div style={{ width: 24, height: 24, borderRadius: 12, background: dim ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}/>
        </div>
      </div>
      {/* fake messages */}
      <div style={{ padding: '24px 60px', display: 'flex', flexDirection: 'column', gap: 20, height: 'calc(100% - 50px)', overflow: 'hidden' }}>
        <MsgLine tokens={tokens} dim={dim} who="H" widths={[72, 64]}/>
        <MsgLine tokens={tokens} dim={dim} who="C" widths={[86, 92, 70, 88, 40]}/>
        <MsgLine tokens={tokens} dim={dim} who="H" widths={[56]}/>
        <MsgLine tokens={tokens} dim={dim} who="C" widths={[92, 88, 74]}/>
      </div>
      {/* FAB in the bottom right */}
      <div style={{ position: 'absolute', right: 24, bottom: 24 }}>
        {children}
      </div>
    </div>
  );
}

function MsgLine({ dim, who, widths }) {
  const isH = who === 'H';
  const bubble = isH ? (dim ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent';
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 24, height: 24, borderRadius: 12, flexShrink: 0,
        background: isH ? '#886A5F' : '#D97757', color: '#fff',
        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{isH ? 'D' : 'C'}</div>
      <div style={{ flex: 1, padding: isH ? '10px 14px' : 0, background: bubble, borderRadius: 10 }}>
        {widths.map((w, i) => (
          <div key={i} style={{
            height: 10, width: `${w}%`, marginBottom: 8, borderRadius: 4,
            background: dim ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          }}/>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ClaudeChatMock });
