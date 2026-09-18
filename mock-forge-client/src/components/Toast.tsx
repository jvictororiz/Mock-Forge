import React from 'react';
import { useToastStore, type Toast as ToastItem, type ToastType } from '../stores/toastStore';

const TYPE_STYLES: Record<ToastType, React.CSSProperties> = {
  error: {
    borderColor: 'var(--danger)',
    background: 'rgba(249, 62, 62, 0.12)',
  },
  success: {
    borderColor: 'var(--accent)',
    background: 'rgba(73, 204, 144, 0.12)',
  },
  info: {
    borderColor: 'var(--info)',
    background: 'rgba(97, 175, 254, 0.12)',
  },
};

function ToastMessage({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      role="status"
      style={{ ...styles.toast, ...TYPE_STYLES[toast.type] }}
      onClick={() => removeToast(toast.id)}
    >
      {toast.message}
    </div>
  );
}

export function Toast() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container} aria-live="polite">
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    right: 16,
    bottom: 40,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 360,
    pointerEvents: 'none',
  },
  toast: {
    pointerEvents: 'auto',
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.4,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    cursor: 'pointer',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};
