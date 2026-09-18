export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
  } catch {
    // ignore storage errors
  }
  return fallback;
}

export function readStoredNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value)) return value;
  } catch {
    // ignore storage errors
  }
  return fallback;
}

export function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore storage errors
  }
}

export function writeStoredNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore storage errors
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readUserSizedWidth(
  widthKey: string,
  userSizedKey: string,
  fallback: number,
  min: number,
  max: number,
): { width: number; hasUserSized: boolean } {
  const hasUserSized = readStoredBoolean(userSizedKey, false);
  const width = clamp(readStoredNumber(widthKey, fallback), min, max);
  return { width, hasUserSized };
}

export function markUserSizedPanel(userSizedKey: string): void {
  writeStoredBoolean(userSizedKey, true);
}

export const EDITOR_LIST_WIDTH_KEY = 'mockforge.editorListWidth';
export const EDITOR_LIST_USER_SIZED_KEY = 'mockforge.editorListUserSized';
export const SESSION_DETAIL_WIDTH_KEY = 'mockforge.sessionDetailWidth';
export const SESSION_DETAIL_USER_SIZED_KEY = 'mockforge.sessionDetailUserSized';
export const TRAFFIC_DETAIL_WIDTH_KEY = 'mockforge.trafficDetailWidth';
export const TRAFFIC_DETAIL_USER_SIZED_KEY = 'mockforge.trafficDetailUserSized';
export const TRAFFIC_MIRROR_OPEN_KEY = 'mockforge.trafficMirrorOpen';
export const TRAFFIC_MIRROR_WIDTH_KEY = 'mockforge.trafficMirrorWidth';
export const TRAFFIC_MIRROR_USER_SIZED_KEY = 'mockforge.trafficMirrorUserSized';
