/**
 * Rail System - Railway tracks and trains
 * Handles rail track drawing with 2 tracks per tile and train movement
 */

import { Tile } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT, CarDirection } from './types';

// ============================================================================
// Types
// ============================================================================

/** Train vehicle type */
export type Train = {
  id: number;
  tileX: number;
  tileY: number;
  direction: CarDirection;
  progress: number;
  speed: number;
  age: number;
  maxAge: number;
  color: string;
  // Train-specific properties
  length: number; // Number of cars
  carPositions: { tileX: number; tileY: number; progress: number; direction: CarDirection }[];
};

/** Rail adjacency info */
export interface RailAdjacency {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Train colors */
export const TRAIN_COLORS = [
  '#1e40af', // Blue
  '#dc2626', // Red
  '#059669', // Green
  '#7c3aed', // Purple
  '#ea580c', // Orange
  '#0891b2', // Cyan
];

/** Rail rendering colors */
export const RAIL_COLORS = {
  BALLAST: '#6b7280',      // Gravel/stone base
  BALLAST_DARK: '#4b5563', // Darker ballast
  SLEEPER: '#78350f',      // Wooden sleepers (ties)
  RAIL: '#9ca3af',         // Metal rails
  RAIL_SHINE: '#d1d5db',   // Rail highlight
};

/** Rail configuration */
export const RAIL_CONFIG = {
  TRACK_SPACING: 0.18,     // Distance between the two tracks (fraction of tile width)
  RAIL_WIDTH: 0.015,       // Width of each rail (fraction of tile width)
  SLEEPER_WIDTH: 0.08,     // Width of sleepers
  SLEEPER_SPACING: 0.12,   // Spacing between sleepers
  BALLAST_WIDTH: 0.28,     // Width of ballast bed
};

// ============================================================================
// Rail Analysis Functions
// ============================================================================

/**
 * Check if a tile is a rail
 */
export function isRail(grid: Tile[][], gridSize: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
  return grid[y][x].building.type === 'rail';
}

/**
 * Check if a tile is a rail station
 */
export function isRailStation(grid: Tile[][], gridSize: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
  return grid[y][x].building.type === 'rail_station';
}

/**
 * Check if a tile has rail track (rail or rail_station)
 */
export function hasRailTrack(grid: Tile[][], gridSize: number, x: number, y: number): boolean {
  return isRail(grid, gridSize, x, y) || isRailStation(grid, gridSize, x, y);
}

/**
 * Get adjacent rail info for a tile
 */
export function getAdjacentRails(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): RailAdjacency {
  return {
    north: hasRailTrack(grid, gridSize, x - 1, y),
    east: hasRailTrack(grid, gridSize, x, y - 1),
    south: hasRailTrack(grid, gridSize, x + 1, y),
    west: hasRailTrack(grid, gridSize, x, y + 1),
  };
}

/**
 * Get direction options for train movement from a rail tile
 */
export function getRailDirectionOptions(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): CarDirection[] {
  const options: CarDirection[] = [];
  if (hasRailTrack(grid, gridSize, x - 1, y)) options.push('north');
  if (hasRailTrack(grid, gridSize, x, y - 1)) options.push('east');
  if (hasRailTrack(grid, gridSize, x + 1, y)) options.push('south');
  if (hasRailTrack(grid, gridSize, x, y + 1)) options.push('west');
  return options;
}

// ============================================================================
// Rail Drawing Functions
// ============================================================================

/**
 * Draw a single rail track segment from start to end
 * This draws both rails of the track with proper spacing
 */
function drawRailTrackSegment(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  trackOffset: number, // Perpendicular offset from center line
  zoom: number
): void {
  // Calculate direction vector
  const dx = endX - startX;
  const dy = endY - startY;
  const len = Math.hypot(dx, dy);
  if (len < 0.1) return;
  
  const dirX = dx / len;
  const dirY = dy / len;
  
  // Perpendicular vector
  const perpX = -dirY;
  const perpY = dirX;
  
  const railSpacing = TILE_WIDTH * 0.025; // Space between the two rails of one track
  const railWidth = Math.max(1, TILE_WIDTH * RAIL_CONFIG.RAIL_WIDTH * zoom);
  
  // Apply track offset to get actual track center
  const trackCenterX = (startX + endX) / 2 + perpX * trackOffset;
  const trackCenterY = (startY + endY) / 2 + perpY * trackOffset;
  
  // Calculate offset start and end points
  const offsetStartX = startX + perpX * trackOffset;
  const offsetStartY = startY + perpY * trackOffset;
  const offsetEndX = endX + perpX * trackOffset;
  const offsetEndY = endY + perpY * trackOffset;
  
  // Draw sleepers (wooden ties) first
  if (zoom >= 0.5) {
    ctx.fillStyle = RAIL_COLORS.SLEEPER;
    const sleeperCount = Math.max(3, Math.floor(len / (TILE_WIDTH * RAIL_CONFIG.SLEEPER_SPACING)));
    const sleeperWidth = TILE_WIDTH * RAIL_CONFIG.SLEEPER_WIDTH;
    const sleeperLength = railSpacing * 3;
    
    for (let i = 0; i < sleeperCount; i++) {
      const t = (i + 0.5) / sleeperCount;
      const sx = offsetStartX + (offsetEndX - offsetStartX) * t;
      const sy = offsetStartY + (offsetEndY - offsetStartY) * t;
      
      // Draw sleeper as a small rectangle perpendicular to track
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.atan2(dirY, dirX));
      ctx.fillRect(-sleeperWidth / 2, -sleeperLength / 2, sleeperWidth, sleeperLength);
      ctx.restore();
    }
  }
  
  // Draw the two rails
  ctx.strokeStyle = RAIL_COLORS.RAIL;
  ctx.lineWidth = railWidth;
  ctx.lineCap = 'round';
  
  // Left rail
  ctx.beginPath();
  ctx.moveTo(offsetStartX + perpX * railSpacing, offsetStartY + perpY * railSpacing);
  ctx.lineTo(offsetEndX + perpX * railSpacing, offsetEndY + perpY * railSpacing);
  ctx.stroke();
  
  // Right rail
  ctx.beginPath();
  ctx.moveTo(offsetStartX - perpX * railSpacing, offsetStartY - perpY * railSpacing);
  ctx.lineTo(offsetEndX - perpX * railSpacing, offsetEndY - perpY * railSpacing);
  ctx.stroke();
  
  // Draw rail shine/highlight when zoomed in
  if (zoom >= 0.7) {
    ctx.strokeStyle = RAIL_COLORS.RAIL_SHINE;
    ctx.lineWidth = Math.max(0.5, railWidth * 0.4);
    
    // Left rail shine
    ctx.beginPath();
    ctx.moveTo(offsetStartX + perpX * railSpacing, offsetStartY + perpY * railSpacing - 0.5);
    ctx.lineTo(offsetEndX + perpX * railSpacing, offsetEndY + perpY * railSpacing - 0.5);
    ctx.stroke();
    
    // Right rail shine
    ctx.beginPath();
    ctx.moveTo(offsetStartX - perpX * railSpacing, offsetStartY - perpY * railSpacing - 0.5);
    ctx.lineTo(offsetEndX - perpX * railSpacing, offsetEndY - perpY * railSpacing - 0.5);
    ctx.stroke();
  }
}

/**
 * Draw ballast (gravel bed) for the rail track
 */
function drawBallast(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  adj: RailAdjacency
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = x + w / 2;
  const cy = y + h / 2;
  
  const ballastWidth = w * RAIL_CONFIG.BALLAST_WIDTH;
  
  // Edge midpoints
  const northEdgeX = x + w * 0.25;
  const northEdgeY = y + h * 0.25;
  const eastEdgeX = x + w * 0.75;
  const eastEdgeY = y + h * 0.25;
  const southEdgeX = x + w * 0.75;
  const southEdgeY = y + h * 0.75;
  const westEdgeX = x + w * 0.25;
  const westEdgeY = y + h * 0.75;
  
  ctx.fillStyle = RAIL_COLORS.BALLAST;
  
  // Helper to calculate perpendicular offset points
  const getPerp = (fromX: number, fromY: number, toX: number, toY: number) => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.hypot(dx, dy);
    return { nx: -dy / len, ny: dx / len };
  };
  
  // Draw ballast segments to each connected direction
  if (adj.north) {
    const perp = getPerp(cx, cy, northEdgeX, northEdgeY);
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * ballastWidth, cy + perp.ny * ballastWidth);
    ctx.lineTo(northEdgeX + perp.nx * ballastWidth, northEdgeY + perp.ny * ballastWidth);
    ctx.lineTo(northEdgeX - perp.nx * ballastWidth, northEdgeY - perp.ny * ballastWidth);
    ctx.lineTo(cx - perp.nx * ballastWidth, cy - perp.ny * ballastWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  if (adj.east) {
    const perp = getPerp(cx, cy, eastEdgeX, eastEdgeY);
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * ballastWidth, cy + perp.ny * ballastWidth);
    ctx.lineTo(eastEdgeX + perp.nx * ballastWidth, eastEdgeY + perp.ny * ballastWidth);
    ctx.lineTo(eastEdgeX - perp.nx * ballastWidth, eastEdgeY - perp.ny * ballastWidth);
    ctx.lineTo(cx - perp.nx * ballastWidth, cy - perp.ny * ballastWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  if (adj.south) {
    const perp = getPerp(cx, cy, southEdgeX, southEdgeY);
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * ballastWidth, cy + perp.ny * ballastWidth);
    ctx.lineTo(southEdgeX + perp.nx * ballastWidth, southEdgeY + perp.ny * ballastWidth);
    ctx.lineTo(southEdgeX - perp.nx * ballastWidth, southEdgeY - perp.ny * ballastWidth);
    ctx.lineTo(cx - perp.nx * ballastWidth, cy - perp.ny * ballastWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  if (adj.west) {
    const perp = getPerp(cx, cy, westEdgeX, westEdgeY);
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * ballastWidth, cy + perp.ny * ballastWidth);
    ctx.lineTo(westEdgeX + perp.nx * ballastWidth, westEdgeY + perp.ny * ballastWidth);
    ctx.lineTo(westEdgeX - perp.nx * ballastWidth, westEdgeY - perp.ny * ballastWidth);
    ctx.lineTo(cx - perp.nx * ballastWidth, cy - perp.ny * ballastWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  // Center diamond for intersection
  const centerSize = ballastWidth * 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - centerSize);
  ctx.lineTo(cx + centerSize, cy);
  ctx.lineTo(cx, cy + centerSize);
  ctx.lineTo(cx - centerSize, cy);
  ctx.closePath();
  ctx.fill();
}

/**
 * Main rail drawing function
 * Draws two parallel rail tracks that respond to adjacent rail tiles
 */
export function drawRail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gridX: number,
  gridY: number,
  grid: Tile[][],
  gridSize: number,
  zoom: number
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = x + w / 2;
  const cy = y + h / 2;
  
  // Get adjacent rails
  const adj = getAdjacentRails(grid, gridSize, gridX, gridY);
  
  // Edge midpoints (where tracks connect to adjacent tiles)
  const northEdgeX = x + w * 0.25;
  const northEdgeY = y + h * 0.25;
  const eastEdgeX = x + w * 0.75;
  const eastEdgeY = y + h * 0.25;
  const southEdgeX = x + w * 0.75;
  const southEdgeY = y + h * 0.75;
  const westEdgeX = x + w * 0.25;
  const westEdgeY = y + h * 0.75;
  
  // Track offset - distance from center line for each of the two tracks
  // CAREFULLY CALCULATED: Each track should be positioned so they line up at tile edges
  const trackOffset = w * RAIL_CONFIG.TRACK_SPACING / 2;
  
  // Draw ballast (gravel base) first
  drawBallast(ctx, x, y, adj);
  
  // Count connections to determine track layout
  const connectionCount = [adj.north, adj.east, adj.south, adj.west].filter(Boolean).length;
  
  // If no connections, draw a simple NS or EW track segment
  if (connectionCount === 0) {
    // Default to NS track when isolated
    drawRailTrackSegment(ctx, cx, cy - h * 0.3, cx, cy + h * 0.3, trackOffset, zoom);
    drawRailTrackSegment(ctx, cx, cy - h * 0.3, cx, cy + h * 0.3, -trackOffset, zoom);
    return;
  }
  
  // For straight tracks (2 opposite connections), draw continuous tracks
  if (connectionCount === 2 && adj.north === adj.south && adj.east === adj.west) {
    if (adj.north && adj.south) {
      // N-S straight track
      // Track 1 (offset left when going north)
      drawRailTrackSegment(ctx, northEdgeX, northEdgeY, southEdgeX, southEdgeY, trackOffset, zoom);
      // Track 2 (offset right when going north)
      drawRailTrackSegment(ctx, northEdgeX, northEdgeY, southEdgeX, southEdgeY, -trackOffset, zoom);
    } else if (adj.east && adj.west) {
      // E-W straight track
      // Track 1
      drawRailTrackSegment(ctx, eastEdgeX, eastEdgeY, westEdgeX, westEdgeY, trackOffset, zoom);
      // Track 2
      drawRailTrackSegment(ctx, eastEdgeX, eastEdgeY, westEdgeX, westEdgeY, -trackOffset, zoom);
    }
    return;
  }
  
  // For corners and intersections, draw tracks to each connected direction
  // The tracks curve through the center
  
  // Helper to get edge point for a direction
  const getEdgePoint = (dir: 'north' | 'east' | 'south' | 'west') => {
    switch (dir) {
      case 'north': return { x: northEdgeX, y: northEdgeY };
      case 'east': return { x: eastEdgeX, y: eastEdgeY };
      case 'south': return { x: southEdgeX, y: southEdgeY };
      case 'west': return { x: westEdgeX, y: westEdgeY };
    }
  };
  
  // Helper to get perpendicular offset for a direction (which way to offset track)
  // This ensures tracks line up properly at tile boundaries
  const getTrackOffsetForDir = (dir: 'north' | 'east' | 'south' | 'west', isLeftTrack: boolean) => {
    // In isometric view:
    // - North direction goes to top-left
    // - East direction goes to top-right
    // - South direction goes to bottom-right
    // - West direction goes to bottom-left
    
    // For proper track alignment, we need consistent offsets
    const edgePt = getEdgePoint(dir);
    const dx = edgePt.x - cx;
    const dy = edgePt.y - cy;
    const len = Math.hypot(dx, dy);
    const perpX = -dy / len;
    const perpY = dx / len;
    
    const offset = isLeftTrack ? trackOffset : -trackOffset;
    return { perpX: perpX * offset, perpY: perpY * offset };
  };
  
  // Draw track segments from center to each connected edge
  const connectedDirs: ('north' | 'east' | 'south' | 'west')[] = [];
  if (adj.north) connectedDirs.push('north');
  if (adj.east) connectedDirs.push('east');
  if (adj.south) connectedDirs.push('south');
  if (adj.west) connectedDirs.push('west');
  
  // For each connected direction, draw both tracks
  for (const dir of connectedDirs) {
    const edgePt = getEdgePoint(dir);
    
    // Draw track 1 (left track when facing that direction)
    drawRailTrackSegment(ctx, cx, cy, edgePt.x, edgePt.y, trackOffset, zoom);
    // Draw track 2 (right track)
    drawRailTrackSegment(ctx, cx, cy, edgePt.x, edgePt.y, -trackOffset, zoom);
  }
}

/**
 * Draw a train on the tracks
 */
export function drawTrain(
  ctx: CanvasRenderingContext2D,
  train: Train,
  offsetX: number,
  offsetY: number,
  zoom: number
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  
  // Calculate screen position based on tile and progress
  const tileScreenX = (train.tileX - train.tileY) * (w / 2) + offsetX;
  const tileScreenY = (train.tileX + train.tileY) * (h / 2) + offsetY;
  
  const cx = tileScreenX + w / 2;
  const cy = tileScreenY + h / 2;
  
  // Direction vectors for movement
  const dirVectors: Record<CarDirection, { dx: number; dy: number; angle: number }> = {
    north: { dx: -w / 2, dy: -h / 2, angle: -Math.PI * 0.75 },
    east: { dx: w / 2, dy: -h / 2, angle: -Math.PI * 0.25 },
    south: { dx: w / 2, dy: h / 2, angle: Math.PI * 0.25 },
    west: { dx: -w / 2, dy: h / 2, angle: Math.PI * 0.75 },
  };
  
  const dir = dirVectors[train.direction];
  const trainX = cx + dir.dx * train.progress;
  const trainY = cy + dir.dy * train.progress;
  
  ctx.save();
  ctx.translate(trainX, trainY);
  ctx.rotate(dir.angle);
  
  // Draw train body (locomotive)
  const scale = 0.7;
  const bodyLength = 16 * scale;
  const bodyWidth = 8 * scale;
  
  // Main body
  ctx.fillStyle = train.color;
  ctx.beginPath();
  ctx.roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, 2);
  ctx.fill();
  
  // Cab section (darker)
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-bodyLength / 2 + 2, -bodyWidth / 2 + 1, 5 * scale, bodyWidth - 2);
  
  // Windows
  ctx.fillStyle = 'rgba(135, 206, 250, 0.8)';
  ctx.fillRect(-bodyLength / 2 + 3, -bodyWidth / 2 + 2, 3 * scale, 2 * scale);
  ctx.fillRect(-bodyLength / 2 + 3, bodyWidth / 2 - 4, 3 * scale, 2 * scale);
  
  // Front light
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(bodyLength / 2 - 2, 0, 1.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  // Wheels (simplified as dark rectangles)
  ctx.fillStyle = '#374151';
  ctx.fillRect(-bodyLength / 2 + 2, -bodyWidth / 2 - 1, 3 * scale, 2);
  ctx.fillRect(-bodyLength / 2 + 2, bodyWidth / 2 - 1, 3 * scale, 2);
  ctx.fillRect(bodyLength / 2 - 5, -bodyWidth / 2 - 1, 3 * scale, 2);
  ctx.fillRect(bodyLength / 2 - 5, bodyWidth / 2 - 1, 3 * scale, 2);
  
  ctx.restore();
}

// ============================================================================
// Train Management Functions
// ============================================================================

const OPPOSITE_DIRECTION: Record<CarDirection, CarDirection> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

/**
 * Pick next direction for train movement
 */
export function pickNextTrainDirection(
  previousDirection: CarDirection,
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): CarDirection | null {
  const options = getRailDirectionOptions(grid, gridSize, x, y);
  if (options.length === 0) return null;
  
  // Prefer not going back the way we came
  const incoming = OPPOSITE_DIRECTION[previousDirection];
  const filtered = options.filter(dir => dir !== incoming);
  const pool = filtered.length > 0 ? filtered : options;
  
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Find rail stations in the grid
 */
export function findRailStations(
  grid: Tile[][],
  gridSize: number
): { x: number; y: number }[] {
  const stations: { x: number; y: number }[] = [];
  
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (grid[y][x].building.type === 'rail_station') {
        stations.push({ x, y });
      }
    }
  }
  
  return stations;
}

/**
 * Find all rail tiles in the grid
 */
export function findRailTiles(
  grid: Tile[][],
  gridSize: number
): { x: number; y: number }[] {
  const rails: { x: number; y: number }[] = [];
  
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (hasRailTrack(grid, gridSize, x, y)) {
        rails.push({ x, y });
      }
    }
  }
  
  return rails;
}
