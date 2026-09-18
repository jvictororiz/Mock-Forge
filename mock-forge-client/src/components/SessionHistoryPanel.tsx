import { useCallback, useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useI18n } from '../hooks/useI18n';
import { useFloatingMenu } from '../hooks/useFloatingMenu';
import { SessionHistoryMenu } from './SessionHistoryMenu';
import type { TrafficSessionMeta } from '../../shared/sessionTypes';
import type { ConsumerPlatform } from '../types';

function formatSessionDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function PlatformBadges({ platforms }: { platforms?: ConsumerPlatform[] }) {
  if (!platforms || platforms.length === 0) return null;
  return (
    <span style={styles.badges}>
      {platforms.map((platform) => (
        <span key={platform} style={styles.platformBadge}>
          {platform}
        </span>
      ))}
    </span>
  );
}

export function SessionHistoryPanel() {
  const { t } = useI18n();
  const {
    sessions,
    viewingSessionId,
    sessionsLoading,
    historyMode,
    loadSessions,
    openSession,
    enterCompareMode,
    deleteSession,
    exportSession,
    importSession,
    mockSession,
  } = useSessionStore(
    (state) => ({
      sessions: state.sessions,
      viewingSessionId: state.viewingSessionId,
      sessionsLoading: state.sessionsLoading,
      historyMode: state.historyMode,
      loadSessions: state.loadSessions,
      openSession: state.openSession,
      enterCompareMode: state.enterCompareMode,
      deleteSession: state.deleteSession,
      exportSession: state.exportSession,
      importSession: state.importSession,
      mockSession: state.mockSession,
    }),
    shallow,
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const {
    menu,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  } = useFloatingMenu<string>();

  const refresh = useCallback(async () => {
    await loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSessionClick = (session: TrafficSessionMeta) => {
    void openSession(session.id);
  };

  const handleDelete = async (session: TrafficSessionMeta) => {
    setBusyId(session.id);
    try {
      await deleteSession(session.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = async (session: TrafficSessionMeta) => {
    setBusyId(session.id);
    try {
      await exportSession(session.id);
    } finally {
      setBusyId(null);
    }
  };

  const menuSession = menu
    ? sessions.find((session) => session.id === menu.id)
    : undefined;

  return (
    <aside style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{t.sessions.title}</h2>
          <p style={styles.subtitle}>{t.sessions.subtitle}</p>
        </div>
      </div>

      <div style={styles.toolbar}>
        <button
          type="button"
          style={{
            ...styles.secondaryBtn,
            ...(historyMode === 'compare' ? styles.activeBtn : {}),
          }}
          onClick={() => enterCompareMode()}
        >
          {t.sessions.compare}
        </button>
        <button
          type="button"
          style={styles.secondaryBtn}
          onClick={() => void importSession()}
          disabled={sessionsLoading}
        >
          ↓ {t.sessions.import}
        </button>
      </div>

      <div style={styles.list}>
        {sessionsLoading && sessions.length === 0 ? (
          <div style={styles.empty}>{t.sessions.loading}</div>
        ) : sessions.length === 0 ? (
          <div style={styles.empty}>{t.sessions.empty}</div>
        ) : (
          sessions.map((session) => {
            const isViewing = viewingSessionId === session.id;
            const isBusy = busyId === session.id;

            return (
              <div
                key={session.id}
                style={{
                  ...styles.card,
                  ...(isViewing ? styles.cardActive : {}),
                }}
                onContextMenu={(event) => {
                  openFromContextMenu(event, session.id);
                }}
              >
                <button
                  type="button"
                  style={styles.cardButton}
                  onClick={() => handleSessionClick(session)}
                >
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardTitle}>{session.name}</span>
                    <span style={styles.completedBadge}>{t.sessions.completed}</span>
                  </div>
                  <span style={styles.cardMeta}>
                    {formatSessionDate(session.endedAt || session.completedAt || session.createdAt)}
                    {' · '}
                    {t.sessions.requests(session.requestCount)}
                  </span>
                  <PlatformBadges platforms={session.platforms} />
                </button>

                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.menuBtn}
                    onClick={(event) => openFromButton(event, session.id)}
                    disabled={isBusy}
                    aria-label={t.sessions.actions}
                  >
                    ⋮
                  </button>
                  <button
                    type="button"
                    style={styles.actionBtn}
                    onClick={() => handleSessionClick(session)}
                    disabled={isBusy}
                  >
                    {t.sessions.viewSession}
                  </button>
                  <button
                    type="button"
                    style={styles.actionBtn}
                    onClick={() => void handleExport(session)}
                    disabled={isBusy}
                  >
                    {t.sessions.export}
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.actionBtn, ...styles.dangerBtn }}
                    onClick={() => void handleDelete(session)}
                    disabled={isBusy}
                  >
                    {t.sessions.delete}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <SessionHistoryMenu
        menu={menu}
        menuRef={menuRef}
        busy={!!menuSession && busyId === menuSession.id}
        labels={{
          view: t.sessions.viewSession,
          export: t.sessions.export,
          mockRecording: t.sessions.mockRecording,
          mockingRecording: t.sessions.mockingRecording,
          delete: t.sessions.delete,
        }}
        onView={() => {
          if (!menuSession) return;
          void handleSessionClick(menuSession);
          closeMenu();
        }}
        onExport={() => {
          if (!menuSession) return;
          closeMenu();
          void handleExport(menuSession);
        }}
        onMockRecording={() => {
          if (!menuSession) return;
          closeMenu();
          setBusyId(menuSession.id);
          void mockSession(menuSession.id).finally(() => setBusyId(null));
        }}
        onDelete={() => {
          if (!menuSession) return;
          closeMenu();
          void handleDelete(menuSession);
        }}
      />
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: '300px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 14px 10px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.45,
  },
  toolbar: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  },
  secondaryBtn: {
    padding: '6px 10px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    fontWeight: 600,
    border: '1px solid var(--border)',
  },
  activeBtn: {
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  empty: {
    padding: '24px 12px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  cardActive: {
    borderColor: 'var(--accent)',
    background: 'rgba(73, 204, 144, 0.06)',
  },
  cardButton: {
    textAlign: 'left',
    width: '100%',
    padding: 0,
    background: 'transparent',
    border: 'none',
    color: 'inherit',
  },
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  completedBadge: {
    fontSize: '9px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    padding: '2px 5px',
    borderRadius: '3px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
  },
  cardMeta: {
    display: 'block',
    marginTop: '4px',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  badges: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  platformBadge: {
    fontSize: '9px',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    padding: '2px 5px',
    borderRadius: '3px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  menuBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    lineHeight: 1,
    fontWeight: 700,
    flexShrink: 0,
  },
  actionBtn: {
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 600,
    borderRadius: 'var(--radius)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
  },
  dangerBtn: {
    color: 'var(--danger)',
  },
};
