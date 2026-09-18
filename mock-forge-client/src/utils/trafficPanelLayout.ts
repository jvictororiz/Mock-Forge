export type TrafficPanelId = 'mirror' | 'list' | 'detail';

export interface TrafficPanelDragSnapshot {
  width: number;
  height: number;
  top: number;
  left: number;
}

export const DEFAULT_PANEL_ORDER: TrafficPanelId[] = ['mirror', 'list', 'detail'];

const PANEL_ORDER_KEY = 'mockforge.trafficPanelOrder';

const PANEL_IDS = new Set<TrafficPanelId>(['mirror', 'list', 'detail']);

export function isTrafficPanelId(value: unknown): value is TrafficPanelId {
  return typeof value === 'string' && PANEL_IDS.has(value as TrafficPanelId);
}

export function readStoredPanelOrder(): TrafficPanelId[] {
  try {
    const raw = localStorage.getItem(PANEL_ORDER_KEY);
    if (!raw) return DEFAULT_PANEL_ORDER;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PANEL_ORDER;

    const order = parsed.filter(isTrafficPanelId);
    if (order.length !== 3 || new Set(order).size !== 3) {
      return DEFAULT_PANEL_ORDER;
    }

    return order;
  } catch {
    return DEFAULT_PANEL_ORDER;
  }
}

export function writeStoredPanelOrder(order: TrafficPanelId[]): void {
  try {
    localStorage.setItem(PANEL_ORDER_KEY, JSON.stringify(order));
  } catch {
    // ignore storage errors
  }
}

export function getVisiblePanelOrder(
  order: TrafficPanelId[],
  mirrorOpen: boolean,
): TrafficPanelId[] {
  return mirrorOpen ? order : order.filter((id) => id !== 'mirror');
}
