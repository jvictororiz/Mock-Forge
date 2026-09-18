export function computeMirrorIdealWidth(
  videoWidth: number,
  videoHeight: number,
  viewportHeight: number,
  minWidth: number,
  maxWidth: number,
): number {
  if (videoWidth <= 0 || videoHeight <= 0 || viewportHeight <= 0) {
    return minWidth;
  }

  const ideal = Math.round(viewportHeight * (videoWidth / videoHeight));
  return Math.min(maxWidth, Math.max(minWidth, ideal));
}
