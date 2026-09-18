import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { DiffLocation } from '../utils/jsonLineDiff';

export function useDiffNavigation(
  containerRef: RefObject<HTMLElement | null>,
  locations: DiffLocation[],
  onNavigate: (location: DiffLocation) => void,
  enabled: boolean,
) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollToken, setScrollToken] = useState(0);

  useEffect(() => {
    setActiveIndex(-1);
    setScrollToken(0);
  }, [locations]);

  const activeLocation = activeIndex >= 0 ? locations[activeIndex] ?? null : null;

  const goToNextDiff = useCallback(() => {
    if (locations.length === 0) return;

    const nextIndex = activeIndex < 0
      ? 0
      : (activeIndex + 1) % locations.length;
    const nextLocation = locations[nextIndex];
    if (!nextLocation) return;

    setActiveIndex(nextIndex);
    setScrollToken((token) => token + 1);
    onNavigate(nextLocation);
  }, [activeIndex, locations, onNavigate]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-json-search-root]')) return;

      const container = containerRef.current;
      if (!container?.isConnected) return;
      if (locations.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      goToNextDiff();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [containerRef, enabled, goToNextDiff, locations.length]);

  return {
    activeIndex,
    activeLocation,
    scrollToken,
    goToNextDiff,
  };
}
