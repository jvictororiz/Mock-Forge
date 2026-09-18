import type { CSSProperties } from 'react';

export const JSON_FONT_SIZE = 11;
export const JSON_LINE_HEIGHT = 1.6;
export const JSON_LINE_HEIGHT_PX = JSON_FONT_SIZE * JSON_LINE_HEIGHT;
export const JSON_EDITOR_HORIZONTAL_PADDING_PX = 24;

export const JSON_EDITOR_LINE_LAYOUT: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: `${JSON_FONT_SIZE}px`,
  lineHeight: JSON_LINE_HEIGHT,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export function getLineCount(text: string): number {
  return getVisibleLineCount(text);
}

export function getLastContentLineIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '') return i;
  }
  return 0;
}

export function getVisibleLineCount(text: string): number {
  if (!text) return 1;
  const lines = text.split('\n');
  const lastContent = getLastContentLineIndex(lines);
  return Math.max(1, Math.min(lines.length, lastContent + 2));
}

export function collapseTrailingBlankLines(text: string): string {
  if (!text) return text;
  return text.replace(/(\r?\n[ \t]*){2,}$/, '\n');
}

export function getDisplayLines(text: string): string[] {
  const lines = text.split('\n');
  return lines.slice(0, getVisibleLineCount(text));
}
