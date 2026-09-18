import { useEffect, useRef } from 'react';
import { createJsonEditorHistory } from '../utils/jsonEditorUndo';

export function useJsonEditorUndo(value: string, onChange: (value: string) => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const valueRef = useRef(value);
  valueRef.current = value;

  const historyRef = useRef<ReturnType<typeof createJsonEditorHistory> | null>(null);
  if (!historyRef.current) {
    historyRef.current = createJsonEditorHistory(
      () => valueRef.current,
      (next) => onChangeRef.current(next),
    );
  }

  const internalRef = useRef(false);

  useEffect(() => {
    if (internalRef.current) {
      internalRef.current = false;
      return;
    }

    historyRef.current?.reset();
  }, [value]);

  const history = historyRef.current;

  const commit = (next: string) => {
    internalRef.current = true;
    history.commit(next);
  };

  const undo = () => {
    internalRef.current = true;
    return history.undo();
  };

  const redo = () => {
    internalRef.current = true;
    return history.redo();
  };

  return { commit, undo, redo };
}
