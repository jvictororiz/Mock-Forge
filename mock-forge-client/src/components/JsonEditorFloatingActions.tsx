import React, { useMemo, useState } from 'react';
import { isValidJson, prettifyJsonIfPossible } from '../../shared/jsonFormat';
import { repairJsonIfPossible } from '../../shared/jsonRepair';
import { JsonFloatingAnchor } from './JsonFloatingAnchor';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const BOTTOM_INSET = 24;

function AiSparklesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.5 2 10.8 6.2 15 7.5 10.8 8.8 9.5 13 8.2 8.8 4 7.5 8.2 6.2 9.5 2Z" />
      <path d="M18 14 18.8 16.5 21.5 17.3 18.8 18.1 18 20.5 17.2 18.1 14.5 17.3 17.2 16.5 18 14Z" />
      <path d="M5 16 5.5 17.8 7.3 18.3 5.5 18.8 5 20.5 4.5 18.8 2.7 18.3 4.5 17.8 5 16Z" />
    </svg>
  );
}

export function JsonEditorFloatingActions({
  containerRef,
  value,
  onChange,
}: {
  containerRef: React.RefObject<HTMLElement>;
  value: string;
  onChange: (value: string) => void;
}) {
  const debouncedValue = useDebouncedValue(value, 150);
  const canFormat = useMemo(() => isValidJson(debouncedValue), [debouncedValue]);
  const canRepair = !canFormat && debouncedValue.trim().length > 0;
  const [repairing, setRepairing] = useState(false);

  if (!value.trim()) return null;

  const handleFormat = () => {
    if (!canFormat) return;
    onChange(prettifyJsonIfPossible(value));
  };

  const handleRepair = () => {
    if (repairing) return;

    setRepairing(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        try {
          const repaired = repairJsonIfPossible(value);
          if (repaired) onChange(repaired);
        } finally {
          setRepairing(false);
        }
      }, 0);
    });
  };

  return (
    <JsonFloatingAnchor containerRef={containerRef} placement="bottom" inset={BOTTOM_INSET}>
      <div style={styles.row}>
        {canRepair ? (
          <button
            type="button"
            style={{
              ...styles.repairButton,
              ...(repairing ? styles.repairButtonBusy : {}),
            }}
            onClick={handleRepair}
            disabled={repairing}
            title={repairing ? 'Fixing JSON…' : 'Fix JSON automatically'}
            aria-label={repairing ? 'Fixing JSON' : 'Fix JSON automatically'}
            aria-busy={repairing}
          >
            {repairing ? <span style={styles.spinner} aria-hidden /> : <AiSparklesIcon />}
          </button>
        ) : null}
        <button
          type="button"
          style={{
            ...styles.formatButton,
            opacity: canFormat ? 1 : 0.45,
            cursor: canFormat ? 'pointer' : 'not-allowed',
          }}
          onClick={handleFormat}
          disabled={!canFormat}
          title={canFormat ? 'Identar JSON' : 'JSON inválido'}
          aria-label="Identar JSON"
        >
          <span style={styles.formatIcon}>{'{ }'}</span>
        </button>
      </div>
    </JsonFloatingAnchor>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  repairButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    borderRadius: '999px',
    border: '1px solid #7c3aed',
    background: '#8b5cf6',
    color: '#fff',
    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.25)',
    transition: 'background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
  },
  repairButtonBusy: {
    cursor: 'wait',
    opacity: 0.9,
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.35)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'mockforge-spin 0.7s linear infinite',
    flexShrink: 0,
  },
  formatButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    borderRadius: '999px',
    border: '1px solid var(--accent-hover)',
    background: 'var(--accent)',
    color: '#1a1a1f',
    boxShadow: '0 4px 14px rgba(73, 204, 144, 0.35), 0 0 0 1px rgba(73, 204, 144, 0.2)',
    transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
  },
  formatIcon: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1,
  },
};
