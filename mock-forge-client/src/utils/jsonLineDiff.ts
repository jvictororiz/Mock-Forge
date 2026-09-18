import { normalizeJsonForSmartCompare } from '../../shared/jsonFormat';
import { diffJsonStructures } from './jsonStructuralDiff';
import { highlightJson, escapeHtml } from './jsonHighlight';

export type LineDiffType = 'equal' | 'left' | 'right' | 'both';

export interface AlignedDiffRow {
  leftLine: string | null;
  rightLine: string | null;
  type: LineDiffType;
}

export interface DiffLocation {
  sectionId: string;
  rowIndex: number;
}

function buildLcsTable(leftLines: string[], rightLines: string[]): number[][] {
  const rows = leftLines.length + 1;
  const cols = rightLines.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (leftLines[i - 1] === rightLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

function alignLines(leftLines: string[], rightLines: string[]): AlignedDiffRow[] {
  const dp = buildLcsTable(leftLines, rightLines);
  const stack: AlignedDiffRow[] = [];
  let i = leftLines.length;
  let j = rightLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      stack.push({
        leftLine: leftLines[i - 1],
        rightLine: rightLines[j - 1],
        type: 'equal',
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ leftLine: null, rightLine: rightLines[j - 1], type: 'right' });
      j -= 1;
    } else {
      stack.push({ leftLine: leftLines[i - 1], rightLine: null, type: 'left' });
      i -= 1;
    }
  }

  return stack.reverse();
}

function mergeAdjacentChanges(rows: AlignedDiffRow[]): AlignedDiffRow[] {
  const merged: AlignedDiffRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];

    if (current.type === 'left' && next?.type === 'right') {
      merged.push({
        leftLine: current.leftLine,
        rightLine: next.rightLine,
        type: 'both',
      });
      index += 1;
      continue;
    }

    merged.push(current);
  }

  return merged;
}

export function diffTextLines(left: string, right: string): AlignedDiffRow[] {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  return mergeAdjacentChanges(alignLines(leftLines, rightLines));
}

export function diffJsonContent(
  left: string,
  right: string,
  smartOrdering: boolean,
): AlignedDiffRow[] {
  if (smartOrdering) {
    const structural = diffJsonStructures(left, right);
    if (structural) return structural;
  }

  const leftText = smartOrdering ? normalizeJsonForSmartCompare(left) : left;
  const rightText = smartOrdering ? normalizeJsonForSmartCompare(right) : right;
  return diffTextLines(leftText, rightText);
}

export function collectDiffLocations(
  sections: Array<{ sectionId: string; left: string; right: string }>,
  smartOrdering: boolean,
): DiffLocation[] {
  const locations: DiffLocation[] = [];

  for (const section of sections) {
    const rows = diffJsonContent(section.left, section.right, smartOrdering);

    rows.forEach((row, rowIndex) => {
      if (row.type !== 'equal') {
        locations.push({ sectionId: section.sectionId, rowIndex });
      }
    });
  }

  return locations;
}

function buildCharDiffOps(left: string, right: string): Array<{ type: 'equal' | 'left' | 'right'; char: string }> {
  const leftChars = [...left];
  const rightChars = [...right];
  const rows = leftChars.length + 1;
  const cols = rightChars.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (leftChars[i - 1] === rightChars[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: Array<{ type: 'equal' | 'left' | 'right'; char: string }> = [];
  let i = leftChars.length;
  let j = rightChars.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftChars[i - 1] === rightChars[j - 1]) {
      ops.push({ type: 'equal', char: leftChars[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'right', char: rightChars[j - 1] });
      j -= 1;
    } else {
      ops.push({ type: 'left', char: leftChars[i - 1] });
      i -= 1;
    }
  }

  return ops.reverse();
}

function renderCharDiffSide(
  ops: Array<{ type: 'equal' | 'left' | 'right'; char: string }>,
  side: 'left' | 'right',
): string {
  let html = '';
  let buffer = '';
  let bufferType: 'equal' | 'left' | 'right' | null = null;

  const flush = () => {
    if (!buffer || !bufferType) return;
    if (bufferType === 'equal') {
      html += highlightJson(buffer);
    } else if (side === 'left' && bufferType === 'left') {
      html += `<span class="json-diff-char-delete">${escapeHtml(buffer)}</span>`;
    } else if (side === 'right' && bufferType === 'right') {
      html += `<span class="json-diff-char-insert">${escapeHtml(buffer)}</span>`;
    }
    buffer = '';
    bufferType = null;
  };

  for (const op of ops) {
    const isRelevant = op.type === 'equal'
      || (side === 'left' && op.type === 'left')
      || (side === 'right' && op.type === 'right');
    if (!isRelevant) continue;

    if (bufferType === op.type) {
      buffer += op.char;
    } else {
      flush();
      bufferType = op.type;
      buffer = op.char;
    }
  }

  flush();
  return html || '&nbsp;';
}

function renderWholeLine(text: string | null, className: string): string {
  if (!text) return '&nbsp;';
  return `<span class="${className}">${highlightJson(text)}</span>`;
}

export function renderDiffLineHtml(
  text: string | null,
  other: string | null,
  type: LineDiffType,
  side: 'left' | 'right',
): string {
  if (!text) return '&nbsp;';

  if (type === 'equal') {
    return highlightJson(text);
  }

  if (type === 'left' && side === 'left') {
    return renderWholeLine(text, 'json-diff-line-delete');
  }

  if (type === 'right' && side === 'right') {
    return renderWholeLine(text, 'json-diff-line-insert');
  }

  if (type === 'both' && other !== null) {
    if (text.length > 800 || other.length > 800) {
      return renderWholeLine(
        text,
        side === 'left' ? 'json-diff-line-delete' : 'json-diff-line-insert',
      );
    }
    const ops = buildCharDiffOps(text, other);
    return renderCharDiffSide(ops, side);
  }

  return highlightJson(text);
}
