import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { findJsonErrorLocations } from '../utils/jsonErrors';
import { useDebouncedValue } from './useDebouncedValue';

const ERROR_SCAN_DEBOUNCE_MS = 150;

export function useJsonErrorNavigation(
  text: string,
  containerRef: RefObject<HTMLElement>,
  textareaRef: RefObject<HTMLTextAreaElement>,
  expandForLine: (line: number) => void,
) {
  const [activeErrorIndex, setActiveErrorIndex] = useState(-1);
  const debouncedText = useDebouncedValue(text, ERROR_SCAN_DEBOUNCE_MS);
  const errors = useMemo(() => findJsonErrorLocations(debouncedText), [debouncedText]);

  useEffect(() => {
    setActiveErrorIndex(-1);
  }, [errors]);

  const navigateToError = useCallback((index: number) => {
    const error = errors[index];
    const container = containerRef.current;
    const textarea = textareaRef.current;
    if (!error || !container || !textarea) return;

    expandForLine(error.line);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(error.offset, error.offset);

    window.requestAnimationFrame(() => {
      const errorLine = container.querySelector('[data-json-error-line="true"]');
      if (errorLine) {
        errorLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [containerRef, errors, expandForLine, textareaRef]);

  const goToNextError = useCallback(() => {
    if (errors.length === 0) return;
    const nextIndex = activeErrorIndex < 0
      ? 0
      : (activeErrorIndex + 1) % errors.length;
    setActiveErrorIndex(nextIndex);
    navigateToError(nextIndex);
  }, [activeErrorIndex, errors.length, navigateToError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      if (!container.contains(document.activeElement)) return;
      if (errors.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      goToNextError();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [containerRef, errors.length, goToNextError]);

  return {
    errors,
    activeError: errors[activeErrorIndex] ?? null,
    activeErrorIndex,
    goToNextError,
  };
}
