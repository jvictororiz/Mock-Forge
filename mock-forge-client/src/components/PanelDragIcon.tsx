import React from 'react';

interface PanelDragIconProps {
  title?: string;
}

export function PanelDragIcon({ title }: PanelDragIconProps) {
  return (
    <span
      style={styles.icon}
      aria-hidden={title ? undefined : true}
      title={title}
      aria-label={title}
    >
      <span style={styles.grip}>
        <span style={styles.dot} />
        <span style={styles.dot} />
        <span style={styles.dot} />
        <span style={styles.dot} />
        <span style={styles.dot} />
        <span style={styles.dot} />
      </span>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '14px',
    height: '14px',
    color: 'var(--text-muted)',
    opacity: 0.55,
    pointerEvents: 'none',
  },
  grip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 3px)',
    gap: '2px',
  },
  dot: {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    background: 'currentColor',
  },
};
