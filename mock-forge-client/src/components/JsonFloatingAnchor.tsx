import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeJsonFloatingStyle } from '../utils/jsonFloatingPosition';

const FLOATING_Z_INDEX = 1000;

export function JsonFloatingAnchor({
  containerRef,
  placement,
  inset = 12,
  active = true,
  children,
}: {
  containerRef: React.RefObject<HTMLElement>;
  placement: 'top' | 'bottom';
  inset?: number;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: -9999,
    zIndex: FLOATING_Z_INDEX,
    visibility: 'hidden',
    pointerEvents: 'none',
  });

  useLayoutEffect(() => {
    if (!active) {
      setStyle({
        position: 'fixed',
        top: -9999,
        left: -9999,
        zIndex: FLOATING_Z_INDEX,
        visibility: 'hidden',
        pointerEvents: 'none',
      });
      return;
    }

    let setupFrame = 0;
    let observer: ResizeObserver | null = null;

    const updatePosition = () => {
      const container = containerRef.current;
      if (!container) return;

      const next = computeJsonFloatingStyle(container, placement, inset);
      if (!next.visible) {
        setStyle({
          position: 'fixed',
          top: -9999,
          left: -9999,
          zIndex: FLOATING_Z_INDEX,
          visibility: 'hidden',
          pointerEvents: 'none',
        });
        return;
      }

      setStyle({
        position: 'fixed',
        ...(next.top !== undefined ? { top: next.top } : {}),
        ...(next.bottom !== undefined ? { bottom: next.bottom } : {}),
        right: next.right,
        zIndex: FLOATING_Z_INDEX,
        visibility: 'visible',
        pointerEvents: 'auto',
      });
    };

    const setup = () => {
      const container = containerRef.current;
      if (!container) {
        setupFrame = window.requestAnimationFrame(setup);
        return;
      }

      updatePosition();

      document.addEventListener('scroll', updatePosition, { capture: true, passive: true });
      window.addEventListener('resize', updatePosition);

      observer = new ResizeObserver(updatePosition);
      observer.observe(container);

      let parent = container.parentElement;
      while (parent) {
        observer.observe(parent);
        parent = parent.parentElement;
      }
    };

    setup();

    return () => {
      window.cancelAnimationFrame(setupFrame);
      document.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
      observer?.disconnect();
    };
  }, [active, containerRef, placement, inset]);

  return createPortal(
    <div style={style}>
      {children}
    </div>,
    document.body,
  );
}
