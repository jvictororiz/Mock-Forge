import { useMemo } from 'react';
import { diffJsonContent, renderDiffLineHtml } from '../utils/jsonLineDiff';

function isChangedRow(type: string): boolean {
  return type !== 'equal';
}

export function JsonDiffViewer({
  left,
  right,
  smartOrdering = false,
  highlightRowIndex = null,
}: {
  left: string;
  right: string;
  smartOrdering?: boolean;
  highlightRowIndex?: number | null;
}) {
  const rows = useMemo(
    () => diffJsonContent(left, right, smartOrdering),
    [left, right, smartOrdering],
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.column}>
        {(() => {
          let lineNumber = 0;
          return rows.map((row, index) => {
            if (row.leftLine !== null) lineNumber += 1;
            const isActive = highlightRowIndex === index && isChangedRow(row.type);
            return (
              <div
                key={`left-${index}`}
                data-diff-row={isChangedRow(row.type) ? index : undefined}
                data-diff-active={isActive ? 'true' : undefined}
                style={{
                  ...styles.line,
                  ...(row.type === 'left' ? styles.lineChangedLeft : {}),
                  ...(isActive ? styles.lineActive : {}),
                }}
              >
                <span style={styles.gutter}>{row.leftLine !== null ? lineNumber : ''}</span>
                <code
                  style={styles.code}
                  dangerouslySetInnerHTML={{
                    __html: renderDiffLineHtml(row.leftLine, row.rightLine, row.type, 'left'),
                  }}
                />
              </div>
            );
          });
        })()}
      </div>
      <div style={styles.divider} />
      <div style={styles.column}>
        {(() => {
          let lineNumber = 0;
          return rows.map((row, index) => {
            if (row.rightLine !== null) lineNumber += 1;
            const isActive = highlightRowIndex === index && isChangedRow(row.type);
            return (
              <div
                key={`right-${index}`}
                data-diff-row={isChangedRow(row.type) ? index : undefined}
                data-diff-active={isActive ? 'true' : undefined}
                style={{
                  ...styles.line,
                  ...(row.type === 'right' ? styles.lineChangedRight : {}),
                  ...(isActive ? styles.lineActive : {}),
                }}
              >
                <span style={styles.gutter}>{row.rightLine !== null ? lineNumber : ''}</span>
                <code
                  style={styles.code}
                  dangerouslySetInnerHTML={{
                    __html: renderDiffLineHtml(row.rightLine, row.leftLine, row.type, 'right'),
                  }}
                />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'grid',
    gridTemplateColumns: '1fr 1px 1fr',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  column: {
    minWidth: 0,
  },
  divider: {
    background: 'var(--border)',
  },
  line: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '0 10px 0 0',
    minHeight: '18px',
    borderBottom: '1px solid rgba(58, 58, 68, 0.35)',
  },
  lineChangedLeft: {
    background: 'rgba(249, 62, 62, 0.08)',
  },
  lineChangedRight: {
    background: 'rgba(73, 204, 144, 0.08)',
  },
  lineActive: {
    boxShadow: 'inset 0 0 0 1px var(--accent)',
    background: 'rgba(97, 175, 254, 0.12)',
  },
  gutter: {
    width: '28px',
    flexShrink: 0,
    textAlign: 'right',
    padding: '1px 0',
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    userSelect: 'none',
  },
  code: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    padding: '1px 0',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--text-primary)',
  },
};
