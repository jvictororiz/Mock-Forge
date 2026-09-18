import { describe, it, expect } from 'vitest';
import { buildMirrorCaptureFilename } from '../src/utils/mirrorCapture';

describe('buildMirrorCaptureFilename', () => {
  it('includes prefix, device id, and extension', () => {
    const name = buildMirrorCaptureFilename('screenshot', 'png', 'emulator-5554');
    expect(name.startsWith('screenshot-emulator-5554-')).toBe(true);
    expect(name.endsWith('.png')).toBe(true);
  });
});
