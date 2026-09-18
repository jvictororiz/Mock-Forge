import type * as Monaco from 'monaco-editor';

let setupPromise: Promise<void> | null = null;

export function ensureMonacoSetup(): Promise<void> {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const [
      { loader },
      monaco,
      editorWorkerModule,
      jsonWorkerModule,
    ] = await Promise.all([
      import('@monaco-editor/react'),
      import('./monacoJsonBundle').then((module) => module.importMonacoJsonBundle()),
      import('monaco-editor/esm/vs/editor/editor.worker.js?worker'),
      import('monaco-editor/esm/vs/language/json/json.worker.js?worker'),
    ]);

    const EditorWorker = editorWorkerModule.default;
    const JsonWorker = jsonWorkerModule.default;

    window.MonacoEnvironment = {
      getWorker(_workerId, label) {
        if (label === 'json') {
          return new JsonWorker();
        }
        return new EditorWorker();
      },
    };

    loader.config({ monaco: monaco as typeof Monaco });
    const { ensureMockforgeMonacoTheme } = await import('./utils/monacoJsonEditor');
    ensureMockforgeMonacoTheme(monaco as typeof Monaco);
  })();

  return setupPromise;
}
