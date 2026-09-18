export function buildMirrorCaptureFilename(prefix: string, extension: string, deviceId?: string | null): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const deviceSuffix = deviceId
    ? `-${deviceId.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    : '';
  return `${prefix}${deviceSuffix}-${stamp}.${extension}`;
}

function waitForCanvasPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  await waitForCanvasPaint();

  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const ctx = snapshot.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to capture screenshot');
  }
  ctx.drawImage(canvas, 0, 0, snapshot.width, snapshot.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    snapshot.toBlob((value) => resolve(value), 'image/png');
  });
  if (!blob) {
    throw new Error('Failed to capture screenshot');
  }
  return blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read blob'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const base64 = dataUrl.split(',')[1];
  if (!base64) {
    throw new Error('Failed to encode blob');
  }
  return base64;
}

export async function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  return blobToBase64(await canvasToPngBlob(canvas));
}

export function createMirrorPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export class MirrorCanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mimeType: string | null = null;

  static isSupported(): boolean {
    return pickRecordingMimeType() !== null
      && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  start(canvas: HTMLCanvasElement): void {
    if (this.recording) return;

    const mimeType = pickRecordingMimeType();
    if (!mimeType) {
      throw new Error('Video recording is not supported in this environment');
    }

    this.mimeType = mimeType;
    this.chunks = [];
    this.stream = canvas.captureStream(30);
    this.recorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });

    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.recorder.start(250);
  }

  stop(): Promise<{ blob: Blob; mimeType: string }> {
    if (!this.recorder || !this.mimeType) {
      return Promise.reject(new Error('No recording in progress'));
    }

    const recorder = this.recorder;
    const mimeType = this.mimeType;

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.recorder = null;
        this.mimeType = null;

        if (this.chunks.length === 0) {
          reject(new Error('Recording produced no data'));
          return;
        }

        resolve({
          blob: new Blob(this.chunks, { type: mimeType }),
          mimeType,
        });
        this.chunks = [];
      };

      recorder.onerror = () => {
        reject(new Error('Recording failed'));
      };

      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      recorder.stop();
    });
  }

  dispose(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.mimeType = null;
    this.chunks = [];
  }
}
