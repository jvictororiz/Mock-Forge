import React, { memo, useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { getJsonEditorStatus } from '../../shared/jsonFormat';
import { useAppStore } from '../stores/appStore';
import { JsonEditor } from './JsonEditor';
import { MatchRulesEditor } from './MatchRulesEditor';
import { MergeJsonEditor } from './MergeJsonEditor';
import { MethodBadge } from './MethodBadge';
import { EditorSectionCard } from './EditorSectionCard';
import { VariantSelector } from './VariantSelector';
import { isRouteApplied } from '../utils/routeActions';
import { hasActiveRouteMocks } from '../../shared/routeUtils';
import { useI18n } from '../hooks/useI18n';
import { Tab, TabBar } from './TabBar';
import type { HttpMethod, MatchRule, MockResponse, RequestOverrideVariant, Route } from '../types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

function InactiveMockPanel({
  inactive,
  notice,
  children,
}: {
  inactive: boolean;
  notice: string;
  children: React.ReactNode;
}) {
  if (!inactive) return <>{children}</>;

  return (
    <div style={styles.inactivePanel}>
      <div style={styles.inactiveNotice}>{notice}</div>
      {children}
    </div>
  );
}

function createResponse(name: string): MockResponse {
  return {
    id: crypto.randomUUID(),
    name,
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    rules: [],
  };
}

function cloneResponse(source: MockResponse, name: string): MockResponse {
  return {
    ...source,
    id: crypto.randomUUID(),
    name,
    headers: { ...source.headers },
    rules: source.rules?.map((rule) => ({ ...rule })) ?? [],
  };
}

function createRequestOverride(name: string): RequestOverrideVariant {
  return {
    id: crypto.randomUUID(),
    name,
    headers: {},
    headersMode: 'merge',
    mergeHeaderFields: [],
    body: '',
    bodyMode: 'merge',
    mergeFields: [],
    rules: [],
  };
}

function cloneRequestOverride(source: RequestOverrideVariant, name: string): RequestOverrideVariant {
  return {
    ...source,
    id: crypto.randomUUID(),
    name,
    headers: source.headers ? { ...source.headers } : {},
    mergeHeaderFields: source.mergeHeaderFields ? [...source.mergeHeaderFields] : [],
    mergeFields: source.mergeFields ? [...source.mergeFields] : [],
    rules: source.rules?.map((rule) => ({ ...rule })) ?? [],
  };
}

type RouteDetailEditorProps = {
  route: Route;
  updateRoute: (route: Route) => void;
  editorTab: 'request' | 'response';
  setEditorTab: (tab: 'request' | 'response') => void;
};

const RouteDetailEditor = memo(function RouteDetailEditor({
  route,
  updateRoute,
  editorTab,
  setEditorTab,
}: RouteDetailEditorProps) {
  const { t } = useI18n();
  const responses = route.responses ?? [];
  const requestOverrides = route.requestOverrides ?? [];
  const activeResponse = responses.find((r) => r.id === route.defaultResponseId) || responses[0];
  const activeRequest = requestOverrides.find((r) => r.id === route.defaultRequestOverrideId)
    || requestOverrides[0];

  const update = useCallback((partial: Partial<Route>) => {
    updateRoute({ ...route, ...partial });
  }, [route, updateRoute]);

  const updateResponse = useCallback((partial: Partial<MockResponse>) => {
    if (!activeResponse) return;
    update({
      responses: responses.map((r) => (r.id === activeResponse.id ? { ...r, ...partial } : r)),
    });
  }, [activeResponse, responses, update]);

  const updateRequestOverride = useCallback((partial: Partial<RequestOverrideVariant>) => {
    if (!activeRequest) return;
    update({
      requestOverrides: requestOverrides.map((r) => (
        r.id === activeRequest.id ? { ...r, ...partial } : r
      )),
    });
  }, [activeRequest, requestOverrides, update]);

  const requestHeadersJson = useMemo(
    () => JSON.stringify(activeRequest?.headers || {}, null, 2),
    [activeRequest?.headers],
  );
  const requestHeadersJsonStatus = useMemo(
    () => getJsonEditorStatus(requestHeadersJson),
    [requestHeadersJson],
  );
  const requestBodyJsonStatus = useMemo(
    () => getJsonEditorStatus(activeRequest?.body || ''),
    [activeRequest?.body],
  );
  const responseHeadersJson = useMemo(
    () => JSON.stringify(activeResponse?.headers || {}, null, 2),
    [activeResponse?.headers],
  );
  const responseHeadersJsonStatus = useMemo(
    () => getJsonEditorStatus(responseHeadersJson),
    [responseHeadersJson],
  );
  const responseBodyJsonStatus = useMemo(
    () => getJsonEditorStatus(activeResponse?.body || ''),
    [activeResponse?.body],
  );

  const handleRequestHeadersJsonChange = useCallback((val: string) => {
    try {
      updateRequestOverride({ headers: JSON.parse(val || '{}') });
    } catch {
      // keep typing
    }
  }, [updateRequestOverride]);

  const handleRequestBodyChange = useCallback((val: string) => {
    updateRequestOverride({ body: val });
  }, [updateRequestOverride]);

  const handleRequestMergeHeaderFieldsChange = useCallback((mergeHeaderFields: string[]) => {
    updateRequestOverride({ mergeHeaderFields });
  }, [updateRequestOverride]);

  const handleRequestMergeFieldsChange = useCallback((mergeFields: string[]) => {
    updateRequestOverride({ mergeFields });
  }, [updateRequestOverride]);

  const handleRequestMergeHeadersChange = useCallback((val: string) => {
    try {
      updateRequestOverride({ headers: JSON.parse(val || '{}') });
    } catch {
      // keep typing
    }
  }, [updateRequestOverride]);

  const handleResponseHeadersJsonChange = useCallback((val: string) => {
    try {
      updateResponse({ headers: JSON.parse(val || '{}') });
    } catch {
      // keep typing
    }
  }, [updateResponse]);

  const handleResponseBodyChange = useCallback((val: string) => {
    updateResponse({ body: val || '' });
  }, [updateResponse]);

  const updateResponseRules = useCallback((rules: MatchRule[]) => {
    updateResponse({ rules });
  }, [updateResponse]);

  const updateRequestRules = useCallback((rules: MatchRule[]) => {
    updateRequestOverride({ rules });
  }, [updateRequestOverride]);

  const ensureResponse = () => {
    if (activeResponse) return activeResponse;
    const created = createResponse(t.routes.responseVariantDefault(1));
    update({
      responses: [created],
      defaultResponseId: created.id,
      mockResponseEnabled: true,
    });
    return created;
  };

  const ensureRequestOverride = () => {
    if (activeRequest) return activeRequest;
    const created = createRequestOverride(t.routes.requestVariantDefault(1));
    update({
      requestOverrides: [created],
      defaultRequestOverrideId: created.id,
      mockRequestEnabled: true,
    });
    return created;
  };

  const addResponse = () => {
    const name = t.routes.responseVariantDefault(responses.length + 1);
    const created = activeResponse
      ? cloneResponse(activeResponse, name)
      : createResponse(name);
    update({
      responses: [...responses, created],
      defaultResponseId: created.id,
      mockResponseEnabled: true,
    });
  };

  const removeResponse = (id: string) => {
    const next = responses.filter((r) => r.id !== id);
    update({
      responses: next,
      defaultResponseId: route.defaultResponseId === id
        ? next[0]?.id
        : route.defaultResponseId,
      mockResponseEnabled: next.length > 0 ? route.mockResponseEnabled : false,
    });
  };

  const addRequestOverride = () => {
    const name = t.routes.requestVariantDefault(requestOverrides.length + 1);
    const created = activeRequest
      ? cloneRequestOverride(activeRequest, name)
      : createRequestOverride(name);
    update({
      requestOverrides: [...requestOverrides, created],
      defaultRequestOverrideId: created.id,
      mockRequestEnabled: true,
    });
  };

  const removeRequestOverride = (id: string) => {
    const next = requestOverrides.filter((r) => r.id !== id);
    update({
      requestOverrides: next,
      defaultRequestOverrideId: route.defaultRequestOverrideId === id
        ? next[0]?.id
        : route.defaultRequestOverrideId,
      mockRequestEnabled: next.length > 0 ? route.mockRequestEnabled : false,
    });
  };

  const enabled = isRouteApplied(route);
  const requestMockActive = !!route.mockRequestEnabled;
  const responseMockActive = route.mockResponseEnabled !== false && responses.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={styles.titleRow}>
          <MethodBadge method={route.method} size="md" />
          <span style={styles.path}>{route.path}</span>
        </div>
        {!enabled && (
          <div style={styles.disabledBanner}>
            {hasActiveRouteMocks(route)
              ? t.routes.routeDisabledBanner
              : t.routes.noMocksEnabled}
          </div>
        )}
      </div>

      <TabBar>
        <Tab active={editorTab === 'request'} onClick={() => setEditorTab('request')}>
          <span style={styles.tabIcon}>⬆</span>
          {t.routes.tabRequest}
          {route.mockRequestEnabled && <span style={styles.tabBadge}>{t.routes.tabOn}</span>}
        </Tab>
        <Tab active={editorTab === 'response'} onClick={() => setEditorTab('response')}>
          <span style={styles.tabIcon}>⬇</span>
          {t.routes.tabResponse}
          {route.mockResponseEnabled !== false && responses.length ? (
            <span style={styles.tabBadge}>{t.routes.tabOn}</span>
          ) : null}
        </Tab>
      </TabBar>

      <div style={styles.scrollArea}>
        <div style={styles.section}>
          <label style={styles.label}>{t.routes.nameLabel}</label>
          <input
            value={route.name}
            onChange={(e) => update({ name: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>{t.routes.methodLabel}</label>
            <select
              value={route.method}
              onChange={(e) => update({ method: e.target.value as HttpMethod })}
              style={styles.input}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ ...styles.field, flex: 1 }}>
            <label style={styles.label}>{t.routes.pathLabel}</label>
            <input
              value={route.path}
              onChange={(e) => update({ path: e.target.value })}
              style={{ ...styles.input, fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.routes.priorityLabel}</label>
            <input
              type="number"
              value={route.priority ?? 0}
              onChange={(e) => update({ priority: parseInt(e.target.value, 10) || 0 })}
              style={{ ...styles.input, width: '70px' }}
            />
          </div>
        </div>

        {editorTab === 'request' ? (
          <>
            <label style={styles.toggleRow}>
              <input
                type="checkbox"
                style={styles.toggleCheckbox}
                checked={!!route.mockRequestEnabled}
                onChange={(e) => {
                  if (e.target.checked) {
                    ensureRequestOverride();
                    update({ mockRequestEnabled: true });
                  } else {
                    update({ mockRequestEnabled: false });
                  }
                }}
              />
              <span>{t.routes.enableRequestMock}</span>
            </label>

            {!activeRequest ? (
              <div style={styles.mutedBox}>{t.routes.noRequestOverride}</div>
            ) : (
              <InactiveMockPanel inactive={!requestMockActive} notice={t.routes.inactiveNotice}>
                <EditorSectionCard title={t.routes.requestVariant} kind="request" defaultOpen={false} resetKey={route.id}>
                  <VariantSelector
                    label={t.routes.requestVariant}
                    embedded
                    variants={requestOverrides}
                    selectedId={route.defaultRequestOverrideId}
                    onSelect={(id) => update({ defaultRequestOverrideId: id })}
                    onAdd={addRequestOverride}
                    onRemove={removeRequestOverride}
                    onRename={(id, name) => {
                      update({
                        requestOverrides: requestOverrides.map((r) => (
                          r.id === id ? { ...r, name } : r
                        )),
                      });
                    }}
                  />
                </EditorSectionCard>

                <EditorSectionCard
                  title={t.routes.matchRules}
                  kind="request"
                  description={t.routes.matchRulesDescription}
                  defaultOpen={false}
                  resetKey={route.id}
                >
                  <MatchRulesEditor
                    embedded
                    rules={activeRequest.rules ?? []}
                    onChange={updateRequestRules}
                  />
                </EditorSectionCard>

                <EditorSectionCard
                  title={t.routes.requestHeaders}
                  kind="request"
                  jsonStatus={requestHeadersJsonStatus}
                  defaultOpen={false}
                  resetKey={route.id}
                >
                  <label style={styles.subLabel}>{t.routes.headersModeLabel}</label>
                  <select
                    value={activeRequest.headersMode || 'merge'}
                    onChange={(e) => {
                      const headersMode = e.target.value as 'replace' | 'merge';
                      updateRequestOverride({
                        headersMode,
                        mergeHeaderFields: headersMode === 'merge'
                          ? (activeRequest.mergeHeaderFields ?? [])
                          : activeRequest.mergeHeaderFields,
                      });
                    }}
                    style={{ ...styles.input, marginBottom: '12px' }}
                  >
                    <option value="replace">{t.routes.replaceHeadersOption}</option>
                    <option value="merge">{t.routes.mergeHeadersOption}</option>
                  </select>

                  {activeRequest.headersMode === 'merge' ? (
                    <MergeJsonEditor
                      value={requestHeadersJson}
                      mergeFields={activeRequest.mergeHeaderFields ?? []}
                      hintText={t.routes.mergeHeadersHint}
                      onChange={handleRequestMergeHeadersChange}
                      onMergeFieldsChange={handleRequestMergeHeaderFieldsChange}
                    />
                  ) : (
                    <JsonEditor
                      value={requestHeadersJson}
                      onChange={handleRequestHeadersJsonChange}
                      minRows={8}
                    />
                  )}
                </EditorSectionCard>

                <EditorSectionCard
                  title={t.routes.requestBody}
                  kind="request"
                  jsonStatus={requestBodyJsonStatus}
                  resetKey={route.id}
                >
                  <label style={styles.subLabel}>{t.routes.bodyModeLabel}</label>
                  <select
                    value={activeRequest.bodyMode || 'merge'}
                    onChange={(e) => {
                      const bodyMode = e.target.value as 'replace' | 'merge';
                      updateRequestOverride({
                        bodyMode,
                        mergeFields: bodyMode === 'merge'
                          ? (activeRequest.mergeFields ?? [])
                          : activeRequest.mergeFields,
                      });
                    }}
                    style={{ ...styles.input, marginBottom: '12px' }}
                  >
                    <option value="replace">{t.routes.replaceBodyOption}</option>
                    <option value="merge">{t.routes.mergeBodyOption}</option>
                  </select>

                  {activeRequest.bodyMode === 'merge' ? (
                    <MergeJsonEditor
                      value={activeRequest.body || ''}
                      mergeFields={activeRequest.mergeFields ?? []}
                      hintText={t.routes.mergeBodyHint}
                      onChange={handleRequestBodyChange}
                      onMergeFieldsChange={handleRequestMergeFieldsChange}
                    />
                  ) : (
                    <JsonEditor
                      value={activeRequest.body || ''}
                      onChange={handleRequestBodyChange}
                      minRows={12}
                      placeholder={t.routes.requestBodyPlaceholder}
                    />
                  )}
                </EditorSectionCard>
              </InactiveMockPanel>
            )}
          </>
        ) : (
          <>
            <label style={styles.toggleRow}>
              <input
                type="checkbox"
                style={styles.toggleCheckbox}
                checked={route.mockResponseEnabled !== false && responses.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    ensureResponse();
                    update({ mockResponseEnabled: true });
                  } else {
                    update({ mockResponseEnabled: false });
                  }
                }}
              />
              <span>{t.routes.enableResponseMock}</span>
            </label>

            {!activeResponse ? (
              <div style={styles.mutedBox}>{t.routes.noResponseData}</div>
            ) : (
              <InactiveMockPanel inactive={!responseMockActive} notice={t.routes.inactiveNotice}>
                <EditorSectionCard title={t.routes.responseVariant} kind="response" defaultOpen={false} resetKey={route.id}>
                  <VariantSelector
                    label={t.routes.responseVariant}
                    embedded
                    variants={responses}
                    selectedId={route.defaultResponseId}
                    onSelect={(id) => update({ defaultResponseId: id })}
                    onAdd={addResponse}
                    onRemove={removeResponse}
                    onRename={(id, name) => {
                      update({
                        responses: responses.map((r) => (r.id === id ? { ...r, name } : r)),
                      });
                    }}
                  />
                </EditorSectionCard>

                <EditorSectionCard
                  title={t.routes.matchRules}
                  kind="response"
                  description={t.routes.matchRulesDescription}
                  defaultOpen={false}
                  resetKey={route.id}
                >
                  <MatchRulesEditor
                    embedded
                    rules={activeResponse.rules ?? []}
                    onChange={updateResponseRules}
                  />
                </EditorSectionCard>

                <EditorSectionCard title={t.routes.responseSettings} kind="response" defaultOpen={false} resetKey={route.id}>
                  <div style={styles.row}>
                    <div style={styles.field}>
                      <label style={styles.subLabel}>{t.routes.statusLabel}</label>
                      <input
                        type="number"
                        value={activeResponse.statusCode}
                        onChange={(e) => updateResponse({ statusCode: parseInt(e.target.value, 10) || 200 })}
                        style={{ ...styles.input, width: '80px' }}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.subLabel}>{t.routes.delayLabel}</label>
                      <input
                        type="number"
                        value={activeResponse.delayMs ?? ''}
                        onChange={(e) => updateResponse({
                          delayMs: parseInt(e.target.value, 10) || undefined,
                        })}
                        style={{ ...styles.input, width: '80px' }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </EditorSectionCard>

                <EditorSectionCard
                  title={t.routes.responseHeaders}
                  kind="response"
                  jsonStatus={responseHeadersJsonStatus}
                  defaultOpen={false}
                  resetKey={route.id}
                >
                  <JsonEditor
                    value={responseHeadersJson}
                    onChange={handleResponseHeadersJsonChange}
                    minRows={8}
                  />
                </EditorSectionCard>

                <EditorSectionCard
                  title={t.routes.responseBody}
                  kind="response"
                  jsonStatus={responseBodyJsonStatus}
                  resetKey={route.id}
                >
                  <JsonEditor
                    value={activeResponse.body}
                    onChange={handleResponseBodyChange}
                    minRows={14}
                    placeholder={t.routes.responseBodyPlaceholder}
                  />
                </EditorSectionCard>
              </InactiveMockPanel>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export const RouteDetail = memo(function RouteDetail() {
  const { t } = useI18n();
  const {
    currentEnvironment,
    selectedRouteId,
    updateRoute,
    editorTab,
    setEditorTab,
  } = useAppStore(
    (state) => ({
      currentEnvironment: state.currentEnvironment,
      selectedRouteId: state.selectedRouteId,
      updateRoute: state.updateRoute,
      editorTab: state.editorTab,
      setEditorTab: state.setEditorTab,
    }),
    shallow,
  );
  const route = currentEnvironment?.routes.find((r) => r.id === selectedRouteId);

  if (!route) {
    return (
      <div style={styles.empty}>
        <p>{t.routes.selectToEdit}</p>
      </div>
    );
  }

  return (
    <RouteDetailEditor
      route={route}
      updateRoute={updateRoute}
      editorTab={editorTab}
      setEditorTab={setEditorTab}
    />
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
  },
  topBar: {
    padding: '12px 14px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  path: {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    wordBreak: 'break-all',
  },
  disabledBanner: {
    marginTop: '8px',
    fontSize: '11px',
    color: 'var(--warning)',
  },
  inactivePanel: {
    background: 'rgba(249, 62, 62, 0.06)',
    border: '1px dashed rgba(249, 62, 62, 0.35)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    marginBottom: '12px',
  },
  inactiveNotice: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--danger)',
    marginBottom: '12px',
    lineHeight: 1.5,
  },
  mutedBox: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    padding: '8px 2px',
    marginBottom: '12px',
  },
  tabIcon: {
    fontSize: '11px',
    opacity: 0.8,
  },
  tabBadge: {
    fontSize: '9px',
    padding: '1px 5px',
    borderRadius: '8px',
    background: 'var(--accent)',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  scrollArea: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 14px',
  },
  section: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  subLabel: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
  },
  row: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
    marginBottom: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '12px',
    marginBottom: '12px',
  },
  toggleCheckbox: {
    width: '18px',
    height: '18px',
    flexShrink: 0,
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
};
