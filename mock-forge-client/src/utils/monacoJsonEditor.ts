import type * as Monaco from 'monaco-editor';
import { findJsonErrorLocations } from './jsonErrors';
import { debounce } from './debounce';
import { getMockedLineNumbers } from '../../shared/trafficMockPaths';

const MARKER_OWNER = 'mockforge-json';

let themeReady = false;

export function ensureMockforgeMonacoTheme(monaco: typeof import('monaco-editor')): void {
  if (themeReady) return;

  monaco.editor.defineTheme('mockforge', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '9cdcfe' },
      { token: 'string.value.json', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'keyword.json', foreground: '569cd6' },
    ],
    colors: {
      'editor.background': '#1a1a1f',
      'editor.foreground': '#e8e8ed',
      'editorLineNumber.foreground': '#68687a',
      'editorLineNumber.activeForeground': '#9898a4',
      // Selection must contrast with line highlight (both were near-identical grays).
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#264F7866',
      'editor.selectionHighlightBackground': '#61affe33',
      'editor.lineHighlightBackground': '#222228',
      'editor.lineHighlightBorder': '#22222800',
      'editorCursor.foreground': '#e8e8ed',
      'editorWidget.background': '#222228',
      'editorWidget.border': '#3a3a44',
      'editorOverviewRuler.border': '#3a3a4400',
      'scrollbarSlider.background': '#3a3a4488',
      'scrollbarSlider.hoverBackground': '#68687a88',
    },
  });

  themeReady = true;
}

export function buildMonacoJsonOptions(
  readOnly: boolean,
): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly,
    minimap: { enabled: false },
    fontSize: 11,
    lineHeight: 18,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    lineNumbers: 'on',
    folding: true,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    padding: { top: 10, bottom: 10 },
    renderLineHighlight: 'line',
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      alwaysConsumeMouseWheel: false,
    },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: false,
    formatOnType: false,
    links: false,
    renderValidationDecorations: 'on',
    fixedOverflowWidgets: true,
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'never',
      seedSearchStringFromSelection: 'never',
    },
  };
}

const monacoJsonEditors = new Set<Monaco.editor.IStandaloneCodeEditor>();
let lastFocusedMonacoJsonEditor: Monaco.editor.IStandaloneCodeEditor | null = null;

export function applyMonacoMockedLineHighlights(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  body: string,
  mockedPaths?: string[],
): () => void {
  let decorationIds: string[] = [];

  const apply = () => {
    const lineNumbers = getMockedLineNumbers(body, mockedPaths);
    const decorations = lineNumbers.map((lineNumber) => ({
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: 'mockforge-json-mocked-line',
      },
    }));
    decorationIds = editor.deltaDecorations(decorationIds, decorations);
  };

  apply();

  return () => {
    decorationIds = editor.deltaDecorations(decorationIds, []);
  };
}

export function registerMonacoJsonEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
): () => void {
  monacoJsonEditors.add(editor);

  const focusDisposable = editor.onDidFocusEditorText(() => {
    lastFocusedMonacoJsonEditor = editor;
  });

  const blurDisposable = editor.onDidBlurEditorText(() => {
    if (lastFocusedMonacoJsonEditor === editor) {
      lastFocusedMonacoJsonEditor = null;
    }
  });

  return () => {
    focusDisposable.dispose();
    blurDisposable.dispose();
    monacoJsonEditors.delete(editor);
    if (lastFocusedMonacoJsonEditor === editor) {
      lastFocusedMonacoJsonEditor = null;
    }
  };
}

export function isInsideMonacoJsonEditor(element: Element | null | undefined): boolean {
  return !!element?.closest('.monaco-editor');
}

function findMonacoEditorInContainer(
  container: ParentNode,
): Monaco.editor.IStandaloneCodeEditor | null {
  if (lastFocusedMonacoJsonEditor) {
    const node = lastFocusedMonacoJsonEditor.getDomNode();
    if (node && container.contains(node)) {
      return lastFocusedMonacoJsonEditor;
    }
  }

  for (const editor of monacoJsonEditors) {
    const node = editor.getDomNode();
    if (node && container.contains(node)) {
      return editor;
    }
  }

  return null;
}

export function triggerMonacoFind(container?: ParentNode | null): boolean {
  const editor = container
    ? findMonacoEditorInContainer(container)
    : lastFocusedMonacoJsonEditor ?? monacoJsonEditors.values().next().value ?? null;

  if (!editor) return false;

  editor.focus();
  editor.trigger('keyboard', 'actions.find', null);
  return true;
}

export function triggerMonacoReplace(container?: ParentNode | null): boolean {
  const editor = container
    ? findMonacoEditorInContainer(container)
    : lastFocusedMonacoJsonEditor ?? monacoJsonEditors.values().next().value ?? null;

  if (!editor) return false;

  editor.focus();
  editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
  return true;
}

function setJsonMarkers(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  text: string,
): ReturnType<typeof findJsonErrorLocations> {
  const errors = findJsonErrorLocations(text);
  monaco.editor.setModelMarkers(model, MARKER_OWNER, errors.map((error) => ({
    startLineNumber: error.line + 1,
    startColumn: error.column + 1,
    endLineNumber: error.line + 1,
    endColumn: Math.max(error.column + 2, error.column + 1),
    message: error.message,
    severity: monaco.MarkerSeverity.Error,
  })));
  return errors;
}

function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function setupMonacoJsonErrorNavigation(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
): () => void {
  let activeIndex = -1;
  let cachedErrors: ReturnType<typeof findJsonErrorLocations> = [];

  const refreshMarkers = () => {
    const model = editor.getModel();
    if (!model) return;
    cachedErrors = setJsonMarkers(monaco, model, model.getValue());
    activeIndex = -1;
  };

  const debouncedRefresh = debounce(refreshMarkers, 120);
  const contentDisposable = editor.onDidChangeModelContent(() => {
    debouncedRefresh();
  });

  refreshMarkers();

  const action = editor.addAction({
    id: 'mockforge.nextJsonError',
    label: 'Next JSON error',
    keybindings: [monaco.KeyCode.F2],
    run: () => {
      if (cachedErrors.length === 0) {
        refreshMarkers();
      }
      if (cachedErrors.length === 0) return;

      activeIndex = activeIndex < 0
        ? 0
        : (activeIndex + 1) % cachedErrors.length;

      const error = cachedErrors[activeIndex];
      const position = {
        lineNumber: error.line + 1,
        column: error.column + 1,
      };

      editor.setPosition(position);
      editor.revealLineInCenter(position.lineNumber);
      editor.setSelection({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      editor.focus();
    },
  });

  return () => {
    contentDisposable.dispose();
    action.dispose();
    debouncedRefresh.cancel();
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
  };
}

export function subscribeMonacoContentSizeChange(
  editor: Monaco.editor.IStandaloneCodeEditor,
  onChange: () => void,
): () => void {
  const disposable = editor.onDidContentSizeChange(onChange);
  return () => disposable.dispose();
}

export function setupMonacoScrollChaining(
  editor: Monaco.editor.IStandaloneCodeEditor,
): () => void {
  const domNode = editor.getDomNode();
  if (!domNode) return () => {};

  const scrollParent = findScrollParent(domNode);

  const onWheel = (event: WheelEvent) => {
    if (!scrollParent) return;

    const scrollTop = editor.getScrollTop();
    const scrollHeight = editor.getScrollHeight();
    const viewportHeight = editor.getLayoutInfo().height;
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + viewportHeight >= scrollHeight - 1;

    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
      scrollParent.scrollTop += event.deltaY;
    }
  };

  domNode.addEventListener('wheel', onWheel, { passive: true });

  return () => {
    domNode.removeEventListener('wheel', onWheel);
  };
}

export function replaceMonacoEditorValue(
  editor: Monaco.editor.IStandaloneCodeEditor,
  next: string,
): void {
  const model = editor.getModel();
  if (!model || model.getValue() === next) return;

  editor.executeEdits('mockforge', [{
    range: model.getFullModelRange(),
    text: next,
  }]);
  editor.pushUndoStop();
  editor.focus();
}

export const MONACO_JSON_LINE_HEIGHT_PX = 18;

export function getMonacoJsonHeight(
  contentHeight: number,
  minRows: number,
  maxRows = 40,
): number {
  const minHeight = minRows * MONACO_JSON_LINE_HEIGHT_PX + 20;
  const maxHeight = maxRows * MONACO_JSON_LINE_HEIGHT_PX + 20;
  return Math.min(Math.max(contentHeight, minHeight), maxHeight);
}
