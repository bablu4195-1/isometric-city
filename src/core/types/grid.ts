// Core grid types for isometric games
// These are abstract types that any isometric game can extend

/**
 * Base tile interface that all game tiles extend
 * Contains only the fundamental positioning and state properties
 */
export interface BaseTile {
  x: number;
  y: number;
}

/**
 * Base building interface that all game buildings extend
 */
export interface BaseBuilding {
  type: string;
  level: number;
}

/**
 * Base game state interface that all games extend
 */
export interface BaseGameState {
  id: string;
  grid: BaseTile[][];
  gridSize: number;
  speed: 0 | 1 | 2 | 3;
  tick: number;
}

/**
 * Generic 2D grid type
 */
export type Grid<T extends BaseTile> = T[][];

/**
 * Coordinate pair for positions
 */
export interface Coords {
  x: number;
  y: number;
}

/**
 * Rectangle bounds
 */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
