import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TrafficTableRow } from './TrafficTableRow';
import type { CapturedRequest, MockKind } from '../types';

export const TRAFFIC_ROW_HEIGHT = 38;
export const TRAFFIC_TABLE_COLUMN_COUNT = 9;

type VirtualTrafficTableProps = {
  tableWrapperRef: React.RefObject<HTMLDivElement>;
  records: CapturedRequest[];
  selectedId: string | null;
  selectedIds: Set<string>;
  mockingId: string | null;
  bulkBusy: boolean;
  selectRowLabel: string;
  actionsLabel: string;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, event: React.MouseEvent<HTMLTableRowElement>) => void;
  onToggleCheck: (id: string) => void;
  onOpenMenu: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMock?: (record: CapturedRequest, kind: MockKind) => void;
  header: React.ReactNode;
  emptyRow: React.ReactNode | null;
  tableStyle?: React.CSSProperties;
  theadStyle?: React.CSSProperties;
};

export function VirtualTrafficTable({
  tableWrapperRef,
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
  tableStyle,
  theadStyle,
}: VirtualTrafficTableProps) {
  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => tableWrapperRef.current,
    estimateSize: () => TRAFFIC_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <table style={tableStyle}>
      <thead style={theadStyle}>
        {header}
      </thead>
      <tbody>
        {emptyRow ?? (
          <>
            {paddingTop > 0 ? (
              <tr aria-hidden="true">
                <td
                  colSpan={TRAFFIC_TABLE_COLUMN_COUNT}
                  style={{ height: paddingTop, padding: 0, border: 'none' }}
                />
              </tr>
            ) : null}
            {virtualItems.map((virtualRow) => {
              const record = records[virtualRow.index];
              return (
                <TrafficTableRow
                  key={record.id}
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
              );
            })}
            {paddingBottom > 0 ? (
              <tr aria-hidden="true">
                <td
                  colSpan={TRAFFIC_TABLE_COLUMN_COUNT}
                  style={{ height: paddingBottom, padding: 0, border: 'none' }}
                />
              </tr>
            ) : null}
          </>
        )}
      </tbody>
    </table>
  );
}
