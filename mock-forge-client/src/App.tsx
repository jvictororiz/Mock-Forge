import React, { lazy, Suspense, useEffect } from 'react';
import { Header } from './components/Header';
import { TrafficLayout } from './components/TrafficLayout';
import { SettingsView } from './components/SettingsView';
import { FeedbackView } from './components/FeedbackView';
import { EnvironmentView } from './components/EnvironmentView';
import { TabLoadingFallback } from './components/TabLoadingFallback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toast } from './components/Toast';
import { useAppStore } from './stores/appStore';
import { useUpdateStore } from './stores/updateStore';
import { UPDATE_CHECK_INTERVAL_MS } from '../shared/appUpdate';
import { useLocaleStore } from './stores/localeStore';
import { ensureCurrentEnvironment } from './utils/ensureEnvironment';
import { showToast } from './utils/notify';
import { hasTrafficInstability } from '../shared/trafficInstability';
import { getInstabilityToastMessage } from './utils/trafficInstabilityDisplay';
import { getTranslations } from './i18n';
import { handleMonacoReplaceShortcut } from './utils/monacoReplaceShortcut';

const EditorLayout = lazy(() => import('./components/EditorLayout').then((module) => ({
  default: module.EditorLayout,
})));
const HistoryLayout = lazy(() => import('./components/HistoryLayout').then((module) => ({
  default: module.HistoryLayout,
})));

export default function App() {
  const activeTab = useAppStore((state) => state.activeTab);
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.dataset.platform = window.mockforge.platform;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    async function init() {
      const { setServerStatus, appendTraffic } = useAppStore.getState();
      try {
        const status = await window.mockforge.server.status();
        setServerStatus(status);

        if (status.running) {
          const traffic = await window.mockforge.traffic.get();
          if (traffic.length > 0) {
            appendTraffic(traffic);
          }
        }
      } catch (err) {
        console.error('Failed to initialize app state', err);
      }

      void ensureCurrentEnvironment();
      void useUpdateStore.getState().check();
    }
    init();

    const updateInterval = setInterval(() => {
      void useUpdateStore.getState().check({ background: true });
    }, UPDATE_CHECK_INTERVAL_MS);

    const unsubscribe = window.mockforge.traffic.onUpdate((requests) => {
      const previousIds = new Set(useAppStore.getState().traffic.map((record) => record.id));
      useAppStore.getState().appendTraffic(requests);
      const locale = useLocaleStore.getState().locale;
      const t = getTranslations(locale);
      for (const record of requests) {
        if (!previousIds.has(record.id) && hasTrafficInstability(record)) {
          showToast(getInstabilityToastMessage(record, t), 'error');
        }
      }
    });

    const statusInterval = setInterval(async () => {
      const status = await window.mockforge.server.status();
      useAppStore.getState().setServerStatus(status);
    }, 5000);

    const unsubscribeStopped = window.mockforge.server.onStopped(async (data) => {
      const status = await window.mockforge.server.status();
      useAppStore.getState().setServerStatus({
        ...status,
        lastError: data.error || status.lastError,
      });
    });

    const unsubscribeStatus = window.mockforge.server.onStatusChanged(async () => {
      const status = await window.mockforge.server.status();
      useAppStore.getState().setServerStatus(status);
    });

    return () => {
      unsubscribe();
      unsubscribeStopped();
      unsubscribeStatus();
      clearInterval(statusInterval);
      clearInterval(updateInterval);
    };
  }, []);

  useEffect(() => {
    void import('./components/EditorLayout');
    void import('./components/HistoryLayout');
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleMonacoReplaceShortcut(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <div style={styles.app}>
      <Header />
      <main style={styles.main}>
        <ErrorBoundary>
          <div
            style={{
              ...styles.tabPane,
              display: activeTab === 'traffic' ? 'flex' : 'none',
            }}
          >
            <TrafficLayout />
          </div>
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'environments' && <EnvironmentView />}
          {activeTab === 'editor' && (
            <Suspense fallback={<TabLoadingFallback />}>
              <EditorLayout />
            </Suspense>
          )}
          {activeTab === 'sessions' && (
            <Suspense fallback={<TabLoadingFallback />}>
              <HistoryLayout />
            </Suspense>
          )}
          {activeTab === 'feedback' && <FeedbackView />}
        </ErrorBoundary>
      </main>
      <Toast />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
    minWidth: 0,
  },
  tabPane: {
    flex: 1,
    display: 'flex',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
};
