/**
 * Train system for rail network
 * Manages train spawning, movement, and rendering
 */

import { Train, TrainType, CarDirection, TILE_WIDTH, TILE_HEIGHT } from './types';
import { Tile } from '@/types/game';
import { DIRECTION_META } from './constants';

// Train colors
export const PASSENGER_TRAIN_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981'];
export const FREIGHT_TRAIN_COLORS = ['#dc2626', '#f97316', '#64748b', '#78716c'];

// Train configuration
export const TRAIN_BASE_SPEED = 0.4;
export const PASSENGER_TRAIN_CARRIAGES = 3; // 3 additional carriages (4 total including lead)
export const FREIGHT_TRAIN_CARRIAGES = 5; // 5 additional carriages (6 total including lead)
export const CARRIAGE_SPACING = 0.85; // Distance between carriages in tiles

/**
 * Check if a tile has rail tracks
 */
export function isRailTile(grid: Tile[][], gridSize: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
  return grid[y]?.[x]?.building.type === 'rail';
}

/**
 * Get valid movement directions from a rail tile
 */
export function getRailDirections(grid: Tile[][], gridSize: number, x: number, y: number): CarDirection[] {
  const directions: CarDirection[] = [];
  
  if (isRailTile(grid, gridSize, x - 1, y)) directions.push('north');
  if (isRailTile(grid, gridSize, x, y - 1)) directions.push('east');
  if (isRailTile(grid, gridSize, x + 1, y)) directions.push('south');
  if (isRailTile(grid, gridSize, x, y + 1)) directions.push('west');
  
  return directions;
}

/**
 * Pick next direction for train movement, preferring to go straight
 */
export function pickNextRailDirection(
  currentDirection: CarDirection,
  grid: Tile[][],
  gridSize: number,
  tileX: number,
  tileY: number
): CarDirection | null {
  const options = getRailDirections(grid, gridSize, tileX, tileY);
  
  if (options.length === 0) return null;
  
  // Prefer continuing in the same direction
  if (options.includes(currentDirection)) {
    return currentDirection;
  }
  
  // Otherwise pick a random valid direction
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Find all rail stations on the map
 */
export function findRailStations(grid: Tile[][], gridSize: number): { x: number; y: number }[] {
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
 * Find path on rails between two points using BFS
 */
export function findPathOnRails(
  grid: Tile[][],
  gridSize: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): { x: number; y: number }[] | null {
  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [
    { x: startX, y: startY, path: [{ x: startX, y: startY }] }
  ];
  const visited = new Set<string>();
  visited.add(`${startX},${startY}`);
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current.x === endX && current.y === endY) {
      return current.path;
    }
    
    const neighbors = getRailDirections(grid, gridSize, current.x, current.y);
    const meta = {
      north: { x: current.x - 1, y: current.y },
      east: { x: current.x, y: current.y - 1 },
      south: { x: current.x + 1, y: current.y },
      west: { x: current.x, y: current.y + 1 },
    };
    
    for (const dir of neighbors) {
      const next = meta[dir];
      const key = `${next.x},${next.y}`;
      
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({
          x: next.x,
          y: next.y,
          path: [...current.path, { x: next.x, y: next.y }]
        });
      }
    }
  }
  
  return null;
}

/**
 * Spawn a random train on the rail network
 */
export function spawnRandomTrain(
  grid: Tile[][],
  gridSize: number,
  trainIdRef: React.MutableRefObject<number>,
  type: TrainType = Math.random() < 0.5 ? 'passenger' : 'freight'
): Train | null {
  // Try to find a random rail tile
  for (let attempt = 0; attempt < 30; attempt++) {
    const tileX = Math.floor(Math.random() * gridSize);
    const tileY = Math.floor(Math.random() * gridSize);
    
    if (!isRailTile(grid, gridSize, tileX, tileY)) continue;
    
    const directions = getRailDirections(grid, gridSize, tileX, tileY);
    if (directions.length === 0) continue;
    
    const direction = directions[Math.floor(Math.random() * directions.length)];
    
    // Create carriages
    const numCarriages = type === 'passenger' ? PASSENGER_TRAIN_CARRIAGES : FREIGHT_TRAIN_CARRIAGES;
    const carriages = [];
    for (let i = 0; i < numCarriages; i++) {
      carriages.push({
        offsetProgress: -(i + 1) * CARRIAGE_SPACING,
        type,
      });
    }
    
    const colors = type === 'passenger' ? PASSENGER_TRAIN_COLORS : FREIGHT_TRAIN_COLORS;
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Build a path - try to create a loop or long journey
    const stations = findRailStations(grid, gridSize);
    let path: { x: number; y: number }[] = [{ x: tileX, y: tileY }];
    
    if (stations.length > 0) {
      const targetStation = stations[Math.floor(Math.random() * stations.length)];
      const foundPath = findPathOnRails(grid, gridSize, tileX, tileY, targetStation.x, targetStation.y);
      if (foundPath && foundPath.length > 1) {
        path = foundPath;
      }
    }
    
    return {
      id: trainIdRef.current++,
      type,
      tileX,
      tileY,
      direction,
      progress: Math.random() * 0.5,
      speed: TRAIN_BASE_SPEED + Math.random() * 0.15,
      age: 0,
      maxAge: 120 + Math.random() * 60, // 2-3 minutes lifespan
      color,
      carriages,
      path,
      pathIndex: 0,
    };
  }
  
  return null;
}

/**
 * Update all trains
 */
export function updateTrains(
  trains: Train[],
  grid: Tile[][],
  gridSize: number,
  delta: number,
  speedMultiplier: number
): Train[] {
  const updatedTrains: Train[] = [];
  
  for (const train of trains) {
    train.age += delta * speedMultiplier;
    
    // Remove old trains
    if (train.age > train.maxAge) {
      continue;
    }
    
    // Check if still on rail
    if (!isRailTile(grid, gridSize, train.tileX, train.tileY)) {
      continue;
    }
    
    // Move train
    train.progress += train.speed * delta * speedMultiplier;
    
    // Handle tile transitions
    while (train.progress >= 1) {
      const meta = DIRECTION_META[train.direction];
      const newTileX = train.tileX + meta.step.x;
      const newTileY = train.tileY + meta.step.y;
      
      // Check if next tile is valid rail
      if (!isRailTile(grid, gridSize, newTileX, newTileY)) {
        // Turn around or find new direction
        const options = getRailDirections(grid, gridSize, train.tileX, train.tileY);
        if (options.length > 0) {
          const otherOptions = options.filter(d => d !== train.direction);
          train.direction = otherOptions.length > 0
            ? otherOptions[Math.floor(Math.random() * otherOptions.length)]
            : options[Math.floor(Math.random() * options.length)];
          train.progress = 0.1;
        } else {
          // Stuck, remove train
          break;
        }
        continue;
      }
      
      // Move to new tile
      train.tileX = newTileX;
      train.tileY = newTileY;
      train.progress -= 1;
      
      // Pick next direction
      const nextDirection = pickNextRailDirection(train.direction, grid, gridSize, train.tileX, train.tileY);
      if (nextDirection) {
        train.direction = nextDirection;
      }
    }
    
    updatedTrains.push(train);
  }
  
  return updatedTrains;
}

/**
 * Draw a single train carriage
 */
function drawCarriage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  type: TrainType,
  color: string,
  isLead: boolean
) {
  const scale = 0.65;
  const length = type === 'passenger' ? 18 : 16;
  const width = type === 'passenger' ? 7 : 6;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  
  // Main body
  ctx.fillStyle = color;
  ctx.fillRect(-length * scale, -width * scale / 2, length * 2 * scale, width * scale);
  
  // Windows/cargo markings
  if (type === 'passenger') {
    // Windows
    ctx.fillStyle = 'rgba(200, 220, 255, 0.8)';
    const windowCount = 4;
    const windowWidth = (length * 2 * scale - 8) / windowCount;
    for (let i = 0; i < windowCount; i++) {
      ctx.fillRect(-length * scale + 4 + i * windowWidth, -width * scale / 2 + 1, windowWidth - 2, width * scale - 2);
    }
  } else {
    // Cargo panels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    const panelCount = 3;
    for (let i = 1; i < panelCount; i++) {
      const x = -length * scale + (length * 2 * scale / panelCount) * i;
      ctx.beginPath();
      ctx.moveTo(x, -width * scale / 2);
      ctx.lineTo(x, width * scale / 2);
      ctx.stroke();
    }
  }
  
  // Roof detail
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(-length * scale, -width * scale / 2 - 1.5, length * 2 * scale, 1.5);
  
  // If lead carriage, add front detail
  if (isLead) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(length * scale, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Wheels (simplified)
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-length * scale + 2, width * scale / 2, 3, 2);
  ctx.fillRect(length * scale - 5, width * scale / 2, 3, 2);
  ctx.fillRect(-length * scale + 2, -width * scale / 2 - 2, 3, 2);
  ctx.fillRect(length * scale - 5, -width * scale / 2 - 2, 3, 2);
  
  ctx.restore();
}

/**
 * Draw all trains
 */
export function drawTrains(
  ctx: CanvasRenderingContext2D,
  trains: Train[],
  grid: Tile[][],
  gridSize: number,
  offset: { x: number; y: number },
  zoom: number,
  dpr: number
) {
  for (const train of trains) {
    const centerX = train.tileX * TILE_WIDTH + TILE_WIDTH / 2;
    const centerY = train.tileY * TILE_HEIGHT + TILE_HEIGHT / 2;
    
    const meta = DIRECTION_META[train.direction];
    
    // Calculate lead carriage position
    const leadX = centerX + meta.vec.dx * train.progress;
    const leadY = centerY + meta.vec.dy * train.progress;
    
    // Draw lead carriage
    drawCarriage(ctx, leadX, leadY, meta.angle, train.type, train.color, true);
    
    // Draw trailing carriages
    for (const carriage of train.carriages) {
      // Calculate position with offset
      const totalProgress = train.progress + carriage.offsetProgress;
      let carriageTileX = train.tileX;
      let carriageTileY = train.tileY;
      let carriageProgress = totalProgress;
      let carriageDirection = train.direction;
      
      // Walk backwards along the path to find carriage position
      while (carriageProgress < 0 && (carriageTileX !== train.tileX || carriageTileY !== train.tileY || carriageProgress !== totalProgress)) {
        // Move to previous tile
        const oppositeMeta = DIRECTION_META[{
          north: 'south' as CarDirection,
          south: 'north' as CarDirection,
          east: 'west' as CarDirection,
          west: 'east' as CarDirection,
        }[carriageDirection]];
        
        carriageTileX += oppositeMeta.step.x;
        carriageTileY += oppositeMeta.step.y;
        carriageProgress += 1;
        
        // Try to find what direction we were coming from
        const dirs = getRailDirections(grid, gridSize, carriageTileX, carriageTileY);
        if (dirs.length > 0) {
          // Pick the direction that leads back toward where we came from
          const backDir = dirs.find(d => {
            const m = DIRECTION_META[d];
            return (carriageTileX + m.step.x === carriageTileX - oppositeMeta.step.x &&
                    carriageTileY + m.step.y === carriageTileY - oppositeMeta.step.y);
          });
          if (backDir) carriageDirection = backDir;
        }
      }
      
      // Ensure positive progress
      if (carriageProgress < 0) carriageProgress = 0;
      if (carriageProgress > 1) carriageProgress = 1;
      
      const carriageMeta = DIRECTION_META[carriageDirection];
      const carriageCenterX = carriageTileX * TILE_WIDTH + TILE_WIDTH / 2;
      const carriageCenterY = carriageTileY * TILE_HEIGHT + TILE_HEIGHT / 2;
      const carriageX = carriageCenterX + carriageMeta.vec.dx * carriageProgress;
      const carriageY = carriageCenterY + carriageMeta.vec.dy * carriageProgress;
      
      drawCarriage(ctx, carriageX, carriageY, carriageMeta.angle, train.type, train.color, false);
    }
  }
}
