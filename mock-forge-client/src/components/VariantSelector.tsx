import React, { useEffect, useRef, useState } from 'react';

export interface VariantOption {
  id: string;
  name: string;
}

interface VariantSelectorProps {
  label: string;
  variants: VariantOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  embedded?: boolean;
}

export function VariantSelector({
  label,
  variants,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  embedded = false,
}: VariantSelectorProps) {
  const activeId = selectedId || variants[0]?.id;
  const activeVariant = variants.find((variant) => variant.id === activeId);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;

    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };

    window.addEventListener('mousedown', closeMenu);
    return () => window.removeEventListener('mousedown', closeMenu);
  }, [menu]);

  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus({ preventScroll: true });
    renameInputRef.current?.select();
  }, [renamingId]);

  const startRename = (id: string) => {
    const variant = variants.find((item) => item.id === id);
    if (!variant) return;
    setRenamingId(id);
    setRenameValue(variant.name);
    setMenu(null);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRename(renamingId, trimmed);
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!activeId) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <div style={embedded ? styles.containerEmbedded : styles.container}>
      {!embedded && <label style={styles.label}>{label}</label>}
      <div style={styles.row}>
        {renamingId === activeId ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitRename();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelRename();
              }
            }}
            style={styles.select}
          />
        ) : (
          <select
            value={activeId || ''}
            onChange={(e) => onSelect(e.target.value)}
            onContextMenu={handleContextMenu}
            style={styles.select}
            title="Right-click to rename"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{variant.name}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={onAdd} style={styles.addBtn} title={`Add ${label.toLowerCase()}`}>
          +
        </button>
        {variants.length > 1 && activeId && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove "${activeVariant?.name}"?`)) {
                onRemove(activeId);
              }
            }}
            style={styles.removeBtn}
            title={`Remove ${label.toLowerCase()}`}
          >
            ×
          </button>
        )}
      </div>

      {menu && activeId && (
        <div
          ref={menuRef}
          style={{
            ...styles.menu,
            left: menu.x,
            top: menu.y,
          }}
        >
          <button
            type="button"
            style={styles.menuItem}
            onClick={() => startRename(activeId)}
          >
            Rename
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '16px',
    position: 'relative',
  },
  containerEmbedded: {
    marginBottom: 0,
    position: 'relative',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  row: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  select: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '12px',
  },
  addBtn: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius)',
    fontSize: '16px',
    color: 'var(--accent)',
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  removeBtn: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius)',
    fontSize: '16px',
    color: 'var(--danger)',
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  menu: {
    position: 'fixed',
    minWidth: '120px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    zIndex: 100,
    overflow: 'hidden',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
};
