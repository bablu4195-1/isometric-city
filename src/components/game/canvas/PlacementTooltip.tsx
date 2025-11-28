'use client';

import React, { memo } from 'react';

import { Tool, TOOL_INFO, Tile, BuildingType } from '@/types/game';
import { requiresWaterAdjacency, getWaterAdjacency, getBuildingSize } from '@/lib/simulation';

interface PlacementTooltipProps {
  hoveredTile: { x: number; y: number } | null;
  selectedTool: Tool;
  isDragging: boolean;
  dragStartTile: { x: number; y: number } | null;
  dragEndTile: { x: number; y: number } | null;
  showsDragGrid: boolean;
  supportsDragPlace: boolean;
  grid: Tile[][];
  gridSize: number;
}

export const PlacementTooltip = memo(function PlacementTooltip({
  hoveredTile,
  selectedTool,
  isDragging,
  dragStartTile,
  dragEndTile,
  showsDragGrid,
  supportsDragPlace,
  grid,
  gridSize,
}: PlacementTooltipProps) {
  if (!hoveredTile || selectedTool === 'select' || !TOOL_INFO[selectedTool]) {
    return null;
  }

  const buildingType = selectedTool as unknown as BuildingType;
  const isWaterfrontTool = requiresWaterAdjacency(buildingType);
  let isWaterfrontPlacementInvalid = false;

  if (isWaterfrontTool && hoveredTile) {
    const size = getBuildingSize(buildingType);
    const waterCheck = getWaterAdjacency(grid, hoveredTile.x, hoveredTile.y, size.width, size.height, gridSize);
    isWaterfrontPlacementInvalid = !waterCheck.hasWater;
  }

  const areaLabel =
    dragStartTile && dragEndTile
      ? `${Math.abs(dragEndTile.x - dragStartTile.x) + 1}x${Math.abs(dragEndTile.y - dragStartTile.y) + 1} area`
      : '';
  const areaCost =
    dragStartTile && dragEndTile
      ? TOOL_INFO[selectedTool].cost > 0
        ? ` - $${TOOL_INFO[selectedTool].cost *
            (Math.abs(dragEndTile.x - dragStartTile.x) + 1) *
            (Math.abs(dragEndTile.y - dragStartTile.y) + 1)}`
        : ''
      : '';

  return (
    <div
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm ${
        isWaterfrontPlacementInvalid
          ? 'bg-destructive/90 border border-destructive-foreground/30 text-destructive-foreground'
          : 'bg-card/90 border border-border'
      }`}
    >
      {isDragging && dragStartTile && dragEndTile && showsDragGrid ? (
        <>
          {TOOL_INFO[selectedTool].name} - {areaLabel}
          {areaCost}
        </>
      ) : isWaterfrontPlacementInvalid ? (
        <>{TOOL_INFO[selectedTool].name} must be placed next to water</>
      ) : (
        <>
          {TOOL_INFO[selectedTool].name} at ({hoveredTile.x}, {hoveredTile.y})
          {TOOL_INFO[selectedTool].cost > 0 && ` - $${TOOL_INFO[selectedTool].cost}`}
          {showsDragGrid && ' - Drag to zone area'}
          {supportsDragPlace && !showsDragGrid && ' - Drag to place'}
        </>
      )}
    </div>
  );
});
