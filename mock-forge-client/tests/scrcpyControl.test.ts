import { describe, it, expect } from 'vitest';
import {
  MAX_INJECT_TEXT_BYTES,
  MAX_MIRROR_SCID,
  MOTION_ACTION_DOWN,
  MOTION_ACTION_UP,
  MOTION_BUTTON_PRIMARY,
  POINTER_ID_MOUSE,
  SCRCPY_CONTROL_MSG_INJECT_TEXT,
  createMirrorScid,
  isValidMirrorScidHex,
  parseMirrorScidHex,
  serializeInjectScroll,
  serializeInjectText,
  serializeInjectTouch,
  socketNameForScid,
  truncateUtf8,
} from '../shared/scrcpyControl';

describe('scrcpyControl', () => {
  it('serializes inject touch messages', () => {
    const down = serializeInjectTouch({
      action: MOTION_ACTION_DOWN,
      x: 120,
      y: 480,
      screenWidth: 472,
      screenHeight: 1024,
      actionButton: MOTION_BUTTON_PRIMARY,
      buttons: MOTION_BUTTON_PRIMARY,
      pointerId: POINTER_ID_MOUSE,
    });

    expect(Array.from(down.slice(0, 4))).toEqual([2, 0, 255, 255]);
    expect(down.length).toBe(32);

    const up = serializeInjectTouch({
      action: MOTION_ACTION_UP,
      x: 120,
      y: 480,
      screenWidth: 472,
      screenHeight: 1024,
      actionButton: MOTION_BUTTON_PRIMARY,
      buttons: 0,
      pointerId: POINTER_ID_MOUSE,
    });

    expect(up[1]).toBe(MOTION_ACTION_UP);
    expect(up.length).toBe(32);
  });

  it('serializes inject scroll messages', () => {
    const scroll = serializeInjectScroll({
      x: 200,
      y: 300,
      screenWidth: 472,
      screenHeight: 1024,
      hScroll: 0,
      vScroll: -8,
    });

    expect(scroll[0]).toBe(3);
    expect(scroll.length).toBe(21);
  });

  it('serializes inject text messages', () => {
    const text = serializeInjectText('hello');
    expect(text[0]).toBe(SCRCPY_CONTROL_MSG_INJECT_TEXT);
    expect(text.length).toBe(1 + 4 + 5);
    expect(new TextDecoder().decode(text.slice(5))).toBe('hello');
  });

  it('truncates inject text to scrcpy byte limit', () => {
    const longText = 'a'.repeat(MAX_INJECT_TEXT_BYTES + 50);
    const truncated = truncateUtf8(longText, MAX_INJECT_TEXT_BYTES);
    expect(new TextEncoder().encode(truncated).length).toBeLessThanOrEqual(MAX_INJECT_TEXT_BYTES);

    const payload = serializeInjectText(longText);
    const length = new DataView(payload.buffer).getUint32(1, false);
    expect(length).toBeLessThanOrEqual(MAX_INJECT_TEXT_BYTES);
  });

  it('generates scrcpy-compatible mirror scids', () => {
    expect(isValidMirrorScidHex('b329537d')).toBe(false);
    expect(isValidMirrorScidHex('7fffffff')).toBe(true);
    expect(isValidMirrorScidHex('00000000')).toBe(true);

    const scid = createMirrorScid(() => 0.999999);
    expect(isValidMirrorScidHex(scid)).toBe(true);
    expect(parseMirrorScidHex(scid)).toBeLessThanOrEqual(MAX_MIRROR_SCID);
    expect(socketNameForScid(scid)).toBe(`scrcpy_${scid}`);
  });
});
