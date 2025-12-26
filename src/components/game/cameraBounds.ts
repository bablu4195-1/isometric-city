import { TILE_HEIGHT, TILE_WIDTH } from '@/components/game/types';

export type CameraOffset = { x: number; y: number };

export type MapBounds = {
  minOffsetX: number;
  maxOffsetX: number;
  minOffsetY: number;
  maxOffsetY: number;
};

/**
 * Compute camera pan bounds for an isometric grid.
 * Bounds are returned in screen-pixel offset space (same units as `offset` in CanvasIsometricGrid).
 */
export function getIsometricMapBounds(params: {
  gridSize: number;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  padding?: number;
}): MapBounds {
  const { gridSize, zoom, canvasWidth, canvasHeight } = params;
  const padding = params.padding ?? 100;

  const n = gridSize;

  // Map bounds in world coordinates
  const mapLeft = -(n - 1) * TILE_WIDTH / 2;
  const mapRight = (n - 1) * TILE_WIDTH / 2;
  const mapTop = 0;
  const mapBottom = (n - 1) * TILE_HEIGHT;

  const minOffsetX = padding - mapRight * zoom;
  const maxOffsetX = canvasWidth - padding - mapLeft * zoom;
  const minOffsetY = padding - mapBottom * zoom;
  const maxOffsetY = canvasHeight - padding - mapTop * zoom;

  return { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY };
}

export function clampOffsetToBounds(offset: CameraOffset, bounds: MapBounds): CameraOffset {
  return {
    x: Math.max(bounds.minOffsetX, Math.min(bounds.maxOffsetX, offset.x)),
    y: Math.max(bounds.minOffsetY, Math.min(bounds.maxOffsetY, offset.y)),
  };
}

export function clampOffsetToIsometricMap(
  offset: CameraOffset,
  params: Parameters<typeof getIsometricMapBounds>[0]
): CameraOffset {
  return clampOffsetToBounds(offset, getIsometricMapBounds(params));
}

