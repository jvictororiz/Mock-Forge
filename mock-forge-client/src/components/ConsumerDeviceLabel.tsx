import React from 'react';
import {
  MOCKFORGE_CONSUMER_LABEL,
  isMockForgeConsumer,
} from '../../shared/consumerUtils';

interface ConsumerDeviceLabelProps {
  consumerId?: string;
  consumerLabel?: string;
  forcedExecution?: boolean;
  headers?: Record<string, string>;
}

export function ConsumerDeviceLabel({
  consumerId,
  consumerLabel,
  forcedExecution,
  headers,
}: ConsumerDeviceLabelProps) {
  if (isMockForgeConsumer({ consumerId, forcedExecution, headers })) {
    return (
      <span style={styles.mockforge} title="Requisição executada pelo MockForge">
        {MOCKFORGE_CONSUMER_LABEL}
      </span>
    );
  }

  return <>{consumerLabel || '—'}</>;
}

const styles: Record<string, React.CSSProperties> = {
  mockforge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.2px',
    color: 'var(--warning)',
    background: 'rgba(255, 193, 7, 0.12)',
    border: '1px solid rgba(255, 193, 7, 0.45)',
  },
};
