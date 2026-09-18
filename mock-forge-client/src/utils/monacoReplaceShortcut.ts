import { isInsideMonacoJsonEditor, triggerMonacoReplace } from './monacoJsonEditor';

export function isMonacoReplaceShortcut(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}): boolean {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === 'r';
}

export function handleMonacoReplaceShortcut(event: KeyboardEvent): void {
  if (!isMonacoReplaceShortcut(event)) return;

  const active = document.activeElement as HTMLElement | null;
  if (!isInsideMonacoJsonEditor(active)) {
    // Keep previous Cmd/Ctrl+R reload behavior outside the JSON editor.
    event.preventDefault();
    event.stopPropagation();
    window.location.reload();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  triggerMonacoReplace();
}
