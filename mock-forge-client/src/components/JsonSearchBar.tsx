import React from 'react';

export function JsonSearchBar({
  inputRef,
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const counter = matchCount > 0
    ? `${activeIndex + 1}/${matchCount}`
    : query.trim()
      ? '0/0'
      : '';

  return (
    <div style={styles.bar} onMouseDown={(event) => event.stopPropagation()}>
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        placeholder="Find in JSON"
        spellCheck={false}
        style={styles.input}
      />
      <span style={styles.counter}>{counter}</span>
      <button type="button" style={styles.btn} onClick={onPrev} title="Previous match (Shift+Enter)">
        ↑
      </button>
      <button type="button" style={styles.btn} onClick={onNext} title="Next match (Enter)">
        ↓
      </button>
      <button type="button" style={styles.btn} onClick={onClose} title="Close (Esc)">
        ×
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 6px',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(73, 204, 144, 0.5)',
    background: 'linear-gradient(180deg, #34343f 0%, #2a2a34 100%)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(73, 204, 144, 0.12)',
    pointerEvents: 'auto',
  },
  input: {
    width: '160px',
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
    border: '1px solid rgba(73, 204, 144, 0.35)',
    borderRadius: '4px',
  },
  counter: {
    minWidth: '34px',
    textAlign: 'center',
    fontSize: '10px',
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
  },
  btn: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    background: 'var(--bg-hover)',
    border: '1px solid rgba(73, 204, 144, 0.25)',
  },
};
