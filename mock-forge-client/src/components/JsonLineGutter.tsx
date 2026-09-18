import React from 'react';
import { getLineCount, JSON_LINE_HEIGHT_PX } from '../utils/jsonDisplay';
import type { FoldedLine } from '../utils/jsonFold';

export const jsonLineNumberStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  lineHeight: 1.6,
  color: 'var(--text-muted)',
  minHeight: '1.6em',
};

export const jsonGutterStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '10px 0',
  paddingLeft: '4px',
  paddingRight: '6px',
  borderRight: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  userSelect: 'none',
};

const jsonGutterRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  gap: '2px',
  minHeight: '1.6em',
};

const jsonFoldSlotStyle: React.CSSProperties = {
  width: '18px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const jsonFoldButtonStyle: React.CSSProperties = {
  width: '18px',
  height: '1.6em',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function JsonLineGutter({
  text,
  foldedLines,
  minHeight,
  errorLine,
  lineHeights,
  onToggleFold,
}: {
  text?: string;
  foldedLines?: FoldedLine[];
  minHeight?: number;
  errorLine?: number | null;
  lineHeights?: number[];
  onToggleFold?: (sourceLine: number) => void;
}) {
  const rows = foldedLines
    ? foldedLines.map((line) => ({
        lineNumber: line.sourceLine + 1,
        foldStart: line.isFoldStart ? line.sourceLine : undefined,
        isCollapsed: line.isCollapsed,
      }))
    : Array.from({ length: getLineCount(text ?? '') }, (_, index) => ({
        lineNumber: index + 1,
        foldStart: undefined,
        isCollapsed: false,
      }));

  return (
    <div style={{ ...jsonGutterStyle, minHeight }}>
      {rows.map((row, index) => (
        <div
          key={`${row.lineNumber}-${row.foldStart ?? 'plain'}`}
          style={{
            ...jsonGutterRowStyle,
            minHeight: lineHeights?.[index] ?? JSON_LINE_HEIGHT_PX,
            height: lineHeights?.[index],
          }}
        >
          <span style={jsonFoldSlotStyle}>
            {row.foldStart !== undefined ? (
              <button
                type="button"
                style={jsonFoldButtonStyle}
                onClick={() => onToggleFold?.(row.foldStart!)}
                aria-label={row.isCollapsed ? 'Expand block' : 'Collapse block'}
              >
                {row.isCollapsed ? '▸' : '▾'}
              </button>
            ) : null}
          </span>
          <span
            style={{
              ...jsonLineNumberStyle,
              ...(row.lineNumber - 1 === errorLine ? gutterStyles.errorLineNumber : {}),
            }}
          >
            {row.lineNumber}
          </span>
        </div>
      ))}
    </div>
  );
}

const gutterStyles: Record<string, React.CSSProperties> = {
  errorLineNumber: {
    color: 'var(--danger)',
    fontWeight: 700,
  },
};

export function JsonInlineFoldButton({
  isFoldStart,
  isCollapsed,
  onToggle,
}: {
  isFoldStart: boolean;
  isCollapsed: boolean;
  onToggle?: () => void;
}) {
  return (
    <span style={{ ...jsonFoldSlotStyle, width: '20px' }}>
      {isFoldStart ? (
        <button
          type="button"
          style={jsonFoldButtonStyle}
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand block' : 'Collapse block'}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
      ) : null}
    </span>
  );
}

export function JsonInlineLineNumber({ line }: { line: number }) {
  return (
    <span
      style={{
        ...jsonLineNumberStyle,
        display: 'block',
        width: '28px',
        flexShrink: 0,
        textAlign: 'right',
        paddingRight: '2px',
        color: 'var(--text-muted)',
      }}
    >
      {line}
    </span>
  );
}
