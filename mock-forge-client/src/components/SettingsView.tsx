import { useMemo, useState, useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { DevicePanel } from './DevicePanel';
import { EnvironmentPanel } from './EnvironmentPanel';
import { LanguagePanel } from './LanguagePanel';
import { UpdateControls } from './UpdateControls';
import { McpPanel } from './McpPanel';
import { DEFAULT_PORT } from '../../shared/constants';
import { getUpstreamUrl, parseUpstreamUrl, isUpstreamUrlValid, isUpstreamDirty } from '../../shared/upstreamUtils';
import { Tab, TabBar } from './TabBar';
import { CopyButton } from './CopyButton';
import packageJson from '../../package.json';
import { showToast } from '../utils/notify';
import { useI18n } from '../hooks/useI18n';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';

type SettingsTab = 'server' | 'devices' | 'mcp' | 'language';

export function SettingsView() {
  const { t } = useI18n();
  const tabs = useMemo(
    (): { id: SettingsTab; label: string }[] => [
      { id: 'server', label: t.settings.tabs.server },
      { id: 'devices', label: t.settings.tabs.devices },
      { id: 'mcp', label: t.settings.tabs.mcp },
      { id: 'language', label: t.settings.tabs.language },
    ],
    [t],
  );
  const {
    currentEnvironment,
    setCurrentEnvironment,
    serverStatus,
    setServerStatus,
    settingsTab,
    setSettingsTab,
  } = useAppStore(
    (state) => ({
      currentEnvironment: state.currentEnvironment,
      setCurrentEnvironment: state.setCurrentEnvironment,
      serverStatus: state.serverStatus,
      setServerStatus: state.setServerStatus,
      settingsTab: state.settingsTab,
      setSettingsTab: state.setSettingsTab,
    }),
    shallow,
  );

  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [upstreamUrl, setUpstreamUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingEnv, setLoadingEnv] = useState(false);

  useEffect(() => {
    if (currentEnvironment) {
      setLoadingEnv(false);
      return;
    }

    let cancelled = false;
    setLoadingEnv(true);
    void ensureCurrentEnvironment()
      .finally(() => {
        if (!cancelled) setLoadingEnv(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentEnvironment]);

  useEffect(() => {
    if (currentEnvironment) {
      setPort(String(currentEnvironment.port));
      setUpstreamUrl(getUpstreamUrl(currentEnvironment));
    }
  }, [currentEnvironment]);

  if (loadingEnv) {
    return <div style={styles.empty}>{t.common.loading}</div>;
  }

  if (!currentEnvironment) {
    return <div style={styles.empty}>{t.settings.noConfig}</div>;
  }

  const portNum = parseInt(port, 10);
  const portValid = !isNaN(portNum) && portNum >= 1024 && portNum <= 65535;
  const portChanged = portNum !== currentEnvironment.port;
  const upstream = parseUpstreamUrl(upstreamUrl);
  const upstreamValid = isUpstreamUrlValid(upstreamUrl);
  const upstreamChanged = isUpstreamDirty(upstreamUrl, currentEnvironment);
  const hasChanges = portChanged || upstreamChanged;
  const localIp = serverStatus.localIp;
  const displayPort = portValid ? portNum : '—';

  const handleSave = async () => {
    if (!portValid) return;

    setSaving(true);
    setSaved(false);

    const wasRunning = serverStatus.running;
    const needsRestart = wasRunning && (portChanged || upstreamChanged);
    const updated = {
      ...currentEnvironment,
      port: portNum,
      upstreamUrl: upstreamUrl.trim() || undefined,
      upstream: upstream ?? undefined,
    };

    try {
      if (needsRestart) {
        await window.mockforge.server.stop();
      }

      const savedEnv = await window.mockforge.environment.save(updated);
      setCurrentEnvironment(savedEnv);

      if (needsRestart) {
        const result = await window.mockforge.server.start();
        if (!result.success && result.error) {
          showToast(t.settings.saveRestartFailed(result.error), 'error');
        }
      }

      const status = await window.mockforge.server.status();
      const current = await window.mockforge.environment.current();
      setServerStatus(status);
      if (current) setCurrentEnvironment(current);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast(t.settings.saveFailed((err as Error).message), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        <div style={styles.content}>
          <div>
            <h2 style={styles.pageTitle}>{t.settings.title}</h2>
            <p style={styles.pageSubtitle}>{t.settings.subtitle}</p>
          </div>

          <section style={styles.envSection}>
            <EnvironmentPanel />
          </section>

          <div style={styles.stickyTabsWrap}>
            <TabBar style={{ padding: 0 }}>
              {tabs.map((tab) => (
                <Tab
                  key={tab.id}
                  active={settingsTab === tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                >
                  {tab.label}
                </Tab>
              ))}
            </TabBar>
          </div>

          <div style={styles.tabContent}>
            {settingsTab === 'server' && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>{t.settings.listeningPort}</label>
              <p style={styles.fieldSubtitle}>{t.settings.listeningPortSubtitle}</p>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                style={{ ...styles.input, maxWidth: '160px' }}
                min={1024}
                max={65535}
                placeholder={String(DEFAULT_PORT)}
              />
              {!portValid && (
                <span style={styles.error}>{t.settings.portInvalid}</span>
              )}
              {portChanged && serverStatus.running && (
                <span style={styles.hint}>{t.settings.portRestartHint}</span>
              )}
              {upstreamChanged && serverStatus.running && !portChanged && (
                <span style={styles.hint}>{t.settings.upstreamRestartHint}</span>
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>{t.settings.upstream}</label>
              <p style={styles.fieldSubtitle}>{t.settings.upstreamSubtitle}</p>
              <input
                value={upstreamUrl}
                onChange={(e) => setUpstreamUrl(e.target.value)}
                style={styles.input}
                placeholder="https://api.example.com/"
              />
              <span style={styles.hintMuted}>{t.settings.upstreamHint}</span>
              {upstreamUrl.trim() && !upstreamValid && (
                <span style={styles.error}>{t.settings.upstreamInvalid}</span>
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>{t.settings.clientAppUrls}</label>
              <div style={styles.urlReferencePanel}>
                <p style={styles.urlReferenceIntro}>{t.settings.clientAppUrlsIntro}</p>
                <div style={styles.urlList}>
                  <UrlRow
                    label={t.settings.urlTunnel}
                    hint={t.settings.urlTunnelHint}
                    url={`http://localhost:${displayPort}`}
                  />
                  {localIp ? (
                    <UrlRow
                      label={t.settings.urlMacIp}
                      hint={t.settings.urlMacIpHint}
                      url={`http://${localIp}:${displayPort}`}
                      divided
                    />
                  ) : null}
                  <UrlRow
                    label={t.settings.urlLocalhost}
                    hint={t.settings.urlLocalhostHint}
                    url={`http://localhost:${displayPort}`}
                    divided
                  />
                  <UrlRow
                    label={t.settings.urlEmulator}
                    hint={t.settings.urlEmulatorHint}
                    url={`http://10.0.2.2:${displayPort}`}
                    divided
                  />
                </div>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>{t.settings.system}</label>
              <div style={styles.infoGrid}>
                <InfoRow
                  label={t.settings.serverStatus}
                  value={serverStatus.running ? t.settings.serverRunning(serverStatus.port) : t.server.stopped}
                  ok={serverStatus.running}
                />
                <InfoRow
                  label={t.settings.version}
                  value={packageJson.version}
                  ok
                />
              </div>
              <UpdateControls />
            </div>
          </>
        )}

        {settingsTab === 'devices' && <DevicePanel embedded />}

        {settingsTab === 'mcp' && <McpPanel />}

        {settingsTab === 'language' && <LanguagePanel />}
          </div>
        </div>
      </div>

      {settingsTab === 'server' && (
        <div style={styles.footer}>
          <button
            style={{
              ...styles.saveBtn,
              opacity: hasChanges && portValid ? 1 : 0.5,
            }}
            onClick={() => void handleSave()}
            disabled={!hasChanges || !portValid || saving || !upstreamValid}
          >
            {saving ? t.settings.saving : saved ? t.settings.saved : t.settings.save}
          </button>
        </div>
      )}
    </div>
  );
}

function UrlRow({
  label,
  url,
  hint,
  divided,
}: {
  label: string;
  url: string;
  hint?: string;
  divided?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div style={{ ...styles.urlRow, ...(divided ? styles.urlRowDivider : {}) }}>
      <div style={styles.urlMeta}>
        <span style={styles.urlLabel}>{label}</span>
        {hint ? <span style={styles.urlHint}>{hint}</span> : null}
      </div>
      <div style={styles.urlValueRow}>
        <code style={styles.urlCode}>{url}</code>
        <CopyButton value={url} title={t.common.copy} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={{ ...styles.infoValue, color: ok ? 'var(--text-secondary)' : 'var(--warning)' }}>
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  content: {
    maxWidth: '720px',
    padding: '24px 32px 32px',
  },
  stickyTabsWrap: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: 'var(--bg-primary)',
    margin: '0 -32px',
    padding: '0 32px',
    borderBottom: '1px solid var(--border)',
  },
  tabContent: {
    paddingTop: '24px',
  },
  footer: {
    flexShrink: 0,
    padding: '12px 32px 20px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '4px',
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '16px',
  },
  envSection: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--border)',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  },
  fieldSubtitle: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
  },
  error: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--danger)',
    marginTop: '4px',
  },
  hint: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--warning)',
    marginTop: '4px',
  },
  hintMuted: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px',
    lineHeight: 1.5,
  },
  urlReferencePanel: {
    marginTop: '4px',
    border: '1px dashed var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  urlReferenceIntro: {
    margin: 0,
    padding: '10px 12px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    borderBottom: '1px dashed var(--border)',
  },
  urlList: {
    display: 'flex',
    flexDirection: 'column',
  },
  urlRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px',
  },
  urlRowDivider: {
    borderTop: '1px dashed var(--border)',
  },
  urlMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  urlLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  urlValueRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  urlCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
    userSelect: 'text',
  },
  urlHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '8px 0',
  },
  infoLabel: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  infoValue: {
    fontSize: '12px',
    textAlign: 'right',
    wordBreak: 'break-word',
  },
  saveBtn: {
    padding: '10px 24px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: 600,
  },
};
