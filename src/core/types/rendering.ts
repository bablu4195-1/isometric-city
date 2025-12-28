// Core rendering types for isometric games
// These are shared rendering concepts used by all isometric games

/**
 * Isometric tile dimensions (shared constants)
 */
export const TILE_WIDTH = 64;
export const HEIGHT_RATIO = 0.60;
export const TILE_HEIGHT = TILE_WIDTH * HEIGHT_RATIO;
export const KEY_PAN_SPEED = 520; // Pixels per second for keyboard panning

/**
 * Cardinal direction type used for movement
 */
export type CardinalDirection = 'north' | 'east' | 'south' | 'west';

/**
 * Direction metadata for entity movement
 */
export interface DirectionMeta {
  step: { x: number; y: number };
  vec: { dx: number; dy: number };
  angle: number;
  normal: { nx: number; ny: number };
}

/**
 * Base world render state
 */
export interface BaseWorldRenderState {
  gridSize: number;
  offset: { x: number; y: number };
  zoom: number;
  speed: number;
  canvasSize: { width: number; height: number };
}

/**
 * Particle type for effects (contrails, wake, smoke, etc.)
 */
export interface Particle {
  x: number;
  y: number;
  age: number;
  opacity: number;
}

/**
 * Extended particle with velocity for physics
 */
export interface PhysicsParticle extends Particle {
  vx: number;
  vy: number;
  maxAge: number;
  size: number;
}

/**
 * Base entity interface for all moving objects (vehicles, units, etc.)
 */
export interface BaseEntity {
  id: number;
  x: number;
  y: number;
}

/**
 * Entity with tile-based movement
 */
export interface TileEntity extends BaseEntity {
  tileX: number;
  tileY: number;
  direction: CardinalDirection;
  progress: number;
  speed: number;
}

/**
 * Entity with free movement and rotation
 */
export interface FreeEntity extends BaseEntity {
  angle: number;
  speed: number;
  altitude?: number;
}
