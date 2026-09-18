import React from 'react';

interface DeviceLabelProps {
  name?: string;
  address?: string;
  placeholder?: string;
  active?: boolean;
}

export function DeviceLabel({ name, address, placeholder, active }: DeviceLabelProps) {
  if (!name && !address) {
    return <span style={styles.placeholder}>{placeholder ?? 'Sem device'}</span>;
  }

  return (
    <div style={styles.col}>
      <span style={{ ...styles.name, ...(active ? styles.nameActive : {}) }}>
        {name ?? address}
      </span>
      {address && name && address !== name && (
        <span style={styles.address}>{address}</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  col: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    minWidth: 0,
    lineHeight: 1.25,
  },
  name: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '160px',
  },
  nameActive: {
    color: 'var(--accent)',
  },
  address: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '160px',
  },
  placeholder: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
};
