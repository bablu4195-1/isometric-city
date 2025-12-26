/**
 * City utilities for multi-city support
 * Provides efficient caching for city lookups and boundary calculations
 */

import { City, CityCache, Tile, GameState } from '@/types/game';

// Default city colors for multi-city display
export const CITY_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
];

// Cache TTL in milliseconds - how long before cache should be rebuilt
const CACHE_TTL_MS = 5000;

// Singleton cache instance (not persisted, rebuilt on load)
let cityCache: CityCache | null = null;

/**
 * Initialize or get the city cache
 */
export function getCityCache(): CityCache {
  if (!cityCache) {
    cityCache = {
      cityTileSets: new Map(),
      tileToCityMap: new Map(),
      lastRebuild: 0,
      isDirty: true,
    };
  }
  return cityCache;
}

/**
 * Mark the city cache as dirty (needs rebuild)
 * Call this when buildings are placed or removed
 */
export function invalidateCityCache(): void {
  const cache = getCityCache();
  cache.isDirty = true;
}

/**
 * Build the city cache from the current game state
 * This is an O(n*m) operation where n is grid size and m is number of buildings
 * Only called when cache is dirty or expired
 */
export function rebuildCityCache(grid: Tile[][], gridSize: number, cities: City[] | undefined): void {
  const cache = getCityCache();
  
  // Clear existing cache
  cache.cityTileSets.clear();
  cache.tileToCityMap.clear();
  
  // Initialize sets for each city
  if (cities) {
    for (const city of cities) {
      cache.cityTileSets.set(city.id, new Set<string>());
    }
  }
  
  // Scan grid and populate cache
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const tile = grid[y]?.[x];
      if (!tile?.building?.cityId) continue;
      
      const cityId = tile.building.cityId;
      const tileKey = `${x},${y}`;
      
      // Add to tile->city map
      cache.tileToCityMap.set(tileKey, cityId);
      
      // Add to city's tile set
      let cityTiles = cache.cityTileSets.get(cityId);
      if (!cityTiles) {
        cityTiles = new Set<string>();
        cache.cityTileSets.set(cityId, cityTiles);
      }
      cityTiles.add(tileKey);
    }
  }
  
  cache.lastRebuild = Date.now();
  cache.isDirty = false;
}

/**
 * Ensure the city cache is up to date
 */
export function ensureCityCacheValid(state: GameState): void {
  const cache = getCityCache();
  const now = Date.now();
  
  // Rebuild if dirty or expired
  if (cache.isDirty || now - cache.lastRebuild > CACHE_TTL_MS) {
    rebuildCityCache(state.grid, state.gridSize, state.cities);
  }
}

/**
 * Get the city ID for a tile (O(1) lookup after cache is built)
 */
export function getCityIdForTile(x: number, y: number): string | undefined {
  const cache = getCityCache();
  return cache.tileToCityMap.get(`${x},${y}`);
}

/**
 * Get all tiles belonging to a city (O(1) lookup after cache is built)
 */
export function getTilesForCity(cityId: string): Set<string> {
  const cache = getCityCache();
  return cache.cityTileSets.get(cityId) || new Set();
}

/**
 * Check if a tile belongs to a specific city (O(1) lookup)
 */
export function isTileInCity(x: number, y: number, cityId: string): boolean {
  const cache = getCityCache();
  const tileCityId = cache.tileToCityMap.get(`${x},${y}`);
  return tileCityId === cityId;
}

/**
 * Count buildings in a city (O(1) after cache is built)
 */
export function countBuildingsInCity(cityId: string): number {
  const tiles = getTilesForCity(cityId);
  return tiles.size;
}

/**
 * Calculate city statistics from the grid
 * This is more expensive - should be cached in City.cachedStats
 */
export function calculateCityStats(
  state: GameState,
  cityId: string
): { population: number; jobs: number; buildingCount: number } {
  const tiles = getTilesForCity(cityId);
  let population = 0;
  let jobs = 0;
  
  for (const tileKey of tiles) {
    const [x, y] = tileKey.split(',').map(Number);
    const tile = state.grid[y]?.[x];
    if (tile?.building) {
      population += tile.building.population;
      jobs += tile.building.jobs;
    }
  }
  
  return {
    population,
    jobs,
    buildingCount: tiles.size,
  };
}

/**
 * Find boundary tiles for a city (tiles that border tiles of other cities or unowned tiles)
 * Used for rendering city borders efficiently
 */
export function findCityBoundaryTiles(
  state: GameState,
  cityId: string
): { x: number; y: number }[] {
  ensureCityCacheValid(state);
  
  const tiles = getTilesForCity(cityId);
  const boundaries: { x: number; y: number }[] = [];
  
  for (const tileKey of tiles) {
    const [x, y] = tileKey.split(',').map(Number);
    
    // Check 4-connected neighbors
    const neighbors = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];
    
    let isBoundary = false;
    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.x >= state.gridSize ||
        neighbor.y < 0 ||
        neighbor.y >= state.gridSize
      ) {
        // Edge of map is a boundary
        isBoundary = true;
        break;
      }
      
      const neighborCityId = getCityIdForTile(neighbor.x, neighbor.y);
      if (neighborCityId !== cityId) {
        // Neighbor is different city or unowned
        isBoundary = true;
        break;
      }
    }
    
    if (isBoundary) {
      boundaries.push({ x, y });
    }
  }
  
  return boundaries;
}

/**
 * Assign a tile to a city
 * Call invalidateCityCache() after bulk assignments
 */
export function assignTileToCity(
  tile: Tile,
  cityId: string
): void {
  if (tile.building) {
    tile.building.cityId = cityId;
  }
}

/**
 * Create a new city with a unique ID and color
 */
export function createCity(
  name: string,
  existingCities: City[] = []
): City {
  const colorIndex = existingCities.length % CITY_COLORS.length;
  
  return {
    id: generateCityId(),
    name,
    color: CITY_COLORS[colorIndex],
    cachedStats: {
      population: 0,
      jobs: 0,
      buildingCount: 0,
      lastUpdated: 0,
    },
    boundaryTiles: [],
  };
}

/**
 * Generate a unique city ID
 */
function generateCityId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'city-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/**
 * Update cached stats for a city
 * Should be called periodically (e.g., every simulation tick)
 */
export function updateCityCachedStats(
  state: GameState,
  city: City
): void {
  const stats = calculateCityStats(state, city.id);
  city.cachedStats = {
    ...stats,
    lastUpdated: Date.now(),
  };
}

/**
 * Get the primary city (first city or create default)
 * For backward compatibility - single city games use this
 */
export function getPrimaryCity(state: GameState): City | undefined {
  return state.cities?.[0];
}

/**
 * Ensure the game state has at least one city (for backward compatibility)
 */
export function ensureDefaultCity(state: GameState): City {
  if (!state.cities || state.cities.length === 0) {
    const defaultCity = createCity(state.cityName);
    state.cities = [defaultCity];
    return defaultCity;
  }
  return state.cities[0];
}
