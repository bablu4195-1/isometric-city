'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRiseGame } from '@/context/RiseGameContext';
import { RiseTile } from '@/games/rise/types';
import { TILE_HEIGHT, TILE_WIDTH } from '@/components/game/types';
import { getRiseSpritePack, getSpriteCoords } from '@/lib/renderConfig';

const TW = TILE_WIDTH;
const TH = TILE_HEIGHT;

function gridToScreen(x: number, y: number, offset: { x: number; y: number }) {
  return {
    x: (x - y) * (TW / 2) + offset.x,
    y: (x + y) * (TH / 2) + offset.y,
  };
}

function screenToGrid(sx: number, sy: number, offset: { x: number; y: number }) {
  const adjustedX = sx - offset.x - TW / 2;
  const adjustedY = sy - offset.y - TH / 2;
  const gx = (adjustedX / (TW / 2) + adjustedY / (TH / 2)) / 2;
  const gy = (adjustedY / (TH / 2) - adjustedX / (TW / 2)) / 2;
  return { x: Math.round(gx), y: Math.round(gy) };
}

function drawDiamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, fill: string, stroke = '#0f172a') {
  ctx.beginPath();
  ctx.moveTo(sx, sy - h / 2);
  ctx.lineTo(sx + w / 2, sy);
  ctx.lineTo(sx, sy + h / 2);
  ctx.lineTo(sx - w / 2, sy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function getTileColor(tile: RiseTile): string {
  if (tile.terrain === 'water') return '#0ea5e9';
  if (tile.terrain === 'mountain') return '#94a3b8';
  if (tile.terrain === 'forest') return '#166534';
  return '#1e293b';
}

function getNodeAccent(tile: RiseTile): string | null {
  if (!tile.node) return null;
  switch (tile.node.type) {
    case 'forest':
      return '#22c55e';
    case 'mine':
      return '#f59e0b';
    case 'oil':
      return '#0f172a';
    case 'fertile':
      return '#84cc16';
    case 'rare':
      return '#c084fc';
    default:
      return null;
  }
}

export function RiseCanvas({
  activeBuild,
  onBuildPlaced,
}: {
  activeBuild?: string | null;
  onBuildPlaced?: () => void;
}) {
  const { state, issueMove, issueGather, selectUnits, placeBuilding, issueAttack } = useRiseGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  const [offset] = useState<{ x: number; y: number }>({ x: 520, y: 120 });
  const [spriteImage, setSpriteImage] = useState<HTMLImageElement | null>(null);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);

  const playerAge = useMemo(() => state.players.find(p => p.id === state.localPlayerId)?.age, [state.players, state.localPlayerId]);

  const isPlacementValid = useCallback(
    (type: string, x: number, y: number) => {
      if (x < 0 || y < 0 || y >= state.gridSize || x >= state.gridSize) return false;
      const tile = state.tiles[y][x];
      if (tile.terrain === 'water') return false;
      if (tile.buildingId) return false;
      if (type === 'farm') {
        return tile.node?.type === 'fertile';
      }
      if (type === 'oil_rig') {
        return tile.node?.type === 'oil';
      }
      return true;
    },
    [state.gridSize, state.tiles]
  );

  // Load age sprite
  useEffect(() => {
    if (!playerAge) return;
    const pack = getRiseSpritePack(playerAge);
    const img = new Image();
    img.onload = () => setSpriteImage(img);
    img.src = pack.src;
    return () => {
      setSpriteImage(null);
    };
  }, [playerAge]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { tiles, units, buildings, gridSize } = state;

    const player = state.players.find(p => p.id === state.localPlayerId);
    const spritePack = player ? getRiseSpritePack(player.age) : null;

    // Draw tiles
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const tile = tiles[y][x];
        const { x: sx, y: sy } = gridToScreen(x, y, offset);
        drawDiamond(ctx, sx, sy, TW, TH, getTileColor(tile), '#0b1220');
        const accent = getNodeAccent(tile);
        if (accent) {
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
        }
      }
    }

    // Buildings
    for (const b of buildings) {
      const { x: sx, y: sy } = gridToScreen(b.tile.x, b.tile.y, offset);
      let drewSprite = false;
      if (spritePack && spriteImage) {
        const coords = getSpriteCoords(b.type, spriteImage.width, spriteImage.height, spritePack);
        if (coords) {
          const scale = 0.8;
          const drawW = (spriteImage.width / spritePack.cols) * scale;
          const drawH = (spriteImage.height / spritePack.rows) * scale;
          ctx.drawImage(spriteImage, coords.sx, coords.sy, coords.sw, coords.sh, sx - drawW / 2, sy - drawH, drawW, drawH);
          drewSprite = true;
        }
      }
      if (!drewSprite) {
        drawDiamond(ctx, sx, sy - 8, TW * 0.9, TH * 0.7, b.ownerId === state.localPlayerId ? '#38bdf8' : '#f97316', '#0f172a');
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.type.replace('_', ' '), sx, sy - 16);
    }

    // Units
    for (const u of units) {
      const { x: sx, y: sy } = gridToScreen(u.position.x, u.position.y, offset);
      ctx.beginPath();
      ctx.arc(sx, sy - 6, 6, 0, Math.PI * 2);
      ctx.fillStyle = u.ownerId === state.localPlayerId ? '#38bdf8' : '#f97316';
      ctx.fill();
      if (state.selectedUnitIds.has(u.id)) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Drag selection
    if (dragStart && dragEnd) {
      const x = Math.min(dragStart.x, dragEnd.x);
      const y = Math.min(dragStart.y, dragEnd.y);
      const w = Math.abs(dragStart.x - dragEnd.x);
      const h = Math.abs(dragStart.y - dragEnd.y);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Hover placement
    if (activeBuild && hoverTile) {
      const { x: sx, y: sy } = gridToScreen(hoverTile.x, hoverTile.y, offset);
      const valid = isPlacementValid(activeBuild, hoverTile.x, hoverTile.y);
      drawDiamond(ctx, sx, sy, TW, TH, valid ? 'rgba(34,197,94,0.35)' : 'rgba(248,113,113,0.35)', valid ? '#22c55e' : '#ef4444');
    }
  }, [state, dragStart, dragEnd, offset, spriteImage, activeBuild, hoverTile, isPlacementValid]);

  // Event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      setDragStart({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
      setDragEnd(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragStart) {
      setDragEnd({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    }
    const { x, y } = screenToGrid(e.nativeEvent.offsetX, e.nativeEvent.offsetY, offset);
    setHoverTile({ x, y });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (dragStart && dragEnd) {
      // Selection
      const x1 = Math.min(dragStart.x, dragEnd.x);
      const x2 = Math.max(dragStart.x, dragEnd.x);
      const y1 = Math.min(dragStart.y, dragEnd.y);
      const y2 = Math.max(dragStart.y, dragEnd.y);
      const selected: string[] = [];
      for (const u of state.units) {
        const { x: sx, y: sy } = gridToScreen(u.position.x, u.position.y, offset);
        if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
          selected.push(u.id);
        }
      }
      selectUnits(selected);
    } else if (dragStart) {
      // Single click selection or build placement
      const { offsetX, offsetY } = e.nativeEvent;
      const { x, y } = screenToGrid(offsetX, offsetY, offset);
      if (activeBuild) {
        if (isPlacementValid(activeBuild, x, y)) {
          placeBuilding(activeBuild, x, y);
          onBuildPlaced?.();
        }
      } else {
        let closest: { id: string; dist: number } | null = null;
        for (const u of state.units) {
          const { x: sx, y: sy } = gridToScreen(u.position.x, u.position.y, offset);
          const dist = Math.hypot(sx - offsetX, sy - offsetY);
          if (!closest || dist < closest.dist) {
            closest = { id: u.id, dist };
          }
        }
        if (closest && closest.dist < 20) {
          selectUnits([closest.id]);
        } else {
          selectUnits([]);
        }
      }
    } else if (e.button === 2) {
      const { offsetX, offsetY } = e.nativeEvent;
      const { x, y } = screenToGrid(offsetX, offsetY, offset);
      const targetTile = state.tiles[y]?.[x];
      const nodeType = targetTile?.node?.type;
      const unitIds = Array.from(state.selectedUnitIds);
      if (unitIds.length > 0) {
        // Check enemy unit or building
        const clickX = offsetX;
        const clickY = offsetY;
        let enemyUnit: { id: string; dist: number } | null = null;
        for (const u of state.units) {
          if (u.ownerId === state.localPlayerId) continue;
          const { x: sx, y: sy } = gridToScreen(u.position.x, u.position.y, offset);
          const dist = Math.hypot(sx - clickX, sy - clickY);
          if (dist < 18 && (!enemyUnit || dist < enemyUnit.dist)) {
            enemyUnit = { id: u.id, dist };
          }
        }
        let enemyBuilding: { id: string; dist: number } | null = null;
        for (const b of state.buildings) {
          if (b.ownerId === state.localPlayerId) continue;
          const { x: sx, y: sy } = gridToScreen(b.tile.x, b.tile.y, offset);
          const dist = Math.hypot(sx - clickX, sy - clickY);
          if (dist < 22 && (!enemyBuilding || dist < enemyBuilding.dist)) {
            enemyBuilding = { id: b.id, dist };
          }
        }

        const attackMove = e.shiftKey;
        if (enemyUnit) {
          issueAttack(unitIds, { x, y }, enemyUnit.id, undefined);
        } else if (enemyBuilding) {
          issueAttack(unitIds, { x, y }, undefined, enemyBuilding.id);
        } else if (attackMove) {
          issueAttack(unitIds, { x, y });
        } else if (nodeType) {
          issueGather(unitIds, { x, y }, nodeType);
        } else {
          issueMove(unitIds, { x, y });
        }
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  // Right-click context menu prevent
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', handler);
    return () => canvas.removeEventListener('contextmenu', handler);
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <canvas
        ref={canvasRef}
        width={1400}
        height={900}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}
