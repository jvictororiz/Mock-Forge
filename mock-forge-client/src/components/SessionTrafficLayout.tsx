import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { SessionTrafficView } from './SessionTrafficView';
import { RequestDetail } from './RequestDetail';
import { useSessionStore } from '../stores/sessionStore';
import {
  clamp,
  markUserSizedPanel,
  readUserSizedWidth,
  SESSION_DETAIL_USER_SIZED_KEY,
  SESSION_DETAIL_WIDTH_KEY,
  writeStoredNumber,
} from '../utils/layoutPreferences';

const RESIZER_WIDTH = 5;
const LIST_SHARE = 1;
const DETAIL_SHARE = 1;
const MIN_LIST_WIDTH = 280;
const MIN_DETAIL_WIDTH = 400;
const MAX_DETAIL_WIDTH = 1200;

function getDefaultDetailWidth(containerWidth: number): number {
  const available = Math.max(0, containerWidth - RESIZER_WIDTH);
  const next = available * (DETAIL_SHARE / (LIST_SHARE + DETAIL_SHARE));
  return clamp(next, MIN_DETAIL_WIDTH, MAX_DETAIL_WIDTH);
}

export function SessionTrafficLayout() {
  const storedDetail = readUserSizedWidth(
    SESSION_DETAIL_WIDTH_KEY,
    SESSION_DETAIL_USER_SIZED_KEY,
    MIN_DETAIL_WIDTH,
    MIN_DETAIL_WIDTH,
    MAX_DETAIL_WIDTH,
  );
  const [detailWidth, setDetailWidth] = useState(storedDetail.width);
  const dragging = useRef(false);
  const hasUserResized = useRef(storedDetail.hasUserSized);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRequest = useSessionStore(
    (state) => (
      state.selectedRecordId
        ? state.viewingRecords.find((record) => record.id === state.selectedRecordId) ?? null
        : null
    ),
    shallow,
  );

  useEffect(() => {
    if (!hasUserResized.current) return;
    writeStoredNumber(SESSION_DETAIL_WIDTH_KEY, detailWidth);
  }, [detailWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncDefaultWidth = () => {
      if (hasUserResized.current) return;
      setDetailWidth(getDefaultDetailWidth(container.getBoundingClientRect().width));
    };

    syncDefaultWidth();
    const observer = new ResizeObserver(syncDefaultWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = rect.right - e.clientX;
      setDetailWidth(clamp(next, MIN_DETAIL_WIDTH, MAX_DETAIL_WIDTH));
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = () => {
    dragging.current = true;
    hasUserResized.current = true;
    markUserSizedPanel(SESSION_DETAIL_USER_SIZED_KEY);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div ref={containerRef} style={styles.layout}>
      <div style={{ ...styles.listPane, minWidth: MIN_LIST_WIDTH }}>
        <SessionTrafficView />
      </div>
      <div
        style={styles.resizer}
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize session detail panel"
      />
      <div style={{ ...styles.detailPane, width: detailWidth, flexShrink: 0 }}>
        <RequestDetail request={selectedRequest} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minWidth: 0,
  },
  listPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  resizer: {
    width: '5px',
    cursor: 'col-resize',
    background: 'var(--border)',
    flexShrink: 0,
  },
  detailPane: {
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
};
