import { useCallback, useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { showToast } from '../utils/notify';
import { useI18n } from '../hooks/useI18n';
import type { Environment } from '../types';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';

function EnvironmentActionsMenu({
  disabled,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  canDelete,
}: {
  disabled: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div style={styles.menuRoot} ref={rootRef}>
      <button
        type="button"
        style={styles.iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        disabled={disabled}
        title={t.environments.actionsMenu}
        aria-label={t.environments.actionsMenu}
      >
        ⋯
      </button>

      {open && (
        <div style={styles.menu}>
          <button type="button" style={styles.menuItem} onClick={() => run(onRename)}>
            {t.environments.rename}
          </button>
          <button type="button" style={styles.menuItem} onClick={() => run(onDuplicate)}>
            {t.environments.duplicate}
          </button>
          <button type="button" style={styles.menuItem} onClick={() => run(onExport)}>
            {t.environments.export}
          </button>
          <div style={styles.menuDivider} />
          <button
            type="button"
            style={{ ...styles.menuItem, ...styles.menuItemDanger }}
            onClick={() => run(onDelete)}
            disabled={!canDelete}
          >
            {t.environments.delete}
          </button>
        </div>
      )}
    </div>
  );
}

export function EnvironmentPanel() {
  const { t } = useI18n();
  const {
    environments,
    currentEnvironment,
    setCurrentEnvironment,
    setSelectedRouteId,
    setTraffic,
    refreshEnvironments,
    serverStatus,
  } = useAppStore(
    (state) => ({
      environments: state.environments,
      currentEnvironment: state.currentEnvironment,
      setCurrentEnvironment: state.setCurrentEnvironment,
      setSelectedRouteId: state.setSelectedRouteId,
      setTraffic: state.setTraffic,
      refreshEnvironments: state.refreshEnvironments,
      serverStatus: state.serverStatus,
    }),
    shallow,
  );

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    return refreshEnvironments();
  }, [refreshEnvironments]);

  useEffect(() => {
    void ensureCurrentEnvironment().then(() => refresh());
  }, [refresh]);

  const activateEnvironment = async (env: Environment, options?: { silent?: boolean }) => {
    if (env.id === currentEnvironment?.id) return;

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
      if (!options?.silent) {
        showToast(t.environments.switched(selected.name), 'success');
      }
      await refresh();
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim() || t.environments.defaultName(environments.length + 1);
    setLoading(true);
    try {
      const created = await window.mockforge.environment.create(name);
      setNewName('');
      setCreating(false);
      await refresh();
      await activateEnvironment(created, { silent: true });
      showToast(t.environments.created(created.name), 'success');
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (env: Environment) => {
    setBusyId(env.id);
    try {
      const copy = await window.mockforge.environment.duplicate(env.id);
      if (!copy) {
        showToast(t.environments.actionFailed(t.environments.duplicateFailed), 'error');
        return;
      }
      await refresh();
      showToast(t.environments.duplicated(copy.name), 'success');
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async (env: Environment) => {
    const name = renameValue.trim();
    if (!name || name === env.name) {
      setRenamingId(null);
      return;
    }

    setBusyId(env.id);
    try {
      const renamed = await window.mockforge.environment.rename(env.id, name);
      if (!renamed) {
        showToast(t.environments.actionFailed(t.environments.renameFailed), 'error');
        return;
      }
      setRenamingId(null);
      await refresh();
      showToast(t.environments.renamed(renamed.name), 'success');
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (env: Environment) => {
    if (environments.length <= 1) {
      showToast(t.environments.cannotDeleteLast, 'error');
      return;
    }
    if (!confirm(t.environments.deleteConfirm(env.name))) return;

    setBusyId(env.id);
    try {
      const next = await window.mockforge.environment.delete(env.id);
      setCurrentEnvironment(next);
      setSelectedRouteId(null);
      setTraffic([]);
      await refresh();
      showToast(t.environments.deleted(env.name), 'success');
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = async (env: Environment) => {
    setBusyId(env.id);
    try {
      const ok = await window.mockforge.environment.export(env.id);
      if (ok) {
        showToast(t.environments.exported, 'success');
      }
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const imported = await window.mockforge.environment.import();
      if (!imported) {
        showToast(t.environments.importFailed, 'error');
        return;
      }
      await refresh();
      await activateEnvironment(imported, { silent: true });
      showToast(t.environments.imported(imported.name), 'success');
    } catch (err) {
      showToast(t.environments.actionFailed((err as Error).message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const startRename = (env: Environment) => {
    setRenamingId(env.id);
    setRenameValue(env.name);
  };

  const isBusy = busyId !== null || loading;
  const activeEnv = currentEnvironment;

  return (
    <div style={styles.wrap}>
      {renamingId && activeEnv && renamingId === activeEnv.id ? (
        <div style={styles.inlineRow}>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            style={styles.input}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename(activeEnv);
              if (e.key === 'Escape') setRenamingId(null);
            }}
          />
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={() => void handleRename(activeEnv)}
            disabled={isBusy}
          >
            {t.common.confirm}
          </button>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={() => setRenamingId(null)}
          >
            {t.common.cancel}
          </button>
        </div>
      ) : (
        <div style={styles.toolbar}>
          <label style={styles.field}>
            <span style={styles.label}>{t.environments.title}</span>
            {environments.length === 0 ? (
              <span style={styles.emptyInline}>{t.environments.empty}</span>
            ) : (
              <select
                value={activeEnv?.id ?? ''}
                onChange={(e) => {
                  const env = environments.find((item) => item.id === e.target.value);
                  if (env) void activateEnvironment(env);
                }}
                style={styles.select}
                disabled={isBusy || !activeEnv}
                title={t.environments.switcherTitle}
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          {activeEnv && (
            <EnvironmentActionsMenu
              disabled={isBusy}
              onRename={() => startRename(activeEnv)}
              onDuplicate={() => void handleDuplicate(activeEnv)}
              onExport={() => void handleExport(activeEnv)}
              onDelete={() => void handleDelete(activeEnv)}
              canDelete={environments.length > 1}
            />
          )}

          <div style={styles.toolbarActions}>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => setCreating((value) => !value)}
              disabled={loading}
            >
              + {t.environments.create}
            </button>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => void handleImport()}
              disabled={loading}
            >
              ↓ {t.environments.import}
            </button>
          </div>
        </div>
      )}

      {serverStatus.running && (
        <p style={styles.hint}>{t.environments.syncHint}</p>
      )}

      {creating && (
        <div style={styles.inlineRow}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.environments.createPlaceholder}
            style={styles.input}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={() => void handleCreate()}
            disabled={loading}
          >
            {t.environments.createConfirm}
          </button>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={() => setCreating(false)}
          >
            {t.common.cancel}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    flexWrap: 'wrap',
    maxWidth: '33.333%',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  select: {
    width: '100%',
    padding: '7px 10px',
    fontSize: '13px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
  },
  input: {
    flex: '1 1 0',
    minWidth: 0,
    padding: '7px 10px',
    fontSize: '13px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
  },
  emptyInline: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    padding: '7px 0',
  },
  toolbarActions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  inlineRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: '33.333%',
  },
  hint: {
    fontSize: '11px',
    color: 'var(--warning)',
    margin: 0,
    lineHeight: 1.4,
  },
  primaryBtn: {
    padding: '7px 12px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    flexShrink: 0,
  },
  secondaryBtn: {
    padding: '7px 12px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  menuRoot: {
    position: 'relative',
    flexShrink: 0,
  },
  iconBtn: {
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    fontSize: '16px',
    lineHeight: 1,
    letterSpacing: '0.05em',
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    minWidth: '160px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    zIndex: 30,
    overflow: 'hidden',
    padding: '4px',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '7px 10px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    borderRadius: '6px',
    background: 'transparent',
  },
  menuItemDanger: {
    color: 'var(--danger)',
  },
  menuDivider: {
    height: '1px',
    background: 'var(--border)',
    margin: '4px 0',
  },
};
