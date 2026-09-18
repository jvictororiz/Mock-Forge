import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { tryFormatJson } from '../utils/format';
import {
  applyMonacoMockedLineHighlights,
  buildMonacoJsonOptions,
  ensureMockforgeMonacoTheme,
  getMonacoJsonHeight,
  registerMonacoJsonEditor,
  setupMonacoScrollChaining,
  subscribeMonacoContentSizeChange,
} from '../utils/monacoJsonEditor';
import { useMonacoReady } from '../hooks/useMonacoReady';
import { ErrorBoundary } from './ErrorBoundary';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

export const JsonViewer = memo(function JsonViewer({
  value,
  highlightPaths,
}: {
  value: string;
  highlightPaths?: string[];
}) {
  const formatted = useMemo(() => tryFormatJson(value), [value]);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const sizeChangeCleanupRef = useRef<(() => void) | null>(null);
  const registerCleanupRef = useRef<(() => void) | null>(null);
  const highlightCleanupRef = useRef<(() => void) | null>(null);
  const [height, setHeight] = useState(getMonacoJsonHeight(6 * 18, 6, 30));
  const [editorReady, setEditorReady] = useState(false);
  const monacoReady = useMonacoReady();
  const editorOptions = useMemo(() => buildMonacoJsonOptions(true), []);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    ensureMockforgeMonacoTheme(monaco);
    monaco.editor.setTheme('mockforge');
    registerCleanupRef.current?.();
    registerCleanupRef.current = registerMonacoJsonEditor(editor);
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = setupMonacoScrollChaining(editor);
    sizeChangeCleanupRef.current?.();

    const updateHeight = () => {
      setHeight(getMonacoJsonHeight(editor.getContentHeight(), 6, 30));
    };

    updateHeight();
    sizeChangeCleanupRef.current = subscribeMonacoContentSizeChange(editor, updateHeight);
    setEditorReady(true);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    highlightCleanupRef.current?.();
    highlightCleanupRef.current = null;

    if (!editor || !monaco || !editorReady || !highlightPaths?.length) {
      return undefined;
    }

    highlightCleanupRef.current = applyMonacoMockedLineHighlights(
      editor,
      monaco,
      formatted,
      highlightPaths,
    );

    return () => {
      highlightCleanupRef.current?.();
      highlightCleanupRef.current = null;
    };
  }, [editorReady, formatted, highlightPaths]);

  useEffect(() => () => {
    setEditorReady(false);
    highlightCleanupRef.current?.();
    highlightCleanupRef.current = null;
    registerCleanupRef.current?.();
    registerCleanupRef.current = null;
    sizeChangeCleanupRef.current?.();
    sizeChangeCleanupRef.current = null;
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = null;
    editorRef.current = null;
    monacoRef.current = null;
  }, []);

  return (
    <div style={styles.frame}>
      <ErrorBoundary>
        {monacoReady ? (
          <Suspense fallback={<div style={{ ...styles.loading, minHeight: height }}>Loading viewer…</div>}>
            <MonacoEditor
              height={`${height}px`}
              language="json"
              theme="mockforge"
              value={formatted}
              beforeMount={ensureMockforgeMonacoTheme}
              onMount={handleMount}
              options={editorOptions}
              loading={<div style={styles.loading}>Loading viewer…</div>}
            />
          </Suspense>
        ) : (
          <div style={{ ...styles.loading, minHeight: height }}>Loading viewer…</div>
        )}
      </ErrorBoundary>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  frame: {
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
