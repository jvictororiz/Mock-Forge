import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../hooks/useI18n';
import { showToast } from '../utils/notify';
import { blobToBase64, blobToDataUrl, createMirrorPreviewUrl } from '../utils/mirrorCapture';

export type MirrorCaptureDialogState =
  | { kind: 'screenshot'; blob: Blob; defaultName: string }
  | { kind: 'video'; blob: Blob; mimeType: string; defaultName: string };

interface MirrorCaptureDialogProps {
  state: MirrorCaptureDialogState | null;
  onClose: () => void;
}

export function MirrorCaptureDialog({ state, onClose }: MirrorCaptureDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resetPreview = () => {
      setPreviewSrc(null);
      setPreviewError(false);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    if (!state) {
      resetPreview();
      return undefined;
    }

    if (state.kind === 'screenshot') {
      void blobToDataUrl(state.blob)
        .then((dataUrl) => {
          if (cancelled) return;
          setPreviewSrc(dataUrl);
          setPreviewError(false);
        })
        .catch(() => {
          if (!cancelled) setPreviewError(true);
        });
      return () => {
        cancelled = true;
      };
    }

    const objectUrl = createMirrorPreviewUrl(state.blob);
    objectUrlRef.current = objectUrl;
    setPreviewSrc(objectUrl);
    setPreviewError(false);

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [state]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewSrc || state?.kind !== 'video') {
      return undefined;
    }

    video.src = previewSrc;
    video.load();
    void video.play().catch(() => {
      // Autoplay may fail until user interacts; controls still work.
    });

    return undefined;
  }, [previewSrc, state?.kind]);

  if (!state) {
    return null;
  }

  const title = state.kind === 'screenshot'
    ? t.mirror.captureDialogScreenshotTitle
    : t.mirror.captureDialogRecordingTitle;

  const handleCopy = async () => {
    setBusy(true);
    try {
      if (state.kind === 'screenshot') {
        const pngBase64 = await blobToBase64(state.blob);
        const result = await window.mockforge.mirror.copyScreenshot(pngBase64);
        if (result.success) {
          showToast(t.mirror.screenshotCopied, 'success');
          onClose();
        } else {
          showToast(result.error ?? t.mirror.captureFailed, 'error');
        }
        return;
      }

      const buffer = await state.blob.arrayBuffer();
      const result = await window.mockforge.mirror.copyRecording(buffer, state.mimeType, state.defaultName);
      if (result.success) {
        showToast(t.mirror.recordingCopied, 'success');
        onClose();
      } else {
        showToast(result.error ?? t.mirror.captureFailed, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      if (state.kind === 'screenshot') {
        const pngBase64 = await blobToBase64(state.blob);
        const result = await window.mockforge.mirror.saveScreenshot(pngBase64, state.defaultName);
        if (result.canceled) return;
        if (result.success) {
          showToast(t.mirror.screenshotSaved, 'success');
          onClose();
        } else {
          showToast(result.error ?? t.mirror.captureFailed, 'error');
        }
        return;
      }

      const buffer = await state.blob.arrayBuffer();
      const result = await window.mockforge.mirror.saveRecording(buffer, state.mimeType, state.defaultName);
      if (result.canceled) return;
      if (result.success) {
        showToast(t.mirror.recordingSaved, 'success');
        onClose();
      } else {
        showToast(result.error ?? t.mirror.captureFailed, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div style={styles.overlay} onMouseDown={onClose}>
      <div
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={styles.header}>
          <span style={styles.title}>{title}</span>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label={t.common.cancel}
          >
            ×
          </button>
        </div>

        <div style={styles.previewWrap}>
          {!previewSrc && !previewError ? (
            <div style={styles.previewLoading}>{t.mirror.capturePreviewLoading}</div>
          ) : previewError ? (
            <div style={styles.previewError}>{t.mirror.capturePreviewFailed}</div>
          ) : state.kind === 'screenshot' ? (
            <img
              src={previewSrc ?? undefined}
              alt={title}
              style={styles.imagePreview}
              onError={() => setPreviewError(true)}
            />
          ) : (
            <video
              ref={videoRef}
              style={styles.videoPreview}
              controls
              playsInline
              preload="auto"
              muted
              loop
              onError={() => setPreviewError(true)}
            />
          )}
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => void handleCopy()}
            disabled={busy || previewError || !previewSrc}
          >
            {t.mirror.copyToClipboard}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => void handleSave()}
            disabled={busy || previewError || !previewSrc}
          >
            {t.mirror.saveToFile}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={onClose}
            disabled={busy}
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    zIndex: 2000,
  },
  dialog: {
    width: 'min(520px, 100%)',
    maxHeight: 'min(90vh, 820px)',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.35)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  closeButton: {
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    cursor: 'pointer',
    lineHeight: 1,
    fontSize: '16px',
    flexShrink: 0,
  },
  previewWrap: {
    padding: '12px',
    background: '#0d1117',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '240px',
    maxHeight: '60vh',
    overflow: 'auto',
  },
  previewLoading: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  previewError: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  imagePreview: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '58vh',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  videoPreview: {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    maxHeight: '58vh',
    borderRadius: '6px',
    background: '#000',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '12px 14px',
    borderTop: '1px solid var(--border)',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#0d1117',
    borderRadius: '6px',
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '6px 12px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    cursor: 'pointer',
  },
};
