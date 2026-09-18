import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { useSessionStore } from '../stores/sessionStore';
import { showToast } from '../utils/notify';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import { useI18n } from '../hooks/useI18n';
import { ConsumerSelector } from './ConsumerSelector';
import { EnvironmentSelector } from './EnvironmentSelector';
import { UpdateControls } from './UpdateControls';
import appIcon from '../assets/app-icon.png';
import { Tab, TabBar } from './TabBar';

export function Header() {
  const { t } = useI18n();
  const {
    serverStatus,
    setServerStatus,
    activeTab,
    setActiveTab,
  } = useAppStore(
    (state) => ({
      serverStatus: state.serverStatus,
      setServerStatus: state.setServerStatus,
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
    }),
    shallow,
  );

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const handleToggleServer = async () => {
    try {
      const recordingSession = serverStatus.running
        ? await window.mockforge.sessions.getActive().catch(() => null)
        : null;

      if (serverStatus.running) {
        setIsStopping(true);
        try {
          await window.mockforge.server.stop();
        } finally {
          setIsStopping(false);
        }

        if (recordingSession?.status === 'recording') {
          const completed = await window.mockforge.sessions.get(recordingSession.id);
          if (completed) {
            useSessionStore.getState().openNamingFlow(completed.id, completed.name);
            await useSessionStore.getState().loadSessions();
          }
        }
      } else {
        setIsStarting(true);
        try {
          const result = await window.mockforge.server.start();
          if (!result.success && result.error) {
            showToast(t.server.startFailed(result.error), 'error');
          } else {
            const traffic = await window.mockforge.traffic.get();
            if (traffic.length > 0) {
              useAppStore.getState().appendTraffic(traffic);
            }
          }
        } finally {
          setIsStarting(false);
        }
      }
      const [status] = await Promise.all([
        window.mockforge.server.status(),
        ensureCurrentEnvironment(),
      ]);
      setServerStatus(status);
    } catch (err) {
      showToast(t.server.startFailed((err as Error).message), 'error');
    }
  };

  const isBusy = isStarting || isStopping;

  return (
    <header style={styles.header} className="app-header">
      <div style={styles.inner}>
        <div style={styles.left}>
        <TabBar variant="pill">
          <Tab active={activeTab === 'traffic'} onClick={() => setActiveTab('traffic')}>
            {t.app.traffic}
          </Tab>
          <Tab active={activeTab === 'editor'} onClick={() => setActiveTab('editor')}>
            {t.app.editor}
          </Tab>
          <Tab active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')}>
            {t.app.recordings}
          </Tab>
          <Tab active={activeTab === 'settings'} onClick={() => {
            setActiveTab('settings');
            useAppStore.getState().setSettingsTab('server');
          }}>
            {t.app.settings}
          </Tab>
        </TabBar>
        </div>

        <div style={styles.center}>
          <div style={styles.logo}>
            <img src={appIcon} alt="" style={styles.logoIcon} width={22} height={22} />
            <span style={styles.logoText}>MockForge</span>
          </div>
        </div>

        <div style={styles.right}>
          <UpdateControls compact />
          <EnvironmentSelector compact />
          <ConsumerSelector compact />

          <div style={styles.status}>
            {serverStatus.running ? (
              <span style={styles.statusRunning}>
                {t.server.runningOn(serverStatus.port)}
              </span>
            ) : (
              <span style={styles.statusStopped}>{t.server.stopped}</span>
            )}
          </div>

          <button
            onClick={handleToggleServer}
            style={{
              ...styles.playBtn,
              backgroundColor: serverStatus.running ? '#555' : 'var(--accent)',
              opacity: isBusy ? 0.85 : 1,
              minWidth: '100px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            disabled={!serverStatus.javaAvailable || !serverStatus.jarAvailable || isBusy}
            title={
              !serverStatus.javaAvailable
                ? (serverStatus.javaSource === 'bundled' ? t.server.javaBundledMissing : t.server.javaRequired)
                : !serverStatus.jarAvailable
                  ? t.server.jarMissing
                  : serverStatus.running ? t.server.stopTitle : t.server.startTitle
            }
          >
            {isBusy && <span style={styles.spinner} aria-hidden />}
            {isStarting ? t.server.starting : isStopping ? t.server.stopping : serverStatus.running ? t.server.stop : t.server.start}
          </button>
        </div>
      </div>
    </header>
  );
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  header: {
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    userSelect: 'none',
    // Native macOS drag + double-click zoom (hiddenInset title bar).
    WebkitAppRegion: 'drag',
  } as React.CSSProperties,
  inner: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '12px 16px 10px',
    paddingLeft: 'var(--titlebar-inset-left)',
    minHeight: '52px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    justifySelf: 'start',
    ...noDrag,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    justifySelf: 'center',
    pointerEvents: 'none',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    display: 'block',
    borderRadius: '6px',
    flexShrink: 0,
  },
  logoText: {
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '-0.3px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    justifySelf: 'end',
    ...noDrag,
  },
  status: {
    fontSize: '12px',
  },
  statusRunning: {
    color: 'var(--accent)',
  },
  statusStopped: {
    color: 'var(--text-muted)',
  },
  playBtn: {
    padding: '6px 16px',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255,255,255,0.35)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'mockforge-spin 0.7s linear infinite',
    flexShrink: 0,
  },
};
