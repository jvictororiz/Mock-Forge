import { describe, expect, it, vi } from 'vitest';
import { createJsonEditorHistory } from '../src/utils/jsonEditorUndo';

describe('jsonEditorUndo', () => {
  it('undoes the last committed edit', () => {
    let value = '{"a":1}';
    const onChange = vi.fn((next: string) => {
      value = next;
    });
    const history = createJsonEditorHistory(() => value, onChange);

    history.commit('{"a":2}');
    history.undo();

    expect(value).toBe('{"a":1}');
  });

  it('redoes after undo', () => {
    let value = '{}';
    const onChange = vi.fn((next: string) => {
      value = next;
    });
    const history = createJsonEditorHistory(() => value, onChange);

    history.commit('{"x":1}');
    history.undo();
    history.redo();

    expect(value).toBe('{"x":1}');
  });

  it('clears history on reset', () => {
    let value = '{}';
    const onChange = vi.fn((next: string) => {
      value = next;
    });
    const history = createJsonEditorHistory(() => value, onChange);

    history.commit('{"edited":true}');
    history.reset();

    expect(history.undo()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
