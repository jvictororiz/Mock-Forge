import { useCallback, useEffect, useRef, useState } from 'react';

export interface FloatingMenuState<T extends string> {
  id: T;
  x: number;
  y: number;
}

export function useFloatingMenu<T extends string>() {
  const [menu, setMenu] = useState<FloatingMenuState<T> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openFromButton = useCallback((event: React.MouseEvent, id: T) => {
    event.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      id,
      x: rect.left,
      y: rect.bottom + 4,
    });
  }, [menu?.id]);

  const openFromContextMenu = useCallback((event: React.MouseEvent, id: T) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  useEffect(() => {
    if (!menu) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu, closeMenu]);

  return {
    menu,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  };
}
