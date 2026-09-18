import { useFloatingMenu } from './useFloatingMenu';

export interface TrafficRequestMenuState {
  requestId: string;
  x: number;
  y: number;
}

export function useTrafficRequestMenu() {
  const {
    menu,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  } = useFloatingMenu<string>();

  return {
    menu: menu
      ? { requestId: menu.id, x: menu.x, y: menu.y }
      : null,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  };
}
