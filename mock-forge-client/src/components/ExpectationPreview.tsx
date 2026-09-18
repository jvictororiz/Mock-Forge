import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useAppStore } from '../stores/appStore';
import { useMonacoReady } from '../hooks/useMonacoReady';
import { ensureMockforgeMonacoTheme } from '../utils/monacoJsonEditor';

export function ExpectationPreview() {
  const currentEnvironment = useAppStore((state) => state.currentEnvironment);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const [preview, setPreview] = useState('');
  const monacoReady = useMonacoReady();

  const route = currentEnvironment?.routes.find((r) => r.id === selectedRouteId);

  useEffect(() => {
    if (!route) {
      setPreview('');
      return;
    }

    window.mockforge.route.previewExpectation(route).then((exp) => {
      setPreview(JSON.stringify(exp, null, 2));
    });
  }, [route]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>MockServer Expectation</span>
      </div>
      <div style={styles.editor}>
        {preview && monacoReady ? (
          <Editor
            height="100%"
            language="json"
            theme="mockforge"
            value={preview}
            beforeMount={ensureMockforgeMonacoTheme}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 11,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              fixedOverflowWidgets: true,
            }}
          />
        ) : preview ? (
          <div style={styles.empty}>Loading preview…</div>
        ) : (
          <div style={styles.empty}>Select a route to preview</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '340px',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-secondary)',
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  editor: {
    flex: 1,
    overflow: 'hidden',
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
};
