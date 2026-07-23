/** Sticky AE active-comp bar for Shots tab (CEP only). */
export default function AeCompBar({
  comp,
  matching,
  matchError,
  matches = [],
  onMatch,
  onPickMatch,
  onDismissMatches,
}) {
  const ambiguous = matches.length > 0 && matches[0].score < 80;
  const picks = ambiguous ? matches.filter((m) => m.score >= 70).slice(0, 3) : [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 12px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <img
          src={`${import.meta.env.BASE_URL}ae-logo.png`}
          alt=""
          width={16}
          height={16}
          style={{ borderRadius: 3, flexShrink: 0 }}
        />
        <span
          title={comp?.ok ? comp.name : (comp?.error || '')}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {comp?.ok ? comp.name : (comp?.error || '—')}
        </span>
        <button
          type="button"
          onClick={onMatch}
          disabled={matching}
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 10,
            fontWeight: 600,
            cursor: matching ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: matching ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          {matching ? '…' : 'Match'}
        </button>
      </div>

      {matchError && (
        <div style={{ color: 'var(--red)', fontSize: 10 }}>{matchError}</div>
      )}

      {picks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.4 }}>
            PICK
          </span>
          {picks.map((m) => (
            <button
              key={m.shot.id}
              type="button"
              onClick={() => onPickMatch?.(m.shot)}
              title={`${Math.round(m.score)}%`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                maxWidth: '100%',
                padding: '3px 8px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 10 }}>
                {Math.round(m.score)}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 140,
                }}
              >
                {m.shot.name}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onDismissMatches}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '0 2px',
              lineHeight: 1,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
