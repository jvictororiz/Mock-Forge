import { shallow } from 'zustand/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useI18n } from '../hooks/useI18n';

export function SessionCompareSelect() {
  const { t } = useI18n();
  const {
    sessions,
    compareSelection,
    compareOptions,
    comparisonLoading,
    selectForCompare,
    setCompareOptions,
    runComparison,
    clearComparison,
  } = useSessionStore(
    (state) => ({
      sessions: state.sessions,
      compareSelection: state.compareSelection,
      compareOptions: state.compareOptions,
      comparisonLoading: state.comparisonLoading,
      selectForCompare: state.selectForCompare,
      setCompareOptions: state.setCompareOptions,
      runComparison: state.runComparison,
      clearComparison: state.clearComparison,
    }),
    shallow,
  );

  const completedSessions = sessions.filter((session) => session.status === 'completed');

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{t.comparison.title}</h2>
          <p style={styles.subtitle}>{t.comparison.subtitle}</p>
        </div>
        <button type="button" style={styles.clearBtn} onClick={clearComparison}>
          {t.comparison.clear}
        </button>
      </div>

      <div style={styles.selectRow}>
        <label style={styles.field}>
          <span style={styles.label}>{t.comparison.sessionA}</span>
          <select
            value={compareSelection.sessionAId ?? ''}
            onChange={(e) => selectForCompare('a', e.target.value || null)}
            style={styles.select}
          >
            <option value="">{t.comparison.selectPlaceholder}</option>
            {completedSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>{t.comparison.sessionB}</span>
          <select
            value={compareSelection.sessionBId ?? ''}
            onChange={(e) => selectForCompare('b', e.target.value || null)}
            style={styles.select}
          >
            <option value="">{t.comparison.selectPlaceholder}</option>
            {completedSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={styles.options}>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={compareOptions.smartOrdering !== false}
            onChange={(e) => setCompareOptions({ smartOrdering: e.target.checked })}
          />
          <span>{t.comparison.smartOrdering}</span>
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={!!compareOptions.ignorePlatformNoise}
            onChange={(e) => setCompareOptions({ ignorePlatformNoise: e.target.checked })}
          />
          <span>{t.comparison.ignorePlatformNoise}</span>
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={!!compareOptions.ignoreTiming}
            onChange={(e) => setCompareOptions({ ignoreTiming: e.target.checked })}
          />
          <span>{t.comparison.ignoreTiming}</span>
        </label>
      </div>

      <button
        type="button"
        style={styles.compareBtn}
        onClick={() => void runComparison()}
        disabled={comparisonLoading}
      >
        {comparisonLoading ? t.comparison.comparing : t.comparison.compare}
      </button>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  clearBtn: {
    padding: '5px 10px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    flexShrink: 0,
  },
  selectRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '10px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  select: {
    padding: '8px 10px',
    fontSize: '12px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  options: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  checkbox: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  compareBtn: {
    alignSelf: 'flex-start',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--accent)',
    borderRadius: 'var(--radius)',
  },
};
