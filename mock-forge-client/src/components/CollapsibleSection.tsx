import React, { useEffect, useState } from 'react';
import { CopyButton } from './CopyButton';

export function CollapsibleSection({
  title,
  copyValue,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  resetKey,
  sectionId,
  children,
}: {
  title: string;
  copyValue?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  resetKey?: string | number;
  sectionId?: string;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  useEffect(() => {
    if (isControlled || resetKey === undefined) return;
    setInternalOpen(defaultOpen);
  }, [defaultOpen, isControlled, resetKey]);

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <div style={styles.section} data-collapsible-section={sectionId}>
      <div style={styles.header}>
        <button
          type="button"
          style={styles.toggle}
          onClick={() => setOpen(!open)}
        >
          <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
          <span style={styles.title}>{title}</span>
        </button>
        {copyValue ? <CopyButton value={copyValue} /> : null}
      </div>
      {open ? <div style={styles.body}>{children}</div> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: '12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 10px',
    background: 'var(--bg-tertiary)',
    borderBottom: '1px solid var(--border)',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    textAlign: 'left',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  chevron: {
    width: '12px',
    color: 'var(--text-muted)',
  },
  title: {
    flex: 1,
  },
  body: {
    padding: '8px',
  },
};
