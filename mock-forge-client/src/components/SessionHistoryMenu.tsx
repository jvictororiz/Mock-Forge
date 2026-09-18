import { createPortal } from 'react-dom';
import type { Ref } from 'react';
import type { FloatingMenuState } from '../hooks/useFloatingMenu';

export function SessionHistoryMenu({
  menu,
  menuRef,
  busy,
  labels,
  onView,
  onExport,
  onMockRecording,
  onDelete,
}: {
  menu: FloatingMenuState<string> | null;
  menuRef: Ref<HTMLDivElement>;
  busy: boolean;
  labels: {
    view: string;
    export: string;
    mockRecording: string;
    mockingRecording: string;
    delete: string;
  };
  onView: () => void;
  onExport: () => void;
  onMockRecording: () => void;
  onDelete: () => void;
}) {
  if (!menu) return null;

  const menuWidth = 180;
  const menuHeight = 152;
  const x = Math.min(menu.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(menu.y, window.innerHeight - menuHeight - 8);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...styles.menu,
        left: Math.max(8, x),
        top: Math.max(8, y),
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        style={styles.menuItem}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onView();
        }}
      >
        {labels.view}
      </button>
      <button
        type="button"
        style={styles.menuItem}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onExport();
        }}
      >
        {labels.export}
      </button>
      <button
        type="button"
        style={styles.menuItem}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onMockRecording();
        }}
      >
        {busy ? labels.mockingRecording : labels.mockRecording}
      </button>
      <button
        type="button"
        style={{ ...styles.menuItem, color: 'var(--danger)' }}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        {labels.delete}
      </button>
    </div>,
    document.body,
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    minWidth: '180px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    zIndex: 1000,
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
