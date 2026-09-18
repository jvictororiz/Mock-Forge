import React, { createContext, useContext } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

export interface TrafficPanelDragContextValue {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  listeners: SyntheticListenerMap | undefined;
  attributes: DraggableAttributes;
  isDragging: boolean;
  label: string;
}

const TrafficPanelDragContext = createContext<TrafficPanelDragContextValue | null>(null);

export function TrafficPanelDragProvider({
  value,
  children,
}: {
  value: TrafficPanelDragContextValue;
  children: React.ReactNode;
}) {
  return (
    <TrafficPanelDragContext.Provider value={value}>
      {children}
    </TrafficPanelDragContext.Provider>
  );
}

export function useTrafficPanelDrag(): TrafficPanelDragContextValue | null {
  return useContext(TrafficPanelDragContext);
}
