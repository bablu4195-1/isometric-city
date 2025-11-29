/**
 * Pedestrian drawing utilities
 * Extracted from CanvasIsometricGrid for better modularity
 */

import { Tile } from '@/types/game';
import { Pedestrian, TILE_WIDTH, TILE_HEIGHT } from './types';
import { DIRECTION_META } from './constants';
import { gridToScreen } from './utils';
import { isEntityBehindBuilding } from './renderHelpers';

/**
 * Draw pedestrians with simple SVG-style sprites
 */
export function drawPedestrians(
  ctx: CanvasRenderingContext2D,
  pedestrians: Pedestrian[],
  grid: Tile[][],
  gridSize: number,
  viewBounds: { viewLeft: number; viewTop: number; viewRight: number; viewBottom: number }
): void {
  if (pedestrians.length === 0) return;

  pedestrians.forEach((ped) => {
    if (ped.state === 'inside_building') {
      return;
    }
    
    const useAnchorPosition = ped.state !== 'walking';
    const anchorTileX = useAnchorPosition ? ped.activityAnchorX ?? ped.destX ?? ped.tileX : ped.tileX;
    const anchorTileY = useAnchorPosition ? ped.activityAnchorY ?? ped.destY ?? ped.tileY : ped.tileY;
    
    const { screenX, screenY } = gridToScreen(anchorTileX, anchorTileY, 0, 0);
    const centerX = screenX + TILE_WIDTH / 2;
    const centerY = screenY + TILE_HEIGHT / 2;
    
    let pedX = centerX;
    let pedY = centerY;
    
    if (useAnchorPosition) {
      pedX += ped.activityOffsetX;
      pedY += ped.activityOffsetY;
    } else {
      const meta = DIRECTION_META[ped.direction];
      const sidewalkOffset = ped.sidewalkSide === 'left' ? -12 : 12;
      pedX = centerX + meta.vec.dx * ped.progress + meta.normal.nx * sidewalkOffset;
      pedY = centerY + meta.vec.dy * ped.progress + meta.normal.ny * sidewalkOffset;
    }

    // Viewport culling
    if (
      pedX < viewBounds.viewLeft - 20 ||
      pedX > viewBounds.viewRight + 20 ||
      pedY < viewBounds.viewTop - 40 ||
      pedY > viewBounds.viewBottom + 40
    ) {
      return;
    }
    
    // Check if pedestrian is behind a building (use anchor when interacting)
    if (isEntityBehindBuilding(grid, gridSize, anchorTileX, anchorTileY)) {
      return;
    }

    ctx.save();
    
    let alpha = 1;
    if (ped.state === 'entering_building') {
      const progress = ped.stateDuration > 0 ? Math.min(1, ped.stateTimer / ped.stateDuration) : 1;
      alpha = 1 - progress * 0.7;
    } else if (ped.state === 'exiting_building') {
      const progress = ped.stateDuration > 0 ? Math.min(1, ped.stateTimer / ped.stateDuration) : 1;
      alpha = 0.4 + progress * 0.6;
    }
    
    ctx.globalAlpha *= alpha;
    ctx.translate(pedX, pedY);

    // Walking animation - bob up and down and sway
    const walkBob = Math.sin(ped.walkOffset) * 0.8;
    const walkSway = Math.sin(ped.walkOffset * 0.5) * 0.5;

    // Scale for pedestrian (smaller, more realistic)
    const scale = 0.35;

    // Draw simple stick figure pedestrian (SVG-style)
    // Head
    ctx.fillStyle = ped.skinColor;
    ctx.beginPath();
    ctx.arc(walkSway * scale, (-12 + walkBob) * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Body (shirt)
    ctx.fillStyle = ped.shirtColor;
    ctx.beginPath();
    ctx.ellipse(walkSway * scale, (-5 + walkBob) * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (animated)
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5 * scale;
    ctx.lineCap = 'round';

    // Left leg
    const leftLegSwing = Math.sin(ped.walkOffset) * 3;
    ctx.beginPath();
    ctx.moveTo(walkSway * scale, (-1 + walkBob) * scale);
    ctx.lineTo((walkSway - 1 + leftLegSwing) * scale, (5 + walkBob) * scale);
    ctx.stroke();

    // Right leg
    const rightLegSwing = Math.sin(ped.walkOffset + Math.PI) * 3;
    ctx.beginPath();
    ctx.moveTo(walkSway * scale, (-1 + walkBob) * scale);
    ctx.lineTo((walkSway + 1 + rightLegSwing) * scale, (5 + walkBob) * scale);
    ctx.stroke();

    // Arms (animated)
    ctx.strokeStyle = ped.skinColor;
    ctx.lineWidth = 1.2 * scale;

    // Left arm
    const leftArmSwing = Math.sin(ped.walkOffset + Math.PI) * 2;
    ctx.beginPath();
    ctx.moveTo((walkSway - 2) * scale, (-6 + walkBob) * scale);
    ctx.lineTo((walkSway - 3 + leftArmSwing) * scale, (-2 + walkBob) * scale);
    ctx.stroke();

    // Right arm
    const rightArmSwing = Math.sin(ped.walkOffset) * 2;
    ctx.beginPath();
    ctx.moveTo((walkSway + 2) * scale, (-6 + walkBob) * scale);
    ctx.lineTo((walkSway + 3 + rightArmSwing) * scale, (-2 + walkBob) * scale);
    ctx.stroke();

    ctx.restore();
  });
}
