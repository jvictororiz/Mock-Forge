import React, { memo } from 'react';
import { MethodBadge } from './MethodBadge';
import { formatTimestamp, formatDuration, statusColor } from '../utils/format';
import { TrafficMockIndicators } from './TrafficMockIndicators';
import { ConsumerDeviceLabel } from './ConsumerDeviceLabel';
import type { CapturedRequest, MockKind } from '../types';
import { isInstabilityRecord } from '../../shared/trafficInstability';
import {
  getTrafficMethodLabel,
  getTrafficPathLabel,
  getTrafficStatusLabel,
} from '../utils/trafficInstabilityDisplay';
import { useI18n } from '../hooks/useI18n';
import { TRAFFIC_GRID_COLUMNS, TRAFFIC_ROW_HEIGHT } from './trafficTableMetrics';

export type TrafficTableRowProps = {
  record: CapturedRequest;
  selected: boolean;
  checked: boolean;
  menuDisabled: boolean;
  selectRowLabel: string;
  actionsLabel: string;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, event: React.MouseEvent<HTMLDivElement>) => void;
  onToggleCheck: (id: string) => void;
  onOpenMenu: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMock?: (record: CapturedRequest, kind: MockKind) => void;
};

export const TrafficTableRow = memo(function TrafficTableRow({
  record,
  selected,
  checked,
  menuDisabled,
  selectRowLabel,
  actionsLabel,
  onSelect,
  onContextMenu,
  onToggleCheck,
  onOpenMenu,
  onOpenMock,
}: TrafficTableRowProps) {
  const { t } = useI18n();
  const isInstability = isInstabilityRecord(record);
  const pathLabel = getTrafficPathLabel(record, t);
  const statusLabel = getTrafficStatusLabel(record, t);
  const statusTone = statusColor(record.responseStatus, {
    failed: !!record.connectionFailed,
    unstable: isInstability || !!record.clientInstability,
  });

  return (
    <div
      role="row"
      style={{
        ...styles.tr,
        ...(selected ? styles.trSelected : {}),
        ...(isInstability ? styles.trInstability : {}),
        ...(record.connectionFailed ? styles.trFailed : {}),
      }}
      onClick={() => onSelect(record.id)}
      onContextMenu={(event) => onContextMenu(record.id, event)}
    >
      <div role="cell" style={styles.tdCompact}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleCheck(record.id)}
          onClick={(event) => event.stopPropagation()}
          aria-label={selectRowLabel}
          style={styles.checkbox}
        />
      </div>
      <div role="cell" style={styles.tdCompact}>
        <button
          type="button"
          style={styles.menuBtn}
          onClick={(event) => onOpenMenu(record.id, event)}
          disabled={menuDisabled || isInstability}
          aria-label={actionsLabel}
        >
          ⋮
        </button>
      </div>
      <div role="cell" style={styles.tdCompact}>
        <TrafficMockIndicators
          request={record}
          onOpenMock={onOpenMock && !isInstability ? (kind) => onOpenMock(record, kind) : undefined}
        />
      </div>
      <div role="cell" style={styles.td}>{formatTimestamp(record.timestamp)}</div>
      <div role="cell" style={styles.td}>
        <MethodBadge method={getTrafficMethodLabel(record)} />
      </div>
      <div
        role="cell"
        style={{
          ...styles.td,
          fontFamily: isInstability ? 'inherit' : 'var(--font-mono)',
          fontSize: isInstability ? '11px' : '12px',
          color: isInstability ? '#ff7043' : undefined,
          fontWeight: isInstability ? 600 : undefined,
        }}
        title={pathLabel}
      >
        {pathLabel}
      </div>
      <div role="cell" style={{ ...styles.td, color: 'var(--text-secondary)', fontSize: '11px' }}>
        {isInstability ? '—' : (
          <ConsumerDeviceLabel
            consumerId={record.consumerId}
            consumerLabel={record.consumerLabel}
            forcedExecution={record.forcedExecution}
            headers={record.headers}
          />
        )}
      </div>
      <div role="cell" style={{ ...styles.td, color: statusTone, fontWeight: 600, textTransform: 'lowercase' }}>
        {statusLabel}
      </div>
      <div role="cell" style={{ ...styles.td, color: 'var(--text-secondary)' }}>
        {formatDuration(record.durationMs)}
      </div>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  tr: {
    display: 'grid',
    gridTemplateColumns: TRAFFIC_GRID_COLUMNS,
    alignItems: 'center',
    height: TRAFFIC_ROW_HEIGHT,
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  trSelected: {
    background: 'var(--bg-tertiary)',
  },
  trInstability: {
    background: 'rgba(255, 112, 67, 0.06)',
  },
  trFailed: {
    background: 'rgba(249, 62, 62, 0.04)',
  },
  td: {
    minWidth: 0,
    padding: '0 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: '12px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    lineHeight: `${TRAFFIC_ROW_HEIGHT - 1}px`,
    height: '100%',
    boxSizing: 'border-box',
  },
  tdCompact: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '1px solid var(--border)',
    height: '100%',
    boxSizing: 'border-box',
  },
  menuBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    lineHeight: 1,
    fontWeight: 700,
  },
  checkbox: {
    width: '15px',
    height: '15px',
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
};
