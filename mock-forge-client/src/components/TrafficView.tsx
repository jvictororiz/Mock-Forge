import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { createMockFromTraffic, createMocksFromTraffic } from '../utils/trafficActions';
import { copyCapturedRequestCurl, copyCapturedRequestsCurl } from '../utils/curlActions';
import { filterTrafficRequests } from '../utils/trafficSearch';
import { listTrafficConsumers } from '../../shared/consumerUtils';
import { TrafficRequestMenu } from './TrafficRequestMenu';
import { VirtualTrafficTable } from './VirtualTrafficTable';
import { useTrafficRequestMenu } from '../hooks/useTrafficRequestMenu';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { showToast } from '../utils/notify';
import type { CapturedRequest } from '../types';
import { useI18n } from '../hooks/useI18n';
import type { TrafficSessionMeta } from '../../shared/sessionTypes';
import { useSessionStore } from '../stores/sessionStore';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import { handleTrafficFindShortcut } from '../utils/trafficFindShortcut';
import { openTrafficMockInEditor } from '../utils/routeActions';
import type { MockKind } from '../types';
import { DraggablePanelHeader } from './DraggablePanelHeader';

const TRAFFIC_SEARCH_DEBOUNCE_MS = 150;

interface TrafficViewProps {
  mirrorOpen?: boolean;
  onToggleMirror?: () => void;
}

export function TrafficView({ mirrorOpen = false, onToggleMirror }: TrafficViewProps) {
  const { t } = useI18n();
  const {
    traffic,
    selectedRequestId,
    setSelectedRequestId,
    serverStatus,
    clearTraffic,
    selectedConsumerId,
    trafficConsumers,
  } = useAppStore(
    (state) => ({
      traffic: state.traffic,
      selectedRequestId: state.selectedRequestId,
      setSelectedRequestId: state.setSelectedRequestId,
      serverStatus: state.serverStatus,
      clearTraffic: state.clearTraffic,
      selectedConsumerId: state.selectedConsumerId,
      trafficConsumers: state.trafficConsumers,
    }),
    shallow,
  );
  const [mockingId, setMockingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [clearing, setClearing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, TRAFFIC_SEARCH_DEBOUNCE_MS);
  const [activeSession, setActiveSession] = useState<TrafficSessionMeta | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const startRecording = useSessionStore((state) => state.startRecording);
  const stopRecording = useSessionStore((state) => state.stopRecording);
  const {
    menu,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  } = useTrafficRequestMenu();
  const searchRef = useRef<HTMLInputElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const refreshActiveSession = async () => {
      try {
        const active = await window.mockforge.sessions.getActive();
        if (!cancelled) setActiveSession(active);
      } catch {
        if (!cancelled) setActiveSession(null);
      }
    };

    void refreshActiveSession();
    const interval = setInterval(() => {
      void refreshActiveSession();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filteredTraffic = useMemo(
    () => filterTrafficRequests(traffic, debouncedSearchQuery, selectedConsumerId),
    [traffic, debouncedSearchQuery, selectedConsumerId],
  );
  const isFiltering = searchQuery.trim().length > 0 || !!selectedConsumerId;
  const selectedRecords = useMemo(
    () => traffic.filter((record) => selectedIds.has(record.id)),
    [selectedIds, traffic],
  );
  const selectedCount = selectedRecords.length;
  const visibleIds = useMemo(
    () => filteredTraffic.map((record) => record.id),
    [filteredTraffic],
  );
  const allVisibleSelected = visibleIds.length > 0
    && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(traffic.map((record) => record.id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [traffic]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allVisibleSelected, visibleIds]);

  const ensureEnvironment = useCallback(async () => {
    const env = await ensureCurrentEnvironment();
    if (env) return true;
    showToast(t.traffic.noEnvironmentForRecording, 'error');
    return false;
  }, [t.traffic.noEnvironmentForRecording]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleTrafficFindShortcut(e, () => {
        searchRef.current?.focus({ preventScroll: true });
        searchRef.current?.select();
      });
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearchQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const handleMock = async (req: CapturedRequest, kind: 'request' | 'response') => {
    closeMenu();
    if (!(await ensureEnvironment())) return;

    setMockingId(req.id);
    try {
      await createMockFromTraffic(req, kind);
    } finally {
      setMockingId(null);
    }
  };

  const handleBulkMock = async (kind: 'request' | 'response') => {
    if (selectedRecords.length === 0 || bulkBusy) return;
    if (!(await ensureEnvironment())) return;

    setBulkBusy(true);
    try {
      await createMocksFromTraffic(selectedRecords, kind);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkCopyCurl = async () => {
    if (selectedRecords.length === 0 || bulkBusy) return;
    await copyCapturedRequestsCurl(selectedRecords);
  };

  const handleSelectRow = useCallback((id: string) => {
    setSelectedRequestId(id);
  }, [setSelectedRequestId]);

  const handleRowContextMenu = useCallback((
    id: string,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => {
    setSelectedRequestId(id);
    openFromContextMenu(event, id);
  }, [openFromContextMenu, setSelectedRequestId]);

  const handleOpenRowMenu = useCallback((
    id: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    openFromButton(event, id);
  }, [openFromButton]);

  const handleOpenMock = useCallback((record: CapturedRequest, kind: MockKind) => {
    openTrafficMockInEditor(record.method, record.path, kind);
  }, []);

  const menuRequest = menu
    ? filteredTraffic.find((record) => record.id === menu.requestId)
      ?? traffic.find((record) => record.id === menu.requestId)
    : undefined;

  const clearScopeCount = useMemo(() => (
    selectedConsumerId
      ? traffic.filter((record) => record.consumerId === selectedConsumerId).length
      : traffic.length
  ), [traffic, selectedConsumerId]);

  const handleStartRecording = async () => {
    setRecordingBusy(true);
    try {
      await startRecording();
      const active = await window.mockforge.sessions.getActive();
      setActiveSession(active);
    } finally {
      setRecordingBusy(false);
    }
  };

  const handleStopRecording = async () => {
    setRecordingBusy(true);
    try {
      await stopRecording();
      setActiveSession(null);
    } finally {
      setRecordingBusy(false);
    }
  };

  const isRecording = activeSession?.status === 'recording';

  const trafficTableEmptyRow = traffic.length === 0 ? (
    <tr>
      <td colSpan={9} style={styles.empty}>
        {t.traffic.empty(serverStatus.port)}
      </td>
    </tr>
  ) : filteredTraffic.length === 0 ? (
    <tr>
      <td colSpan={9} style={styles.empty}>
        {t.traffic.noResults(searchQuery.trim())}
      </td>
    </tr>
  ) : null;

  const handleClear = async () => {
    if (clearScopeCount === 0) return;

    const selectedConsumer = selectedConsumerId
      ? listTrafficConsumers(trafficConsumers).find((consumer) => consumer.id === selectedConsumerId)
      : null;
    const confirmMessage = selectedConsumer
      ? t.traffic.clearConsumerConfirm(selectedConsumer.label)
      : t.traffic.clearAllConfirm;

    if (!confirm(confirmMessage)) return;

    setClearing(true);
    try {
      if (!selectedConsumerId && serverStatus.running) {
        await window.mockforge.traffic.clear();
      }
      clearTraffic(selectedConsumerId);
      setSelectedIds(new Set());
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={styles.container}>
      <DraggablePanelHeader style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {serverStatus.adbAvailable && onToggleMirror && !mirrorOpen ? (
            <button
              type="button"
              style={styles.mirrorBtn}
              onClick={onToggleMirror}
              title={t.mirror.show}
            >
              {t.mirror.showShort}
            </button>
          ) : null}
          <span style={styles.toolbarTitle}>{t.traffic.title}</span>
          {isRecording ? (
            <span style={styles.recordingIndicator} title={activeSession?.name}>
              <span style={styles.recordingDot} aria-hidden />
              {t.traffic.recordingActive}
            </span>
          ) : null}
        </div>
        <div style={styles.toolbarActions}>
          <div style={styles.searchWrap}>
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.traffic.searchPlaceholder}
              spellCheck={false}
              style={styles.searchInput}
            />
            {isFiltering && (
              <span style={styles.searchCount}>
                {filteredTraffic.length}/{traffic.length}
              </span>
            )}
            {searchQuery && (
              <button
                type="button"
                style={styles.searchClear}
                onClick={() => {
                  setSearchQuery('');
                  searchRef.current?.focus();
                }}
                aria-label={t.traffic.clearSearch}
              >
                ×
              </button>
            )}
          </div>
          {serverStatus.running && (
            isRecording ? (
              <button
                type="button"
                style={styles.stopRecordBtn}
                onClick={() => void handleStopRecording()}
                disabled={recordingBusy}
              >
                {recordingBusy ? t.traffic.stoppingRecording : t.traffic.stopRecording}
              </button>
            ) : (
              <button
                type="button"
                style={styles.recordBtn}
                onClick={() => void handleStartRecording()}
                disabled={recordingBusy}
              >
                {recordingBusy ? t.traffic.startingRecording : t.traffic.startRecording}
              </button>
            )
          )}
          <button
            type="button"
            style={styles.clearBtn}
            onClick={() => void handleClear()}
            disabled={clearScopeCount === 0 || clearing}
          >
            {clearing ? t.traffic.clearing : t.traffic.clear}
          </button>
        </div>
      </DraggablePanelHeader>

      {selectedCount > 0 ? (
        <div style={styles.bulkBar}>
          <span style={styles.bulkCount}>{t.traffic.selectedCount(selectedCount)}</span>
          <div style={styles.bulkActions}>
            <button
              type="button"
              style={styles.bulkBtn}
              onClick={() => void handleBulkMock('request')}
              disabled={bulkBusy}
            >
              {t.traffic.mockRequest}
            </button>
            <button
              type="button"
              style={styles.bulkBtn}
              onClick={() => void handleBulkMock('response')}
              disabled={bulkBusy}
            >
              {t.traffic.mockResponse}
            </button>
            <button
              type="button"
              style={styles.bulkBtn}
              onClick={() => void handleBulkCopyCurl()}
              disabled={bulkBusy}
            >
              {t.traffic.copyCurl}
            </button>
          </div>
        </div>
      ) : null}

      <div ref={tableWrapperRef} style={styles.tableWrapper}>
        <VirtualTrafficTable
          tableWrapperRef={tableWrapperRef}
          records={filteredTraffic}
          selectedId={selectedRequestId}
          selectedIds={selectedIds}
          mockingId={mockingId}
          bulkBusy={bulkBusy}
          selectRowLabel={t.traffic.selectRow}
          actionsLabel={t.traffic.actions}
          onSelect={handleSelectRow}
          onContextMenu={handleRowContextMenu}
          onToggleCheck={toggleSelected}
          onOpenMenu={handleOpenRowMenu}
          onOpenMock={handleOpenMock}
          tableStyle={styles.table}
          theadStyle={styles.thead}
          emptyRow={trafficTableEmptyRow}
          header={(
            <tr>
              <th style={{ ...styles.th, width: '36px' }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = !allVisibleSelected && someVisibleSelected;
                  }}
                  onChange={toggleSelectAllVisible}
                  disabled={visibleIds.length === 0}
                  aria-label={t.common.selectAll}
                  style={styles.checkbox}
                />
              </th>
              <th style={{ ...styles.th, width: '36px' }} />
              <th style={{ ...styles.th, width: '44px' }} />
              <th style={styles.th}>{t.traffic.colTime}</th>
              <th style={styles.th}>{t.traffic.colMethod}</th>
              <th style={styles.th}>{t.traffic.colPath}</th>
              <th style={{ ...styles.th, width: '140px' }}>{t.traffic.colDevice}</th>
              <th style={{ ...styles.th, width: '70px' }}>{t.traffic.colStatus}</th>
              <th style={{ ...styles.th, width: '80px' }}>{t.traffic.colDuration}</th>
            </tr>
          )}
        />
      </div>
      <TrafficRequestMenu
        menu={menu}
        menuRef={menuRef}
        mockingId={mockingId}
        mockRequestLabel={t.traffic.mockRequest}
        mockResponseLabel={t.traffic.mockResponse}
        copyCurlLabel={t.traffic.copyCurl}
        onMockRequest={() => {
          if (menuRequest) void handleMock(menuRequest, 'request');
        }}
        onMockResponse={() => {
          if (menuRequest) void handleMock(menuRequest, 'response');
        }}
        onCopyCurl={() => {
          if (menuRequest) void copyCapturedRequestCurl(menuRequest);
          closeMenu();
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  toolbar: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  toolbarTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  recordingIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--accent)',
    padding: '3px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(73, 204, 144, 0.35)',
    background: 'rgba(73, 204, 144, 0.08)',
  },
  recordingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
    justifyContent: 'flex-end',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flex: 1,
    maxWidth: '360px',
    padding: '2px 8px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    background: 'transparent',
    padding: '4px 0',
    fontSize: '12px',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  searchCount: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  searchClear: {
    width: '18px',
    height: '18px',
    borderRadius: '3px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    lineHeight: 1,
    flexShrink: 0,
  },
  clearBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
  },
  mirrorBtn: {
    padding: '4px 12px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--accent)',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(73, 204, 144, 0.5)',
    background: 'rgba(73, 204, 144, 0.16)',
    flexShrink: 0,
  },
  recordBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'var(--accent)',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(73, 204, 144, 0.35)',
    background: 'rgba(73, 204, 144, 0.08)',
    flexShrink: 0,
    fontWeight: 600,
  },
  stopRecordBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    color: '#fff',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(220, 80, 80, 0.5)',
    background: 'rgba(220, 80, 80, 0.85)',
    flexShrink: 0,
    fontWeight: 600,
  },
  bulkBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(73, 204, 144, 0.08)',
    flexShrink: 0,
  },
  bulkCount: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--accent)',
    flexShrink: 0,
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  bulkBtn: {
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
  },
  checkbox: {
    width: '15px',
    height: '15px',
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  tableWrapper: {
    flex: 1,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  },
  tr: {
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  trSelected: {
    background: 'var(--bg-tertiary)',
  },
  empty: {
    textAlign: 'center',
    padding: '48px 24px',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  inlineCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    background: 'var(--bg-tertiary)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
};
