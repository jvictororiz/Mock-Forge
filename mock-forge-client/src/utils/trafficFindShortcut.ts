import { isInsideMonacoJsonEditor, triggerMonacoFind } from './monacoJsonEditor';

export function handleTrafficFindShortcut(
  event: KeyboardEvent,
  focusTrafficSearch: () => void,
): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') {
    return;
  }

  const active = document.activeElement as HTMLElement | null;

  if (active?.closest('[data-json-search-root]')) return;

  if (isInsideMonacoJsonEditor(active)) {
    event.preventDefault();
    event.stopPropagation();
    triggerMonacoFind(active?.closest('[data-traffic-detail]'));
    return;
  }

  const detailPanel = active?.closest('[data-traffic-detail]')
    ?? document.querySelector('[data-traffic-detail]');

  if (detailPanel instanceof HTMLElement && triggerMonacoFind(detailPanel)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  window.requestAnimationFrame(focusTrafficSearch);
}
