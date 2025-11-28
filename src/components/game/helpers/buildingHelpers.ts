import { BuildingType, Tile } from '@/types/game';
import { getBuildingSize } from '@/lib/simulation';

/**
 * Check if a tile is part of a multi-tile building footprint
 */
export function isPartOfMultiTileBuilding(
  gridX: number,
  gridY: number,
  grid: Tile[][],
  gridSize: number
): boolean {
  // Check all possible origin positions that could have a multi-tile building covering this tile
  // For a 2x2 building, check up to 1 tile away in each direction
  // For a 3x3 building, check up to 2 tiles away
  // For a 4x4 building, check up to 3 tiles away
  const maxSize = 4; // Maximum building size
  
  for (let dy = 0; dy < maxSize; dy++) {
    for (let dx = 0; dx < maxSize; dx++) {
      const originX = gridX - dx;
      const originY = gridY - dy;
      
      if (originX >= 0 && originX < gridSize && originY >= 0 && originY < gridSize) {
        const originTile = grid[originY][originX];
        const buildingSize = getBuildingSize(originTile.building.type);
        
        // Check if this tile is within the footprint of the building at origin
        if (buildingSize.width > 1 || buildingSize.height > 1) {
          if (gridX >= originX && gridX < originX + buildingSize.width &&
              gridY >= originY && gridY < originY + buildingSize.height) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}

/**
 * Find the origin of a multi-tile building that contains a given tile
 * Returns the origin coordinates and building type, or null if not part of a multi-tile building
 */
export function findBuildingOrigin(
  gridX: number,
  gridY: number,
  grid: Tile[][],
  gridSize: number
): { originX: number; originY: number; buildingType: BuildingType } | null {
  const maxSize = 4; // Maximum building size
  
  // First check if this tile itself has a multi-tile building
  const tile = grid[gridY]?.[gridX];
  if (!tile) return null;
  
  // If this tile has a real building (not empty), check if it's multi-tile
  if (tile.building.type !== 'empty' && 
      tile.building.type !== 'grass' && 
      tile.building.type !== 'water' && 
      tile.building.type !== 'road' && 
      tile.building.type !== 'tree') {
    const size = getBuildingSize(tile.building.type);
    if (size.width > 1 || size.height > 1) {
      return { originX: gridX, originY: gridY, buildingType: tile.building.type };
    }
    return null; // Single-tile building
  }
  
  // If this is an 'empty' tile, search for the origin building
  if (tile.building.type === 'empty') {
    for (let dy = 0; dy < maxSize; dy++) {
      for (let dx = 0; dx < maxSize; dx++) {
        const originX = gridX - dx;
        const originY = gridY - dy;
        
        if (originX >= 0 && originX < gridSize && originY >= 0 && originY < gridSize) {
          const originTile = grid[originY][originX];
          
          if (originTile.building.type !== 'empty' && 
              originTile.building.type !== 'grass' &&
              originTile.building.type !== 'water' &&
              originTile.building.type !== 'road' &&
              originTile.building.type !== 'tree') {
            const size = getBuildingSize(originTile.building.type);
            
            // Check if the clicked tile is within this building's footprint
            if (size.width > 1 || size.height > 1) {
              if (gridX >= originX && gridX < originX + size.width &&
                  gridY >= originY && gridY < originY + size.height) {
                return { originX, originY, buildingType: originTile.building.type };
              }
            }
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Check if a tile is part of a park building footprint
 * Note: buildings with grey bases (baseball_stadium, swimming_pool, community_center, office_building_small) are NOT included
 */
export function isPartOfParkBuilding(
  gridX: number,
  gridY: number,
  grid: Tile[][],
  gridSize: number,
  parkBuildingsSet: Set<BuildingType>
): boolean {
  const maxSize = 4; // Maximum building size

  for (let dy = 0; dy < maxSize; dy++) {
    for (let dx = 0; dx < maxSize; dx++) {
      const originX = gridX - dx;
      const originY = gridY - dy;

      if (originX >= 0 && originX < gridSize && originY >= 0 && originY < gridSize) {
        const originTile = grid[originY][originX];

        // PERF: Use Set.has() instead of array.includes() for O(1) lookup
        if (parkBuildingsSet.has(originTile.building.type)) {
          const buildingSize = getBuildingSize(originTile.building.type);
          if (gridX >= originX && gridX < originX + buildingSize.width &&
              gridY >= originY && gridY < originY + buildingSize.height) {
            return true;
          }
        }
      }
    }
  }
  return false;
}
