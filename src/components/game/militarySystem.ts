/**
 * Military Unit System
 * 
 * Handles rendering and interaction for military units in competitive mode.
 */

import { MilitaryUnit, MilitaryUnitType, CompetitiveState } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { gridToScreen } from './utils';

// Player colors
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308'];

/**
 * Draw a single military unit
 */
function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: MilitaryUnit,
  zoom: number
) {
  const playerColor = PLAYER_COLORS[unit.playerId] || '#888888';
  const { screenX, screenY } = gridToScreen(unit.tileX, unit.tileY, 0, 0);
  
  // Calculate screen position based on unit's x/y
  const unitScreenX = screenX + TILE_WIDTH / 2 + (unit.x - unit.tileX * 64);
  const unitScreenY = screenY + TILE_HEIGHT / 2 + (unit.y - unit.tileY * 32);
  
  // Altitude offset for helicopters
  const altitudeOffset = unit.altitude ? -20 * unit.altitude : 0;
  
  ctx.save();
  ctx.translate(unitScreenX, unitScreenY + altitudeOffset);
  
  // Draw selection ring if selected
  if (unit.selected) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    
    // Selection glow
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Draw health bar
  const healthPercent = unit.health / unit.maxHealth;
  const healthBarWidth = 20;
  const healthBarHeight = 3;
  
  ctx.fillStyle = '#333';
  ctx.fillRect(-healthBarWidth / 2, -18, healthBarWidth, healthBarHeight);
  
  ctx.fillStyle = healthPercent > 0.5 ? '#22c55e' : healthPercent > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillRect(-healthBarWidth / 2, -18, healthBarWidth * healthPercent, healthBarHeight);
  
  // Draw unit based on type
  ctx.rotate(unit.direction);
  
  switch (unit.type) {
    case 'infantry': {
      // Body
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Head
      ctx.fillStyle = '#f5d0c0';
      ctx.beginPath();
      ctx.arc(0, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Helmet
      ctx.fillStyle = '#4a5568';
      ctx.beginPath();
      ctx.arc(0, -5, 3.5, Math.PI, 0);
      ctx.fill();
      
      // Gun
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      break;
    }
    
    case 'tank': {
      // Tank body
      ctx.fillStyle = playerColor;
      ctx.fillRect(-12, -6, 24, 12);
      
      // Tracks
      ctx.fillStyle = '#333';
      ctx.fillRect(-12, -7, 24, 2);
      ctx.fillRect(-12, 5, 24, 2);
      
      // Turret
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Cannon
      ctx.fillStyle = '#444';
      ctx.fillRect(6, -2, 12, 4);
      
      // Detail
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    
    case 'military_helicopter': {
      // Helicopter body
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Cockpit
      ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(6, 0, 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Tail
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-20, -2);
      ctx.lineTo(-20, 2);
      ctx.closePath();
      ctx.fill();
      
      // Tail rotor
      ctx.fillStyle = '#888';
      const tailRotorAngle = unit.animTimer * 15;
      ctx.save();
      ctx.translate(-18, 0);
      ctx.rotate(tailRotorAngle);
      ctx.fillRect(-1, -4, 2, 8);
      ctx.restore();
      
      // Main rotor
      ctx.fillStyle = 'rgba(150, 150, 150, 0.8)';
      const rotorAngle = unit.animTimer * 20;
      ctx.save();
      ctx.rotate(rotorAngle);
      ctx.fillRect(-15, -1, 30, 2);
      ctx.fillRect(-1, -15, 2, 30);
      ctx.restore();
      
      // Rotor blur effect
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Shadow on ground
      ctx.restore();
      ctx.save();
      ctx.translate(unitScreenX + 4, unitScreenY + 4);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return; // Already restored
    }
  }
  
  ctx.restore();
}

/**
 * Draw all military units
 */
export function drawMilitaryUnits(
  ctx: CanvasRenderingContext2D,
  competitive: CompetitiveState | undefined,
  offset: { x: number; y: number },
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
) {
  if (!competitive) return;
  
  const dpr = window.devicePixelRatio || 1;
  
  ctx.save();
  ctx.scale(dpr * zoom, dpr * zoom);
  ctx.translate(offset.x / zoom, offset.y / zoom);
  
  // Draw units sorted by y position for proper depth
  const sortedUnits = [...competitive.units]
    .filter(u => u.state !== 'destroyed')
    .sort((a, b) => a.tileY - b.tileY);
  
  for (const unit of sortedUnits) {
    drawUnit(ctx, unit, zoom);
  }
  
  // Draw selection box if active
  if (competitive.selectionBox) {
    const box = competitive.selectionBox;
    const minX = Math.min(box.startX, box.endX);
    const minY = Math.min(box.startY, box.endY);
    const width = Math.abs(box.endX - box.startX);
    const height = Math.abs(box.endY - box.startY);
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(minX, minY, width, height);
    ctx.setLineDash([]);
    
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(minX, minY, width, height);
  }
  
  ctx.restore();
}

/**
 * Draw fog of war overlay
 */
export function drawFogOfWar(
  ctx: CanvasRenderingContext2D,
  fogOfWar: CompetitiveState['fogOfWar'] | undefined,
  gridSize: number,
  offset: { x: number; y: number },
  zoom: number
) {
  if (!fogOfWar) return;
  
  const dpr = window.devicePixelRatio || 1;
  
  ctx.save();
  ctx.scale(dpr * zoom, dpr * zoom);
  ctx.translate(offset.x / zoom, offset.y / zoom);
  
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const explored = fogOfWar.explored[y]?.[x] ?? false;
      const visible = fogOfWar.visible[y]?.[x] ?? false;
      
      if (!explored) {
        // Completely unexplored - solid dark
        const { screenX, screenY } = gridToScreen(x, y, 0, 0);
        
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.moveTo(screenX + TILE_WIDTH / 2, screenY);
        ctx.lineTo(screenX + TILE_WIDTH, screenY + TILE_HEIGHT / 2);
        ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT);
        ctx.lineTo(screenX, screenY + TILE_HEIGHT / 2);
        ctx.closePath();
        ctx.fill();
      } else if (!visible) {
        // Explored but not currently visible - dark tint
        const { screenX, screenY } = gridToScreen(x, y, 0, 0);
        
        ctx.fillStyle = 'rgba(26, 26, 46, 0.6)';
        ctx.beginPath();
        ctx.moveTo(screenX + TILE_WIDTH / 2, screenY);
        ctx.lineTo(screenX + TILE_WIDTH, screenY + TILE_HEIGHT / 2);
        ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT);
        ctx.lineTo(screenX, screenY + TILE_HEIGHT / 2);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  
  ctx.restore();
}

/**
 * Find units within a selection box
 */
export function findUnitsInSelectionBox(
  units: MilitaryUnit[],
  box: { startX: number; startY: number; endX: number; endY: number },
  offset: { x: number; y: number },
  zoom: number
): number[] {
  const minX = Math.min(box.startX, box.endX);
  const maxX = Math.max(box.startX, box.endX);
  const minY = Math.min(box.startY, box.endY);
  const maxY = Math.max(box.startY, box.endY);
  
  const selectedIds: number[] = [];
  
  for (const unit of units) {
    if (unit.playerId !== 0 || unit.state === 'destroyed') continue;
    
    const { screenX, screenY } = gridToScreen(unit.tileX, unit.tileY, 0, 0);
    const unitScreenX = screenX + TILE_WIDTH / 2;
    const unitScreenY = screenY + TILE_HEIGHT / 2;
    
    // Transform to match the selection box coordinate space
    const adjustedX = unitScreenX * zoom + offset.x;
    const adjustedY = unitScreenY * zoom + offset.y;
    
    if (adjustedX >= minX && adjustedX <= maxX && adjustedY >= minY && adjustedY <= maxY) {
      selectedIds.push(unit.id);
    }
  }
  
  return selectedIds;
}

/**
 * Find if a click hit any unit
 */
export function findUnitAtPosition(
  units: MilitaryUnit[],
  screenX: number,
  screenY: number,
  offset: { x: number; y: number },
  zoom: number
): MilitaryUnit | null {
  for (const unit of units) {
    if (unit.state === 'destroyed') continue;
    
    const { screenX: tileScreenX, screenY: tileScreenY } = gridToScreen(unit.tileX, unit.tileY, 0, 0);
    const unitScreenX = (tileScreenX + TILE_WIDTH / 2) * zoom + offset.x;
    const unitScreenY = (tileScreenY + TILE_HEIGHT / 2) * zoom + offset.y;
    
    const dist = Math.sqrt(
      Math.pow(screenX - unitScreenX, 2) + Math.pow(screenY - unitScreenY, 2)
    );
    
    if (dist < 15 * zoom) {
      return unit;
    }
  }
  
  return null;
}
