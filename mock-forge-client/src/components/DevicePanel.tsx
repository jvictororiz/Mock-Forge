import React, { useCallback, useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { useI18n } from '../hooks/useI18n';
import { DeviceLabel } from './DeviceLabel';
import { ConsumerList } from './ConsumerSelector';
import { CollapsibleSection } from './CollapsibleSection';
import type { AdbDevice } from '../types';

function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={index} style={styles.inlineCode}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function InstructionList({ steps }: { steps: string[] }) {
  return (
    <ol style={styles.stepList}>
      {steps.map((step, index) => (
        <li key={index} style={styles.stepItem}>
          <RichText text={step} />
        </li>
      ))}
    </ol>
  );
}

function TunnelDeviceRow({
  device,
  isActive,
  loading,
  onConnect,
}: {
  device: AdbDevice;
  isActive: boolean;
  loading: boolean;
  onConnect: () => void;
}) {
  const { t } = useI18n();
  const typeLabel = device.connectionType === 'wifi'
    ? t.devices.wifi
    : device.connectionType === 'usb'
      ? t.devices.usb
      : t.devices.emulator;
  const statusSuffix = `${typeLabel} · ${device.state}${device.reverseActive ? t.devices.tunnelActiveSuffix : ''}`;

  return (
    <div style={{ ...styles.deviceRow, ...(isActive ? styles.deviceRowActive : {}) }}>
      <div style={styles.deviceInfo}>
        <DeviceLabel name={device.name} address={device.address} active={isActive} />
        <span style={styles.deviceMeta}>{statusSuffix}</span>
      </div>
      <button
        style={{ ...styles.connectBtn, ...(isActive ? styles.connectBtnActive : {}) }}
        onClick={onConnect}
        disabled={loading || device.state === 'unauthorized'}
        title={device.state === 'unauthorized' ? t.devices.unauthorized : undefined}
      >
        {loading ? '…' : isActive ? t.devices.tunnelActive : t.devices.activateTunnel}
      </button>
    </div>
  );
}

export function DevicePanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { serverStatus, setServerStatus } = useAppStore(
    (state) => ({
      serverStatus: state.serverStatus,
      setServerStatus: state.setServerStatus,
    }),
    shallow,
  );
  const [devices, setDevices] = useState<AdbDevice[]>(serverStatus.adbDevices ?? []);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const port = serverStatus.port;

  const refresh = useCallback(async () => {
    try {
      const list = await window.mockforge.adb.list();
      setDevices(list);
      const status = await window.mockforge.server.status();
      setServerStatus(status);
    } catch (err) {
      console.error('Failed to refresh devices', err);
    }
  }, [setServerStatus]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleConnectDevice = async (device: AdbDevice) => {
    setLoadingId(device.id);
    setMessage(null);
    try {
      const result = await window.mockforge.adb.connectDevice(device.id);
      if (!result.success) {
        setMessage(result.error || t.devices.connectFailed);
      } else {
        setMessage(t.devices.tunnelOn(result.deviceId ?? device.id));
      }
      await refresh();
    } catch (err) {
      setMessage((err as Error).message || t.devices.connectFailed);
    } finally {
      setLoadingId(null);
    }
  };

  const connected = devices.filter((d) => d.state === 'device');
  const others = devices.filter((d) => d.state !== 'device');

  return (
    <div style={embedded ? undefined : styles.section} id="devices-panel">
      <p style={styles.intro}>{t.devices.intro}</p>

      <section style={styles.block}>
        <h4 style={styles.blockTitle}>{t.devices.iosTitle}</h4>
        <div style={styles.guideBlock}>
          <div style={styles.guideSubheading}>{t.devices.iosSimulatorTitle}</div>
          <p style={styles.hint}>
            <RichText text={t.devices.iosSimulatorHint(port)} />
          </p>
        </div>
        <div style={styles.guideBlock}>
          <div style={styles.guideSubheading}>{t.devices.iosPhysicalTitle}</div>
          <InstructionList steps={t.devices.iosPhysicalSteps(port)} />
        </div>
      </section>

      <section style={styles.block}>
        <h4 style={styles.blockTitle}>{t.devices.adbTitle}</h4>
        <CollapsibleSection title={t.devices.connectUsbTitle} defaultOpen={connected.length === 0 && others.length === 0}>
          <InstructionList steps={t.devices.connectUsbSteps(port)} />
        </CollapsibleSection>
        <CollapsibleSection title={t.devices.connectWifiTitle} defaultOpen={false}>
          <InstructionList steps={t.devices.connectWifiSteps(port)} />
        </CollapsibleSection>
        <p style={styles.tunnelHint}>
          <RichText text={t.devices.tunnelButtonHint(port)} />
        </p>

        {!serverStatus.adbAvailable ? (
          <p style={styles.muted}>
            {t.devices.adbMissing}
          </p>
        ) : connected.length === 0 && others.length === 0 ? (
          <div style={styles.emptyBox}>
            {t.devices.adbEmpty}
          </div>
        ) : (
          <div style={styles.deviceList}>
            {connected.map((device) => (
              <TunnelDeviceRow
                key={device.id}
                device={device}
                isActive={serverStatus.activeAdbDevice === device.id}
                loading={loadingId === device.id}
                onConnect={() => void handleConnectDevice(device)}
              />
            ))}
            {others.map((device) => (
              <TunnelDeviceRow
                key={device.id}
                device={device}
                isActive={false}
                loading={loadingId === device.id}
                onConnect={() => void handleConnectDevice(device)}
              />
            ))}
          </div>
        )}
      </section>

      <section style={styles.block}>
        <ConsumerList title={t.devices.connectedTitle} />
      </section>

      {message && <p style={styles.message}>{message}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: '32px',
    paddingBottom: '32px',
    borderBottom: '1px solid var(--border)',
  },
  intro: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: '24px',
  },
  block: {
    marginBottom: '28px',
  },
  blockTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '12px',
  },
  guideBlock: {
    marginBottom: '16px',
  },
  guideSubheading: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  },
  hint: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    margin: 0,
  },
  tunnelHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    marginTop: '4px',
    marginBottom: '12px',
  },
  stepList: {
    margin: 0,
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  stepItem: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  muted: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
  inlineCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    background: 'var(--bg-tertiary)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  message: {
    fontSize: '12px',
    color: 'var(--accent)',
    marginTop: '8px',
  },
  emptyBox: {
    padding: '24px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    background: 'var(--bg-secondary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  deviceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  deviceRowActive: {
    borderColor: 'var(--accent)',
    background: 'rgba(73, 204, 144, 0.06)',
  },
  deviceInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    flex: 1,
  },
  deviceMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  connectBtn: {
    padding: '6px 12px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    fontWeight: 600,
    flexShrink: 0,
  },
  connectBtnActive: {
    background: 'var(--bg-tertiary)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
  },
};
