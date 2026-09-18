import { useCallback, useEffect, useState } from 'react';
import { getFoldRanges, pruneCollapsedLines, pruneStructuralCollapsedLines } from '../utils/jsonFold';

export function useJsonFold(text: string) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setCollapsed((prev) => {
      const next = pruneCollapsedLines(text, prev);
      if (next.size === prev.size && [...next].every((line) => prev.has(line))) {
        return prev;
      }
      return next;
    });
  }, [text]);

  const toggle = useCallback((sourceLine: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sourceLine)) {
        next.delete(sourceLine);
      } else {
        next.add(sourceLine);
      }
      return next;
    });
  }, []);

  const expandForLine = useCallback((targetLine: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;

      for (const range of getFoldRanges(text)) {
        if (!next.has(range.startLine)) continue;
        if (targetLine > range.startLine && targetLine <= range.endLine) {
          next.delete(range.startLine);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [text]);

  const hasCollapsed = collapsed.size > 0;

  return { collapsed, toggle, expandForLine, hasCollapsed };
}

export function useStructuralJsonFold(lines: Array<{ text: string }>) {
  const linesKey = lines.map((line) => line.text).join('\n');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setCollapsed((prev) => {
      const next = pruneStructuralCollapsedLines(lines, prev);
      if (next.size === prev.size && [...next].every((line) => prev.has(line))) {
        return prev;
      }
      return next;
    });
  }, [linesKey]);

  const toggle = useCallback((sourceLine: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sourceLine)) {
        next.delete(sourceLine);
      } else {
        next.add(sourceLine);
      }
      return next;
    });
  }, []);

  const hasCollapsed = collapsed.size > 0;

  return { collapsed, toggle, hasCollapsed };
}
