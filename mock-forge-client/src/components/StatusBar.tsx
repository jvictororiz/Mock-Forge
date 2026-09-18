import { useAppStore } from '../stores/appStore';
import { useI18n } from '../hooks/useI18n';

export function StatusBar() {
  const { t } = useI18n();
  const serverStatus = useAppStore((state) => state.serverStatus);
  const { port, localIp } = serverStatus;

  return (
    <footer style={styles.bar}>
      <div style={styles.left}>
        {serverStatus.running && (
          <>
            {serverStatus.adbReverseActive && serverStatus.deviceBaseUrl ? (
              <>
                <span style={styles.item}>
                  <span style={{ ...styles.dot, background: 'var(--info)' }} />
                  {t.server.device}: <code style={styles.code}>{serverStatus.deviceBaseUrl}</code>
                </span>
                <span style={styles.separator}>|</span>
              </>
            ) : localIp ? (
              <>
                <span style={styles.item}>
                  <span style={styles.dot} />
                  {t.server.macLabel}: <code style={styles.code}>http://{localIp}:{port}</code>
                </span>
                <span style={styles.separator}>|</span>
              </>
            ) : null}
            <span style={styles.item}>
              {t.server.local}: <code style={styles.code}>http://localhost:{port}</code>
            </span>
            <span style={styles.separator}>|</span>
            <span style={styles.itemMuted} title={t.server.emulatorTitle}>
              {t.server.emulator}: <code style={styles.codeMuted}>10.0.2.2:{port}</code>
            </span>
            {serverStatus.proxyRequestCount != null && (
              <>
                <span style={styles.separator}>|</span>
                <span style={styles.itemMuted} title={t.server.receivedTitle}>
                  {t.server.received}: {serverStatus.proxyRequestCount}
                </span>
              </>
            )}
          </>
        )}
        {!serverStatus.running && (
          <span style={styles.itemMuted}>{t.server.stoppedBar}</span>
        )}
      </div>
      <div style={styles.right}>
        {!serverStatus.running && serverStatus.lastError && (
          <span style={styles.error} title={serverStatus.lastError}>
            {t.server.crashed}
          </span>
        )}
        {!serverStatus.javaAvailable && (
          <span style={styles.warning}>
            {serverStatus.javaSource === 'bundled'
              ? t.server.javaBundledMissing
              : t.server.javaRequired}
          </span>
        )}
        {serverStatus.javaAvailable && !serverStatus.jarAvailable && (
          <span style={styles.warning}>{t.server.jarMissingHint}</span>
        )}
        {serverStatus.javaVersion && (
          <span style={styles.itemMuted}>{serverStatus.javaVersion}</span>
        )}
      </div>
    </footer>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    background: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border)',
    fontSize: '11px',
    height: '28px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--text-secondary)',
  },
  itemMuted: {
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--accent)',
    display: 'inline-block',
  },
  code: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  codeMuted: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    background: 'var(--bg-tertiary)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  separator: {
    color: 'var(--border)',
  },
  warning: {
    color: 'var(--warning)',
  },
  error: {
    color: 'var(--danger)',
    cursor: 'help',
  },
};
