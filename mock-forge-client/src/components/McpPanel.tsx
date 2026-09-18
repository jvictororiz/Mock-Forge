import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { showToast } from '../utils/notify';
import type { McpClientId, McpClientInfo } from '../../shared/mcpTypes';

export function McpPanel() {
  const { t } = useI18n();
  const [clients, setClients] = useState<McpClientInfo[]>([]);
  const [manualConfig, setManualConfig] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<McpClientId | null>(null);
  const [mcpReady, setMcpReady] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const mcp = window.mockforge?.mcp;
      if (!mcp) {
        setClients([]);
        setManualConfig('');
        setMcpReady(false);
        return;
      }

      const [detected, manual, ready] = await Promise.all([
        mcp.listClients(),
        mcp.getManualConfig(),
        mcp.isReady(),
      ]);
      setClients(Array.isArray(detected) ? detected : []);
      setManualConfig(manual?.json ?? '');
      setMcpReady(!!ready);
    } catch (err) {
      console.error('Failed to load MCP settings', err);
      setClients([]);
      setManualConfig('');
      setMcpReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSetup = async (clientId: McpClientId) => {
    const mcp = window.mockforge?.mcp;
    if (!mcp) {
      showToast(t.mcp.setupFailed, 'error');
      return;
    }

    setBusyId(clientId);
    try {
      const result = await mcp.setup(clientId);
      if (!result.success) {
        showToast(result.error || t.mcp.setupFailed, 'error');
        return;
      }
      showToast(t.mcp.setupSuccess, 'success');
      await refresh();
    } catch (err) {
      showToast((err as Error).message || t.mcp.setupFailed, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (clientId: McpClientId) => {
    const mcp = window.mockforge?.mcp;
    if (!mcp) {
      showToast(t.mcp.removeFailed, 'error');
      return;
    }

    setBusyId(clientId);
    try {
      const result = await mcp.remove(clientId);
      if (!result.success) {
        showToast(result.error || t.mcp.removeFailed, 'error');
        return;
      }
      showToast(t.mcp.removeSuccess, 'success');
      await refresh();
    } catch (err) {
      showToast((err as Error).message || t.mcp.removeFailed, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(manualConfig);
      showToast(t.mcp.copied, 'success');
    } catch {
      showToast(t.mcp.copyFailed, 'error');
    }
  };

  if (loading) {
    return <div style={styles.empty}>{t.common.loading}</div>;
  }

  return (
    <div style={styles.wrap}>
      <p style={styles.subtitle}>{t.mcp.subtitle}</p>

      {!mcpReady && (
        <div style={styles.warningBox}>
          <span style={styles.warningText}>{t.mcp.serverMissing}</span>
        </div>
      )}

      {clients.length > 0 ? (
        <div style={styles.list}>
          {clients.map((client) => (
            <div key={client.id} style={styles.card}>
              <div style={styles.cardMain}>
                <span style={styles.label}>{client.name}</span>
                <span style={styles.meta}>
                  {client.configured ? t.mcp.statusConfigured : t.mcp.statusDetected}
                </span>
              </div>

              <div style={styles.actions}>
                {client.configured ? (
                  <>
                    <span style={styles.badge}>{t.mcp.connected}</span>
                    <button
                      type="button"
                      style={styles.secondaryBtn}
                      onClick={() => void handleRemove(client.id)}
                      disabled={busyId === client.id}
                    >
                      {busyId === client.id ? '…' : t.mcp.remove}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    style={styles.primaryBtn}
                    onClick={() => void handleSetup(client.id)}
                    disabled={busyId === client.id || !mcpReady}
                  >
                    {busyId === client.id ? '…' : t.mcp.integrate}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.emptyState}>{t.mcp.noClients}</div>
      )}

      <p style={styles.restartHint}>{t.mcp.restartHint}</p>

      <section style={styles.manualSection}>
        <h3 style={styles.manualTitle}>{t.mcp.manualTitle}</h3>
        <p style={styles.manualSubtitle}>{t.mcp.manualSubtitle}</p>
        <pre style={styles.codeBlock}>{manualConfig}</pre>
        <button type="button" style={styles.secondaryBtn} onClick={() => void handleCopyConfig()}>
          {t.mcp.copyConfig}
        </button>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    margin: 0,
  },
  warningBox: {
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(255, 193, 7, 0.35)',
    background: 'rgba(255, 193, 7, 0.08)',
  },
  warningText: {
    fontSize: '12px',
    color: 'var(--warning)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '560px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  cardMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  meta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--accent)',
    padding: '2px 8px',
    borderRadius: '3px',
    background: 'rgba(73, 204, 144, 0.12)',
    border: '1px solid rgba(73, 204, 144, 0.35)',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 500,
  },
  empty: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  emptyState: {
    padding: '16px',
    borderRadius: 'var(--radius)',
    border: '1px dashed var(--border)',
    color: 'var(--text-muted)',
    fontSize: '12px',
    maxWidth: '560px',
  },
  restartHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    margin: 0,
    lineHeight: 1.5,
  },
  manualSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '560px',
    marginTop: '8px',
    paddingTop: '16px',
    borderTop: '1px solid var(--border)',
  },
  manualTitle: {
    fontSize: '13px',
    fontWeight: 600,
    margin: 0,
    color: 'var(--text-primary)',
  },
  manualSubtitle: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    margin: 0,
    lineHeight: 1.5,
  },
  codeBlock: {
    margin: 0,
    padding: '12px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};
