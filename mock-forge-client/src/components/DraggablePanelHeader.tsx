import React from 'react';
import { useTrafficPanelDrag } from '../contexts/TrafficPanelDragContext';
import { PanelDragIcon } from './PanelDragIcon';

interface DraggablePanelHeaderProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  iconAlign?: 'center' | 'start';
  layout?: 'row' | 'column';
}

export function DraggablePanelHeader({
  children,
  style,
  iconAlign = 'center',
  layout = 'row',
}: DraggablePanelHeaderProps) {
  const drag = useTrafficPanelDrag();

  if (!drag) {
    return <div style={style}>{children}</div>;
  }

  return (
    <div
      ref={drag.setActivatorNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      style={{
        display: 'flex',
        alignItems: iconAlign === 'start' ? 'flex-start' : 'center',
        gap: '6px',
        ...style,
        cursor: drag.isDragging ? 'grabbing' : 'grab',
      }}
      title={drag.label}
      aria-label={drag.label}
    >
      <span style={iconAlign === 'start' ? styles.iconStart : undefined}>
        <PanelDragIcon />
      </span>
      <div style={layout === 'column' ? styles.bodyColumn : styles.bodyRow}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bodyRow: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  bodyColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  iconStart: {
    paddingTop: '2px',
  },
};
