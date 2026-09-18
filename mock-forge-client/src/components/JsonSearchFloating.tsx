import React, { useLayoutEffect } from 'react';
import { JsonFloatingAnchor } from './JsonFloatingAnchor';
import { scheduleSearchInputFocus } from '../hooks/useJsonSearch';

export function JsonSearchFloating({
  containerRef,
  open,
  children,
  inputRef,
}: {
  containerRef: React.RefObject<HTMLElement>;
  open: boolean;
  children: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  useLayoutEffect(() => {
    if (!open) return;
    scheduleSearchInputFocus(inputRef?.current ?? null);
  }, [open, inputRef]);

  return (
    <JsonFloatingAnchor containerRef={containerRef} placement="top" active={open}>
      <div
        style={{
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
        }}
        aria-hidden={!open}
      >
        {children}
      </div>
    </JsonFloatingAnchor>
  );
}
