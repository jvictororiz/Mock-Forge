import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { H264WebCodecsRenderer } from '../utils/h264WebCodecsDecoder';
import { mapClientPointToMirror } from '../utils/mirrorPointerMap';
import { computeMirrorIdealWidth } from '../utils/mirrorIdealWidth';
import { useI18n } from '../hooks/useI18n';
import { MirrorCaptureToolbar } from './MirrorCaptureToolbar';
import { DraggablePanelHeader } from './DraggablePanelHeader';
import type { MirrorStatus, MirrorTouchInput } from '../../shared/types';

interface DeviceMirrorPanelProps {
  onClose: () => void;
  onIdealWidth?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
}

export function DeviceMirrorPanel({
  onClose,
  onIdealWidth,
  minWidth = 300,
  maxWidth = 520,
}: DeviceMirrorPanelProps) {
  const { t } = useI18n();
  const serverStatus = useAppStore((state) => state.serverStatus);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const autoSizedRef = useRef(false);
  const [status, setStatus] = useState<MirrorStatus>(() => ({
    state: 'idle',
    active: false,
    deviceId: null,
    serverAvailable: false,
    error: null,
  }));
  const [webCodecsSupported, setWebCodecsSupported] = useState(true);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const pointerDownRef = useRef(false);
  const pasteHandledRef = useRef(false);

  const activeDevice = serverStatus.adbDevices?.find(
    (device) => device.id === serverStatus.activeAdbDevice && device.state === 'device',
  ) ?? serverStatus.adbDevices?.find((device) => device.state === 'device');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeDevice) {
      return undefined;
    }

    let decoder: H264WebCodecsRenderer;
    try {
      decoder = new H264WebCodecsRenderer(canvas, () => {
        setHasRenderedFrame(true);
      });
      setWebCodecsSupported(decoder.supported);
    } catch {
      setWebCodecsSupported(false);
      return undefined;
    }

    const unsubscribeChunk = window.mockforge.mirror.onChunk((chunk) => {
      decoder.feed(chunk);
    });

    const unsubscribeState = window.mockforge.mirror.onState((next) => {
      setStatus(next);
    });

    void window.mockforge.mirror.status().then((next) => {
      setStatus(next);
    });

    decoder.reset();
    setHasRenderedFrame(false);
    autoSizedRef.current = false;
    void window.mockforge.mirror.start(activeDevice.id);

    return () => {
      unsubscribeChunk();
      unsubscribeState();
      decoder.dispose();
      void window.mockforge.mirror.stop();
    };
  }, [activeDevice?.id]);

  useLayoutEffect(() => {
    if (!hasRenderedFrame || autoSizedRef.current || !onIdealWidth) {
      return;
    }

    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport || canvas.width <= 0 || canvas.height <= 0) {
      return;
    }

    const idealWidth = computeMirrorIdealWidth(
      canvas.width,
      canvas.height,
      viewport.clientHeight,
      minWidth,
      maxWidth,
    );
    autoSizedRef.current = true;
    onIdealWidth(idealWidth);
  }, [hasRenderedFrame, maxWidth, minWidth, onIdealWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeDevice || status.state !== 'streaming' || !hasRenderedFrame) {
      return undefined;
    }

    const buildTouchInput = (
      action: MirrorTouchInput['action'],
      clientX: number,
      clientY: number,
    ): MirrorTouchInput | null => {
      const point = mapClientPointToMirror(canvas, clientX, clientY);
      if (!point) return null;
      return {
        action,
        x: point.x,
        y: point.y,
        screenWidth: canvas.width,
        screenHeight: canvas.height,
      };
    };

    const sendTouch = (input: MirrorTouchInput | null) => {
      if (!input) return;
      void window.mockforge.mirror.injectTouch(input);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      canvas.focus();
      canvas.setPointerCapture(event.pointerId);
      pointerDownRef.current = true;
      sendTouch(buildTouchInput('down', event.clientX, event.clientY));
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDownRef.current) return;
      event.preventDefault();
      sendTouch(buildTouchInput('move', event.clientX, event.clientY));
    };

    const endPointer = (event: PointerEvent) => {
      if (!pointerDownRef.current) return;
      event.preventDefault();
      pointerDownRef.current = false;
      sendTouch(buildTouchInput('up', event.clientX, event.clientY));
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = mapClientPointToMirror(canvas, event.clientX, event.clientY);
      if (!point) return;
      void window.mockforge.mirror.injectScroll({
        x: point.x,
        y: point.y,
        screenWidth: canvas.width,
        screenHeight: canvas.height,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
    };

    const injectPastedText = (text: string) => {
      if (!text) return;
      void window.mockforge.mirror.injectText(text);
    };

    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      pasteHandledRef.current = true;
      injectPastedText(text);
      queueMicrotask(() => {
        pasteHandledRef.current = false;
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const isPaste =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && !event.shiftKey;
      if (!isPaste) return;
      event.preventDefault();
      if (pasteHandledRef.current) return;
      void navigator.clipboard.readText().then(injectPastedText).catch(() => {});
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('paste', onPaste);
    canvas.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endPointer);
      canvas.removeEventListener('pointercancel', endPointer);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('paste', onPaste);
      canvas.removeEventListener('keydown', onKeyDown);
      pointerDownRef.current = false;
    };
  }, [activeDevice?.id, hasRenderedFrame, status.state]);

  const statusLabel = (() => {
    if (!webCodecsSupported) return t.mirror.webCodecsMissing;
    if (status.state === 'downloading') return t.mirror.downloadingServer;
    if (!status.serverAvailable && status.state === 'error') return t.mirror.serverMissing;
    if (!activeDevice) return t.mirror.noDevice;
    if (status.state === 'starting') return t.mirror.connecting;
    if (status.state === 'streaming' && !hasRenderedFrame) return t.mirror.decoding;
    if (status.state === 'streaming') return t.mirror.streaming;
    if (status.state === 'error') return status.error ?? t.mirror.startFailed;
    return t.mirror.connecting;
  })();

  return (
    <div style={styles.panel}>
      <DraggablePanelHeader style={styles.header}>
        <div style={styles.headerText}>
          <span style={styles.title}>{t.mirror.title}</span>
          <span style={styles.subtitle}>{statusLabel}</span>
        </div>
        <div style={styles.headerActions}>
          <MirrorCaptureToolbar
            canvasRef={canvasRef}
            deviceId={activeDevice?.id}
            enabled={status.state === 'streaming' && hasRenderedFrame}
          />
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            title={t.mirror.hide}
            aria-label={t.mirror.hide}
          >
            ×
          </button>
        </div>
      </DraggablePanelHeader>
      <div ref={viewportRef} style={styles.viewport}>
        {webCodecsSupported && activeDevice ? (
          <canvas
            ref={canvasRef}
            tabIndex={0}
            style={{
              ...styles.canvas,
              touchAction: 'none',
              cursor: status.state === 'streaming' && hasRenderedFrame ? 'pointer' : 'default',
              outline: 'none',
            }}
            aria-label={t.mirror.title}
          />
        ) : (
          <div style={styles.placeholder}>{statusLabel}</div>
        )}
      </div>
      {activeDevice ? (
        <div style={styles.footer} title={activeDevice.id}>
          {activeDevice.name ?? activeDevice.id}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    background: 'var(--bg-primary)',
  },
  header: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: '2px',
    flex: 1,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: 1,
    fontSize: '16px',
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d1117',
    overflow: 'hidden',
  },
  canvas: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  placeholder: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  footer: {
    padding: '6px 10px',
    borderTop: '1px solid var(--border)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
};
