import React from 'react';
import { useLocaleStore } from '../stores/localeStore';

export function TabLoadingFallback() {
  const loadingLabel = useLocaleStore((state) => state.t.common?.loading ?? 'Loading…');

  return (
    <div style={styles.root} aria-busy="true" aria-live="polite">
      <span style={styles.spinner} aria-hidden />
      <span style={styles.label}>{loadingLabel}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    background: 'var(--bg-primary)',
  },
  label: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  spinner: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    animation: 'mockforge-spin 0.8s linear infinite',
  },
};
