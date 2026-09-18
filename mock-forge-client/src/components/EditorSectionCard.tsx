import React, { useEffect, useState } from 'react';
import type { JsonEditorStatus } from '../../shared/jsonFormat';

type SectionKind = 'request' | 'response' | 'neutral';

const GREEN_THEME = {
  accent: 'var(--badge-request-color)',
  border: 'rgba(73, 204, 144, 0.35)',
  headerBg: 'rgba(73, 204, 144, 0.08)',
};

const RED_THEME = {
  accent: 'var(--danger)',
  border: 'rgba(249, 62, 62, 0.45)',
  headerBg: 'rgba(249, 62, 62, 0.08)',
};

const NEUTRAL_THEME = {
  accent: 'var(--text-secondary)',
  border: 'var(--border)',
  headerBg: 'var(--bg-tertiary)',
};

function resolveTheme(kind: SectionKind, jsonStatus?: JsonEditorStatus) {
  if (jsonStatus === 'invalid') return RED_THEME;
  if (kind === 'neutral') return NEUTRAL_THEME;
  return GREEN_THEME;
}

export function EditorSectionCard({
  title,
  description,
  kind = 'neutral',
  jsonStatus,
  defaultOpen = true,
  resetKey,
  headerAction,
  children,
}: {
  title: string;
  description?: string;
  kind?: SectionKind;
  jsonStatus?: JsonEditorStatus;
  defaultOpen?: boolean;
  resetKey?: string | number;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const theme = resolveTheme(kind, jsonStatus);

  useEffect(() => {
    if (resetKey === undefined) return;
    setOpen(defaultOpen);
  }, [defaultOpen, resetKey]);

  return (
    <div
      style={{
        ...styles.card,
        borderColor: theme.border,
        boxShadow: kind !== 'neutral' ? `inset 3px 0 0 ${theme.accent}` : undefined,
      }}
    >
      <div
        style={{
          ...styles.header,
          background: theme.headerBg,
          borderBottom: open ? `1px solid ${theme.border}` : 'none',
        }}
      >
        <button
          type="button"
          style={styles.toggle}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
          <div style={styles.headerText}>
            <div style={styles.titleRow}>
              <div style={{ ...styles.title, color: theme.accent }}>{title}</div>
              {jsonStatus === 'invalid' ? (
                <span style={styles.jsonErrorHint}>(F2 to find the error)</span>
              ) : null}
            </div>
            {description && open ? <p style={styles.description}>{description}</p> : null}
          </div>
        </button>
        {headerAction ? (
          <div
            style={styles.headerAction}
            onClick={(event) => event.stopPropagation()}
          >
            {headerAction}
          </div>
        ) : null}
      </div>
      {open ? <div style={styles.body}>{children}</div> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid',
    borderRadius: 'var(--radius)',
    marginBottom: '12px',
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '10px 12px',
  },
  toggle: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    color: 'inherit',
  },
  chevron: {
    width: '16px',
    marginTop: '0',
    flexShrink: 0,
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: 1.2,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerAction: {
    flexShrink: 0,
    paddingTop: '1px',
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    width: '100%',
  },
  jsonErrorHint: {
    color: 'var(--danger)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: 'normal',
    textTransform: 'none',
    flexShrink: 0,
  },
  description: {
    margin: '4px 0 0',
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  body: {
    padding: '12px',
  },
};
