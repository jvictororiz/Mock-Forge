import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useAppStore } from '../stores/appStore';
import { createMockFromTraffic, createMocksFromTraffic } from '../utils/trafficActions';
import { copyCapturedRequestCurl, copyCapturedRequestsCurl } from '../utils/curlActions';
import { filterTrafficRequests } from '../utils/trafficSearch';
import { TrafficRequestMenu } from './TrafficRequestMenu';
import { VirtualTrafficTable } from './VirtualTrafficTable';
import { useTrafficRequestMenu } from '../hooks/useTrafficRequestMenu';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { showToast } from '../utils/notify';
import type { CapturedRequest } from '../types';
import { useI18n } from '../hooks/useI18n';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import { handleTrafficFindShortcut } from '../utils/trafficFindShortcut';
import { openTrafficMockInEditor } from '../utils/routeActions';
import type { MockKind } from '../types';

const TRAFFIC_SEARCH_DEBOUNCE_MS = 150;

export function SessionTrafficView() {
  const { t } = useI18n();
  const {
    viewingSession,
    viewingRecords,
    selectedRecordId,
    recordsLoading,
    setSelectedRecordId,
    closeSessionView,
  } = useSessionStore(
    (state) => ({
      viewingSession: state.viewingSession,
      viewingRecords: state.viewingRecords,
      selectedRecordId: state.selectedRecordId,
      recordsLoading: state.recordsLoading,
      setSelectedRecordId: state.setSelectedRecordId,
      closeSessionView: state.closeSessionView,
    }),
    shallow,
  );
  const selectedConsumerId = useAppStore((state) => state.selectedConsumerId);

  const [mockingId, setMockingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, TRAFFIC_SEARCH_DEBOUNCE_MS);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const {
    menu,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  } = useTrafficRequestMenu();

  const filteredTraffic = useMemo(
    () => filterTrafficRequests(viewingRecords, debouncedSearchQuery, selectedConsumerId),
    [viewingRecords, debouncedSearchQuery, selectedConsumerId],
  );
  const isFiltering = searchQuery.trim().length > 0 || !!selectedConsumerId;
  const selectedRecords = useMemo(
    () => viewingRecords.filter((record) => selectedIds.has(record.id)),
    [selectedIds, viewingRecords],
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
    setSelectedIds(new Set());
  }, [viewingSession?.id]);

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
    setSelectedRecordId(id);
  }, [setSelectedRecordId]);

  const handleRowContextMenu = useCallback((
    id: string,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => {
    setSelectedRecordId(id);
    openFromContextMenu(event, id);
  }, [openFromContextMenu, setSelectedRecordId]);

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
      ?? viewingRecords.find((record) => record.id === menu.requestId)
    : undefined;

  const trafficTableEmptyRow = viewingRecords.length === 0 ? (
    <tr>
      <td colSpan={9} style={styles.emptyCell}>
        {t.sessions.empty}
      </td>
    </tr>
  ) : filteredTraffic.length === 0 ? (
    <tr>
      <td colSpan={9} style={styles.emptyCell}>
        {t.traffic.noResults(searchQuery.trim())}
      </td>
    </tr>
  ) : null;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.toolbarTitle}>{viewingSession?.name ?? t.sessions.title}</span>
          {viewingSession && (
            <span style={styles.toolbarMeta}>
              {t.sessions.requests(viewingSession.requestCount)}
            </span>
          )}
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
                {filteredTraffic.length}/{viewingRecords.length}
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
          <button type="button" style={styles.closeBtn} onClick={closeSessionView}>
            {t.sessions.closeView}
          </button>
        </div>
      </div>

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
        {recordsLoading ? (
          <div style={styles.empty}>{t.sessions.loading}</div>
        ) : (
          <VirtualTrafficTable
            tableWrapperRef={tableWrapperRef}
            records={filteredTraffic}
            selectedId={selectedRecordId}
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
        )}
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
    minWidth: 0,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    minWidth: 0,
  },
  toolbarTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toolbarMeta: {
    fontSize: '10px',
    color: 'var(--text-muted)',
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
  closeBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    flexShrink: 0,
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
  emptyCell: {
    textAlign: 'center',
    padding: '48px 24px',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
};
