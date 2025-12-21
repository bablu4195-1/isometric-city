'use client';

import React from 'react';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MILITARY_UNIT_STATS, MilitaryUnitType } from '@/types/game';

export function MilitaryPanel() {
  const { state, setActivePanel, trainUnit, isCompetitiveMode } = useGame();
  
  if (!isCompetitiveMode || !state.competitive) {
    return null;
  }
  
  const { players, units } = state.competitive;
  const playerUnits = units.filter(u => u.playerId === 0 && u.state !== 'destroyed');
  const money = state.stats.money;
  
  const handleTrainUnit = (type: MilitaryUnitType) => {
    trainUnit(type);
  };
  
  const unitTypes: MilitaryUnitType[] = ['infantry', 'tank', 'military_helicopter'];
  
  return (
    <div className="absolute left-60 top-14 w-72 bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
        <h2 className="font-semibold text-sm">Military Command</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setActivePanel('none')}
          className="h-6 w-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>
      
      <div className="p-3 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Unit training section */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Train Units
          </h3>
          <div className="space-y-2">
            {unitTypes.map(type => {
              const stats = MILITARY_UNIT_STATS[type];
              const canAfford = money >= stats.cost;
              
              return (
                <Button
                  key={type}
                  onClick={() => handleTrainUnit(type)}
                  disabled={!canAfford}
                  variant="outline"
                  className="w-full justify-between h-auto py-2 px-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {type === 'infantry' ? '🪖' : type === 'tank' ? '🛡️' : '🚁'}
                    </span>
                    <div className="text-left">
                      <div className="font-medium text-sm">{stats.name}</div>
                      <div className="text-xs text-muted-foreground">
                        HP: {stats.health} | DMG: {stats.damage}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${canAfford ? 'text-green-500' : 'text-red-500'}`}>
                    ${stats.cost}
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
        
        {/* Your forces section */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Your Forces ({playerUnits.length})
          </h3>
          <div className="space-y-1 text-sm">
            {unitTypes.map(type => {
              const count = playerUnits.filter(u => u.type === type).length;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center justify-between py-1 px-2 bg-muted/30 rounded">
                  <span>{MILITARY_UNIT_STATS[type].name}</span>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            {playerUnits.length === 0 && (
              <div className="text-muted-foreground text-center py-2">
                No units trained yet
              </div>
            )}
          </div>
        </div>
        
        {/* Tips section */}
        <div className="border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Controls
          </h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>Left click + drag</strong> to select units</p>
            <p>• <strong>Right click</strong> to move or attack</p>
            <p>• Destroy enemy city halls to eliminate them</p>
          </div>
        </div>
      </div>
    </div>
  );
}
