/**
 * Rise of Nations - Enhanced Photorealistic Graphics System
 * 
 * This module provides high-fidelity, realistic terrain, water, lighting, and effects.
 * Uses procedural noise for natural-looking textures with a focus on photorealism
 * rather than cartoon-style rendering.
 */

import { createNoise2D, NoiseFunction2D } from 'simplex-noise';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/shared';

// ============================================================================
// NOISE GENERATORS (initialized lazily with seeded randomness)
// ============================================================================

let terrainNoise: NoiseFunction2D | null = null;
let detailNoise: NoiseFunction2D | null = null;
let waterNoise: NoiseFunction2D | null = null;
let waveNoise: NoiseFunction2D | null = null;
let cloudNoise: NoiseFunction2D | null = null;
let rockNoise: NoiseFunction2D | null = null;

function getTerrainNoise(): NoiseFunction2D {
  if (!terrainNoise) terrainNoise = createNoise2D(() => 0.5);
  return terrainNoise;
}

function getDetailNoise(): NoiseFunction2D {
  if (!detailNoise) detailNoise = createNoise2D(() => 0.3);
  return detailNoise;
}

function getWaterNoise(): NoiseFunction2D {
  if (!waterNoise) waterNoise = createNoise2D(() => 0.7);
  return waterNoise;
}

function getWaveNoise(): NoiseFunction2D {
  if (!waveNoise) waveNoise = createNoise2D(() => 0.2);
  return waveNoise;
}

function getCloudNoise(): NoiseFunction2D {
  if (!cloudNoise) cloudNoise = createNoise2D(() => 0.9);
  return cloudNoise;
}

function getRockNoise(): NoiseFunction2D {
  if (!rockNoise) rockNoise = createNoise2D(() => 0.1);
  return rockNoise;
}

// ============================================================================
// PHOTOREALISTIC COLOR PALETTES
// ============================================================================

/**
 * Realistic grass colors - less saturated, more natural earth tones
 * Based on real world grass photography
 */
export const REALISTIC_GRASS = {
  // Natural grass base - desaturated olive/sage greens
  base: { h: 85, s: 28, l: 38 },
  light: { h: 78, s: 32, l: 45 },
  dark: { h: 92, s: 24, l: 28 },
  // Dry/dead grass patches
  dry: { h: 48, s: 25, l: 42 },
  // Shadow tones
  shadow: { h: 95, s: 20, l: 22 },
  // Grid stroke - very subtle
  stroke: 'rgba(40, 50, 35, 0.15)',
};

/**
 * Realistic water colors - deep ocean blues to coastal turquoise
 */
export const REALISTIC_WATER = {
  deep: { h: 205, s: 55, l: 22 },
  mid: { h: 200, s: 48, l: 32 },
  shallow: { h: 192, s: 42, l: 45 },
  surface: { h: 198, s: 35, l: 55 },
  foam: { h: 190, s: 15, l: 88 },
  reflection: { h: 210, s: 20, l: 75 },
  sparkle: '#e8f4ff',
};

/**
 * Realistic beach/sand colors - warm browns and tans
 */
export const REALISTIC_BEACH = {
  dry: { h: 38, s: 35, l: 68 },
  wet: { h: 32, s: 32, l: 48 },
  dark: { h: 28, s: 28, l: 38 },
  foam: { h: 42, s: 12, l: 92 },
};

/**
 * Realistic mountain/rock colors - grey-browns with variation
 */
export const REALISTIC_MOUNTAIN = {
  rock: { h: 35, s: 12, l: 42 },
  peak: { h: 32, s: 8, l: 52 },
  shadow: { h: 40, s: 15, l: 25 },
  snow: { h: 210, s: 8, l: 96 },
  cliff: { h: 25, s: 10, l: 35 },
  ore: { h: 28, s: 45, l: 22 },
  oreGlint: { h: 45, s: 55, l: 55 },
};

/**
 * Realistic forest colors - natural tree greens and browns
 */
export const REALISTIC_FOREST = {
  canopy: { h: 110, s: 35, l: 22 },
  canopyLight: { h: 95, s: 38, l: 32 },
  canopyShadow: { h: 125, s: 30, l: 15 },
  trunk: { h: 25, s: 30, l: 22 },
  trunkHighlight: { h: 28, s: 25, l: 32 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Convert HSL to CSS color string */
function hsl(h: number, s: number, l: number, a = 1): string {
  return a === 1 ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Smooth step interpolation */
function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return a + (b - a) * (x * x * (3 - 2 * x));
}

/** Multi-octave noise for more natural patterns */
function octaveNoise(
  noise: NoiseFunction2D,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  scale: number
): number {
  let total = 0;
  let frequency = scale;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

/** Generate a deterministic pseudo-random value from coordinates */
function hash(x: number, y: number, seed: number = 0): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

// ============================================================================
// ENHANCED GRASS/TERRAIN RENDERING
// ============================================================================

/**
 * Render photorealistic grass tile with natural color variation
 */
export function drawRealisticGrassTile(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  zoom: number,
  options: {
    ambient?: number;
    highlight?: boolean;
    selected?: boolean;
  } = {}
): void {
  const { ambient = 1.0, highlight = false, selected = false } = options;
  const noise = getTerrainNoise();
  const detail = getDetailNoise();

  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  // Get large-scale color variation (creates patches/biomes)
  const largeNoise = octaveNoise(noise, gridX * 0.15, gridY * 0.15, 3, 0.5, 0.08);
  // Medium-scale variation
  const medNoise = octaveNoise(noise, gridX * 0.4, gridY * 0.4, 2, 0.6, 0.15);
  // Fine detail
  const fineNoise = octaveNoise(detail, gridX * 1.2, gridY * 1.2, 2, 0.5, 0.25);

  // Combine noise for natural color variation
  const colorVar = (largeNoise + 1) / 2; // 0-1
  const detailVar = (medNoise + fineNoise) / 2;

  // Calculate base HSL with realistic earth tones
  // Mix between green grass and dry/brown patches based on noise
  const isDryPatch = largeNoise > 0.3 && medNoise > 0.2;
  
  let baseH: number, baseS: number, baseL: number;
  
  if (isDryPatch) {
    // Dry grass patch - more brown/tan
    baseH = lerp(REALISTIC_GRASS.dry.h, REALISTIC_GRASS.base.h, 0.3 + colorVar * 0.4);
    baseS = lerp(REALISTIC_GRASS.dry.s, REALISTIC_GRASS.base.s, 0.4);
    baseL = lerp(REALISTIC_GRASS.dry.l, REALISTIC_GRASS.base.l, 0.5);
  } else {
    // Green grass - subtle variation
    baseH = lerp(REALISTIC_GRASS.dark.h, REALISTIC_GRASS.light.h, colorVar);
    baseS = lerp(REALISTIC_GRASS.dark.s, REALISTIC_GRASS.light.s, colorVar) + detailVar * 4;
    baseL = lerp(REALISTIC_GRASS.dark.l, REALISTIC_GRASS.light.l, colorVar) + detailVar * 5;
  }

  // Apply ambient lighting
  const finalL = baseL * ambient;

  // Create subtle gradient across tile for depth
  const gradient = ctx.createLinearGradient(
    screenX, screenY + h * 0.3,
    screenX + w, screenY + h * 0.7
  );
  
  // Subtle lighting variation across the tile
  gradient.addColorStop(0, hsl(baseH + 2, baseS - 2, finalL + 3));
  gradient.addColorStop(0.35, hsl(baseH, baseS, finalL));
  gradient.addColorStop(0.65, hsl(baseH - 1, baseS + 1, finalL - 2));
  gradient.addColorStop(1, hsl(baseH - 2, baseS - 1, finalL - 4));

  // Draw base tile
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(cx, screenY);
  ctx.lineTo(screenX + w, cy);
  ctx.lineTo(cx, screenY + h);
  ctx.lineTo(screenX, cy);
  ctx.closePath();
  ctx.fill();

  // Add fine grass texture when zoomed in
  if (zoom >= 0.5) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, screenY);
    ctx.lineTo(screenX + w, cy);
    ctx.lineTo(cx, screenY + h);
    ctx.lineTo(screenX, cy);
    ctx.closePath();
    ctx.clip();

    // Draw subtle grass blades/texture dots
    const numDetails = zoom >= 0.8 ? 12 : 6;
    for (let i = 0; i < numDetails; i++) {
      const seed = gridX * 17 + gridY * 31 + i * 7;
      const px = cx + (hash(seed, 0) - 0.5) * w * 0.7;
      const py = cy + (hash(0, seed) - 0.5) * h * 0.7;
      const bladeNoise = detail(px * 0.1, py * 0.1);
      
      const bladeH = baseH + bladeNoise * 8;
      const bladeL = finalL + bladeNoise * 6 - 3;
      
      ctx.fillStyle = hsl(bladeH, baseS - 5, bladeL, 0.4);
      ctx.beginPath();
      ctx.arc(px, py, 0.8 + hash(seed, seed) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw very subtle grid lines when zoomed in
  if (zoom >= 0.7) {
    ctx.strokeStyle = REALISTIC_GRASS.stroke;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, screenY);
    ctx.lineTo(screenX + w, cy);
    ctx.lineTo(cx, screenY + h);
    ctx.lineTo(screenX, cy);
    ctx.closePath();
    ctx.stroke();
  }

  // Selection/highlight overlay
  if (highlight || selected) {
    ctx.fillStyle = selected 
      ? 'rgba(34, 197, 94, 0.2)' 
      : 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(cx, screenY);
    ctx.lineTo(screenX + w, cy);
    ctx.lineTo(cx, screenY + h);
    ctx.lineTo(screenX, cy);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = selected ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();
  }
}

// ============================================================================
// ENHANCED WATER RENDERING
// ============================================================================

/**
 * Render photorealistic water tile with depth-based coloring and subtle animation
 */
export function drawRealisticWaterTile(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  animTime: number,
  zoom: number,
  adjacentWater: { north: boolean; east: boolean; south: boolean; west: boolean },
  options: {
    ambient?: number;
    sparkle?: boolean;
  } = {}
): void {
  const { ambient = 1.0, sparkle = true } = options;
  const waterNoiseFn = getWaterNoise();
  const waveNoiseFn = getWaveNoise();

  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  // Calculate water depth based on adjacency (edges are shallower)
  const numAdjacent = [adjacentWater.north, adjacentWater.east, adjacentWater.south, adjacentWater.west]
    .filter(Boolean).length;
  const depth = numAdjacent / 4;

  // Animated noise for subtle movement
  const waveVal = octaveNoise(waveNoiseFn, gridX * 0.25 + animTime * 0.3, gridY * 0.25, 2, 0.5, 0.15);
  const colorNoise = octaveNoise(waterNoiseFn, gridX * 0.4 + animTime * 0.08, gridY * 0.4, 2, 0.5, 0.12);

  // Depth-based color calculation
  const shallow = REALISTIC_WATER.shallow;
  const deep = REALISTIC_WATER.deep;
  
  const waterH = lerp(shallow.h, deep.h, depth * 0.7 + colorNoise * 0.15);
  const waterS = lerp(shallow.s, deep.s, depth * 0.6);
  const waterL = lerp(shallow.l, deep.l, depth * 0.8) * ambient;

  // Subtle animated color shift
  const animH = waterH + waveVal * 3;
  const animL = waterL + colorNoise * 4;

  // Create depth gradient
  const gradient = ctx.createRadialGradient(
    cx + waveVal * 3, cy + waveVal * 2,
    0,
    cx, cy,
    w * 0.6
  );
  
  // Center is slightly lighter (surface reflection)
  gradient.addColorStop(0, hsl(animH - 3, waterS - 5, animL + 6));
  gradient.addColorStop(0.4, hsl(animH, waterS, animL));
  gradient.addColorStop(0.8, hsl(animH + 3, waterS + 3, animL - 4));
  gradient.addColorStop(1, hsl(animH + 5, waterS + 5, animL - 7));

  // Clip to tile
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, screenY);
  ctx.lineTo(screenX + w, cy);
  ctx.lineTo(cx, screenY + h);
  ctx.lineTo(screenX, cy);
  ctx.closePath();
  ctx.clip();

  // Draw base water
  ctx.fillStyle = gradient;
  ctx.fillRect(screenX, screenY, w, h);

  // Draw subtle wave patterns
  if (zoom >= 0.4) {
    const numWaves = 2;
    for (let i = 0; i < numWaves; i++) {
      const wavePhase = (animTime * 0.25 + i * 0.5) % 1;
      const waveY = screenY + h * 0.25 + wavePhase * h * 0.6;
      const waveAmp = 1.5 + waveVal * 1.5;
      
      ctx.strokeStyle = hsl(
        REALISTIC_WATER.reflection.h, 
        REALISTIC_WATER.reflection.s, 
        REALISTIC_WATER.reflection.l, 
        0.08 + (1 - wavePhase) * 0.1
      );
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      
      for (let x = screenX; x <= screenX + w; x += 4) {
        const localWave = waveNoiseFn((x + gridX * w) * 0.04, animTime);
        const py = waveY + localWave * waveAmp;
        if (x === screenX) {
          ctx.moveTo(x, py);
        } else {
          ctx.lineTo(x, py);
        }
      }
      ctx.stroke();
    }
  }

  // Draw occasional sparkles/reflections
  if (sparkle && zoom >= 0.45) {
    const numSparkles = Math.floor(2 + depth * 2);
    for (let i = 0; i < numSparkles; i++) {
      const seed = gridX * 13 + gridY * 29 + i * 11;
      const sparklePhase = (animTime * 1.5 + hash(seed, i)) % 1;
      const intensity = Math.max(0, Math.sin(sparklePhase * Math.PI));
      
      if (intensity > 0.6) {
        const offsetX = (hash(seed, 0) - 0.5) * w * 0.6;
        const offsetY = (hash(0, seed) - 0.5) * h * 0.5;
        const sparkleX = cx + offsetX + waveVal * 2;
        const sparkleY = cy + offsetY;
        
        const sparkleAlpha = (intensity - 0.6) / 0.4 * 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, 0.8 + intensity * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();

  // Subtle tile outline
  if (zoom >= 0.6) {
    ctx.strokeStyle = 'rgba(30, 80, 120, 0.15)';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(cx, screenY);
    ctx.lineTo(screenX + w, cy);
    ctx.lineTo(cx, screenY + h);
    ctx.lineTo(screenX, cy);
    ctx.closePath();
    ctx.stroke();
  }
}

// ============================================================================
// ENHANCED BEACH RENDERING
// ============================================================================

/**
 * Draw realistic beach/shoreline on water tiles adjacent to land
 */
export function drawRealisticBeach(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  adjacentLand: { north: boolean; east: boolean; south: boolean; west: boolean },
  zoom: number,
  animTime: number
): void {
  const { north, east, south, west } = adjacentLand;
  if (!north && !east && !south && !west) return;

  const noise = getTerrainNoise();
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  // Natural beach width variation
  const beachNoise = octaveNoise(noise, gridX * 0.6, gridY * 0.6, 2, 0.5, 0.25);
  const beachWidth = w * (0.14 + beachNoise * 0.04);

  // Corner positions
  const corners = {
    top: { x: cx, y: screenY },
    right: { x: screenX + w, y: cy },
    bottom: { x: cx, y: screenY + h },
    left: { x: screenX, y: cy },
  };

  // Inward direction vectors
  const inwardVec = {
    north: { dx: 0.707, dy: 0.707 },
    east: { dx: -0.707, dy: 0.707 },
    south: { dx: -0.707, dy: -0.707 },
    west: { dx: 0.707, dy: -0.707 },
  };

  const drawBeachEdge = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    inward: { dx: number; dy: number }
  ) => {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const innerX = midX + inward.dx * beachWidth;
    const innerY = midY + inward.dy * beachWidth;

    // Create wet-to-dry gradient
    const gradient = ctx.createLinearGradient(midX, midY, innerX, innerY);
    const wet = REALISTIC_BEACH.wet;
    const dry = REALISTIC_BEACH.dry;
    
    gradient.addColorStop(0, hsl(wet.h, wet.s, wet.l));
    gradient.addColorStop(0.35, hsl(
      lerp(wet.h, dry.h, 0.4),
      lerp(wet.s, dry.s, 0.4),
      lerp(wet.l, dry.l, 0.4)
    ));
    gradient.addColorStop(0.7, hsl(dry.h, dry.s, dry.l));
    gradient.addColorStop(1, hsl(dry.h + 2, dry.s - 3, dry.l + 4));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(end.x + inward.dx * beachWidth, end.y + inward.dy * beachWidth);
    ctx.lineTo(start.x + inward.dx * beachWidth, start.y + inward.dy * beachWidth);
    ctx.closePath();
    ctx.fill();

    // Subtle foam line
    const foamPhase = (animTime * 0.4) % 1;
    const foamWidth = beachWidth * (0.15 + Math.sin(foamPhase * Math.PI) * 0.08);
    
    ctx.strokeStyle = hsl(
      REALISTIC_BEACH.foam.h,
      REALISTIC_BEACH.foam.s,
      REALISTIC_BEACH.foam.l,
      0.2 + Math.sin(animTime * 1.8) * 0.08
    );
    ctx.lineWidth = foamWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(
      start.x + inward.dx * beachWidth * 0.65,
      start.y + inward.dy * beachWidth * 0.65
    );
    ctx.lineTo(
      end.x + inward.dx * beachWidth * 0.65,
      end.y + inward.dy * beachWidth * 0.65
    );
    ctx.stroke();
  };

  // Draw each beach edge
  if (north) drawBeachEdge(corners.left, corners.top, inwardVec.north);
  if (east) drawBeachEdge(corners.top, corners.right, inwardVec.east);
  if (south) drawBeachEdge(corners.right, corners.bottom, inwardVec.south);
  if (west) drawBeachEdge(corners.bottom, corners.left, inwardVec.west);
}

// ============================================================================
// ENHANCED MOUNTAIN/METAL DEPOSIT RENDERING
// ============================================================================

/**
 * Draw realistic mountain terrain with metal ore deposits
 */
export function drawRealisticMountain(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  hasMetalDeposit: boolean,
  zoom: number
): void {
  const noise = getTerrainNoise();
  const rockN = getRockNoise();
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  // Rocky base with natural color variation
  const baseNoise = octaveNoise(noise, gridX * 0.3, gridY * 0.3, 2, 0.5, 0.2);
  const rock = REALISTIC_MOUNTAIN.rock;
  const cliff = REALISTIC_MOUNTAIN.cliff;

  const baseGradient = ctx.createLinearGradient(screenX, screenY, screenX + w, screenY + h);
  baseGradient.addColorStop(0, hsl(rock.h + baseNoise * 5, rock.s, rock.l + 3));
  baseGradient.addColorStop(0.4, hsl(rock.h, rock.s, rock.l));
  baseGradient.addColorStop(0.7, hsl(cliff.h, cliff.s, cliff.l));
  baseGradient.addColorStop(1, hsl(cliff.h - 3, cliff.s + 2, cliff.l - 5));

  ctx.fillStyle = baseGradient;
  ctx.beginPath();
  ctx.moveTo(cx, screenY);
  ctx.lineTo(screenX + w, cy);
  ctx.lineTo(cx, screenY + h);
  ctx.lineTo(screenX, cy);
  ctx.closePath();
  ctx.fill();

  // Draw mountain peak cluster
  const seed = gridX * 1000 + gridY;
  const numPeaks = 5 + (seed % 4);

  const peakConfigs = [
    { dx: 0.50, dy: 0.26, size: 1.5, heightMult: 1.4 },
    { dx: 0.33, dy: 0.32, size: 1.2, heightMult: 1.15 },
    { dx: 0.67, dy: 0.32, size: 1.3, heightMult: 1.2 },
    { dx: 0.40, dy: 0.42, size: 1.0, heightMult: 0.95 },
    { dx: 0.60, dy: 0.45, size: 1.1, heightMult: 1.0 },
    { dx: 0.50, dy: 0.52, size: 0.85, heightMult: 0.8 },
    { dx: 0.28, dy: 0.50, size: 0.7, heightMult: 0.65 },
    { dx: 0.72, dy: 0.48, size: 0.75, heightMult: 0.7 },
  ];

  for (let i = 0; i < Math.min(numPeaks, peakConfigs.length); i++) {
    const cfg = peakConfigs[i];
    const pkSeed = seed * 7 + i * 13;
    const pkNoise = rockN((gridX + i) * 0.25, (gridY + i) * 0.25);

    const baseX = screenX + w * cfg.dx + ((pkSeed % 5) - 2.5) * 0.4;
    const baseY = screenY + h * cfg.dy + ((pkSeed * 3 % 4) - 2) * 0.25;
    const baseWidth = (13 + (pkSeed % 5)) * cfg.size;
    const peakHeight = (15 + (pkSeed * 2 % 9)) * cfg.heightMult;

    const peakX = baseX + ((pkSeed % 3) - 1) * 0.4;
    const peakY = baseY - peakHeight;

    // Left face (shadow)
    const shadowClr = REALISTIC_MOUNTAIN.shadow;
    ctx.fillStyle = hsl(shadowClr.h + pkNoise * 4, shadowClr.s, shadowClr.l + pkNoise * 3);
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    const leftRidgeX = baseX - baseWidth * 0.28;
    const leftRidgeY = baseY - peakHeight * 0.38;
    ctx.lineTo(leftRidgeX, leftRidgeY);
    ctx.lineTo(baseX - baseWidth * 0.5, baseY);
    ctx.lineTo(baseX, baseY);
    ctx.closePath();
    ctx.fill();

    // Right face (lit)
    const peakClr = REALISTIC_MOUNTAIN.peak;
    ctx.fillStyle = hsl(peakClr.h, peakClr.s, peakClr.l);
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    const rightRidgeX = baseX + baseWidth * 0.22;
    const rightRidgeY = baseY - peakHeight * 0.32;
    ctx.lineTo(rightRidgeX, rightRidgeY);
    ctx.lineTo(baseX + baseWidth * 0.5, baseY);
    ctx.lineTo(baseX, baseY);
    ctx.closePath();
    ctx.fill();

    // Ridge line detail
    if (cfg.heightMult > 0.85) {
      ctx.fillStyle = hsl(shadowClr.h, shadowClr.s - 3, shadowClr.l + 5);
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(peakX - 0.8, peakY + peakHeight * 0.45);
      ctx.lineTo(peakX + 0.8, peakY + peakHeight * 0.45);
      ctx.closePath();
      ctx.fill();
    }

    // Snow cap on taller peaks
    if (cfg.heightMult >= 1.05 && zoom >= 0.4) {
      const snowH = peakHeight * 0.22;
      const snow = REALISTIC_MOUNTAIN.snow;
      ctx.fillStyle = hsl(snow.h, snow.s, snow.l);
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(peakX - baseWidth * 0.09, peakY + snowH);
      ctx.lineTo(peakX + baseWidth * 0.09, peakY + snowH);
      ctx.closePath();
      ctx.fill();
      
      // Snow drip
      if (cfg.heightMult >= 1.3) {
        ctx.fillStyle = hsl(snow.h, snow.s + 2, snow.l - 3);
        ctx.beginPath();
        ctx.arc(peakX - 1.5, peakY + snowH + 1.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw ore deposits
  if (hasMetalDeposit && zoom >= 0.35) {
    const numOre = 5 + (seed % 3);
    const oreClr = REALISTIC_MOUNTAIN.ore;
    const glint = REALISTIC_MOUNTAIN.oreGlint;
    
    const orePositions = [
      { dx: 0.26, dy: 0.68 },
      { dx: 0.40, dy: 0.72 },
      { dx: 0.55, dy: 0.70 },
      { dx: 0.70, dy: 0.68 },
      { dx: 0.35, dy: 0.64 },
      { dx: 0.62, dy: 0.66 },
      { dx: 0.48, dy: 0.76 },
    ];

    for (let i = 0; i < Math.min(numOre, orePositions.length); i++) {
      const pos = orePositions[i];
      const oreSeed = seed * 11 + i * 17;
      const oreX = screenX + w * pos.dx + ((oreSeed % 5) - 2.5) * 0.3;
      const oreY = screenY + h * pos.dy + ((oreSeed * 2 % 4) - 2) * 0.2;
      const oreSize = 1.8 + (oreSeed % 2);

      // Dark ore chunk
      ctx.fillStyle = hsl(oreClr.h, oreClr.s, oreClr.l);
      ctx.beginPath();
      ctx.moveTo(oreX, oreY - oreSize);
      ctx.lineTo(oreX + oreSize, oreY);
      ctx.lineTo(oreX, oreY + oreSize);
      ctx.lineTo(oreX - oreSize, oreY);
      ctx.closePath();
      ctx.fill();

      // Metallic glint
      ctx.fillStyle = hsl(glint.h, glint.s, glint.l, 0.5);
      ctx.beginPath();
      ctx.arc(oreX - oreSize * 0.3, oreY - oreSize * 0.3, oreSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Scatter some boulders at the base
  if (zoom >= 0.5) {
    const numBoulders = 6 + (seed % 4);
    for (let i = 0; i < numBoulders; i++) {
      const bSeed = seed * 19 + i * 23;
      const bx = screenX + w * 0.18 + ((bSeed % 100) / 100) * w * 0.64;
      const by = screenY + h * 0.56 + ((bSeed * 3 % 50) / 100) * h * 0.36;
      const bSize = 1.8 + (bSeed % 3);

      ctx.fillStyle = hsl(rock.h - 2, rock.s + 2, rock.l - 5);
      ctx.beginPath();
      ctx.arc(bx, by, bSize, 0, Math.PI * 2);
      ctx.fill();

      // Light highlight
      ctx.fillStyle = hsl(rock.h, rock.s - 3, rock.l + 12, 0.6);
      ctx.beginPath();
      ctx.arc(bx - bSize * 0.25, by - bSize * 0.3, bSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ============================================================================
// ENHANCED FOREST RENDERING
// ============================================================================

/**
 * Draw realistic procedural trees for forest tiles
 * (Used when sprite-based trees are not available or as enhancement)
 */
export function drawRealisticForestOverlay(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  forestDensity: number,
  zoom: number,
  animTime: number
): void {
  const noise = getTerrainNoise();
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;

  // Calculate number of trees based on density
  const numTrees = Math.floor(5 + (forestDensity / 100) * 5);

  const treePositions = [
    { dx: 0.50, dy: 0.32, scale: 1.0 },
    { dx: 0.28, dy: 0.42, scale: 0.9 },
    { dx: 0.72, dy: 0.42, scale: 0.88 },
    { dx: 0.18, dy: 0.54, scale: 0.78 },
    { dx: 0.50, dy: 0.52, scale: 0.95 },
    { dx: 0.82, dy: 0.54, scale: 0.82 },
    { dx: 0.32, dy: 0.64, scale: 0.72 },
    { dx: 0.68, dy: 0.64, scale: 0.76 },
    { dx: 0.50, dy: 0.72, scale: 0.68 },
    { dx: 0.22, dy: 0.70, scale: 0.62 },
  ];

  for (let i = 0; i < Math.min(numTrees, treePositions.length); i++) {
    const pos = treePositions[i];
    const seed = gridX * 31 + gridY * 17 + i * 7;
    const treeNoise = noise((gridX + i) * 0.4, (gridY + i) * 0.4);

    // Tree position with variation
    const treeX = screenX + w * pos.dx + (hash(seed, 0) - 0.5) * w * 0.06;
    const treeY = screenY + h * pos.dy + (hash(0, seed) - 0.5) * h * 0.04;
    const scale = pos.scale * (0.92 + hash(seed, seed) * 0.16);

    const trunkH = 5 * scale * zoom;
    const trunkW = 1.8 * scale * zoom;
    const canopyR = 6 * scale * zoom;

    // Subtle wind animation
    const windOff = Math.sin(animTime * 0.8 + seed * 0.1) * 0.4 * scale;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.ellipse(treeX + 2, treeY + 1, canopyR * 0.65, canopyR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    const trunk = REALISTIC_FOREST.trunk;
    ctx.fillStyle = hsl(trunk.h + treeNoise * 3, trunk.s, trunk.l);
    ctx.fillRect(treeX - trunkW / 2, treeY - trunkH, trunkW, trunkH);

    // Canopy layers
    const canopy = REALISTIC_FOREST.canopy;
    const canopyLight = REALISTIC_FOREST.canopyLight;
    const canopyShadow = REALISTIC_FOREST.canopyShadow;

    // Back layer (shadow)
    ctx.fillStyle = hsl(canopyShadow.h + treeNoise * 5, canopyShadow.s, canopyShadow.l);
    ctx.beginPath();
    ctx.arc(treeX + windOff * 0.4, treeY - trunkH - canopyR * 0.55, canopyR * 0.88, 0, Math.PI * 2);
    ctx.fill();

    // Main canopy
    ctx.fillStyle = hsl(canopy.h + treeNoise * 4, canopy.s, canopy.l);
    ctx.beginPath();
    ctx.arc(treeX + windOff, treeY - trunkH - canopyR * 0.75, canopyR * 0.82, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = hsl(canopyLight.h, canopyLight.s, canopyLight.l, 0.5);
    ctx.beginPath();
    ctx.arc(
      treeX + windOff * 0.6 - canopyR * 0.22,
      treeY - trunkH - canopyR - canopyR * 0.08,
      canopyR * 0.42,
      0, Math.PI * 2
    );
    ctx.fill();
  }
}

// ============================================================================
// ENHANCED SKY BACKGROUND
// ============================================================================

/**
 * Draw photorealistic sky with time-of-day lighting
 */
export function drawRealisticSky(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  timeOfDay: 'day' | 'dawn' | 'dusk' | 'night',
  animTime: number
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);

  switch (timeOfDay) {
    case 'night':
      gradient.addColorStop(0, '#080812');
      gradient.addColorStop(0.25, '#0c1018');
      gradient.addColorStop(0.5, '#101620');
      gradient.addColorStop(0.75, '#0c1210');
      gradient.addColorStop(1, '#081008');
      break;
    case 'dawn':
      gradient.addColorStop(0, '#1a2848');
      gradient.addColorStop(0.25, '#3a3050');
      gradient.addColorStop(0.45, '#6a4048');
      gradient.addColorStop(0.6, '#904838');
      gradient.addColorStop(0.75, '#b05830');
      gradient.addColorStop(1, '#1a3020');
      break;
    case 'dusk':
      gradient.addColorStop(0, '#202048');
      gradient.addColorStop(0.25, '#4a2848');
      gradient.addColorStop(0.45, '#702838');
      gradient.addColorStop(0.6, '#903828');
      gradient.addColorStop(0.75, '#a04828');
      gradient.addColorStop(1, '#182018');
      break;
    default: // day
      gradient.addColorStop(0, '#1a3050');
      gradient.addColorStop(0.15, '#204060');
      gradient.addColorStop(0.35, '#2a5575');
      gradient.addColorStop(0.55, '#356585');
      gradient.addColorStop(0.75, '#2a5545');
      gradient.addColorStop(1, '#1a3828');
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle cloud layer for day/dawn/dusk
  if (timeOfDay !== 'night') {
    const cloudN = getCloudNoise();
    ctx.save();
    ctx.globalAlpha = 0.025;
    
    for (let y = 0; y < canvas.height * 0.6; y += 60) {
      for (let x = 0; x < canvas.width; x += 60) {
        const cloudVal = octaveNoise(
          cloudN,
          (x + animTime * 8) * 0.0015,
          y * 0.0025,
          3, 0.5, 0.08
        );
        
        if (cloudVal > 0.25) {
          const intensity = (cloudVal - 0.25) / 0.75;
          ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.25})`;
          ctx.beginPath();
          ctx.ellipse(x, y, 45 + intensity * 35, 22 + intensity * 15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    ctx.restore();
  }
}

// ============================================================================
// UNIT SHADOW & EFFECTS
// ============================================================================

/**
 * Draw realistic shadow under a unit
 */
export function drawUnitShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  radius: number,
  elevation: number = 0
): void {
  const shadowOffset = 1.5 + elevation * 0.4;
  
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(
    screenX + shadowOffset,
    screenY + shadowOffset * 0.5,
    radius * 1.1,
    radius * 0.45,
    0, 0, Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

/**
 * Draw selection glow effect around a tile
 */
export function drawSelectionGlow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  animTime: number
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  const pulse = 0.5 + Math.sin(animTime * 3.5) * 0.18;

  // Outer glow
  ctx.strokeStyle = `rgba(34, 197, 94, ${0.25 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, screenY - 1.5);
  ctx.lineTo(screenX + w + 1.5, cy);
  ctx.lineTo(cx, screenY + h + 1.5);
  ctx.lineTo(screenX - 1.5, cy);
  ctx.closePath();
  ctx.stroke();

  // Inner bright line
  ctx.strokeStyle = `rgba(34, 197, 94, ${0.7 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, screenY);
  ctx.lineTo(screenX + w, cy);
  ctx.lineTo(cx, screenY + h);
  ctx.lineTo(screenX, cy);
  ctx.closePath();
  ctx.stroke();
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'smoke' | 'dust' | 'spark' | 'water_splash';
}

export class ParticleSystem {
  particles: Particle[] = [];
  maxParticles = 150;

  emit(x: number, y: number, type: Particle['type'], count = 1): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      const particle: Particle = {
        x,
        y,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2 - 1,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: this.getColor(type),
        type,
      };

      switch (type) {
        case 'smoke':
          particle.vy = -Math.random() * 1 - 0.5;
          particle.size = 4 + Math.random() * 4;
          particle.maxLife = 1 + Math.random();
          break;
        case 'dust':
          particle.vx = (Math.random() - 0.5) * 3;
          particle.vy = -Math.random();
          particle.size = 2 + Math.random() * 2;
          break;
        case 'spark':
          particle.vx = (Math.random() - 0.5) * 4;
          particle.vy = -Math.random() * 4 - 2;
          particle.size = 1 + Math.random() * 2;
          particle.maxLife = 0.3 + Math.random() * 0.3;
          break;
        case 'water_splash':
          particle.vx = (Math.random() - 0.5) * 2;
          particle.vy = -Math.random() * 3 - 1;
          particle.size = 2 + Math.random() * 2;
          particle.maxLife = 0.4 + Math.random() * 0.3;
          break;
      }

      this.particles.push(particle);
    }
  }

  update(dt: number): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt * 30;
      p.y += p.vy * dt * 30;
      p.vy += 0.5 * dt * 30;
      p.life -= dt / p.maxLife;

      if (p.type === 'smoke') {
        p.size += dt * 3;
        p.vy -= 0.7 * dt * 30;
      }

      return p.life > 0;
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private getColor(type: Particle['type']): string {
    switch (type) {
      case 'smoke': return 'rgba(70, 70, 70, 0.55)';
      case 'dust': return 'rgba(130, 110, 90, 0.45)';
      case 'spark': return 'rgba(255, 190, 40, 0.85)';
      case 'water_splash': return 'rgba(90, 160, 200, 0.6)';
      default: return 'rgba(255, 255, 255, 0.5)';
    }
  }
}

export const globalParticles = new ParticleSystem();

// ============================================================================
// OIL DEPOSIT RENDERING
// ============================================================================

/**
 * Draw realistic oil deposit patches
 */
export function drawRealisticOilDeposit(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  zoom: number
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  const seed = gridX * 31 + gridY * 17;
  const numSplotches = 5 + (seed % 3);

  // Generate oil splotches
  for (let i = 0; i < numSplotches; i++) {
    const splotchSeed = seed * 7 + i * 13;
    const baseSize = 0.07 + (splotchSeed % 50) / 1000;
    
    const dx = ((splotchSeed % 60) - 30) / 100 * w * 0.5;
    const dy = ((splotchSeed * 3 % 45) - 22) / 100 * h * 0.5;
    const splotchW = w * baseSize;
    const splotchH = h * (baseSize * 0.7 + (splotchSeed * 2 % 25) / 1000);
    const angle = ((splotchSeed * 5) % 80 - 40) * Math.PI / 180;

    const px = cx + dx;
    const py = cy + dy;

    // Dark oil base
    const darkness = 6 + (i * 2 % 5);
    ctx.fillStyle = `rgb(${darkness}, ${darkness}, ${darkness + 3})`;
    ctx.beginPath();
    ctx.ellipse(px, py, splotchW, splotchH, angle, 0, Math.PI * 2);
    ctx.fill();

    // Subtle gloss
    ctx.fillStyle = 'rgba(40, 40, 55, 0.2)';
    ctx.beginPath();
    ctx.ellipse(px - splotchW * 0.2, py - splotchH * 0.2, splotchW * 0.45, splotchH * 0.35, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiny white highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let i = 0; i < 2; i++) {
    const hx = cx + (hash(seed, i) - 0.5) * w * 0.4;
    const hy = cy + (hash(i, seed) - 0.5) * h * 0.3;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================================
// FISHING SPOT RENDERING
// ============================================================================

/**
 * Draw realistic fishing spot indicator
 */
export function drawFishingSpot(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number,
  animTime: number
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = screenX + w / 2;
  const cy = screenY + h / 2;

  const phase = ((gridX + gridY) * 0.3 + animTime) % (Math.PI * 2);
  const rippleSize = 3 + Math.sin(phase) * 1.5;

  // Draw ripples
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 0.6;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rippleSize * 2, rippleSize, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, cy, rippleSize * 3.2, rippleSize * 1.6, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Small fish silhouette
  ctx.fillStyle = 'rgba(60, 120, 140, 0.35)';
  ctx.globalAlpha = 0.35;
  const fishX = cx + Math.sin(phase * 2) * 3.5;
  const fishY = cy + Math.cos(phase) * 1.5;

  ctx.beginPath();
  ctx.ellipse(fishX, fishY, 3.5, 1.8, Math.sin(phase) * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Tail
  ctx.beginPath();
  ctx.moveTo(fishX - 3.5, fishY);
  ctx.lineTo(fishX - 6, fishY - 1.8);
  ctx.lineTo(fishX - 6, fishY + 1.8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
