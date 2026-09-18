export interface MirrorPoint {
  x: number;
  y: number;
}

export function mapClientPointToMirror(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): MirrorPoint | null {
  const rect = canvas.getBoundingClientRect();
  const videoWidth = canvas.width;
  const videoHeight = canvas.height;
  if (videoWidth <= 0 || videoHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const displayWidth = videoWidth * scale;
  const displayHeight = videoHeight * scale;
  const offsetX = (rect.width - displayWidth) / 2;
  const offsetY = (rect.height - displayHeight) / 2;

  if (
    relX < offsetX
    || relY < offsetY
    || relX > offsetX + displayWidth
    || relY > offsetY + displayHeight
  ) {
    return null;
  }

  return {
    x: Math.round((relX - offsetX) / scale),
    y: Math.round((relY - offsetY) / scale),
  };
}
