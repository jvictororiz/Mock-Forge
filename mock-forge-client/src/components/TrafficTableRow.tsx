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

export type TrafficTableRowProps = {
  record: CapturedRequest;
  selected: boolean;
  checked: boolean;
  menuDisabled: boolean;
  selectRowLabel: string;
  actionsLabel: string;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, event: React.MouseEvent<HTMLTableRowElement>) => void;
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
  const statusLabel = getTrafficStatusLabel(record, t);
  const statusTone = statusColor(record.responseStatus, {
    failed: !!record.connectionFailed,
    unstable: isInstability || !!record.clientInstability,
  });

  return (
    <tr
      style={{
        ...styles.tr,
        ...(selected ? styles.trSelected : {}),
        ...(isInstability ? styles.trInstability : {}),
        ...(record.connectionFailed ? styles.trFailed : {}),
      }}
      onClick={() => onSelect(record.id)}
      onContextMenu={(event) => onContextMenu(record.id, event)}
    >
      <td style={styles.tdCheckbox}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleCheck(record.id)}
          onClick={(event) => event.stopPropagation()}
          aria-label={selectRowLabel}
          style={styles.checkbox}
        />
      </td>
      <td style={styles.tdMenu}>
        <button
          type="button"
          style={styles.menuBtn}
          onClick={(event) => onOpenMenu(record.id, event)}
          disabled={menuDisabled || isInstability}
          aria-label={actionsLabel}
        >
          ⋮
        </button>
      </td>
      <td style={styles.tdIcon}>
        <TrafficMockIndicators
          request={record}
          onOpenMock={onOpenMock && !isInstability ? (kind) => onOpenMock(record, kind) : undefined}
        />
      </td>
      <td style={styles.td}>{formatTimestamp(record.timestamp)}</td>
      <td style={styles.td}>
        <MethodBadge method={getTrafficMethodLabel(record)} />
      </td>
      <td style={{
        ...styles.td,
        fontFamily: isInstability ? 'inherit' : 'var(--font-mono)',
        fontSize: isInstability ? '11px' : '12px',
        color: isInstability ? '#ff7043' : undefined,
        fontWeight: isInstability ? 600 : undefined,
      }}>
        {getTrafficPathLabel(record, t)}
      </td>
      <td style={{ ...styles.td, color: 'var(--text-secondary)', fontSize: '11px' }}>
        {isInstability ? '—' : (
          <ConsumerDeviceLabel
            consumerId={record.consumerId}
            consumerLabel={record.consumerLabel}
            forcedExecution={record.forcedExecution}
            headers={record.headers}
          />
        )}
      </td>
      <td style={{ ...styles.td, color: statusTone, fontWeight: 600, textTransform: 'lowercase' }}>
        {statusLabel}
      </td>
      <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>
        {formatDuration(record.durationMs)}
      </td>
    </tr>
  );
});

const styles: Record<string, React.CSSProperties> = {
  tr: {
    cursor: 'pointer',
    transition: 'background 0.1s',
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
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: '12px',
  },
  tdIcon: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    width: '44px',
    textAlign: 'center',
  },
  tdCheckbox: {
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    width: '36px',
    textAlign: 'center',
  },
  tdMenu: {
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    width: '36px',
    textAlign: 'center',
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
