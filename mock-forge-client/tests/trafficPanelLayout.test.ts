import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PANEL_ORDER,
  getVisiblePanelOrder,
  isTrafficPanelId,
} from '../src/utils/trafficPanelLayout';

describe('trafficPanelLayout', () => {
  it('validates panel ids', () => {
    expect(isTrafficPanelId('mirror')).toBe(true);
    expect(isTrafficPanelId('list')).toBe(true);
    expect(isTrafficPanelId('detail')).toBe(true);
    expect(isTrafficPanelId('other')).toBe(false);
  });

  it('hides mirror when closed', () => {
    expect(getVisiblePanelOrder(DEFAULT_PANEL_ORDER, false)).toEqual(['list', 'detail']);
    expect(getVisiblePanelOrder(['detail', 'list', 'mirror'], false)).toEqual(['detail', 'list']);
  });

  it('keeps full order when mirror is open', () => {
    expect(getVisiblePanelOrder(DEFAULT_PANEL_ORDER, true)).toEqual(DEFAULT_PANEL_ORDER);
    expect(getVisiblePanelOrder(['detail', 'list', 'mirror'], true)).toEqual([
      'detail',
      'list',
      'mirror',
    ]);
  });
});
