import React, { useState } from 'react';

export function CopyButton({ value, title = 'Copy' }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      className={`copy-btn${copied ? ' copy-btn--copied' : ''}`}
      style={styles.btn}
      title={copied ? 'Copied!' : title}
      aria-label={title}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    width: '24px',
    height: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    flexShrink: 0,
    cursor: 'pointer',
  },
};
