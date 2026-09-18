import { useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useI18n } from '../hooks/useI18n';
import { SessionHistoryPanel } from './SessionHistoryPanel';
import { SessionTrafficLayout } from './SessionTrafficLayout';
import { SessionCompareSelect } from './SessionCompareSelect';
import { ComparisonSummary } from './ComparisonSummary';
import { ComparisonDiffView } from './ComparisonDiffView';

function SessionNamingPanel() {
  const { t } = useI18n();
  const { pendingNameDefault, finishNamingSession } = useSessionStore(
    (state) => ({
      pendingNameDefault: state.pendingNameDefault,
      finishNamingSession: state.finishNamingSession,
    }),
    shallow,
  );
  const [name, setName] = useState(pendingNameDefault);

  useEffect(() => {
    setName(pendingNameDefault);
  }, [pendingNameDefault]);

  return (
    <div style={styles.namingPanel}>
      <h2 style={styles.namingTitle}>{t.sessions.nameSessionTitle}</h2>
      <p style={styles.namingSubtitle}>{t.sessions.nameSessionSubtitle}</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.sessions.nameSessionPlaceholder}
        style={styles.input}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void finishNamingSession(name);
        }}
      />
      <div style={styles.namingActions}>
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => void finishNamingSession(name)}
        >
          {t.sessions.nameSessionConfirm}
        </button>
        <button
          type="button"
          style={styles.secondaryBtn}
          onClick={() => void finishNamingSession(null)}
        >
          {t.sessions.nameSessionSkip}
        </button>
      </div>
    </div>
  );
}

export function HistoryLayout() {
  const { t } = useI18n();
  const { historyMode, pendingNameSessionId } = useSessionStore(
    (state) => ({
      historyMode: state.historyMode,
      pendingNameSessionId: state.pendingNameSessionId,
    }),
    shallow,
  );

  return (
    <div style={styles.layout}>
      <SessionHistoryPanel />
      <div style={styles.main}>
        {pendingNameSessionId ? (
          <SessionNamingPanel />
        ) : historyMode === 'session' ? (
          <SessionTrafficLayout />
        ) : historyMode === 'compare' ? (
          <div style={styles.compareLayout}>
            <SessionCompareSelect />
            <ComparisonSummary />
            <ComparisonDiffView />
          </div>
        ) : (
          <div style={styles.empty}>
            <p style={styles.emptyText}>{t.sessions.selectSession}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minWidth: 0,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
    background: 'var(--bg-primary)',
  },
  compareLayout: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    minHeight: 0,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  emptyText: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    maxWidth: '360px',
    lineHeight: 1.5,
  },
  namingPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '32px',
    maxWidth: '420px',
    margin: '0 auto',
  },
  namingTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  namingSubtitle: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  namingActions: {
    display: 'flex',
    gap: '8px',
    width: '100%',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid var(--border)',
  },
};
