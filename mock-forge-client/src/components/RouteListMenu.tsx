import { createPortal } from 'react-dom';
import type { Ref } from 'react';
import type { Route } from '../types';
import type { FloatingMenuState } from '../hooks/useFloatingMenu';
import { hasActiveRequestMock, hasActiveResponseMock } from '../../shared/routeUtils';

export function RouteListMenu({
  menu,
  menuRef,
  route,
  executingRouteId,
  labels,
  onRequestMockChange,
  onResponseMockChange,
  onDuplicate,
  onExport,
  onImport,
  onExecute,
  onDelete,
  onCopyCurl,
}: {
  menu: FloatingMenuState<string> | null;
  menuRef: Ref<HTMLDivElement>;
  route: Route | undefined;
  executingRouteId: string | null;
  labels: {
    request: string;
    response: string;
    duplicate: string;
    export: string;
    import: string;
    execute: string;
    executing: string;
    delete: string;
    copyCurl: string;
  };
  onRequestMockChange: (enabled: boolean) => void;
  onResponseMockChange: (enabled: boolean) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onImport: () => void;
  onExecute: () => void;
  onDelete: () => void;
  onCopyCurl: () => void;
}) {
  if (!menu || !route) return null;

  const requestMockActive = hasActiveRequestMock(route);
  const responseMockActive = hasActiveResponseMock(route);
  const menuWidth = 200;
  const menuHeight = 332;
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
      <div style={styles.mockToggles}>
        <label style={styles.toggleRow}>
          <span style={styles.requestLabel}>{labels.request}</span>
          <input
            type="checkbox"
            checked={requestMockActive}
            style={styles.toggleCheckbox}
            onChange={(event) => {
              event.stopPropagation();
              onRequestMockChange(event.target.checked);
            }}
          />
        </label>
        <label style={styles.toggleRow}>
          <span style={styles.responseLabel}>{labels.response}</span>
          <input
            type="checkbox"
            checked={responseMockActive}
            style={styles.toggleCheckbox}
            onChange={(event) => {
              event.stopPropagation();
              onResponseMockChange(event.target.checked);
            }}
          />
        </label>
      </div>
      <div style={styles.menuDivider} />
      <button type="button" style={styles.menuItem} onClick={(event) => { event.stopPropagation(); onDuplicate(); }}>
        {labels.duplicate}
      </button>
      <button type="button" style={styles.menuItem} onClick={(event) => { event.stopPropagation(); onExport(); }}>
        {labels.export}
      </button>
      <button type="button" style={styles.menuItem} onClick={(event) => { event.stopPropagation(); onImport(); }}>
        {labels.import}
      </button>
      <button type="button" style={styles.menuItem} onClick={(event) => { event.stopPropagation(); onCopyCurl(); }}>
        {labels.copyCurl}
      </button>
      <button
        type="button"
        style={{
          ...styles.menuItem,
          ...(executingRouteId === route.id ? styles.menuItemLoading : {}),
        }}
        disabled={executingRouteId === route.id}
        onClick={(event) => {
          event.stopPropagation();
          onExecute();
        }}
      >
        {executingRouteId === route.id ? labels.executing : labels.execute}
      </button>
      <button
        type="button"
        style={{ ...styles.menuItem, color: 'var(--danger)' }}
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
    minWidth: '200px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  mockToggles: {
    padding: '8px 12px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  requestLabel: {
    color: 'var(--badge-request-color)',
    fontWeight: 600,
  },
  responseLabel: {
    color: 'var(--badge-response-color)',
    fontWeight: 600,
  },
  toggleCheckbox: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  menuDivider: {
    height: '1px',
    background: 'var(--border)',
    margin: '4px 0',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  menuItemLoading: {
    opacity: 0.7,
    cursor: 'wait',
  },
};
