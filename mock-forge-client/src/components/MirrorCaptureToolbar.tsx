import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { showToast } from '../utils/notify';
import {
  MirrorCanvasRecorder,
  buildMirrorCaptureFilename,
  canvasToPngBlob,
} from '../utils/mirrorCapture';
import { MirrorCaptureDialog, type MirrorCaptureDialogState } from './MirrorCaptureDialog';
import { MirrorCameraIcon, MirrorRecordIcon } from './MirrorToolbarIcons';

interface MirrorCaptureToolbarProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  deviceId?: string | null;
  enabled: boolean;
}

export function MirrorCaptureToolbar({ canvasRef, deviceId, enabled }: MirrorCaptureToolbarProps) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogState, setDialogState] = useState<MirrorCaptureDialogState | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const recorderRef = useRef<MirrorCanvasRecorder | null>(null);

  const canCapture = enabled && !busy && !dialogState;
  const canRecord = canCapture && MirrorCanvasRecorder.isSupported();

  useEffect(() => {
    recorderRef.current = new MirrorCanvasRecorder();
    return () => {
      recorderRef.current?.dispose();
      recorderRef.current = null;
    };
  }, []);

  const getCanvas = (): HTMLCanvasElement | null => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return null;
    }
    return canvas;
  };

  const handleScreenshot = async () => {
    const canvas = getCanvas();
    if (!canvas) {
      showToast(t.mirror.captureUnavailable, 'error');
      return;
    }

    setBusy(true);
    try {
      const blob = await canvasToPngBlob(canvas);
      setDialogKey((value) => value + 1);
      setDialogState({
        kind: 'screenshot',
        blob,
        defaultName: buildMirrorCaptureFilename('screenshot', 'png', deviceId),
      });
    } catch {
      showToast(t.mirror.captureFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRecording = async () => {
    const canvas = getCanvas();
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (!recording) {
      if (!canvas) {
        showToast(t.mirror.captureUnavailable, 'error');
        return;
      }
      try {
        recorder.start(canvas);
        setRecording(true);
      } catch {
        showToast(t.mirror.recordingUnsupported, 'error');
      }
      return;
    }

    setBusy(true);
    try {
      const { blob, mimeType } = await recorder.stop();
      setRecording(false);

      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      setDialogKey((value) => value + 1);
      setDialogState({
        kind: 'video',
        blob,
        mimeType,
        defaultName: buildMirrorCaptureFilename('recording', extension, deviceId),
      });
    } catch {
      setRecording(false);
      showToast(t.mirror.captureFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={styles.toolbar}>
        <button
          type="button"
          style={{
            ...styles.actionButton,
            ...(canCapture ? {} : styles.actionButtonDisabled),
          }}
          onClick={() => void handleScreenshot()}
          disabled={!canCapture}
          title={t.mirror.screenshot}
          aria-label={t.mirror.screenshot}
        >
          <MirrorCameraIcon />
        </button>

        <button
          type="button"
          style={{
            ...styles.actionButton,
            ...(recording ? styles.recordButtonActive : {}),
            ...((canRecord && !recording) || recording ? {} : styles.actionButtonDisabled),
          }}
          onClick={() => void handleToggleRecording()}
          disabled={!canRecord && !recording}
          title={recording ? t.mirror.stopRecording : t.mirror.startRecording}
          aria-label={recording ? t.mirror.stopRecording : t.mirror.startRecording}
        >
          <MirrorRecordIcon stopping={recording} />
        </button>
      </div>

      <MirrorCaptureDialog
        key={dialogKey}
        state={dialogState}
        onClose={() => setDialogState(null)}
      />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(73, 204, 144, 0.45)',
    background: 'rgba(73, 204, 144, 0.12)',
    color: 'var(--accent)',
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  actionButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  recordButtonActive: {
    color: '#ffffff',
    borderColor: 'rgba(255, 107, 107, 0.65)',
    background: '#8b2f2f',
  },
};
