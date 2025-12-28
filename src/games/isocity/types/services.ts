/**
 * SimCity Service Types
 * 
 * Defines city services like police, fire, health, and education.
 */

// ============================================================================
// Service Types
// ============================================================================

/** City service categories */
export type ServiceType = 'police' | 'fire' | 'health' | 'education' | 'power' | 'water';

/** Service coverage grids */
export interface ServiceCoverage {
  /** Police coverage (0-100 per tile) */
  police: number[][];
  /** Fire coverage (0-100 per tile) */
  fire: number[][];
  /** Health coverage (0-100 per tile) */
  health: number[][];
  /** Education coverage (0-100 per tile) */
  education: number[][];
  /** Power connection (boolean per tile) */
  power: boolean[][];
  /** Water connection (boolean per tile) */
  water: boolean[][];
}

// ============================================================================
// Service Configuration
// ============================================================================

/** Configuration for a service type */
export interface ServiceConfig {
  /** Building types that provide this service */
  buildingTypes: string[];
  /** Radius of effect in tiles */
  radius: number;
  /** Maximum coverage value */
  maxCoverage: number;
  /** Monthly cost per building */
  costPerBuilding: number;
  /** Effect on city stats */
  statEffect: Partial<{
    happiness: number;
    health: number;
    education: number;
    safety: number;
  }>;
}

/** Default service configurations */
export const SERVICE_CONFIGS: Record<ServiceType, ServiceConfig> = {
  police: {
    buildingTypes: ['police_station'],
    radius: 15,
    maxCoverage: 100,
    costPerBuilding: 100,
    statEffect: { safety: 10, happiness: 2 },
  },
  fire: {
    buildingTypes: ['fire_station'],
    radius: 15,
    maxCoverage: 100,
    costPerBuilding: 100,
    statEffect: { safety: 5, happiness: 1 },
  },
  health: {
    buildingTypes: ['hospital'],
    radius: 20,
    maxCoverage: 100,
    costPerBuilding: 200,
    statEffect: { health: 15, happiness: 5 },
  },
  education: {
    buildingTypes: ['school', 'university'],
    radius: 18,
    maxCoverage: 100,
    costPerBuilding: 150,
    statEffect: { education: 15, happiness: 3 },
  },
  power: {
    buildingTypes: ['power_plant'],
    radius: 25,
    maxCoverage: 1,
    costPerBuilding: 300,
    statEffect: {},
  },
  water: {
    buildingTypes: ['water_tower'],
    radius: 20,
    maxCoverage: 1,
    costPerBuilding: 150,
    statEffect: { health: 5 },
  },
};

// ============================================================================
// Service Coverage Calculation
// ============================================================================

/**
 * Create an empty coverage grid
 */
export function createCoverageGrid<T>(size: number, defaultValue: T): T[][] {
  const grid: T[][] = [];
  for (let y = 0; y < size; y++) {
    grid.push(new Array(size).fill(defaultValue));
  }
  return grid;
}

/**
 * Create empty service coverage grids
 */
export function createEmptyServiceCoverage(size: number): ServiceCoverage {
  return {
    police: createCoverageGrid(size, 0),
    fire: createCoverageGrid(size, 0),
    health: createCoverageGrid(size, 0),
    education: createCoverageGrid(size, 0),
    power: createCoverageGrid(size, false),
    water: createCoverageGrid(size, false),
  };
}

/**
 * Calculate coverage from a service building
 */
export function addServiceCoverage(
  grid: number[][],
  centerX: number,
  centerY: number,
  radius: number,
  maxCoverage: number,
  fundingLevel: number = 100
): void {
  const effectiveRadius = Math.floor(radius * (fundingLevel / 100));
  const effectiveCoverage = maxCoverage * (fundingLevel / 100);
  
  const gridSize = grid.length;
  
  for (let dy = -effectiveRadius; dy <= effectiveRadius; dy++) {
    for (let dx = -effectiveRadius; dx <= effectiveRadius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      
      if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > effectiveRadius) continue;
      
      // Linear falloff from center
      const falloff = 1 - distance / effectiveRadius;
      const coverage = effectiveCoverage * falloff;
      
      // Add to existing coverage (capped at max)
      grid[y][x] = Math.min(maxCoverage, grid[y][x] + coverage);
    }
  }
}

/**
 * Spread power/water connections using BFS
 */
export function spreadUtilityConnection(
  grid: boolean[][],
  startX: number,
  startY: number,
  maxDistance: number,
  isConnectable: (x: number, y: number) => boolean
): void {
  const gridSize = grid.length;
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; dist: number }> = [
    { x: startX, y: startY, dist: 0 },
  ];
  
  while (queue.length > 0) {
    const { x, y, dist } = queue.shift()!;
    const key = `${x},${y}`;
    
    if (visited.has(key)) continue;
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
    if (dist > maxDistance) continue;
    if (!isConnectable(x, y)) continue;
    
    visited.add(key);
    grid[y][x] = true;
    
    // Add neighbors
    queue.push(
      { x: x - 1, y, dist: dist + 1 },
      { x: x + 1, y, dist: dist + 1 },
      { x, y: y - 1, dist: dist + 1 },
      { x, y: y + 1, dist: dist + 1 },
    );
  }
}
