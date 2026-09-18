import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Transform } from '@dnd-kit/utilities';
import { TrafficPanelDragProvider } from '../contexts/TrafficPanelDragContext';
import type { TrafficPanelDragSnapshot, TrafficPanelId } from '../utils/trafficPanelLayout';

interface SortableTrafficPanelProps {
  id: TrafficPanelId;
  dragLabel: string;
  style?: React.CSSProperties;
  dragSnapshot?: TrafficPanelDragSnapshot | null;
  panelRef?: (node: HTMLDivElement | null) => void;
  children: React.ReactNode;
}

function toTranslateOnly(transform: Transform | null): Transform | null {
  if (!transform) return null;
  return {
    x: transform.x,
    y: transform.y,
    scaleX: 1,
    scaleY: 1,
  };
}

export function SortableTrafficPanel({
  id,
  dragLabel,
  style,
  dragSnapshot,
  panelRef,
  children,
}: SortableTrafficPanelProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    panelRef?.(node);
  };

  const translateTransform = toTranslateOnly(transform);
  const draggingStyle = isDragging && dragSnapshot
    ? {
        position: 'fixed' as const,
        top: dragSnapshot.top,
        left: dragSnapshot.left,
        width: dragSnapshot.width,
        height: dragSnapshot.height,
        minWidth: dragSnapshot.width,
        maxWidth: dragSnapshot.width,
        flex: 'none',
        margin: 0,
        opacity: 0.45,
        zIndex: 1000,
        pointerEvents: 'none' as const,
        background: 'var(--bg-primary)',
        boxSizing: 'border-box' as const,
        transform: CSS.Transform.toString(translateTransform),
        transition: undefined,
      }
    : {
        transform: CSS.Transform.toString(translateTransform),
        transition,
      };

  return (
    <TrafficPanelDragProvider
      value={{
        setActivatorNodeRef,
        listeners,
        attributes,
        isDragging,
        label: dragLabel,
      }}
    >
      <div
        ref={setRefs}
        data-traffic-panel={id}
        style={{
          ...styles.panel,
          ...style,
          ...draggingStyle,
        }}
      >
        {children}
      </div>
    </TrafficPanelDragProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    height: '100%',
  },
};
