const MAX_HISTORY = 100;

export type JsonEditorHistory = {
  commit: (next: string) => void;
  undo: () => boolean;
  redo: () => boolean;
  reset: () => void;
};

export function createJsonEditorHistory(
  getValue: () => string,
  onChange: (value: string) => void,
): JsonEditorHistory {
  const past: string[] = [];
  const future: string[] = [];

  const reset = () => {
    past.length = 0;
    future.length = 0;
  };

  const commit = (next: string) => {
    const current = getValue();
    if (next === current) return;

    past.push(current);
    if (past.length > MAX_HISTORY) {
      past.shift();
    }
    future.length = 0;
    onChange(next);
  };

  const undo = () => {
    if (past.length === 0) return false;

    const previous = past.pop()!;
    future.unshift(getValue());
    onChange(previous);
    return true;
  };

  const redo = () => {
    if (future.length === 0) return false;

    const next = future.shift()!;
    past.push(getValue());
    onChange(next);
    return true;
  };

  return { commit, undo, redo, reset };
}
