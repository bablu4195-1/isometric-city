/**
 * Rise of Nations - Building Info Panel
 * 
 * Displays building information and allows queuing units for production buildings.
 * Styled to match IsoCity's TileInfoPanel for consistency.
 */
'use client';

import React from 'react';
import { useRoN } from '../context/RoNContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CloseIcon } from '@/components/ui/Icons';
import { BUILDING_STATS, RoNBuildingType, UNIT_PRODUCTION_BUILDINGS } from '../types/buildings';
import { UNIT_STATS, UnitType } from '../types/units';
import { ResourceType, RESOURCE_INFO } from '../types/resources';

interface RoNBuildingPanelProps {
  onClose: () => void;
}

export function RoNBuildingPanel({ onClose }: RoNBuildingPanelProps) {
  const { state, getCurrentPlayer, queueUnit, selectBuilding, selectedBuildingPos } = useRoN();
  const currentPlayer = getCurrentPlayer();
  
  if (!selectedBuildingPos || !currentPlayer) return null;
  
  const { x, y } = selectedBuildingPos;
  const tile = state.grid[y]?.[x];
  
  if (!tile?.building) return null;
  
  const building = tile.building;
  const buildingType = building.type as RoNBuildingType;
  const buildingStats = BUILDING_STATS[buildingType];
  
  // Check if this building can produce units
  const producableUnits = (UNIT_PRODUCTION_BUILDINGS[buildingType] || []) as UnitType[];
  const canProduce = producableUnits.length > 0 && building.constructionProgress >= 100;
  
  // Check if building is under construction
  const isConstructing = building.constructionProgress < 100;
  
  // Get health bar color
  const healthPercent = (building.health / building.maxHealth) * 100;
  
  // Check if we can afford a unit
  const canAffordUnit = (unitType: UnitType): boolean => {
    const stats = UNIT_STATS[unitType];
    if (!stats?.cost) return true;
    
    for (const [resource, amount] of Object.entries(stats.cost)) {
      if (amount && currentPlayer.resources[resource as ResourceType] < amount) {
        return false;
      }
    }
    return true;
  };
  
  const handleQueueUnit = (unitType: UnitType) => {
    queueUnit({ x, y }, unitType);
  };
  
  const handleClose = () => {
    selectBuilding(null);
    onClose();
  };
  
  // Count workers at this building (distinguish between traveling and working)
  const allWorkersHere = state.units.filter(u => 
    u.ownerId === currentPlayer.id &&
    u.task?.startsWith('gather_') &&
    u.taskTarget &&
    typeof u.taskTarget === 'object' &&
    'x' in u.taskTarget &&
    Math.floor(u.taskTarget.x) === x &&
    Math.floor(u.taskTarget.y) === y
  );
  const workingWorkers = allWorkersHere.filter(u => !u.isMoving);
  const travelingWorkers = allWorkersHere.filter(u => u.isMoving);
  
  return (
    <Card className="absolute top-4 right-4 w-72">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-sans capitalize">
          {buildingType.replace(/_/g, ' ')}
        </CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={handleClose}>
          <CloseIcon size={14} />
        </Button>
      </CardHeader>
      
      <CardContent className="space-y-3 text-sm">
        {/* Location - matches IsoCity style */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Location</span>
          <span>({x}, {y})</span>
        </div>
        
        {/* Owner */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Owner</span>
          <Badge variant={tile.ownerId === currentPlayer.id ? 'default' : 'destructive'}>
            {tile.ownerId === currentPlayer.id ? 'You' : 'Enemy'}
          </Badge>
        </div>
        
        {/* Health */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Health</span>
          <span className={healthPercent > 60 ? 'text-green-500' : healthPercent > 30 ? 'text-amber-500' : 'text-red-500'}>
            {building.health}/{building.maxHealth}
          </span>
        </div>
        
        {/* Construction Progress */}
        {isConstructing && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Construction</span>
            <span className="text-amber-500">{Math.round(building.constructionProgress)}%</span>
          </div>
        )}
        
        {/* Building Level */}
        {building.level > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Level</span>
            <span>{building.level}</span>
          </div>
        )}
        
        {/* Building Stats */}
        {buildingStats && (
          <>
            {buildingStats.providesHousing && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Housing</span>
                <span className="text-green-500">+{buildingStats.providesHousing}</span>
              </div>
            )}
            
            {buildingStats.attackDamage && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attack</span>
                <span className="text-red-500">{buildingStats.attackDamage}</span>
              </div>
            )}
            
            {buildingStats.attackRange && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Range</span>
                <span>{buildingStats.attackRange}</span>
              </div>
            )}
            
            {buildingStats.garrisonSlots && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Garrison</span>
                <span>{buildingStats.garrisonSlots} slots</span>
              </div>
            )}
          </>
        )}
        
        {/* Workers Assigned */}
        {allWorkersHere.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Workers</span>
            <span>
              {workingWorkers.length > 0 && (
                <span className="text-green-500">{workingWorkers.length} working</span>
              )}
              {workingWorkers.length > 0 && travelingWorkers.length > 0 && ', '}
              {travelingWorkers.length > 0 && (
                <span className="text-amber-500">{travelingWorkers.length} en route</span>
              )}
            </span>
          </div>
        )}
        
        {/* Production Queue */}
        {building.queuedUnits.length > 0 && (
          <>
            <Separator />
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Production Queue</div>
            <div className="space-y-1">
              {building.queuedUnits.map((unitType, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="capitalize text-xs">{unitType.replace(/_/g, ' ')}</span>
                  {index === 0 && (
                    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${building.productionProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        
        {/* Unit Production - only for your buildings */}
        {canProduce && tile.ownerId === currentPlayer.id && (
          <>
            <Separator />
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Train Units</div>
            <div className="grid grid-cols-2 gap-1">
              {producableUnits.map(unitType => {
                const stats = UNIT_STATS[unitType];
                const canAfford = canAffordUnit(unitType);
                const queueFull = building.queuedUnits.length >= 5;
                const popFull = currentPlayer.population >= currentPlayer.populationCap;
                const disabled = !canAfford || queueFull || popFull;
                
                return (
                  <Button
                    key={unitType}
                    size="sm"
                    variant={disabled ? 'outline' : 'default'}
                    disabled={disabled}
                    onClick={() => handleQueueUnit(unitType)}
                    className="h-auto py-1 px-2"
                  >
                    <div className="flex flex-col items-center text-xs">
                      <span className="capitalize">{unitType.replace(/_/g, ' ')}</span>
                      {stats?.cost && (
                        <span className="text-[9px] opacity-70">
                          {Object.entries(stats.cost)
                            .filter(([, v]) => v && v > 0)
                            .map(([r, v]) => `${RESOURCE_INFO[r as ResourceType]?.icon || r[0]}${v}`)
                            .join(' ')}
                        </span>
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
            {currentPlayer.population >= currentPlayer.populationCap && (
              <div className="text-xs text-red-500 text-center">
                Population cap reached
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
