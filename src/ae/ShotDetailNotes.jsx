import { useEffect, useState } from 'react';
import { createNote, fetchNotes } from '../api/ftrack.js';

/**
 * Compact notes list + composer for Shots detail (CEP / mobile).
 * @param {{ parentId: string, parentType: string, label?: string }} props
 */
export default function ShotDetailNotes({ parentId, parentType, label = '' }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!parentId) {
      setNotes([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchNotes(parentId)
      .then((rows) => {
        if (!cancelled) setNotes(rows || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load notes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  const post = async () => {
    const content = text.trim();
    if (!content || !parentId || !parentType) return;
    setBusy(true);
    setError('');
    try {
      await createNote(parentId, parentType, content, { isTodo: false });
      setText('');
      const rows = await fetchNotes(parentId);
      setNotes(rows || []);
    } catch (err) {
      setError(err.message || 'Failed to post note');
    } finally {
      setBusy(false);
    }
  };

  if (!parentId) {
    return (
      <div style={{ padding: '8px 20px 16px', color: 'var(--muted)', fontSize: 12 }}>
        Select a version to leave notes.
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 12px' }}>
      <div className="section-label">
        Notes{label ? ` · ${label}` : ''}
      </div>
      {loading && (
        <div style={{ padding: '8px 20px', color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
      )}
      {!loading && notes.length === 0 && (
        <div style={{ padding: '4px 20px 8px', color: 'var(--muted)', fontSize: 12 }}>No notes yet</div>
      )}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notes.map((n) => (
          <div
            key={n.id}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
              {[n.author?.first_name, n.author?.last_name].filter(Boolean).join(' ') || 'User'}
              {n.frame_number != null ? ` · f${n.frame_number}` : ''}
              {n.category?.name ? ` · ${n.category.name}` : ''}
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {n.content}
            </div>
          </div>
        ))}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            parentType === 'AssetVersion'
              ? 'Leave a note on this version…'
              : 'Leave a note…'
          }
          rows={3}
          style={{
            width: '100%',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          disabled={!text.trim() || busy}
          onClick={post}
          style={{
            alignSelf: 'flex-start',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: text.trim() && !busy ? 'pointer' : 'default',
            opacity: !text.trim() || busy ? 0.45 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? 'Posting…' : 'Post note'}
        </button>
        {error && (
          <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
