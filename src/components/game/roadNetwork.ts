/**
 * Road network analysis for detecting adjacent roads and determining road configurations
 */

import { Tile } from '@/types/game';

export type RoadConfiguration = {
  // Number of lanes in each direction (1-3)
  lanesPerDirection: number;
  // Whether this road has a central divider
  hasDivider: boolean;
  // Whether this is an intersection (3+ connections)
  isIntersection: boolean;
  // Adjacent roads in each direction
  adjacent: {
    north: boolean;
    east: boolean;
    south: boolean;
    west: boolean;
  };
  // Parallel roads (roads running in the same direction)
  parallel: {
    north: boolean; // Road to north AND to south (parallel vertical)
    east: boolean; // Road to east AND to west (parallel horizontal)
  };
};

/**
 * Analyze road network around a tile to determine its configuration
 */
export function analyzeRoadConfiguration(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): RoadConfiguration {
  const hasRoad = (dx: number, dy: number): boolean => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) return false;
    return grid[ny][nx].building.type === 'road';
  };

  const north = hasRoad(-1, 0);
  const east = hasRoad(0, -1);
  const south = hasRoad(1, 0);
  const west = hasRoad(0, 1);

  // Count connections
  const connectionCount = [north, east, south, west].filter(Boolean).length;
  const isIntersection = connectionCount >= 3;

  // Check for parallel roads (roads running in the same direction)
  // Vertical parallel: roads both north and south
  const parallelVertical = north && south;
  // Horizontal parallel: roads both east and west
  const parallelHorizontal = east && west;

  // Determine lanes based on parallel roads (roads running next to each other)
  // When roads are placed adjacent in perpendicular directions and also connect
  // in the same direction, they form parallel multi-lane roads
  let lanesPerDirection = 1;
  
  // For a road running north-south, check if there are roads to east/west
  // that also run north-south (forming parallel lanes)
  if (parallelVertical) {
    const eastRoad = hasRoad(0, -1);
    const westRoad = hasRoad(0, 1);
    
    // Check if these perpendicular neighbors also have north-south connections
    let eastParallel = false;
    let westParallel = false;
    
    if (eastRoad) {
      // Check if east road also connects north or south
      const eastNorth = hasRoad(-1, -1);
      const eastSouth = hasRoad(1, -1);
      eastParallel = eastNorth || eastSouth;
    }
    
    if (westRoad) {
      const westNorth = hasRoad(-1, 1);
      const westSouth = hasRoad(1, 1);
      westParallel = westNorth || westSouth;
    }
    
    if (eastParallel && westParallel) {
      lanesPerDirection = 3;
    } else if (eastParallel || westParallel) {
      lanesPerDirection = 2;
    }
  }
  
  // For a road running east-west, check if there are roads to north/south
  // that also run east-west (forming parallel lanes)
  if (parallelHorizontal) {
    const northRoad = hasRoad(-1, 0);
    const southRoad = hasRoad(1, 0);
    
    let northParallel = false;
    let southParallel = false;
    
    if (northRoad) {
      const northEast = hasRoad(-1, -1);
      const northWest = hasRoad(-1, 1);
      northParallel = northEast || northWest;
    }
    
    if (southRoad) {
      const southEast = hasRoad(1, -1);
      const southWest = hasRoad(1, 1);
      southParallel = southEast || southWest;
    }
    
    if (northParallel && southParallel) {
      lanesPerDirection = Math.max(lanesPerDirection, 3);
    } else if (northParallel || southParallel) {
      lanesPerDirection = Math.max(lanesPerDirection, 2);
    }
  }

  // Add divider for 3+ lane roads or major intersections
  const hasDivider = lanesPerDirection >= 2 || isIntersection;

  return {
    lanesPerDirection,
    hasDivider,
    isIntersection,
    adjacent: { north, east, south, west },
    parallel: {
      north: parallelVertical,
      east: parallelHorizontal,
    },
  };
}

/**
 * Check if a tile should have a traffic light
 * Traffic lights appear at intersections (3+ connections)
 */
export function shouldHaveTrafficLight(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number
): boolean {
  const config = analyzeRoadConfiguration(grid, gridSize, x, y);
  return config.isIntersection;
}

/**
 * Get traffic light state (for animation)
 * Returns 'red', 'yellow', or 'green' based on time
 */
export function getTrafficLightState(tick: number, intersectionId: number): 'red' | 'yellow' | 'green' {
  // Each intersection has a different phase offset
  const phase = (tick * 0.1 + intersectionId * 0.5) % 6;
  
  // 3 seconds red, 0.5 seconds yellow, 2.5 seconds green
  if (phase < 3) return 'red';
  if (phase < 3.5) return 'yellow';
  return 'green';
}

/**
 * Calculate intersection ID for consistent traffic light timing
 */
export function getIntersectionId(x: number, y: number): number {
  // Simple hash function for consistent IDs
  return (x * 31 + y * 17) % 1000;
}
