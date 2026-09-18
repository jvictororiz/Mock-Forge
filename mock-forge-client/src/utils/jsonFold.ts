import { getLastContentLineIndex } from './jsonDisplay';

export interface FoldRange {
  startLine: number;
  endLine: number;
  opener: '{' | '[';
}

export interface FoldedLine {
  text: string;
  sourceLine: number;
  isFoldStart: boolean;
  isCollapsed: boolean;
}

export function getFoldRanges(text: string): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: Array<{ line: number; char: '{' | '[' }> = [];

  let line = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '\n') {
      line += 1;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push({ line, char: ch });
      continue;
    }

    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (!open) continue;
      const expectedClose = open.char === '{' ? '}' : ']';
      if (ch !== expectedClose) continue;
      if (line > open.line) {
        ranges.push({
          startLine: open.line,
          endLine: line,
          opener: open.char,
        });
      }
    }
  }

  return ranges;
}

function collapseOpenerLine(
  openerLine: string,
  opener: '{' | '[',
  endLine: string,
): string {
  const closer = opener === '{' ? '}' : ']';
  const hasComma = endLine.trimEnd().endsWith(',');
  return `${openerLine.trimEnd()} ... ${closer}${hasComma ? ',' : ''}`;
}

export function buildFoldedView(text: string, collapsed: ReadonlySet<number>): FoldedLine[] {
  if (!text) {
    return [{ text: '', sourceLine: 0, isFoldStart: false, isCollapsed: false }];
  }

  const lines = text.split('\n');
  const visibleLineCount = Math.min(lines.length, getLastContentLineIndex(lines) + 2);
  const ranges = getFoldRanges(text);
  const rangeByStart = new Map(ranges.map((range) => [range.startLine, range]));
  const hidden = new Set<number>();

  for (const range of ranges) {
    if (!collapsed.has(range.startLine)) continue;
    for (let i = range.startLine + 1; i <= range.endLine; i += 1) {
      hidden.add(i);
    }
  }

  const folded: FoldedLine[] = [];

  for (let i = 0; i < visibleLineCount; i += 1) {
    if (hidden.has(i)) continue;

    const range = rangeByStart.get(i);
    const isFoldStart = !!range
      && range.endLine > range.startLine
      && lines[i].trim().length > 0;
    const isCollapsed = collapsed.has(i);

    folded.push({
      text: isCollapsed && range
        ? collapseOpenerLine(lines[i], range.opener, lines[range.endLine])
        : lines[i],
      sourceLine: i,
      isFoldStart,
      isCollapsed,
    });
  }

  return folded;
}

export function buildFoldedText(text: string, collapsed: ReadonlySet<number>): string {
  return buildFoldedView(text, collapsed)
    .map((line) => line.text)
    .join('\n');
}

export function pruneCollapsedLines(text: string, collapsed: ReadonlySet<number>): Set<number> {
  const validStarts = new Set(getFoldRanges(text).map((range) => range.startLine));
  return new Set([...collapsed].filter((line) => validStarts.has(line)));
}

function getLineOpener(text: string): '{' | '[' | null {
  const trimmed = text.trim();
  if (trimmed === '{' || trimmed === '[') return trimmed;
  if (trimmed.endsWith('{')) return '{';
  if (trimmed.endsWith('[')) return '[';
  return null;
}

function isLineCloser(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === '}' || trimmed === ']' || trimmed === '},' || trimmed === '],';
}

export function getStructuralFoldRanges(lines: Array<{ text: string }>): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: Array<{ startLine: number; opener: '{' | '[' }> = [];

  lines.forEach((line, index) => {
    const opener = getLineOpener(line.text);
    if (opener) {
      stack.push({ startLine: index, opener });
      return;
    }

    if (isLineCloser(line.text)) {
      const open = stack.pop();
      if (!open || index <= open.startLine) return;
      ranges.push({ startLine: open.startLine, endLine: index, opener: open.opener });
    }
  });

  return ranges;
}

export function pruneStructuralCollapsedLines(
  lines: Array<{ text: string }>,
  collapsed: ReadonlySet<number>,
): Set<number> {
  const validStarts = new Set(getStructuralFoldRanges(lines).map((range) => range.startLine));
  return new Set([...collapsed].filter((line) => validStarts.has(line)));
}

export function buildStructuralFoldedView<T extends { text: string }>(
  lines: T[],
  collapsed: ReadonlySet<number>,
): Array<T & FoldedLine> {
  const ranges = getStructuralFoldRanges(lines);
  const rangeByStart = new Map(ranges.map((range) => [range.startLine, range]));
  const hidden = new Set<number>();

  for (const range of ranges) {
    if (!collapsed.has(range.startLine)) continue;
    for (let i = range.startLine + 1; i <= range.endLine; i += 1) {
      hidden.add(i);
    }
  }

  const folded: Array<T & FoldedLine> = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (hidden.has(i)) continue;

    const range = rangeByStart.get(i);
    const isFoldStart = !!range && range.endLine > range.startLine;
    const isCollapsed = collapsed.has(i);

    folded.push({
      ...lines[i],
      text: isCollapsed && range
        ? collapseOpenerLine(lines[i].text, range.opener, lines[range.endLine].text)
        : lines[i].text,
      sourceLine: i,
      isFoldStart,
      isCollapsed,
    });
  }

  return folded;
}
