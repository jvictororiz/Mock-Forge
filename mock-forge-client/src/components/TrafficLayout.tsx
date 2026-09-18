import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { TrafficView } from './TrafficView';
import { RequestDetail } from './RequestDetail';
import { DeviceMirrorPanel } from './DeviceMirrorPanel';
import { SortableTrafficPanel } from './SortableTrafficPanel';
import { useI18n } from '../hooks/useI18n';
import {
  clamp,
  markUserSizedPanel,
  readStoredBoolean,
  readStoredNumber,
  readUserSizedWidth,
  TRAFFIC_DETAIL_USER_SIZED_KEY,
  TRAFFIC_DETAIL_WIDTH_KEY,
  TRAFFIC_MIRROR_OPEN_KEY,
  TRAFFIC_MIRROR_USER_SIZED_KEY,
  TRAFFIC_MIRROR_WIDTH_KEY,
  writeStoredBoolean,
  writeStoredNumber,
} from '../utils/layoutPreferences';
import {
  getVisiblePanelOrder,
  readStoredPanelOrder,
  writeStoredPanelOrder,
  type TrafficPanelDragSnapshot,
  type TrafficPanelId,
} from '../utils/trafficPanelLayout';

const RESIZER_WIDTH = 5;
const MIN_LIST_WIDTH = 200;
const MIN_MIRROR_WIDTH = 300;
const MAX_MIRROR_WIDTH = 520;
const DEFAULT_MIRROR_WIDTH = 400;
const MIN_DETAIL_WIDTH = 260;
const MAX_DETAIL_WIDTH = 900;

function getDefaultDetailWidth(
  containerWidth: number,
  visibleOrder: TrafficPanelId[],
  mirrorWidth: number,
): number {
  const resizers = (visibleOrder.length - 1) * RESIZER_WIDTH;
  const fixedMirror = visibleOrder.includes('mirror') ? mirrorWidth : 0;
  const fixed = fixedMirror + resizers + MIN_LIST_WIDTH;
  const available = Math.max(MIN_DETAIL_WIDTH, containerWidth - fixed);
  return clamp(available * 0.45, MIN_DETAIL_WIDTH, MAX_DETAIL_WIDTH);
}

function getPanelWidthLimits(id: TrafficPanelId): { min: number; max: number } | null {
  if (id === 'list') return null;
  if (id === 'mirror') return { min: MIN_MIRROR_WIDTH, max: MAX_MIRROR_WIDTH };
  return { min: MIN_DETAIL_WIDTH, max: MAX_DETAIL_WIDTH };
}

export function TrafficLayout() {
  const { t } = useI18n();
  const storedDetail = readUserSizedWidth(
    TRAFFIC_DETAIL_WIDTH_KEY,
    TRAFFIC_DETAIL_USER_SIZED_KEY,
    MIN_DETAIL_WIDTH,
    MIN_DETAIL_WIDTH,
    MAX_DETAIL_WIDTH,
  );
  const [panelOrder, setPanelOrder] = useState(() => readStoredPanelOrder());
  const [mirrorOpen, setMirrorOpen] = useState(() => readStoredBoolean(TRAFFIC_MIRROR_OPEN_KEY, false));
  const [mirrorWidth, setMirrorWidth] = useState(() => clamp(
    readStoredNumber(TRAFFIC_MIRROR_WIDTH_KEY, DEFAULT_MIRROR_WIDTH),
    MIN_MIRROR_WIDTH,
    MAX_MIRROR_WIDTH,
  ));
  const [detailWidth, setDetailWidth] = useState(storedDetail.width);
  const [activeDragId, setActiveDragId] = useState<TrafficPanelId | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<TrafficPanelDragSnapshot | null>(null);
  const resizingIndex = useRef<number | null>(null);
  const hasUserResizedDetail = useRef(storedDetail.hasUserSized);
  const hasUserResizedMirror = useRef(readStoredBoolean(TRAFFIC_MIRROR_USER_SIZED_KEY, false));
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<TrafficPanelId, HTMLDivElement | null>>({
    mirror: null,
    list: null,
    detail: null,
  });

  const visibleOrder = getVisiblePanelOrder(panelOrder, mirrorOpen);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const setPanelWidth = useCallback((id: TrafficPanelId, width: number) => {
    const limits = getPanelWidthLimits(id);
    if (!limits) return;

    const next = clamp(width, limits.min, limits.max);
    if (id === 'mirror') {
      setMirrorWidth(next);
      return;
    }
    setDetailWidth(next);
  }, []);

  const getPanelWidth = useCallback((id: TrafficPanelId): number => {
    if (id === 'mirror') return mirrorWidth;
    if (id === 'detail') return detailWidth;
    return 0;
  }, [detailWidth, mirrorWidth]);

  const getPanelStyle = useCallback((id: TrafficPanelId): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minWidth: 0,
      background: 'var(--bg-primary)',
    };

    if (id === 'list') {
      return { ...base, flex: 1, minWidth: MIN_LIST_WIDTH };
    }

    const width = getPanelWidth(id);
    return { ...base, width, flexShrink: 0 };
  }, [getPanelWidth]);

  const panelDragLabels: Record<TrafficPanelId, string> = {
    mirror: t.traffic.dragPanelMirror,
    list: t.traffic.dragPanelList,
    detail: t.traffic.dragPanelDetail,
  };

  useEffect(() => {
    writeStoredPanelOrder(panelOrder);
  }, [panelOrder]);

  useEffect(() => {
    writeStoredBoolean(TRAFFIC_MIRROR_OPEN_KEY, mirrorOpen);
  }, [mirrorOpen]);

  useEffect(() => {
    writeStoredNumber(TRAFFIC_MIRROR_WIDTH_KEY, mirrorWidth);
  }, [mirrorWidth]);

  useEffect(() => {
    if (!hasUserResizedDetail.current) return;
    writeStoredNumber(TRAFFIC_DETAIL_WIDTH_KEY, detailWidth);
  }, [detailWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncDefaultWidth = () => {
      const width = container.getBoundingClientRect().width;
      if (!hasUserResizedDetail.current) {
        setDetailWidth(getDefaultDetailWidth(width, visibleOrder, mirrorWidth));
      }
    };

    syncDefaultWidth();
    const observer = new ResizeObserver(syncDefaultWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [mirrorOpen, mirrorWidth, visibleOrder]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const index = resizingIndex.current;
      if (index === null) return;

      const order = getVisiblePanelOrder(panelOrder, mirrorOpen);
      const leftId = order[index];
      const rightId = order[index + 1];
      if (!leftId || !rightId) return;

      const leftEl = panelRefs.current[leftId];
      const rightEl = panelRefs.current[rightId];
      if (!leftEl || !rightEl) return;

      if (leftId !== 'list') {
        const leftRect = leftEl.getBoundingClientRect();
        setPanelWidth(leftId, event.clientX - leftRect.left);
      }

      if (rightId !== 'list') {
        const rightRect = rightEl.getBoundingClientRect();
        setPanelWidth(rightId, rightRect.right - event.clientX);
      }
    };

    const onUp = () => {
      if (resizingIndex.current === null) return;
      resizingIndex.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [mirrorOpen, panelOrder, setPanelWidth]);

  const startResize = (index: number, leftId: TrafficPanelId, rightId: TrafficPanelId) => {
    resizingIndex.current = index;
    if (leftId === 'detail' || rightId === 'detail') {
      hasUserResizedDetail.current = true;
      markUserSizedPanel(TRAFFIC_DETAIL_USER_SIZED_KEY);
    }
    if (leftId === 'mirror' || rightId === 'mirror') {
      hasUserResizedMirror.current = true;
      markUserSizedPanel(TRAFFIC_MIRROR_USER_SIZED_KEY);
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMirrorIdealWidth = (width: number) => {
    if (hasUserResizedMirror.current) return;
    setMirrorWidth(clamp(width, MIN_MIRROR_WIDTH, MAX_MIRROR_WIDTH));
  };

  const toggleMirror = () => {
    setMirrorOpen((open) => !open);
  };

  useEffect(() => {
    if (!mirrorOpen) {
      void window.mockforge.mirror.stop();
    }
  }, [mirrorOpen]);

  const handleDragStart = (event: DragStartEvent) => {
    const panelId = event.active.id as TrafficPanelId;
    const panel = panelRefs.current[panelId];
    setActiveDragId(panelId);
    if (panel) {
      const rect = panel.getBoundingClientRect();
      setDragSnapshot({
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      });
      return;
    }
    setDragSnapshot(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setDragSnapshot(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPanelOrder((current) => {
      const oldIndex = current.indexOf(active.id as TrafficPanelId);
      const newIndex = current.indexOf(over.id as TrafficPanelId);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setDragSnapshot(null);
  };

  const renderPanelContent = (id: TrafficPanelId) => {
    if (id === 'mirror') {
      return (
        <DeviceMirrorPanel
          onClose={() => setMirrorOpen(false)}
          onIdealWidth={handleMirrorIdealWidth}
          minWidth={MIN_MIRROR_WIDTH}
          maxWidth={MAX_MIRROR_WIDTH}
        />
      );
    }

    if (id === 'list') {
      return <TrafficView mirrorOpen={mirrorOpen} onToggleMirror={toggleMirror} />;
    }

    return <RequestDetail />;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={containerRef} style={styles.layout}>
        <SortableContext items={visibleOrder} strategy={horizontalListSortingStrategy}>
          {visibleOrder.map((panelId, index) => (
            <React.Fragment key={panelId}>
              {activeDragId === panelId && dragSnapshot ? (
                <div
                  style={{
                    width: dragSnapshot.width,
                    flex: '0 0 auto',
                    flexShrink: 0,
                    height: '100%',
                  }}
                  aria-hidden
                />
              ) : null}
              <SortableTrafficPanel
                id={panelId}
                dragLabel={panelDragLabels[panelId]}
                style={getPanelStyle(panelId)}
                dragSnapshot={activeDragId === panelId ? dragSnapshot : null}
                panelRef={(node) => {
                  panelRefs.current[panelId] = node;
                }}
              >
                {renderPanelContent(panelId)}
              </SortableTrafficPanel>

              {index < visibleOrder.length - 1 ? (
                <div
                  style={{
                    ...styles.resizer,
                    ...(activeDragId ? styles.resizerHidden : null),
                  }}
                  onMouseDown={() => startResize(index, panelId, visibleOrder[index + 1])}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t.traffic.resizePanels}
                  aria-hidden={activeDragId ? true : undefined}
                />
              ) : null}
            </React.Fragment>
          ))}
        </SortableContext>
      </div>

    </DndContext>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minWidth: 0,
  },
  resizer: {
    width: `${RESIZER_WIDTH}px`,
    cursor: 'col-resize',
    background: 'var(--border)',
    flexShrink: 0,
    transition: 'width 0.15s ease, opacity 0.15s ease',
  },
  resizerHidden: {
    width: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
};
