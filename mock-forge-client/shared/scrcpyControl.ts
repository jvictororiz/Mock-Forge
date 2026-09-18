export const SCRCPY_CONTROL_MSG_INJECT_TEXT = 1;
export const SCRCPY_CONTROL_MSG_INJECT_TOUCH = 2;
export const SCRCPY_CONTROL_MSG_INJECT_SCROLL = 3;

export const MAX_INJECT_TEXT_BYTES = 300;
export const MAX_MIRROR_SCID = 0x7fffffff;

export const MOTION_ACTION_DOWN = 0;
export const MOTION_ACTION_UP = 1;
export const MOTION_ACTION_MOVE = 2;

export const MOTION_BUTTON_PRIMARY = 1;

export const POINTER_ID_MOUSE = 0xFFFFFFFFFFFFFFFFn;

export interface ScrcpyTouchInput {
  action: number;
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  pressure?: number;
  actionButton?: number;
  buttons?: number;
  pointerId?: bigint;
}

export interface ScrcpyScrollInput {
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  hScroll: number;
  vScroll: number;
  buttons?: number;
}

export function createMirrorScid(random = Math.random): string {
  const scid = Math.floor(random() * (MAX_MIRROR_SCID + 1));
  return scid.toString(16).padStart(8, '0');
}

export function socketNameForScid(scid: string): string {
  return `scrcpy_${scid}`;
}

export function parseMirrorScidHex(scidHex: string): number {
  return Number.parseInt(scidHex, 16);
}

export function isValidMirrorScidHex(scidHex: string): boolean {
  if (!/^[0-9a-f]{1,8}$/i.test(scidHex)) {
    return false;
  }
  const value = parseMirrorScidHex(scidHex);
  return Number.isFinite(value) && value >= 0 && value <= MAX_MIRROR_SCID;
}

function floatToU16Fp(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 0xffff);
}

function floatToI16Fp(value: number): number {
  return Math.round(Math.max(-1, Math.min(1, value)) * 32767);
}

export function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }

  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
    end -= 1;
  }

  return new TextDecoder().decode(bytes.subarray(0, end));
}

export function serializeInjectText(text: string): Uint8Array {
  const payload = new TextEncoder().encode(truncateUtf8(text, MAX_INJECT_TEXT_BYTES));
  const buf = new Uint8Array(1 + 4 + payload.length);
  const view = new DataView(buf.buffer);
  buf[0] = SCRCPY_CONTROL_MSG_INJECT_TEXT;
  view.setUint32(1, payload.length, false);
  buf.set(payload, 5);
  return buf;
}

export function serializeInjectTouch(input: ScrcpyTouchInput): Uint8Array {
  const buf = new Uint8Array(32);
  const view = new DataView(buf.buffer);
  buf[0] = SCRCPY_CONTROL_MSG_INJECT_TOUCH;
  buf[1] = input.action;
  view.setBigUint64(2, input.pointerId ?? POINTER_ID_MOUSE, false);
  view.setInt32(10, input.x, false);
  view.setInt32(14, input.y, false);
  view.setUint16(18, input.screenWidth, false);
  view.setUint16(20, input.screenHeight, false);
  const pressure = input.pressure ?? (input.action === MOTION_ACTION_UP ? 0 : 1);
  view.setUint16(22, floatToU16Fp(pressure), false);
  view.setUint32(24, input.actionButton ?? 0, false);
  view.setUint32(28, input.buttons ?? 0, false);
  return buf;
}

export function serializeInjectScroll(input: ScrcpyScrollInput): Uint8Array {
  const buf = new Uint8Array(21);
  const view = new DataView(buf.buffer);
  buf[0] = SCRCPY_CONTROL_MSG_INJECT_SCROLL;
  view.setInt32(1, input.x, false);
  view.setInt32(5, input.y, false);
  view.setUint16(9, input.screenWidth, false);
  view.setUint16(11, input.screenHeight, false);
  const hScroll = Math.max(-16, Math.min(16, input.hScroll));
  const vScroll = Math.max(-16, Math.min(16, input.vScroll));
  view.setInt16(13, floatToI16Fp(hScroll / 16), false);
  view.setInt16(15, floatToI16Fp(vScroll / 16), false);
  view.setUint32(17, input.buttons ?? 0, false);
  return buf;
}
