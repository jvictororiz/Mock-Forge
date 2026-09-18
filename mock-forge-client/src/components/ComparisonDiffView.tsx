import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useI18n } from '../hooks/useI18n';
import { useDiffNavigation } from '../hooks/useDiffNavigation';
import { JsonDiffViewer } from './JsonDiffViewer';
import { CollapsibleSection } from './CollapsibleSection';
import { Tab, TabBar } from './TabBar';
import { maskSensitiveHeaders, tryFormatJson } from '../utils/format';
import { collectDiffLocations } from '../utils/jsonLineDiff';

type DiffTab = 'request' | 'response';

function formatHeaders(headers: Record<string, string>): string {
  return JSON.stringify(maskSensitiveHeaders(headers), null, 2);
}

function formatBody(body?: string): string {
  return body ? tryFormatJson(body) : '';
}

export function ComparisonDiffView() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const { comparisonResult, selectedDiffPairKey, compareOptions } = useSessionStore(
    (state) => ({
      comparisonResult: state.comparisonResult,
      selectedDiffPairKey: state.selectedDiffPairKey,
      compareOptions: state.compareOptions,
    }),
    shallow,
  );
  const [activeTab, setActiveTab] = useState<DiffTab>('request');
  const smartOrdering = compareOptions.smartOrdering !== false;
  const [requestHeadersOpen, setRequestHeadersOpen] = useState(false);
  const [requestBodyOpen, setRequestBodyOpen] = useState(true);
  const [responseHeadersOpen, setResponseHeadersOpen] = useState(false);
  const [responseBodyOpen, setResponseBodyOpen] = useState(true);

  const selectedPair = useMemo(() => {
    if (!comparisonResult || !selectedDiffPairKey) return null;
    return comparisonResult.pairs.find((pair) => pair.key === selectedDiffPairKey) ?? null;
  }, [comparisonResult, selectedDiffPairKey]);

  useEffect(() => {
    setActiveTab('request');
    setRequestHeadersOpen(false);
    setRequestBodyOpen(true);
    setResponseHeadersOpen(false);
    setResponseBodyOpen(true);
  }, [selectedDiffPairKey]);

  const expandSection = useCallback((sectionId: string) => {
    switch (sectionId) {
      case 'request-headers':
        setRequestHeadersOpen(true);
        break;
      case 'request-body':
        setRequestBodyOpen(true);
        break;
      case 'response-headers':
        setResponseHeadersOpen(true);
        break;
      case 'response-body':
        setResponseBodyOpen(true);
        break;
      default:
        break;
    }
  }, []);

  const isRequest = activeTab === 'request';
  const recordA = selectedPair?.recordA;
  const recordB = selectedPair?.recordB;

  const requestHeadersA = recordA ? formatHeaders(recordA.headers) : '';
  const requestHeadersB = recordB ? formatHeaders(recordB.headers) : '';
  const requestBodyA = recordA ? formatBody(recordA.body) : '';
  const requestBodyB = recordB ? formatBody(recordB.body) : '';
  const responseHeadersA = recordA ? formatHeaders(recordA.responseHeaders || {}) : '';
  const responseHeadersB = recordB ? formatHeaders(recordB.responseHeaders || {}) : '';
  const responseBodyA = recordA ? formatBody(recordA.responseBody) : '';
  const responseBodyB = recordB ? formatBody(recordB.responseBody) : '';

  const hasRequestBody = Boolean(recordA?.body || recordB?.body);
  const hasResponseBody = Boolean(recordA?.responseBody || recordB?.responseBody);
  const hasResponseHeaders = Boolean(
    Object.keys(recordA?.responseHeaders || {}).length
      || Object.keys(recordB?.responseHeaders || {}).length,
  );

  const diffSections = useMemo(() => (
    isRequest
      ? [
          { sectionId: 'request-headers', left: requestHeadersA, right: requestHeadersB },
          ...(hasRequestBody
            ? [{ sectionId: 'request-body', left: requestBodyA, right: requestBodyB }]
            : []),
        ]
      : [
          ...(hasResponseHeaders
            ? [{ sectionId: 'response-headers', left: responseHeadersA, right: responseHeadersB }]
            : []),
          ...(hasResponseBody
            ? [{ sectionId: 'response-body', left: responseBodyA, right: responseBodyB }]
            : []),
        ]
  ), [
    hasRequestBody,
    hasResponseBody,
    hasResponseHeaders,
    isRequest,
    requestBodyA,
    requestBodyB,
    requestHeadersA,
    requestHeadersB,
    responseBodyA,
    responseBodyB,
    responseHeadersA,
    responseHeadersB,
  ]);

  const diffLocations = useMemo(
    () => collectDiffLocations(diffSections, smartOrdering),
    [diffSections, smartOrdering],
  );

  const navigationEnabled = Boolean(comparisonResult && selectedPair);

  const { activeLocation, scrollToken } = useDiffNavigation(
    containerRef,
    diffLocations,
    (location) => expandSection(location.sectionId),
    navigationEnabled,
  );

  useLayoutEffect(() => {
    if (!activeLocation || scrollToken === 0) return;

    expandSection(activeLocation.sectionId);

    window.requestAnimationFrame(() => {
      const section = containerRef.current?.querySelector(
        `[data-collapsible-section="${activeLocation.sectionId}"]`,
      );
      const marker = section?.querySelector(`[data-diff-row="${activeLocation.rowIndex}"]`);
      marker?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [
    activeLocation,
    scrollToken,
    expandSection,
    requestBodyOpen,
    requestHeadersOpen,
    responseBodyOpen,
    responseHeadersOpen,
  ]);

  if (!comparisonResult) {
    return (
      <div style={styles.emptyWrap}>
        <p style={styles.empty}>{t.comparison.selectDiff}</p>
      </div>
    );
  }

  if (!selectedPair || !recordA || !recordB) {
    return (
      <div style={styles.emptyWrap}>
        <p style={styles.empty}>{t.comparison.selectDiff}</p>
      </div>
    );
  }

  const leftLabel = comparisonResult.sessionA.name;
  const rightLabel = comparisonResult.sessionB.name;

  const highlightForSection = (sectionId: string) => (
    activeLocation?.sectionId === sectionId ? activeLocation.rowIndex : null
  );

  return (
    <div ref={containerRef} style={styles.container} data-comparison-diff-root="">
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>
            {recordA.method} {recordA.path}
          </h3>
          <p style={styles.subtitle}>
            {t.comparison.pairStatus[selectedPair.status]}
            {' · '}
            {t.comparison.diffCount(selectedPair.diffs.filter((diff) => !diff.ignored).length)}
            {!isRequest ? (
              <>
                {' · '}
                {recordA.responseStatus ?? '—'} / {recordB.responseStatus ?? '—'}
              </>
            ) : null}
            {diffLocations.length > 0 ? (
              <>
                {' · '}
                {t.comparison.nextDiffHint}
              </>
            ) : null}
          </p>
        </div>
      </div>

      <TabBar>
        <Tab active={isRequest} onClick={() => setActiveTab('request')}>
          {t.comparison.request}
        </Tab>
        <Tab active={!isRequest} onClick={() => setActiveTab('response')}>
          {t.comparison.response}
        </Tab>
      </TabBar>

      <div style={styles.section}>
        <div style={styles.columnLabels}>
          <span style={styles.columnLabel}>{leftLabel}</span>
          <span style={styles.columnLabel}>{rightLabel}</span>
        </div>

        {isRequest ? (
          <>
            <CollapsibleSection
              sectionId="request-headers"
              title={t.request.requestHeaders}
              copyValue={requestHeadersA}
              open={requestHeadersOpen}
              onOpenChange={setRequestHeadersOpen}
            >
              <JsonDiffViewer
                left={requestHeadersA}
                right={requestHeadersB}
                smartOrdering={smartOrdering}
                highlightRowIndex={highlightForSection('request-headers')}
              />
            </CollapsibleSection>
            {hasRequestBody ? (
              <CollapsibleSection
                sectionId="request-body"
                title={t.request.requestBody}
                copyValue={requestBodyA}
                open={requestBodyOpen}
                onOpenChange={setRequestBodyOpen}
              >
                <JsonDiffViewer
                  left={requestBodyA}
                  right={requestBodyB}
                  smartOrdering={smartOrdering}
                  highlightRowIndex={highlightForSection('request-body')}
                />
              </CollapsibleSection>
            ) : (
              <div style={styles.mutedBox}>{t.request.noRequestBody}</div>
            )}
          </>
        ) : (
          <>
            <CollapsibleSection
              sectionId="response-headers"
              title={t.request.responseHeaders(recordA.responseStatus)}
              copyValue={responseHeadersA}
              open={responseHeadersOpen}
              onOpenChange={setResponseHeadersOpen}
            >
              {hasResponseHeaders ? (
                <JsonDiffViewer
                  left={responseHeadersA}
                  right={responseHeadersB}
                  smartOrdering={smartOrdering}
                  highlightRowIndex={highlightForSection('response-headers')}
                />
              ) : (
                <div style={styles.mutedBox}>{t.request.noResponseHeaders}</div>
              )}
            </CollapsibleSection>
            {hasResponseBody ? (
              <CollapsibleSection
                sectionId="response-body"
                title={t.request.responseBody}
                copyValue={responseBodyA}
                open={responseBodyOpen}
                onOpenChange={setResponseBodyOpen}
              >
                <JsonDiffViewer
                  left={responseBodyA}
                  right={responseBodyB}
                  smartOrdering={smartOrdering}
                  highlightRowIndex={highlightForSection('response-body')}
                />
              </CollapsibleSection>
            ) : (
              <div style={styles.mutedBox}>{t.request.noResponseBody}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '14px 16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    wordBreak: 'break-all',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  columnLabels: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  columnLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    padding: '0 10px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mutedBox: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    padding: '8px 2px',
  },
  emptyWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  empty: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
};
