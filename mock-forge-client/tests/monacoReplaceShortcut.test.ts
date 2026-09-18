import { describe, expect, it } from 'vitest';
import { isMonacoReplaceShortcut } from '../src/utils/monacoReplaceShortcut';

describe('isMonacoReplaceShortcut', () => {
  it('matches Cmd/Ctrl+R without modifiers', () => {
    expect(isMonacoReplaceShortcut({
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      key: 'r',
    })).toBe(true);

    expect(isMonacoReplaceShortcut({
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      key: 'R',
    })).toBe(true);
  });

  it('ignores reload and other chords', () => {
    expect(isMonacoReplaceShortcut({
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      key: 'r',
    })).toBe(false);

    expect(isMonacoReplaceShortcut({
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      key: 'r',
    })).toBe(false);

    expect(isMonacoReplaceShortcut({
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      key: 'f',
    })).toBe(false);
  });
});
