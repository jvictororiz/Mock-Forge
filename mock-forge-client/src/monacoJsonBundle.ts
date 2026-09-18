import type * as Monaco from 'monaco-editor';

export async function importMonacoJsonBundle(): Promise<typeof Monaco> {
  // @ts-expect-error Monaco ESM entry is resolved by Vite at build time.
  const monacoModule = await import('monaco-editor/esm/vs/editor/editor.api.js');
  // @ts-expect-error Monaco ESM entry is resolved by Vite at build time.
  await import('monaco-editor/esm/vs/editor/contrib/find/browser/findController.js');
  // @ts-expect-error Monaco ESM entry is resolved by Vite at build time.
  await import('monaco-editor/esm/vs/language/json/monaco.contribution.js');
  return monacoModule as typeof Monaco;
}
