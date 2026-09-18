import { CopyButton } from './CopyButton';
import { useI18n } from '../hooks/useI18n';
import { useUpdateStore } from '../stores/updateStore';
import { showToast } from '../utils/notify';

export function UpdateControls({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { checking, applying, progress, result, check, apply } = useUpdateStore();

  const handleCheck = () => {
    void check().then((next) => {
      if (next?.error) {
        showToast(t.settings.updateFailed(next.error), 'error');
      }
    });
  };

  const handleApply = () => {
    void apply().then((outcome) => {
      if (!outcome.success && outcome.error) {
        showToast(t.settings.updateFailed(outcome.error), 'error');
        return;
      }
      if (outcome.openedReleasePage) return;
      if (result?.method === 'mac-dmg') {
        showToast(t.settings.updateOpenedDmg, 'success');
      }
    });
  };

  if (compact) {
    if (!result?.available) return null;
    return (
      <button
        type="button"
        onClick={handleApply}
        disabled={applying}
        style={styles.headerBtn}
        title={t.settings.updateAvailable(result.latestVersion || '')}
      >
        {applying ? t.settings.updating : t.settings.headerUpdate}
      </button>
    );
  }

  const methodHint = result?.method === 'windows-setup'
    ? t.settings.updateMethodWindows
    : result?.method === 'mac-brew'
      ? t.settings.updateMethodBrew
      : result?.method === 'mac-dmg'
        ? t.settings.updateMethodDmg
        : result?.available
          ? t.settings.updateNoPackage
          : null;

  const statusLabel = checking
    ? t.settings.checkingUpdates
    : applying && progress != null
      ? t.settings.downloadingUpdate(progress)
      : applying
        ? t.settings.downloadingUpdateUnknown
        : result?.error
          ? t.settings.updateFailed(result.error)
          : result?.available && result.latestVersion
            ? t.settings.updateAvailable(result.latestVersion)
            : result
              ? t.settings.upToDate
              : null;

  return (
    <div style={styles.wrap}>
      {statusLabel ? <p style={styles.status}>{statusLabel}</p> : null}
      {methodHint && result?.available ? <p style={styles.hint}>{methodHint}</p> : null}
      {result && !result.packaged && result.available ? (
        <p style={styles.hint}>{t.settings.updateDevHint}</p>
      ) : null}

      <div style={styles.actions}>
        <button
          type="button"
          style={styles.secondaryBtn}
          onClick={handleCheck}
          disabled={checking || applying}
        >
          {checking ? t.settings.checkingUpdates : t.settings.checkUpdates}
        </button>
        {result?.available ? (
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? t.settings.updating : t.settings.updateNow}
          </button>
        ) : null}
        {result?.releaseUrl ? (
          <button
            type="button"
            style={styles.linkBtn}
            onClick={() => {
              if (result.releaseUrl) {
                void window.mockforge.updates.openUrl(result.releaseUrl);
              }
            }}
          >
            {t.settings.openRelease}
          </button>
        ) : null}
      </div>

      {window.mockforge.platform === 'darwin' && result?.brewInstallCommand ? (
        <div style={styles.brewBox}>
          <span style={styles.brewLabel}>{t.settings.brewInstallHint}</span>
          <div style={styles.brewRow}>
            <code style={styles.brewCode}>{result.brewInstallCommand}</code>
            <CopyButton value={result.brewInstallCommand} title={t.common.copy} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '12px',
  },
  status: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  hint: {
    margin: 0,
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
  },
  primaryBtn: {
    padding: '8px 16px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '8px 16px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
  },
  linkBtn: {
    padding: '8px 10px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
  },
  headerBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--accent)',
  },
  brewBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '4px',
  },
  brewLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  brewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  brewCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
  },
};
