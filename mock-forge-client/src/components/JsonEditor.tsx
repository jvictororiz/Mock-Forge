import React, {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type * as Monaco from 'monaco-editor';
import { JsonEditorFloatingActions } from './JsonEditorFloatingActions';
import { ErrorBoundary } from './ErrorBoundary';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { useMonacoReady } from '../hooks/useMonacoReady';
import {
  buildMonacoJsonOptions,
  ensureMockforgeMonacoTheme,
  getMonacoJsonHeight,
  registerMonacoJsonEditor,
  replaceMonacoEditorValue,
  setupMonacoJsonErrorNavigation,
  setupMonacoScrollChaining,
  subscribeMonacoContentSizeChange,
} from '../utils/monacoJsonEditor';

const PARENT_SYNC_DEBOUNCE_MS = 200;
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

export const JsonEditor = memo(function JsonEditor({
  value,
  onChange,
  minRows = 6,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  placeholder?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const registerCleanupRef = useRef<(() => void) | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const sizeChangeCleanupRef = useRef<(() => void) | null>(null);
  const lastExternalValueRef = useRef(value);
  const applyingExternalRef = useRef(false);
  const [actionValue, setActionValue] = useState(value);
  const [height, setHeight] = useState(getMonacoJsonHeight(minRows * 18, minRows));
  const monacoReady = useMonacoReady();

  const debouncedOnChange = useDebouncedCallback(onChange, PARENT_SYNC_DEBOUNCE_MS);
  const editorOptions = useMemo(
    () => ({
      ...buildMonacoJsonOptions(false),
      ariaLabel: placeholder || 'JSON editor',
    }),
    [placeholder],
  );

  const syncToParent = useCallback((next: string) => {
    lastExternalValueRef.current = next;
    debouncedOnChange(next);
  }, [debouncedOnChange]);

  const flushToParent = useCallback(() => {
    debouncedOnChange.flush();
  }, [debouncedOnChange]);

  useEffect(() => () => debouncedOnChange.flush(), [debouncedOnChange]);

  useEffect(() => {
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    setActionValue(value);
    if (editorRef.current) {
      applyingExternalRef.current = true;
      replaceMonacoEditorValue(editorRef.current, value);
      applyingExternalRef.current = false;
    }
  }, [value]);

  const applyEditorValue = useCallback((next: string) => {
    lastExternalValueRef.current = next;
    setActionValue(next);
    if (editorRef.current) {
      replaceMonacoEditorValue(editorRef.current, next);
    }
    debouncedOnChange.flush();
    onChange(next);
  }, [debouncedOnChange, onChange]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor;
    ensureMockforgeMonacoTheme(monaco);
    monaco.editor.setTheme('mockforge');
    cleanupRef.current?.();
    cleanupRef.current = setupMonacoJsonErrorNavigation(editor, monaco);
    registerCleanupRef.current?.();
    registerCleanupRef.current = registerMonacoJsonEditor(editor);
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = setupMonacoScrollChaining(editor);
    sizeChangeCleanupRef.current?.();

    const updateHeight = () => {
      setHeight(getMonacoJsonHeight(editor.getContentHeight(), minRows));
    };

    updateHeight();
    sizeChangeCleanupRef.current = subscribeMonacoContentSizeChange(editor, updateHeight);
  }, [minRows]);

  useEffect(() => () => {
    registerCleanupRef.current?.();
    registerCleanupRef.current = null;
    sizeChangeCleanupRef.current?.();
    sizeChangeCleanupRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = null;
    editorRef.current = null;
  }, []);

  const handleChange = useCallback((next: string | undefined) => {
    if (applyingExternalRef.current || next === undefined) return;
    setActionValue(next);
    syncToParent(next);
  }, [syncToParent]);

  return (
    <div ref={containerRef} style={styles.shell}>
      <JsonEditorFloatingActions
        containerRef={containerRef}
        value={actionValue}
        onChange={applyEditorValue}
      />
      <div style={styles.editorFrame}>
        <ErrorBoundary>
          {monacoReady ? (
            <Suspense fallback={<div style={{ ...styles.loading, minHeight: height }}>Loading editor…</div>}>
              <MonacoEditor
                height={`${height}px`}
                defaultValue={value}
                language="json"
                theme="mockforge"
                beforeMount={ensureMockforgeMonacoTheme}
                onChange={handleChange}
                onMount={handleMount}
                options={editorOptions}
                loading={<div style={styles.loading}>Loading editor…</div>}
                wrapperProps={{
                  onBlur: flushToParent,
                }}
              />
            </Suspense>
          ) : (
            <div style={{ ...styles.loading, minHeight: height }}>Loading editor…</div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  shell: {
    position: 'relative',
    width: '100%',
  },
  editorFrame: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  loading: {
    padding: '16px',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
};
