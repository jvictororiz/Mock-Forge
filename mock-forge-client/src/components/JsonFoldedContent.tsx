import React, { memo, useMemo } from 'react';
import type { FoldedLine } from '../utils/jsonFold';
import { JSON_EDITOR_LINE_LAYOUT } from '../utils/jsonDisplay';
import { escapeHtml } from '../utils/jsonHighlight';
import { highlightFoldedLines } from '../utils/jsonSearchHighlight';

export const JsonFoldedContent = memo(function JsonFoldedContent({
  foldedLines,
  query = '',
  activeMatchIndex = 0,
  errorLine,
  lineHeights,
  onToggleFold,
  style,
  lineStyle,
  plainText = false,
}: {
  foldedLines: FoldedLine[];
  query?: string;
  activeMatchIndex?: number;
  errorLine?: number | null;
  lineHeights?: number[];
  onToggleFold?: (sourceLine: number) => void;
  style?: React.CSSProperties;
  lineStyle?: React.CSSProperties;
  plainText?: boolean;
}) {
  const lines = useMemo(() => {
    if (plainText) {
      return foldedLines.map((line) => ({
        html: escapeHtml(line.text) || '&nbsp;',
        sourceLine: line.sourceLine,
        isCollapsed: line.isCollapsed,
      }));
    }

    return highlightFoldedLines(foldedLines, query, activeMatchIndex);
  }, [activeMatchIndex, foldedLines, plainText, query]);

  return (
    <div style={style}>
      {lines.map((line, index) => (
        <div
          key={line.sourceLine}
          className={[
            line.isCollapsed ? 'json-folded-line' : undefined,
            line.sourceLine === errorLine ? 'json-error-line' : undefined,
          ].filter(Boolean).join(' ') || undefined}
          data-json-error-line={line.sourceLine === errorLine ? 'true' : undefined}
          style={{
            ...JSON_EDITOR_LINE_LAYOUT,
            ...lineStyle,
            minHeight: lineHeights?.[index],
            height: lineHeights?.[index],
          }}
          onClick={
            line.isCollapsed
              ? () => onToggleFold?.(line.sourceLine)
              : undefined
          }
          role={line.isCollapsed ? 'button' : undefined}
          tabIndex={line.isCollapsed ? -1 : undefined}
          aria-label={line.isCollapsed ? 'Expand block' : undefined}
          dangerouslySetInnerHTML={{ __html: line.html || '&nbsp;' }}
        />
      ))}
    </div>
  );
});
