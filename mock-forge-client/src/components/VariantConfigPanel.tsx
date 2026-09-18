import React from 'react';

type VariantKind = 'request' | 'response';

const PANEL_THEMES: Record<VariantKind, {
  title: string;
  icon: string;
  accent: string;
  background: string;
  border: string;
  headerBackground: string;
  captionColor: string;
}> = {
  request: {
    title: 'Request variant',
    icon: '⬆',
    accent: 'var(--badge-request-color)',
    background: 'var(--badge-request-bg)',
    border: 'rgba(73, 204, 144, 0.35)',
    headerBackground: 'rgba(73, 204, 144, 0.08)',
    captionColor: 'var(--badge-request-color)',
  },
  response: {
    title: 'Response variant',
    icon: '⬇',
    accent: 'var(--badge-request-color)',
    background: 'var(--badge-request-bg)',
    border: 'rgba(73, 204, 144, 0.35)',
    headerBackground: 'rgba(73, 204, 144, 0.08)',
    captionColor: 'var(--badge-request-color)',
  },
};

export function VariantConfigPanel({
  kind,
  variantName,
  selector,
  children,
}: {
  kind: VariantKind;
  variantName: string;
  selector: React.ReactNode;
  children: React.ReactNode;
}) {
  const theme = PANEL_THEMES[kind];

  return (
    <div
      style={{
        ...styles.panel,
        background: theme.background,
        borderColor: theme.border,
        boxShadow: `inset 3px 0 0 ${theme.accent}`,
      }}
    >
      <div
        style={{
          ...styles.header,
          background: theme.headerBackground,
          borderBottomColor: theme.border,
        }}
      >
        <div style={styles.headerTop}>
          <span style={{ ...styles.headerIcon, color: theme.accent }}>{theme.icon}</span>
          <span style={{ ...styles.headerTitle, color: theme.accent }}>{theme.title}</span>
        </div>
        {selector}
        <div style={{ ...styles.caption, color: theme.captionColor }}>
          Configuration for <strong>{variantName}</strong>
        </div>
      </div>

      <div style={styles.body}>
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid',
    borderRadius: 'var(--radius)',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 12px 10px',
    borderBottom: '1px solid',
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  headerIcon: {
    fontSize: '11px',
    lineHeight: 1,
  },
  headerTitle: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  caption: {
    marginTop: '8px',
    fontSize: '11px',
    lineHeight: 1.4,
  },
  body: {
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.14)',
  },
};
