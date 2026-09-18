import { findSearchMatches } from './jsonSearch';
import { highlightJson } from './jsonHighlight';

function highlightLineWithSearch(
  line: string,
  query: string,
  activeMatchIndex: number,
  globalMatchOffset: number,
): { html: string; matchCount: number } {
  const matches = findSearchMatches(line, query);
  if (matches.length === 0) {
    return { html: highlightJson(line), matchCount: 0 };
  }

  const queryLength = query.length;
  let html = '';
  let lastEnd = 0;

  matches.forEach((start, index) => {
    const end = start + queryLength;
    const globalIndex = globalMatchOffset + index;

    if (start > lastEnd) {
      html += highlightJson(line.slice(lastEnd, start));
    }

    const matchHtml = highlightJson(line.slice(start, end));
    const className = globalIndex === activeMatchIndex ? 'json-search-active' : 'json-search-match';
    html += `<mark class="${className}">${matchHtml}</mark>`;
    lastEnd = end;
  });

  if (lastEnd < line.length) {
    html += highlightJson(line.slice(lastEnd));
  }

  return { html, matchCount: matches.length };
}

export function highlightFoldedLines(
  foldedLines: Array<{ text: string; sourceLine: number; isCollapsed: boolean }>,
  query: string,
  activeMatchIndex = 0,
): Array<{ html: string; sourceLine: number; isCollapsed: boolean }> {
  const trimmed = query.trim();
  let globalMatchOffset = 0;

  return foldedLines.map((line) => {
    if (!trimmed) {
      return {
        html: highlightJson(line.text),
        sourceLine: line.sourceLine,
        isCollapsed: line.isCollapsed,
      };
    }

    const { html, matchCount } = highlightLineWithSearch(
      line.text,
      trimmed,
      activeMatchIndex,
      globalMatchOffset,
    );
    globalMatchOffset += matchCount;

    return {
      html,
      sourceLine: line.sourceLine,
      isCollapsed: line.isCollapsed,
    };
  });
}

export function highlightJsonWithSearch(
  json: string,
  query: string,
  activeMatchIndex = 0,
): string {
  const lines = json.split('\n');
  const trimmed = query.trim();

  if (!trimmed) {
    return lines.map((line) => highlightJson(line)).join('<br />');
  }

  let globalMatchOffset = 0;
  const htmlLines: string[] = [];

  for (const line of lines) {
    const { html, matchCount } = highlightLineWithSearch(
      line,
      trimmed,
      activeMatchIndex,
      globalMatchOffset,
    );
    htmlLines.push(html);
    globalMatchOffset += matchCount;
  }

  return htmlLines.join('<br />');
}
