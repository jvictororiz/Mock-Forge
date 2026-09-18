import React, { useEffect, useRef, useState } from 'react';
import { RouteList } from './RouteList';
import { RouteDetail } from './RouteDetail';
import { TabLoadingFallback } from './TabLoadingFallback';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import {
  clamp,
  EDITOR_LIST_USER_SIZED_KEY,
  EDITOR_LIST_WIDTH_KEY,
  markUserSizedPanel,
  readUserSizedWidth,
  writeStoredNumber,
} from '../utils/layoutPreferences';

const DEFAULT_LIST_WIDTH = 380;
const MIN_LIST_WIDTH = 300;
const MAX_LIST_WIDTH = 560;
const MIN_DETAIL_WIDTH = 360;

export function EditorLayout() {
  const storedList = readUserSizedWidth(
    EDITOR_LIST_WIDTH_KEY,
    EDITOR_LIST_USER_SIZED_KEY,
    DEFAULT_LIST_WIDTH,
    MIN_LIST_WIDTH,
    MAX_LIST_WIDTH,
  );
  const [listWidth, setListWidth] = useState(storedList.width);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const dragging = useRef(false);
  const hasUserResized = useRef(storedList.hasUserSized);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureCurrentEnvironment().finally(() => {
      if (!cancelled) setEnvironmentReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasUserResized.current) return;
    writeStoredNumber(EDITOR_LIST_WIDTH_KEY, listWidth);
  }, [listWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = e.clientX - rect.left;
      const max = Math.min(MAX_LIST_WIDTH, rect.width - MIN_DETAIL_WIDTH);
      setListWidth(clamp(next, MIN_LIST_WIDTH, max));
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
    markUserSizedPanel(EDITOR_LIST_USER_SIZED_KEY);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!environmentReady) {
    return <TabLoadingFallback />;
  }

  return (
    <div ref={containerRef} style={styles.layout}>
      <div style={{ ...styles.listPane, width: listWidth, flexShrink: 0 }}>
        <RouteList />
      </div>
      <div
        style={styles.resizer}
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize routes panel"
      />
      <div style={styles.detailPane}>
        <RouteDetail />
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
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
  },
  resizer: {
    width: '5px',
    cursor: 'col-resize',
    background: 'var(--border)',
    flexShrink: 0,
  },
  detailPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
    background: 'var(--bg-primary)',
  },
};
