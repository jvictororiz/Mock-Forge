import {
  buildFoldedView,
  getFoldRanges,
  type FoldRange,
} from './jsonFold';

const COLLAPSED_MARKER = /(\{ \.\.\. \}|\[ \.\.\. \])/;

function getRangeByStart(text: string): Map<number, FoldRange> {
  return new Map(getFoldRanges(text).map((range) => [range.startLine, range]));
}

function getDisplayLineIndex(displayText: string, offset: number): number {
  if (offset <= 0) return 0;
  return displayText.slice(0, offset).split('\n').length - 1;
}

function getLineOffsets(displayText: string): Array<{ start: number; end: number }> {
  const lines = displayText.split('\n');
  const offsets: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const line of lines) {
    const start = cursor;
    const end = cursor + line.length;
    offsets.push({ start, end });
    cursor = end + 1;
  }

  return offsets;
}

function removeSourceRange(fullText: string, range: FoldRange): string {
  const lines = fullText.split('\n');
  const before = lines.slice(0, range.startLine);
  const after = lines.slice(range.endLine + 1);

  if (before.length > 0) {
    const lastIdx = before.length - 1;
    before[lastIdx] = before[lastIdx].replace(/,\s*$/, '');
  } else if (after.length > 0) {
    after[0] = after[0].replace(/^\s*,\s*/, '');
  }

  return [...before, ...after].join('\n');
}

function findRemovedCollapsedBlocks(
  foldedView: ReturnType<typeof buildFoldedView>,
  prevLines: string[],
  nextLines: string[],
): Set<number> {
  const removed = new Set<number>();

  for (let i = 0; i < foldedView.length; i += 1) {
    const foldLine = foldedView[i];
    if (!foldLine.isCollapsed) continue;

    const prevLine = prevLines[i];
    if (!prevLine) continue;

    const stillPresent = nextLines.some(
      (line) => line === prevLine || line === foldLine.text,
    );

    if (!stillPresent) {
      removed.add(foldLine.sourceLine);
    }
  }

  return removed;
}

export function applyFoldedDisplayEdit(
  fullText: string,
  collapsed: ReadonlySet<number>,
  prevDisplay: string,
  nextDisplay: string,
): string {
  if (!collapsed.size) return nextDisplay;
  if (prevDisplay === nextDisplay) return fullText;

  const fullLines = fullText.split('\n');
  const prevLines = prevDisplay.split('\n');
  const nextLines = nextDisplay.split('\n');
  const foldedView = buildFoldedView(fullText, collapsed);
  const rangeByStart = getRangeByStart(fullText);
  const removedBlocks = findRemovedCollapsedBlocks(foldedView, prevLines, nextLines);

  const result: string[] = [];
  let nextIdx = 0;

  for (let fi = 0; fi < foldedView.length; fi += 1) {
    const foldLine = foldedView[fi];

    if (removedBlocks.has(foldLine.sourceLine)) {
      continue;
    }

    if (nextIdx >= nextLines.length) {
      if (foldLine.isCollapsed) {
        const range = rangeByStart.get(foldLine.sourceLine);
        if (!range) continue;
        for (let j = range.startLine; j <= range.endLine; j += 1) {
          result.push(fullLines[j]);
        }
      }
      continue;
    }

    const newLine = nextLines[nextIdx];
    nextIdx += 1;

    if (foldLine.isCollapsed) {
      const range = rangeByStart.get(foldLine.sourceLine);
      if (!range) {
        result.push(newLine);
        continue;
      }

      const prevLine = prevLines[fi] ?? '';
      if (newLine === prevLine || newLine === foldLine.text) {
        for (let j = range.startLine; j <= range.endLine; j += 1) {
          result.push(fullLines[j]);
        }
      } else {
        result.push(newLine);
      }
      continue;
    }

    result.push(newLine);
  }

  while (nextIdx < nextLines.length) {
    result.push(nextLines[nextIdx]);
    nextIdx += 1;
  }

  return result.join('\n');
}

export function tryDeleteCollapsedBlockSelection(
  fullText: string,
  collapsed: ReadonlySet<number>,
  displayText: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; sourceLines: number[] } | null {
  if (!collapsed.size || selectionStart === selectionEnd) return null;

  const foldedView = buildFoldedView(fullText, collapsed);
  const lineOffsets = getLineOffsets(displayText);
  const rangeByStart = getRangeByStart(fullText);
  const matched: Array<{ range: FoldRange; sourceLine: number }> = [];

  for (let i = 0; i < lineOffsets.length; i += 1) {
    const { start, end } = lineOffsets[i];
    const foldLine = foldedView[i];
    if (!foldLine?.isCollapsed) continue;

    const line = displayText.slice(start, end);
    const marker = line.match(COLLAPSED_MARKER);
    if (!marker || marker.index === undefined) continue;

    const markerStart = start + marker.index;
    const markerEnd = markerStart + marker[0].length;
    const selectionCoversMarker = selectionStart <= markerStart && selectionEnd >= markerEnd;
    const selectionCoversLine = selectionStart <= start && selectionEnd >= end;
    const selectionInsideMarker = selectionStart >= markerStart && selectionEnd <= markerEnd;

    if (!selectionCoversMarker && !selectionCoversLine && !selectionInsideMarker) {
      continue;
    }

    const range = rangeByStart.get(foldLine.sourceLine);
    if (!range) continue;

    matched.push({ range, sourceLine: foldLine.sourceLine });
  }

  if (matched.length === 0) return null;

  const sorted = [...matched].sort((a, b) => b.range.startLine - a.range.startLine);
  let text = fullText;
  const sourceLines: number[] = [];

  for (const { range, sourceLine } of sorted) {
    text = removeSourceRange(text, range);
    sourceLines.push(sourceLine);
  }

  return { text, sourceLines };
}

export function getCollapsedLineAtOffset(
  fullText: string,
  collapsed: ReadonlySet<number>,
  displayText: string,
  offset: number,
): number | null {
  if (!collapsed.size) return null;

  const foldedView = buildFoldedView(fullText, collapsed);
  const lineIndex = getDisplayLineIndex(displayText, offset);
  const foldLine = foldedView[lineIndex];

  return foldLine?.isCollapsed ? foldLine.sourceLine : null;
}
