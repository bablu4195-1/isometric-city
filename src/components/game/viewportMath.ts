export type Point = { x: number; y: number };

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getTouchDistance(
  touch1: Pick<Touch, 'clientX' | 'clientY'>,
  touch2: Pick<Touch, 'clientX' | 'clientY'>
): number {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getTouchCenter(
  touch1: Pick<Touch, 'clientX' | 'clientY'>,
  touch2: Pick<Touch, 'clientX' | 'clientY'>
): Point {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

export function getWheelZoomNext(
  currentZoom: number,
  deltaY: number,
  zoomMin: number,
  zoomMax: number,
  baseZoomDelta = 0.05
): number {
  // Match CanvasIsometricGrid feel: smaller base delta and scale by zoom.
  const scaledDelta = baseZoomDelta * Math.max(0.5, currentZoom); // Scale with zoom, min 0.5x
  const zoomDelta = deltaY > 0 ? -scaledDelta : scaledDelta;
  return clampNumber(currentZoom + zoomDelta, zoomMin, zoomMax);
}

/**
 * Given a zoom change, compute the new offset that keeps the same world
 * position pinned under a specific screen point (in container pixels).
 *
 * screen = world * zoom + offset  =>  world = (screen - offset) / zoom
 */
export function getOffsetForZoomAroundScreenPoint(params: {
  screen: Point;
  offset: Point;
  currentZoom: number;
  nextZoom: number;
}): Point {
  const { screen, offset, currentZoom, nextZoom } = params;

  const worldX = (screen.x - offset.x) / currentZoom;
  const worldY = (screen.y - offset.y) / currentZoom;

  return {
    x: screen.x - worldX * nextZoom,
    y: screen.y - worldY * nextZoom,
  };
}

