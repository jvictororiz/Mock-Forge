import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findSearchMatches } from '../utils/jsonSearch';

function focusSearchInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.select();
}

function scheduleSearchInputFocus(input: HTMLInputElement | null) {
  focusSearchInput(input);
  queueMicrotask(() => focusSearchInput(input));
  window.requestAnimationFrame(() => focusSearchInput(input));
  window.setTimeout(() => focusSearchInput(input), 0);
}

export { scheduleSearchInputFocus };

export function useJsonSearch(text: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(
    () => (open && query ? findSearchMatches(text, query) : []),
    [open, query, text],
  );
  const matchCount = matches.length;

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((index) => (index + 1) % matchCount);
  }, [matchCount]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((index) => (index - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const focusSearch = useCallback(() => {
    scheduleSearchInputFocus(inputRef.current);
  }, []);

  const openSearch = useCallback(() => {
    setOpen(true);
    scheduleSearchInputFocus(inputRef.current);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, text]);

  useLayoutEffect(() => {
    if (!open) return;
    scheduleSearchInputFocus(inputRef.current);
  }, [open]);

  useEffect(() => {
    if (!open || matchCount === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const activeMark = container.querySelector('.json-search-active, [data-search-active="true"]');
    activeMark?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, activeIndex, matchCount, query, text]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) {
        const isFocused = container.contains(document.activeElement);
        if (!isFocused) return;
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          setOpen(true);
        }
        scheduleSearchInputFocus(inputRef.current);
        return;
      }

      if (!open) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === 'Enter') {
        const target = event.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
        event.preventDefault();
        if (event.shiftKey) goPrev();
        else goNext();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, close, goNext, goPrev]);

  const focusContainer = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  return {
    containerRef,
    inputRef,
    open,
    query,
    setQuery,
    activeIndex,
    matches,
    matchCount,
    goNext,
    goPrev,
    close,
    focusContainer,
    focusSearch,
    openSearch,
  };
}
