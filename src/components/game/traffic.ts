/**
 * Traffic System - Advanced road rendering and traffic light management
 * Handles multi-lane roads, medians, turn lanes, and traffic light cycles
 */

import { Tile } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT, CarDirection } from './types';

// ============================================================================
// Types
// ============================================================================

/** Traffic light state */
export type TrafficLightPhase = 'green_ns' | 'yellow_ns' | 'green_ew' | 'yellow_ew';

/** Road configuration based on adjacency */
export type RoadConfig = {
  /** Number of lanes in each direction */
  lanes: number;
  /** Whether this is part of a merged avenue */
  isAvenue: boolean;
  /** Which side has the median (for single tiles of an avenue) */
  medianSide: 'north' | 'east' | 'south' | 'west' | null;
  /** Is this an intersection */
  isIntersection: boolean;
  /** Number of connecting roads (for intersection type) */
  connectionCount: number;
  /** Which directions connect */
  connections: { north: boolean; east: boolean; south: boolean; west: boolean };
};

/** Traffic light state at an intersection */
export type TrafficLight = {
  tileX: number;
  tileY: number;
  phase: TrafficLightPhase;
  timer: number;
};

/** Avenue tile - represents a merged 2-wide road */
export type AvenueTile = {
  x: number;
  y: number;
  direction: 'horizontal' | 'vertical';
  partnerX: number;
  partnerY: number;
};

// ============================================================================
// Constants
// ============================================================================

/** Traffic light timing in seconds */
export const TRAFFIC_LIGHT_TIMING = {
  green: 8.0,   // Long green phase for smooth traffic flow
  yellow: 2.0,  // Short yellow warning
} as const;

/** Road rendering constants */
export const ROAD_CONFIG = {
  // Standard road dimensions
  roadWidthRatio: 0.28,  // Road width as fraction of tile (wider for lanes)
  laneWidth: 0.12,       // Width of a single lane
  
  // Lane markings
  laneMarkingColor: '#fbbf24',  // Yellow center line
  edgeMarkingColor: '#ffffff',  // White edge lines
  laneMarkingWidth: 0.8,
  
  // Median/divider
  medianWidth: 0.08,
  medianColor: '#4a7c3f',       // Green for planted median
  medianBorderColor: '#6b7280', // Grey curb
  
  // Sidewalk
  sidewalkWidth: 0.08,
  sidewalkColor: '#9ca3af',
  curbColor: '#6b7280',
  
  // Turn lane indicators
  turnArrowColor: '#ffffff',
  
  // Asphalt colors
  asphaltColor: '#4a4a4a',
  asphaltDarkColor: '#3a3a3a',
  
  // Edge stop for road extension to tile edge
  edgeStop: 0.98,
} as const;

/** Traffic light colors */
export const TRAFFIC_LIGHT_COLORS = {
  red: '#ef4444',
  yellow: '#fbbf24',
  green: '#22c55e',
  housing: '#374151',  // Dark grey for the light housing
  pole: '#6b7280',     // Grey for the pole
} as const;

// ============================================================================
// Road Classification Functions
// ============================================================================

/**
 * Check if a tile at (x, y) is a road
 */
export function isRoad(grid: Tile[][], gridSize: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
  return grid[y]?.[x]?.building.type === 'road';
}

/**
 * Get road adjacency information
 */
export function getRoadAdjacency(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): { north: boolean; east: boolean; south: boolean; west: boolean } {
  return {
    north: isRoad(grid, gridSize, x - 1, y),
    east: isRoad(grid, gridSize, x, y - 1),
    south: isRoad(grid, gridSize, x + 1, y),
    west: isRoad(grid, gridSize, x, y + 1),
  };
}

/**
 * Check if this road tile is part of a 2-wide avenue (parallel roads)
 * Returns information about the avenue configuration
 */
export function detectAvenue(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): AvenueTile | null {
  if (!isRoad(grid, gridSize, x, y)) return null;
  
  const adj = getRoadAdjacency(grid, gridSize, x, y);
  
  // Check for horizontal avenue (road to north AND road to north also has east/west connections)
  // This tile at (x,y) and tile at (x-1,y) form a horizontal avenue
  if (isRoad(grid, gridSize, x - 1, y)) {
    const partnerAdj = getRoadAdjacency(grid, gridSize, x - 1, y);
    // Both should have similar E-W connectivity and not be intersections
    const thisIsHorizontal = (adj.east || adj.west) && !adj.north;
    const partnerIsHorizontal = (partnerAdj.east || partnerAdj.west) && !partnerAdj.south;
    
    if (thisIsHorizontal && partnerIsHorizontal) {
      return {
        x,
        y,
        direction: 'horizontal',
        partnerX: x - 1,
        partnerY: y,
      };
    }
  }
  
  // Check for vertical avenue (road to east AND similar N-S connectivity)
  if (isRoad(grid, gridSize, x, y - 1)) {
    const partnerAdj = getRoadAdjacency(grid, gridSize, x, y - 1);
    // Both should have similar N-S connectivity and not be intersections
    const thisIsVertical = (adj.north || adj.south) && !adj.east;
    const partnerIsVertical = (partnerAdj.north || partnerAdj.south) && !partnerAdj.west;
    
    if (thisIsVertical && partnerIsVertical) {
      return {
        x,
        y,
        direction: 'vertical',
        partnerX: x,
        partnerY: y - 1,
      };
    }
  }
  
  return null;
}

/**
 * Get comprehensive road configuration for a tile
 */
export function getRoadConfig(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): RoadConfig {
  const adj = getRoadAdjacency(grid, gridSize, x, y);
  const connectionCount = [adj.north, adj.east, adj.south, adj.west].filter(Boolean).length;
  const isIntersection = connectionCount >= 3;
  
  // Check for avenue (2-wide road)
  const avenue = detectAvenue(grid, gridSize, x, y);
  
  let medianSide: 'north' | 'east' | 'south' | 'west' | null = null;
  if (avenue) {
    // Determine which side has the median based on avenue direction and position
    if (avenue.direction === 'horizontal') {
      medianSide = avenue.partnerX < x ? 'north' : 'south';
    } else {
      medianSide = avenue.partnerY < y ? 'east' : 'west';
    }
  }
  
  return {
    lanes: avenue ? 2 : 1,
    isAvenue: avenue !== null,
    medianSide,
    isIntersection,
    connectionCount,
    connections: adj,
  };
}

// ============================================================================
// Traffic Light Management
// ============================================================================

/**
 * Determine if a tile should have a traffic light
 * Only 3-way and 4-way intersections get traffic lights
 */
export function shouldHaveTrafficLight(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): boolean {
  if (!isRoad(grid, gridSize, x, y)) return false;
  
  const adj = getRoadAdjacency(grid, gridSize, x, y);
  const connectionCount = [adj.north, adj.east, adj.south, adj.west].filter(Boolean).length;
  
  return connectionCount >= 3;
}

/**
 * Update traffic light phase based on timing
 */
export function updateTrafficLightPhase(
  currentPhase: TrafficLightPhase,
  timer: number
): { phase: TrafficLightPhase; timer: number } {
  const timing = TRAFFIC_LIGHT_TIMING;
  
  switch (currentPhase) {
    case 'green_ns':
      if (timer >= timing.green) {
        return { phase: 'yellow_ns', timer: 0 };
      }
      break;
    case 'yellow_ns':
      if (timer >= timing.yellow) {
        return { phase: 'green_ew', timer: 0 };
      }
      break;
    case 'green_ew':
      if (timer >= timing.green) {
        return { phase: 'yellow_ew', timer: 0 };
      }
      break;
    case 'yellow_ew':
      if (timer >= timing.yellow) {
        return { phase: 'green_ns', timer: 0 };
      }
      break;
  }
  
  return { phase: currentPhase, timer };
}

/**
 * Check if a car can proceed through a traffic light
 */
export function canProceed(
  phase: TrafficLightPhase,
  carDirection: CarDirection
): boolean {
  const isNorthSouth = carDirection === 'north' || carDirection === 'south';
  const isEastWest = carDirection === 'east' || carDirection === 'west';
  
  if (phase === 'green_ns' || phase === 'yellow_ns') {
    return isNorthSouth;
  } else {
    return isEastWest;
  }
}

// ============================================================================
// Drawing Helpers
// ============================================================================

// Note: getDiamondCorners is already exported from drawing.ts

/**
 * Draw a simple traffic light pole at an intersection corner
 */
export function drawTrafficLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: TrafficLightPhase,
  corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
): void {
  const colors = TRAFFIC_LIGHT_COLORS;
  
  // Determine light position based on corner
  let lightX: number;
  let lightY: number;
  
  const offsetFromCenter = 8;
  const cornerOffsets = {
    topLeft: { dx: -offsetFromCenter, dy: -offsetFromCenter + 2 },
    topRight: { dx: offsetFromCenter, dy: -offsetFromCenter + 2 },
    bottomLeft: { dx: -offsetFromCenter, dy: offsetFromCenter - 2 },
    bottomRight: { dx: offsetFromCenter, dy: offsetFromCenter - 2 },
  };
  
  const offset = cornerOffsets[corner];
  lightX = x + offset.dx;
  lightY = y + offset.dy;
  
  // Draw pole (very thin vertical line)
  ctx.strokeStyle = colors.pole;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lightX, lightY + 3);
  ctx.lineTo(lightX, lightY + 8);
  ctx.stroke();
  
  // Draw light housing (tiny rectangle)
  ctx.fillStyle = colors.housing;
  ctx.fillRect(lightX - 2, lightY - 4, 4, 7);
  
  // Determine which lights are on based on phase and corner position
  // Top-left and bottom-right control N-S traffic
  // Top-right and bottom-left control E-W traffic
  const controlsNS = corner === 'topLeft' || corner === 'bottomRight';
  const controlsEW = corner === 'topRight' || corner === 'bottomLeft';
  
  let redOn = false;
  let yellowOn = false;
  let greenOn = false;
  
  if (controlsNS) {
    if (phase === 'green_ns') greenOn = true;
    else if (phase === 'yellow_ns') yellowOn = true;
    else redOn = true;
  } else if (controlsEW) {
    if (phase === 'green_ew') greenOn = true;
    else if (phase === 'yellow_ew') yellowOn = true;
    else redOn = true;
  }
  
  // Draw the three lights (very small circles)
  const lightRadius = 1.2;
  const lightSpacing = 2;
  
  // Red light (top)
  ctx.fillStyle = redOn ? colors.red : '#1f1f1f';
  ctx.beginPath();
  ctx.arc(lightX, lightY - lightSpacing, lightRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Yellow light (middle)
  ctx.fillStyle = yellowOn ? colors.yellow : '#1f1f1f';
  ctx.beginPath();
  ctx.arc(lightX, lightY, lightRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Green light (bottom)
  ctx.fillStyle = greenOn ? colors.green : '#1f1f1f';
  ctx.beginPath();
  ctx.arc(lightX, lightY + lightSpacing, lightRadius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw a median strip with optional decorations (plants, structures)
 */
export function drawMedian(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  perpX: number,
  perpY: number,
  seed: number
): void {
  const config = ROAD_CONFIG;
  
  // Draw median base
  ctx.fillStyle = config.medianColor;
  ctx.beginPath();
  ctx.moveTo(startX + perpX * width / 2, startY + perpY * width / 2);
  ctx.lineTo(endX + perpX * width / 2, endY + perpY * width / 2);
  ctx.lineTo(endX - perpX * width / 2, endY - perpY * width / 2);
  ctx.lineTo(startX - perpX * width / 2, startY - perpY * width / 2);
  ctx.closePath();
  ctx.fill();
  
  // Draw curb edges
  ctx.strokeStyle = config.medianBorderColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(startX + perpX * width / 2, startY + perpY * width / 2);
  ctx.lineTo(endX + perpX * width / 2, endY + perpY * width / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(startX - perpX * width / 2, startY - perpY * width / 2);
  ctx.lineTo(endX - perpX * width / 2, endY - perpY * width / 2);
  ctx.stroke();
  
  // Add decorative elements (small plants/trees) based on seed
  const medianLength = Math.hypot(endX - startX, endY - startY);
  const numDecorations = Math.floor(medianLength / 12);
  
  if (numDecorations > 0) {
    const random = seededRandom(seed);
    
    for (let i = 0; i < numDecorations; i++) {
      const t = (i + 0.5) / numDecorations;
      const decorX = startX + (endX - startX) * t;
      const decorY = startY + (endY - startY) * t;
      
      // Small decorative element (tiny tree/shrub)
      const decorType = random() > 0.7 ? 'tree' : 'shrub';
      
      if (decorType === 'tree') {
        // Tiny tree
        ctx.fillStyle = '#2d5a2d';
        ctx.beginPath();
        ctx.arc(decorX, decorY - 1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(decorX - 0.3, decorY - 0.5, 0.6, 1.5);
      } else {
        // Small shrub
        ctx.fillStyle = '#3d6a3d';
        ctx.beginPath();
        ctx.ellipse(decorX, decorY, 1.5, 1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Simple seeded random number generator
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = Math.sin(s * 9999) * 10000;
    return s - Math.floor(s);
  };
}

/**
 * Draw lane markings (dashed lines)
 */
export function drawLaneMarkings(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  isDashed: boolean = true
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = ROAD_CONFIG.laneMarkingWidth;
  
  if (isDashed) {
    ctx.setLineDash([3, 4]);
  } else {
    ctx.setLineDash([]);
  }
  
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Draw a turn arrow indicator
 */
export function drawTurnArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 'left' | 'right' | 'straight',
  rotation: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  
  ctx.fillStyle = ROAD_CONFIG.turnArrowColor;
  ctx.strokeStyle = ROAD_CONFIG.turnArrowColor;
  ctx.lineWidth = 1;
  
  if (direction === 'straight') {
    // Straight arrow
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(2, -1);
    ctx.lineTo(0.8, -1);
    ctx.lineTo(0.8, 4);
    ctx.lineTo(-0.8, 4);
    ctx.lineTo(-0.8, -1);
    ctx.lineTo(-2, -1);
    ctx.closePath();
    ctx.fill();
  } else if (direction === 'left') {
    // Left turn arrow
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(-1, -2);
    ctx.lineTo(-1, -0.5);
    ctx.lineTo(1, -0.5);
    ctx.lineTo(1, 3);
    ctx.lineTo(-0.5, 3);
    ctx.lineTo(-0.5, 0.5);
    ctx.lineTo(-1, 0.5);
    ctx.lineTo(-1, 2);
    ctx.closePath();
    ctx.fill();
  } else {
    // Right turn arrow
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(1, -2);
    ctx.lineTo(1, -0.5);
    ctx.lineTo(-1, -0.5);
    ctx.lineTo(-1, 3);
    ctx.lineTo(0.5, 3);
    ctx.lineTo(0.5, 0.5);
    ctx.lineTo(1, 0.5);
    ctx.lineTo(1, 2);
    ctx.closePath();
    ctx.fill();
  }
  
  ctx.restore();
}
