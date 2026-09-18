import { useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { showToast } from '../utils/notify';
import { useI18n } from '../hooks/useI18n';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import type { Environment } from '../types';

function EnvironmentOption({
  env,
  active,
  onClick,
}: {
  env: Environment;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.option,
        ...(active ? styles.optionActive : {}),
      }}
    >
      <span style={styles.optionLabel}>{env.name}</span>
      <span style={styles.optionMeta}>
        {t.environments.port(env.port)} · {t.environments.routes(env.routes.length)}
      </span>
    </button>
  );
}

export function EnvironmentSelector({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const {
    environments,
    currentEnvironment,
    setCurrentEnvironment,
    setSelectedRouteId,
    setTraffic,
    refreshEnvironments,
    openEnvironmentsSettings,
  } = useAppStore(
    (state) => ({
      environments: state.environments,
      currentEnvironment: state.currentEnvironment,
      setCurrentEnvironment: state.setCurrentEnvironment,
      setSelectedRouteId: state.setSelectedRouteId,
      setTraffic: state.setTraffic,
      refreshEnvironments: state.refreshEnvironments,
      openEnvironmentsSettings: state.openEnvironmentsSettings,
    }),
    shallow,
  );

  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ensureCurrentEnvironment();
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const switchEnvironment = async (env: Environment) => {
    if (env.id === currentEnvironment?.id) {
      setOpen(false);
      return;
    }

    setBusyId(env.id);
    try {
      const selected = await window.mockforge.environment.setCurrent(env.id);
      if (!selected) {
        showToast(t.environments.actionFailed(t.environments.notFound), 'error');
        return;
      }
      setCurrentEnvironment(selected);
      setSelectedRouteId(null);
      setTraffic([]);
      await refreshEnvironments();
      showToast(t.environments.switched(selected.name), 'success');
      setOpen(false);
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const badgeLabel = currentEnvironment?.name ?? t.environments.noEnvironment;

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
          ...(currentEnvironment ? styles.badgeActive : styles.badgeIdle),
          ...(compact ? styles.badgeCompact : {}),
        }}
        title={t.environments.switcherTitle}
        disabled={busyId !== null}
      >
        <span style={styles.label}>{badgeLabel}</span>
        <span style={styles.chevron}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={styles.menu}>
          {environments.length === 0 ? (
            <p style={styles.emptyHint}>{t.environments.empty}</p>
          ) : (
            environments.map((env) => (
              <EnvironmentOption
                key={env.id}
                env={env}
                active={env.id === currentEnvironment?.id}
                onClick={() => void switchEnvironment(env)}
              />
            ))
          )}
          <div style={styles.divider} />
          <button
            type="button"
            style={styles.manageBtn}
            onClick={() => {
              setOpen(false);
              openEnvironmentsSettings();
            }}
          >
            {t.environments.manageEnvironments}
          </button>
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
    maxWidth: '200px',
    cursor: 'pointer',
    background: 'var(--bg-tertiary)',
  },
  badgeCompact: {
    maxWidth: '180px',
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
    minWidth: '240px',
    maxWidth: '300px',
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
};
