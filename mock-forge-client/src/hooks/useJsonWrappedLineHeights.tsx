import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  JSON_EDITOR_HORIZONTAL_PADDING_PX,
  JSON_EDITOR_LINE_LAYOUT,
  JSON_LINE_HEIGHT_PX,
} from '../utils/jsonDisplay';

const WRAP_MEASURE_LINE_LIMIT = 100;

export function useJsonWrappedLineHeights(
  editorAreaRef: RefObject<HTMLElement>,
  lines: string[],
) {
  const measureRef = useRef<HTMLDivElement>(null);
  const linesKey = useMemo(() => lines.join('\n'), [lines]);
  const shouldMeasureWrap = lines.length <= WRAP_MEASURE_LINE_LIMIT;
  const [contentWidth, setContentWidth] = useState(0);
  const [lineHeights, setLineHeights] = useState<number[]>(() => (
    lines.map(() => JSON_LINE_HEIGHT_PX)
  ));

  useLayoutEffect(() => {
    const area = editorAreaRef.current;
    if (!area) return;

    const updateWidth = () => {
      setContentWidth(Math.max(0, area.clientWidth - JSON_EDITOR_HORIZONTAL_PADDING_PX));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(area);
    return () => observer.disconnect();
  }, [editorAreaRef]);

  useLayoutEffect(() => {
    if (!shouldMeasureWrap) {
      setLineHeights(lines.map(() => JSON_LINE_HEIGHT_PX));
      return;
    }

    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      const measure = measureRef.current;
      if (!measure || contentWidth <= 0) {
        setLineHeights(lines.map(() => JSON_LINE_HEIGHT_PX));
        return;
      }

      const children = Array.from(measure.children) as HTMLElement[];
      if (children.length !== lines.length) {
        setLineHeights(lines.map(() => JSON_LINE_HEIGHT_PX));
        return;
      }

      setLineHeights(children.map((child) => (
        Math.max(child.getBoundingClientRect().height, JSON_LINE_HEIGHT_PX)
      )));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [contentWidth, lines.length, linesKey, shouldMeasureWrap]);

  const contentHeight = useMemo(
    () => lineHeights.reduce((total, height) => total + height, 0),
    [lineHeights],
  );

  const measureMirror = shouldMeasureWrap ? (
    <div
      ref={measureRef}
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
        width: contentWidth > 0 ? `${contentWidth}px` : '100%',
        boxSizing: 'border-box',
        zIndex: -1,
        ...JSON_EDITOR_LINE_LAYOUT,
      }}
    >
      {lines.map((line, index) => (
        <div key={`${index}-${line}`}>{line || '\u00a0'}</div>
      ))}
    </div>
  ) : null;

  return { lineHeights, contentHeight, measureMirror };
}
