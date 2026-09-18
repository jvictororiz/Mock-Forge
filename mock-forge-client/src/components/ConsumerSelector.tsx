import React, { useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { useI18n } from '../hooks/useI18n';
import type { TrafficConsumer } from '../../shared/consumerUtils';
import { listTrafficConsumers, isMockForgeConsumer } from '../../shared/consumerUtils';

function ConsumerOption({
  label,
  meta,
  active,
  onClick,
  mockforge = false,
}: {
  label: string;
  meta?: string;
  active: boolean;
  onClick: () => void;
  mockforge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.option,
        ...(active ? styles.optionActive : {}),
      }}
    >
      <span style={{
        ...styles.optionLabel,
        ...(mockforge ? styles.optionLabelMockforge : {}),
      }}
      >
        {label}
      </span>
      {meta ? <span style={styles.optionMeta}>{meta}</span> : null}
    </button>
  );
}

export function ConsumerSelector({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const {
    trafficCount,
    selectedConsumerId,
    setSelectedConsumerId,
    openDevicesSettings,
  } = useAppStore(
    (state) => ({
      trafficCount: state.traffic.length,
      selectedConsumerId: state.selectedConsumerId,
      setSelectedConsumerId: state.setSelectedConsumerId,
      openDevicesSettings: state.openDevicesSettings,
    }),
    shallow,
  );

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const consumers = listTrafficConsumers(useAppStore((state) => state.trafficConsumers));
  const selected = consumers.find((c) => c.id === selectedConsumerId);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const handleSelect = (consumer: TrafficConsumer | null) => {
    setSelectedConsumerId(consumer?.id ?? null);
    setOpen(false);
  };

  const badgeLabel = selected?.label ?? t.devices.allDevices;

  return (
    <div style={styles.root} ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        style={{
          ...styles.badge,
          ...(selectedConsumerId ? styles.badgeActive : styles.badgeIdle),
          ...(compact ? styles.badgeCompact : {}),
        }}
        title={t.devices.filterByDevice}
      >
        <span style={styles.label}>{badgeLabel}</span>
        <span style={styles.chevron}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={styles.menu}>
          <ConsumerOption
            label={t.devices.allDevices}
            meta={t.devices.requests(trafficCount)}
            active={!selectedConsumerId}
            onClick={() => handleSelect(null)}
          />
          {consumers.length > 0 ? (
            <>
              <div style={styles.divider} />
              {consumers.map((consumer) => (
                <ConsumerOption
                  key={consumer.id}
                  label={consumer.label}
                  meta={t.devices.requestsShort(consumer.requestCount)}
                  active={selectedConsumerId === consumer.id}
                  mockforge={isMockForgeConsumer({ consumerId: consumer.id })}
                  onClick={() => handleSelect(consumer)}
                />
              ))}
            </>
          ) : (
            <p style={styles.emptyHint}>{t.devices.noConsumers}</p>
          )}
          <div style={styles.divider} />
          <button
            type="button"
            style={styles.manageBtn}
            onClick={() => {
              setOpen(false);
              openDevicesSettings();
            }}
          >
            {t.devices.manageDevices}
          </button>
        </div>
      )}
    </div>
  );
}

export function ConsumerList({
  title,
}: {
  title: string;
}) {
  const { t } = useI18n();
  const selectedConsumerId = useAppStore((state) => state.selectedConsumerId);
  const setSelectedConsumerId = useAppStore((state) => state.setSelectedConsumerId);
  const consumers = listTrafficConsumers(useAppStore((state) => state.trafficConsumers));

  return (
    <div style={styles.listBlock}>
      <h5 style={styles.listTitle}>{title}</h5>
      {consumers.length === 0 ? (
        <div style={styles.emptyBox}>{t.devices.noRequests}</div>
      ) : (
        <div style={styles.list}>
          {consumers.map((consumer) => {
            const active = selectedConsumerId === consumer.id;
            return (
              <button
                key={consumer.id}
                type="button"
                onClick={() => setSelectedConsumerId(consumer.id)}
                style={{
                  ...styles.listRow,
                  ...(active ? styles.listRowActive : {}),
                }}
              >
                <div style={styles.listInfo}>
                  <span style={{
                    ...styles.listLabel,
                    ...(isMockForgeConsumer({ consumerId: consumer.id }) ? styles.listLabelMockforge : {}),
                  }}
                  >
                    {consumer.label}
                  </span>
                  <span style={styles.listMeta}>
                    {t.devices.requestsShort(consumer.requestCount)}
                    {consumer.clientIp && consumer.clientIp !== 'unknown' ? ` · ${consumer.clientIp}` : ''}
                  </span>
                </div>
                <span style={styles.listState}>{active ? t.devices.filtering : t.devices.select}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    fontSize: '11px',
    maxWidth: '240px',
    cursor: 'pointer',
    background: 'var(--bg-tertiary)',
  },
  badgeCompact: {
    maxWidth: '220px',
  },
  badgeActive: {
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
  },
  badgeIdle: {
    color: 'var(--text-muted)',
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  chevron: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: '260px',
    maxWidth: '320px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    zIndex: 30,
    overflow: 'hidden',
    padding: '4px',
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-primary)',
  },
  optionActive: {
    background: 'rgba(73, 204, 144, 0.08)',
    color: 'var(--accent)',
  },
  optionLabel: {
    fontSize: '12px',
    fontWeight: 500,
  },
  optionLabelMockforge: {
    color: 'var(--warning)',
    fontWeight: 600,
  },
  optionMeta: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  divider: {
    height: '1px',
    background: 'var(--border)',
    margin: '4px 0',
  },
  emptyHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    padding: '8px 10px',
    lineHeight: 1.5,
    margin: 0,
  },
  manageBtn: {
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    borderRadius: '6px',
  },
  listBlock: {
    marginTop: '16px',
  },
  listTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    textAlign: 'left',
  },
  listRowActive: {
    borderColor: 'var(--accent)',
    background: 'rgba(73, 204, 144, 0.06)',
  },
  listInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    flex: 1,
  },
  listLabel: {
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  listLabelMockforge: {
    color: 'var(--warning)',
    fontWeight: 600,
  },
  listMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  listState: {
    fontSize: '11px',
    color: 'var(--accent)',
    flexShrink: 0,
  },
  emptyBox: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    background: 'var(--bg-secondary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    fontSize: '12px',
  },
};
