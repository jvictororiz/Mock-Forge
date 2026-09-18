const FLOATING_BAR_HEIGHT = 40;

type Rect = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
}

export function computeJsonFloatingPlacement(
  containerRect: Rect,
  viewportRect: Rect,
  placement: 'top' | 'bottom',
  inset: number,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): {
  top?: number;
  bottom?: number;
  right: number;
  visible: boolean;
} {
  const right = Math.max(inset, viewportWidth - containerRect.right + inset);
  const visible = rectsIntersect(containerRect, viewportRect);

  if (!visible) {
    return { right, visible: false };
  }

  if (placement === 'top') {
    const visibleTop = Math.max(containerRect.top, viewportRect.top);
    const visibleBottom = Math.min(containerRect.bottom, viewportRect.bottom);
    const maxTop = visibleBottom - FLOATING_BAR_HEIGHT - inset;
    const top = Math.min(visibleTop + inset, Math.max(visibleTop + inset, maxTop));

    return { top, right, visible: true };
  }

  const visibleBottom = Math.min(containerRect.bottom, viewportRect.bottom);
  const bottom = Math.max(inset, viewportHeight - visibleBottom + inset);

  return { bottom, right, visible: true };
}

function getScrollViewportRect(element: HTMLElement): Rect {
  let parent = element.parentElement;

  while (parent) {
    const { overflowY, overflow } = window.getComputedStyle(parent);
    if (
      overflowY === 'auto'
      || overflowY === 'scroll'
      || overflowY === 'overlay'
      || overflow === 'auto'
      || overflow === 'scroll'
    ) {
      return parent.getBoundingClientRect();
    }
    parent = parent.parentElement;
  }

  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

export function computeJsonFloatingStyle(
  container: HTMLElement,
  placement: 'top' | 'bottom',
  inset: number,
): {
  top?: number;
  bottom?: number;
  right: number;
  visible: boolean;
} {
  return computeJsonFloatingPlacement(
    container.getBoundingClientRect(),
    getScrollViewportRect(container),
    placement,
    inset,
  );
}
