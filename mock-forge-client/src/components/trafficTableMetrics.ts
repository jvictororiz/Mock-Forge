import type { CSSProperties } from 'react';

export const TRAFFIC_ROW_HEIGHT = 38;
export const TRAFFIC_GRID_COLUMNS = '36px 36px 44px 112px 78px minmax(120px, 1fr) 140px 70px 80px';
export const TRAFFIC_GRID_MIN_WIDTH = 760;

export const trafficHeaderCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

export const trafficHeaderCellCompactStyle: CSSProperties = {
  ...trafficHeaderCellStyle,
  justifyContent: 'center',
  padding: '8px 4px',
};
