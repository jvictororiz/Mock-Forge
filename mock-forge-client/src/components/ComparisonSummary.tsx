import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useI18n } from '../hooks/useI18n';
import { MethodBadge } from './MethodBadge';
import type { ComparisonPair } from '../../shared/comparisonTypes';

function getDiffPairs(pairs: ComparisonPair[]): ComparisonPair[] {
  return pairs.filter((pair) => pair.status !== 'identical');
}

export function ComparisonSummary() {
  const { t } = useI18n();
  const { comparisonResult, selectedDiffPairKey, selectDiffPair } = useSessionStore(
    (state) => ({
      comparisonResult: state.comparisonResult,
      selectedDiffPairKey: state.selectedDiffPairKey,
      selectDiffPair: state.selectDiffPair,
    }),
    shallow,
  );

  const diffPairs = useMemo(
    () => (comparisonResult ? getDiffPairs(comparisonResult.pairs) : []),
    [comparisonResult],
  );

  if (!comparisonResult) return null;

  const { summary } = comparisonResult;
  const cards = [
    { label: t.comparison.summary.totalA, value: summary.totalA },
    { label: t.comparison.summary.totalB, value: summary.totalB },
    { label: t.comparison.summary.matched, value: summary.matched },
    { label: t.comparison.summary.onlyInA, value: summary.onlyInA },
    { label: t.comparison.summary.onlyInB, value: summary.onlyInB },
    { label: t.comparison.summary.withDifferences, value: summary.withDifferences, accent: true },
    { label: t.comparison.summary.identical, value: summary.identical },
    { label: t.comparison.summary.statusCodeDiffs, value: summary.statusCodeDiffs },
  ];

  return (
    <section style={styles.section}>
      <div style={styles.cards}>
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              ...styles.card,
              ...(card.accent ? styles.cardAccent : {}),
            }}
          >
            <span style={styles.cardValue}>{card.value}</span>
            <span style={styles.cardLabel} title={card.label}>{card.label}</span>
          </div>
        ))}
      </div>

      <div style={styles.diffSection}>
        <h3 style={styles.diffTitle}>{t.comparison.criticalDiffs}</h3>
        {diffPairs.length === 0 ? (
          <p style={styles.empty}>{t.comparison.noCriticalDiffs}</p>
        ) : (
          <div style={styles.diffList}>
            {diffPairs.map((pair) => {
              const isSelected = selectedDiffPairKey === pair.key;
              const record = pair.recordA ?? pair.recordB;
              return (
                <button
                  key={pair.key}
                  type="button"
                  style={{
                    ...styles.diffItem,
                    ...(isSelected ? styles.diffItemSelected : {}),
                  }}
                  onClick={() => selectDiffPair(pair.key)}
                >
                  <div style={styles.diffHeader}>
                    {record && <MethodBadge method={record.method} />}
                    <span style={styles.diffPath}>{record?.path ?? pair.key}</span>
                  </div>
                  <div style={styles.diffFooter}>
                    <span style={styles.severityBadge}>
                      {t.comparison.pairStatus[pair.status]}
                    </span>
                    <span style={styles.diffKind}>
                      {t.comparison.diffCount(pair.diffs.filter((diff) => !diff.ignored).length)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
    gap: '8px',
  },
  card: {
    padding: '8px 10px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  cardAccent: {
    borderColor: 'rgba(255, 99, 99, 0.45)',
    background: 'rgba(255, 99, 99, 0.08)',
  },
  cardValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.1,
  },
  cardLabel: {
    fontSize: '8px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    lineHeight: 1.25,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  diffSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  diffTitle: {
    margin: 0,
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  empty: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  diffList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '8px',
  },
  diffItem: {
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  diffItemSelected: {
    borderColor: 'var(--accent)',
    background: 'rgba(73, 204, 144, 0.06)',
  },
  diffHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    minWidth: 0,
  },
  diffPath: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-primary)',
    flex: 1,
    minWidth: 0,
    wordBreak: 'break-all',
    lineHeight: 1.35,
  },
  diffFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexWrap: 'wrap',
  },
  severityBadge: {
    fontSize: '9px',
    fontWeight: 700,
    color: 'var(--danger)',
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'rgba(255, 99, 99, 0.12)',
    border: '1px solid rgba(255, 99, 99, 0.35)',
  },
  diffKind: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
};
