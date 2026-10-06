import React, { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TrafficTableRow } from './TrafficTableRow';
import {
  TRAFFIC_GRID_COLUMNS,
  TRAFFIC_GRID_MIN_WIDTH,
  TRAFFIC_ROW_HEIGHT,
  trafficHeaderCellCompactStyle,
  trafficHeaderCellStyle,
} from './trafficTableMetrics';
import type { CapturedRequest, MockKind } from '../types';

export {
  TRAFFIC_ROW_HEIGHT,
  trafficHeaderCellCompactStyle,
  trafficHeaderCellStyle,
};

type VirtualTrafficTableProps = {
  records: CapturedRequest[];
  selectedId: string | null;
  selectedIds: Set<string>;
  mockingId: string | null;
  bulkBusy: boolean;
  selectRowLabel: string;
  actionsLabel: string;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, event: React.MouseEvent<HTMLDivElement>) => void;
  onToggleCheck: (id: string) => void;
  onOpenMenu: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMock?: (record: CapturedRequest, kind: MockKind) => void;
  header: React.ReactNode;
  emptyRow: React.ReactNode | null;
};

export function VirtualTrafficTable({
  records,
  selectedId,
  selectedIds,
  mockingId,
  bulkBusy,
  selectRowLabel,
  actionsLabel,
  onSelect,
  onContextMenu,
  onToggleCheck,
  onOpenMenu,
  onOpenMock,
  header,
  emptyRow,
}: VirtualTrafficTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const getItemKey = useCallback((index: number) => recordsRef.current[index]?.id ?? index, []);

  const rowVirtualizer = useVirtualizer({
    count: emptyRow ? 0 : records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TRAFFIC_ROW_HEIGHT,
    overscan: 8,
    getItemKey,
    directDomUpdates: true,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const syncHeader = (scrollLeft: number) => {
    const track = headerTrackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
  };

  return (
    <div role="table" style={styles.root}>
      <div style={styles.headerClip}>
        <div ref={headerTrackRef} role="row" style={styles.header}>
          {header}
        </div>
      </div>
      <div
        ref={scrollRef}
        style={styles.scroller}
        onScroll={(event) => syncHeader(event.currentTarget.scrollLeft)}
      >
        {emptyRow ?? (
          <div ref={rowVirtualizer.containerRef} role="rowgroup" style={styles.body}>
            {virtualItems.map((virtualRow) => {
              const record = records[virtualRow.index];
              if (!record) return null;
              return (
                <div
                  key={record.id}
                  role="presentation"
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={styles.slot}
                >
                  <TrafficTableRow
                    record={record}
                    selected={selectedId === record.id}
                    checked={selectedIds.has(record.id)}
                    menuDisabled={mockingId === record.id || bulkBusy}
                    selectRowLabel={selectRowLabel}
                    actionsLabel={actionsLabel}
                    onSelect={onSelect}
                    onContextMenu={onContextMenu}
                    onToggleCheck={onToggleCheck}
                    onOpenMenu={onOpenMenu}
                    onOpenMock={onOpenMock}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    height: '100%',
  },
  headerClip: {
    overflow: 'hidden',
    flexShrink: 0,
    background: 'var(--bg-primary)',
    borderBottom: '1px solid var(--border)',
  },
  header: {
    display: 'grid',
    gridTemplateColumns: TRAFFIC_GRID_COLUMNS,
    width: '100%',
    minWidth: TRAFFIC_GRID_MIN_WIDTH,
    background: 'var(--bg-primary)',
  },
  scroller: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    overflowAnchor: 'none',
    overscrollBehavior: 'contain',
  },
  body: {
    position: 'relative',
    width: '100%',
    minWidth: TRAFFIC_GRID_MIN_WIDTH,
  },
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: TRAFFIC_ROW_HEIGHT,
    overflow: 'hidden',
  },
};
