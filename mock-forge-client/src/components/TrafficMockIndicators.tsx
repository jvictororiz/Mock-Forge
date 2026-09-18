import React from 'react';
import type { CapturedRequest, MockKind } from '../types';
import { getTrafficMockStatus } from '../utils/trafficMockStatus';
import { useI18n } from '../hooks/useI18n';
import { hasTrafficInstability, isInstabilityRecord } from '../../shared/trafficInstability';

export function TrafficMockIndicators({
  request,
  onOpenMock,
}: {
  request: CapturedRequest;
  onOpenMock?: (kind: MockKind) => void;
}) {
  const { t } = useI18n();
  const { mockedRequest, mockedResponse } = getTrafficMockStatus(request);
  const isInstability = isInstabilityRecord(request);
  const hasInstability = hasTrafficInstability(request);

  if (isInstability) {
    return (
      <span style={styles.instability} title={t.traffic.instabilityIndicatorTitle}>
        ⚠
      </span>
    );
  }

  if (!mockedRequest && !mockedResponse && !request.forcedExecution && !hasInstability) {
    return (
      <span style={styles.real} title="Chamada real (proxy/passthrough)">
        real
      </span>
    );
  }

  const handleClick = (event: React.MouseEvent, kind: MockKind) => {
    event.stopPropagation();
    onOpenMock?.(kind);
  };

  return (
    <span style={styles.group}>
      {hasInstability && (
        <span style={styles.instability} title={t.traffic.instabilityIndicatorTitle}>
          ⚠
        </span>
      )}
      {request.forcedExecution && (
        <span style={styles.forced} title="Execução forçada do editor">
          ▶
        </span>
      )}
      {mockedRequest && (
        <button
          type="button"
          style={{
            ...styles.request,
            ...(onOpenMock ? styles.clickable : {}),
          }}
          title={onOpenMock ? t.traffic.mockRequestIndicatorTitle : 'Request mocked'}
          onClick={onOpenMock ? (event) => handleClick(event, 'request') : undefined}
          disabled={!onOpenMock}
        >
          ⬆
        </button>
      )}
      {mockedResponse && (
        <button
          type="button"
          style={{
            ...styles.response,
            ...(onOpenMock ? styles.clickable : {}),
          }}
          title={onOpenMock ? t.traffic.mockResponseIndicatorTitle : 'Response mocked'}
          onClick={onOpenMock ? (event) => handleClick(event, 'response') : undefined}
          disabled={!onOpenMock}
        >
          ⬇
        </button>
      )}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
  },
  real: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    borderRadius: '3px',
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
  },
  clickable: {
    cursor: 'pointer',
  },
  request: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: '0 3px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 700,
    color: 'var(--badge-request-color)',
    background: 'var(--badge-request-bg)',
    border: '1px solid rgba(73, 204, 144, 0.35)',
  },
  response: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: '0 3px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 700,
    color: 'var(--badge-response-color)',
    background: 'var(--badge-response-bg)',
    border: '1px solid rgba(97, 175, 254, 0.35)',
  },
  forced: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: '0 3px',
    borderRadius: '3px',
    fontSize: '8px',
    fontWeight: 700,
    color: 'var(--warning)',
    background: 'rgba(255, 193, 7, 0.12)',
    border: '1px solid rgba(255, 193, 7, 0.45)',
  },
  instability: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: '0 3px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#ff7043',
    background: 'rgba(255, 112, 67, 0.12)',
    border: '1px solid rgba(255, 112, 67, 0.45)',
  },
};
