import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

/**
 * Calculate camera bounds based on grid size
 */
export function getMapBounds(
  gridSize: number,
  currentZoom: number,
  canvasW: number,
  canvasH: number
) {
  const n = gridSize;
  const padding = 100; // Allow some over-scroll
  
  // Map bounds in world coordinates
  const mapLeft = -(n - 1) * TILE_WIDTH / 2;
  const mapRight = (n - 1) * TILE_WIDTH / 2;
  const mapTop = 0;
  const mapBottom = (n - 1) * TILE_HEIGHT;
  
  const minOffsetX = padding - mapRight * currentZoom;
  const maxOffsetX = canvasW - padding - mapLeft * currentZoom;
  const minOffsetY = padding - mapBottom * currentZoom;
  const maxOffsetY = canvasH - padding - mapTop * currentZoom;
  
  return { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY };
}

/**
 * Clamp offset to keep camera within reasonable bounds
 */
export function clampOffset(
  newOffset: { x: number; y: number },
  gridSize: number,
  currentZoom: number,
  canvasW: number,
  canvasH: number
) {
  const bounds = getMapBounds(gridSize, currentZoom, canvasW, canvasH);
  return {
    x: Math.max(bounds.minOffsetX, Math.min(bounds.maxOffsetX, newOffset.x)),
    y: Math.max(bounds.minOffsetY, Math.min(bounds.maxOffsetY, newOffset.y)),
  };
}
