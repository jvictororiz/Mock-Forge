import React, { useMemo, useState, memo } from 'react';
import { useAppStore } from '../stores/appStore';
import { MethodBadge } from './MethodBadge';
import { CopyButton } from './CopyButton';
import { CollapsibleSection } from './CollapsibleSection';
import { JsonViewer } from './JsonViewer';
import { maskSensitiveHeaders, tryFormatJson, formatDuration } from '../utils/format';
import { Tab, TabBar } from './TabBar';
import type { MockKind } from '../types';
import type { CapturedRequest } from '../types';
import { useI18n } from '../hooks/useI18n';
import { showToast } from '../utils/notify';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import { listLeafPaths, parseJsonBody } from '../../shared/jsonMergeUtils';
import { DraggablePanelHeader } from './DraggablePanelHeader';
import { hasTrafficInstability, isInstabilityRecord } from '../../shared/trafficInstability';
import {
  getTrafficMethodLabel,
  getTrafficPathLabel,
  getTrafficStatusLabel,
} from '../utils/trafficInstabilityDisplay';

type DetailTab = 'request' | 'response';

export const RequestDetail = memo(function RequestDetail({
  request: requestProp,
}: {
  request?: CapturedRequest | null;
}) {
  const { t } = useI18n();
  const selectedRequestId = useAppStore((state) => state.selectedRequestId);
  const requestFromStore = useAppStore(
    (state) => (
      selectedRequestId
        ? state.traffic.find((record) => record.id === selectedRequestId)
        : undefined
    ),
    (previous, next) => previous === next,
  );
  const request = requestProp ?? requestFromStore;
  const upsertRoute = useAppStore((state) => state.upsertRoute);
  const [creating, setCreating] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('request');

  const formattedContent = useMemo(() => {
    if (!request) return null;

    const maskedRequestHeaders = maskSensitiveHeaders(request.headers);
    const maskedResponseHeaders = maskSensitiveHeaders(request.responseHeaders || {});
    const requestBody = request.body ? tryFormatJson(request.body) : '';
    const responseBody = request.responseBody ? tryFormatJson(request.responseBody) : '';

    let responseBodyHighlightPaths: string[] | undefined;
    if (request.mockedResponse && responseBody) {
      const parsed = parseJsonBody(responseBody);
      if (parsed !== null) {
        const paths = listLeafPaths(parsed);
        responseBodyHighlightPaths = paths.length > 0 ? paths : undefined;
      }
    }

    const responseHeaderHighlightPaths = request.mockedResponse
      ? Object.keys(maskedResponseHeaders)
      : undefined;

    return {
      maskedRequestHeaders,
      maskedResponseHeaders,
      requestHeadersJson: JSON.stringify(maskedRequestHeaders, null, 2),
      responseHeadersJson: JSON.stringify(maskedResponseHeaders, null, 2),
      requestBody,
      responseBody,
      responseBodyHighlightPaths,
      responseHeaderHighlightPaths: responseHeaderHighlightPaths?.length
        ? responseHeaderHighlightPaths
        : undefined,
    };
  }, [request]);

  if (!request || !formattedContent) {
    return (
      <div style={styles.container}>
        <DraggablePanelHeader style={styles.emptyHeader}>
          <span style={styles.emptyHeaderTitle}>{t.request.panelTitle}</span>
        </DraggablePanelHeader>
        <div style={styles.empty}>
          <p>{t.request.select}</p>
        </div>
      </div>
    );
  }

  const {
    maskedResponseHeaders,
    requestHeadersJson,
    responseHeadersJson,
    requestBody,
    responseBody,
    responseBodyHighlightPaths,
    responseHeaderHighlightPaths,
  } = formattedContent;

  const handleExportInstabilityLogs = async () => {
    if (!request) return;
    setExportingLogs(true);
    try {
      const result = await window.mockforge.traffic.exportInstabilityLogs(request.id);
      if (result.cancelled) return;
      if (result.success) {
        showToast(t.traffic.exportInstabilityLogsSuccess, 'success');
      } else {
        showToast(result.error || t.traffic.exportInstabilityLogsFailed, 'error');
      }
    } catch {
      showToast(t.traffic.exportInstabilityLogsFailed, 'error');
    } finally {
      setExportingLogs(false);
    }
  };

  const handleCreateMock = async (kind: MockKind) => {
    const env = await ensureCurrentEnvironment();
    if (!env) {
      showToast(t.traffic.noEnvironmentForRecording, 'error');
      return;
    }

    setCreating(true);
    try {
      const route = await window.mockforge.route.createFromRequest(request, kind);
      if (route) upsertRoute(route, kind);
    } finally {
      setCreating(false);
    }
  };

  const showInstability = hasTrafficInstability(request);
  const isInstability = isInstabilityRecord(request);

  return (
    <div style={styles.container} data-traffic-detail="">
      <DraggablePanelHeader style={styles.topBar} layout="column" iconAlign="start">
        <div style={styles.urlRow}>
          <MethodBadge method={getTrafficMethodLabel(request)} size="md" />
          <span style={styles.path}>{getTrafficPathLabel(request, t)}</span>
          {!isInstability && (
            <CopyButton value={request.path} title={t.request.copyPath} />
          )}
        </div>
        <div style={styles.metaRow}>
          {request.forcedExecution && (
            <span style={styles.forcedBadge} title={t.request.forcedTitle}>
              {t.request.forced}
            </span>
          )}
          <span style={styles.metaItem}>
            {t.request.status}: {getTrafficStatusLabel(request, t)}
          </span>
          <span style={styles.metaItem}>
            {t.request.duration}: {formatDuration(request.durationMs)}
          </span>
        </div>
      </DraggablePanelHeader>

      {showInstability && (
        <div style={styles.instabilityBanner}>
          <div style={styles.instabilityHeader}>
            <strong>{t.traffic.instabilityIndicatorTitle}</strong>
            <button
              type="button"
              style={styles.exportLogsBtn}
              onClick={() => void handleExportInstabilityLogs()}
              disabled={exportingLogs}
            >
              {exportingLogs ? '…' : t.traffic.exportInstabilityLogs}
            </button>
          </div>
          <p style={styles.instabilityText}>{t.traffic.instabilityBanner}</p>
          {request.instabilityMessage && (
            <pre style={styles.instabilityDetail}>{request.instabilityMessage}</pre>
          )}
        </div>
      )}

      {!isInstability && (
        <TabBar>
          <Tab active={activeTab === 'request'} onClick={() => setActiveTab('request')}>
            {t.request.tabRequest}
          </Tab>
          <Tab active={activeTab === 'response'} onClick={() => setActiveTab('response')}>
            {t.request.tabResponse}
          </Tab>
        </TabBar>
      )}

      {!isInstability && (
        <div style={styles.actions}>
          {activeTab === 'request' ? (
            <button
              style={styles.primaryBtn}
              onClick={() => void handleCreateMock('request')}
              disabled={creating}
            >
              {t.request.mockRequest}
            </button>
          ) : (
            <button
              style={styles.primaryBtn}
              onClick={() => void handleCreateMock('response')}
              disabled={creating}
            >
              {t.request.mockResponse}
            </button>
          )}
        </div>
      )}

      {!isInstability && (
      <div style={styles.content}>
        {activeTab === 'request' ? (
          <>
            <CollapsibleSection
              title={t.request.requestHeaders}
              copyValue={requestHeadersJson}
              defaultOpen={false}
              resetKey={request.id}
            >
              <JsonViewer
                value={requestHeadersJson}
                highlightPaths={request.mockedRequestHeaderFields}
              />
            </CollapsibleSection>
            {request.body ? (
              <CollapsibleSection
                title={t.request.requestBody}
                copyValue={requestBody}
                defaultOpen
                resetKey={request.id}
              >
                <JsonViewer
                  value={requestBody}
                  highlightPaths={request.mockedRequestBodyPaths}
                />
              </CollapsibleSection>
            ) : (
              <div style={styles.mutedBox}>{t.request.noRequestBody}</div>
            )}
          </>
        ) : (
          <>
            {request.responseReason && (
              <div style={styles.reason}>{request.responseReason}</div>
            )}
            <CollapsibleSection
              title={t.request.responseHeaders(request.responseStatus)}
              copyValue={responseHeadersJson}
              defaultOpen={false}
              resetKey={request.id}
            >
              {Object.keys(maskedResponseHeaders).length > 0 ? (
                <JsonViewer
                  value={responseHeadersJson}
                  highlightPaths={responseHeaderHighlightPaths}
                />
              ) : (
                <div style={styles.mutedBox}>{t.request.noResponseHeaders}</div>
              )}
            </CollapsibleSection>
            {responseBody ? (
              <CollapsibleSection
                title={t.request.responseBody}
                copyValue={responseBody}
                defaultOpen
                resetKey={request.id}
              >
                {request.responseBodyTruncated ? (
                  <div style={styles.truncationNotice}>
                    {t.request.truncated}
                  </div>
                ) : null}
                <JsonViewer
                  value={responseBody}
                  highlightPaths={responseBodyHighlightPaths}
                />
              </CollapsibleSection>
            ) : (
              <div style={styles.mutedBox}>
                {!request.responseStatus
                  ? t.request.noResponseYet
                  : t.request.noResponseBody}
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  emptyHeader: {
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  emptyHeaderTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  topBar: {
    padding: '12px 14px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  urlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  path: {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    wordBreak: 'break-all',
    flex: 1,
  },
  metaRow: {
    display: 'flex',
    gap: '12px',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  metaItem: {
    fontFamily: 'var(--font-mono)',
  },
  forcedBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--warning)',
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'rgba(255, 193, 7, 0.12)',
    border: '1px solid rgba(255, 193, 7, 0.45)',
  },
  instabilityBanner: {
    margin: '0 14px 10px',
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
    background: 'rgba(255, 112, 67, 0.08)',
    border: '1px solid rgba(255, 112, 67, 0.35)',
    color: 'var(--text-primary)',
    fontSize: '12px',
  },
  instabilityHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  exportLogsBtn: {
    padding: '6px 10px',
    borderRadius: 'var(--radius)',
    background: '#ff7043',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  instabilityText: {
    margin: '6px 0 0',
    color: 'var(--text-secondary)',
  },
  instabilityDetail: {
    margin: '8px 0 0',
    padding: '8px',
    borderRadius: '4px',
    background: 'var(--bg-tertiary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  primaryBtn: {
    padding: '7px 14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontWeight: 600,
    fontSize: '12px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 14px',
  },
  reason: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '10px',
  },
  mutedBox: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    padding: '8px 2px',
  },
  truncationNotice: {
    fontSize: '12px',
    color: 'var(--warning, #fca130)',
    marginBottom: '8px',
    padding: '8px 10px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
};
