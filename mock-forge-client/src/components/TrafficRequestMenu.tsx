import { createPortal } from 'react-dom';
import type { Ref } from 'react';
import type { TrafficRequestMenuState } from '../hooks/useTrafficRequestMenu';

export function TrafficRequestMenu({
  menu,
  menuRef,
  mockingId,
  mockRequestLabel,
  mockResponseLabel,
  copyCurlLabel,
  onMockRequest,
  onMockResponse,
  onCopyCurl,
}: {
  menu: TrafficRequestMenuState | null;
  menuRef: Ref<HTMLDivElement>;
  mockingId: string | null;
  mockRequestLabel: string;
  mockResponseLabel: string;
  copyCurlLabel: string;
  onMockRequest: () => void;
  onMockResponse: () => void;
  onCopyCurl: () => void;
}) {
  if (!menu) return null;

  const menuWidth = 160;
  const menuHeight = 116;
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
        onClick={(event) => {
          event.stopPropagation();
          onMockRequest();
        }}
        disabled={mockingId === menu.requestId}
      >
        {mockRequestLabel}
      </button>
      <button
        type="button"
        style={styles.menuItem}
        onClick={(event) => {
          event.stopPropagation();
          onMockResponse();
        }}
        disabled={mockingId === menu.requestId}
      >
        {mockResponseLabel}
      </button>
      <button
        type="button"
        style={styles.menuItem}
        onClick={(event) => {
          event.stopPropagation();
          onCopyCurl();
        }}
      >
        {copyCurlLabel}
      </button>
    </div>,
    document.body,
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    minWidth: '160px',
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
