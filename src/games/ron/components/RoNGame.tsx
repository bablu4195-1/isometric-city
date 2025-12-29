/**
 * Rise of Nations - Main Game Component
 * 
 * Integrates all game components: canvas, sidebar, minimap.
 */
'use client';

import React, { useState, useCallback } from 'react';
import { RoNProvider, useRoN } from '../context/RoNContext';
import { RoNCanvas } from './RoNCanvas';
import { RoNSidebar } from './RoNSidebar';
import { RoNMiniMap } from './RoNMiniMap';
import { RoNBuildingPanel } from './RoNBuildingPanel';
import { Button } from '@/components/ui/button';
import { AGE_INFO } from '../types/ages';
import { PLAYER_COLORS } from '../lib/renderConfig';
import { SpeedControl } from '@/components/game/shared';
import { StatBadge } from '@/components/game/TopBar';

function GameContent({ onExit }: { onExit?: () => void }) {
  const { state, getCurrentPlayer, newGame, selectedBuildingPos, setSpeed, debugAddResources } = useRoN();
  const [navigationTarget, setNavigationTarget] = useState<{ x: number; y: number } | null>(null);
  
  const currentPlayer = getCurrentPlayer();
  
  // Handle navigation from minimap
  const handleNavigate = useCallback((x: number, y: number) => {
    setNavigationTarget({ x, y });
    // Clear after a moment
    setTimeout(() => setNavigationTarget(null), 100);
  }, []);
  
  // Victory/Defeat overlay
  if (state.gameOver) {
    const winner = state.winnerId 
      ? state.players.find(p => p.id === state.winnerId)
      : null;
    const isVictory = winner?.id === currentPlayer?.id;
    
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <div className="text-center p-8 bg-slate-800 rounded-lg shadow-xl">
          <h1 className={`text-4xl font-bold mb-4 ${isVictory ? 'text-green-400' : 'text-red-400'}`}>
            {isVictory ? '🏆 Victory!' : '💀 Defeat'}
          </h1>
          {winner && (
            <p className="text-xl text-white mb-6">
              {winner.name} has conquered all!
            </p>
          )}
          <div className="flex gap-4 justify-center">
            <Button 
              onClick={() => newGame({ 
                gridSize: 50, 
                playerConfigs: [
                  { name: 'Player', type: 'human', color: '#3b82f6' },
                  { name: 'AI', type: 'ai', difficulty: 'medium', color: '#ef4444' },
                ]
              })}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Play Again
            </Button>
            {onExit && (
              <Button onClick={onExit} variant="outline">
                Exit
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Match IsoCity's layout structure exactly
  return (
    <div className="w-full h-full min-h-[720px] overflow-hidden bg-slate-900 flex">
      {/* Sidebar - uses same pattern as IsoCity */}
      <RoNSidebar />
      
      {/* Main game area - uses flex-col like IsoCity */}
      <div className="flex-1 flex flex-col ml-56">
        {/* Top bar - as flex child (not absolute) like IsoCity */}
        <div className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
          {/* Left section: Players, Speed control */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              {state.players.map((player, index) => (
                <div 
                  key={player.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
                    player.id === currentPlayer?.id ? 'bg-secondary' : ''
                  }`}
                >
                  <div 
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PLAYER_COLORS[index] }}
                  />
                  <span className="text-foreground">{player.name}</span>
                  <span className="text-xs" style={{ color: AGE_INFO[player.age].color }}>
                    ({AGE_INFO[player.age].name})
                  </span>
                  {player.isDefeated && (
                    <span className="text-red-500 text-xs">☠️</span>
                  )}
                </div>
              ))}
            </div>
            
            {/* Speed control - same component as IsoCity */}
            <SpeedControl 
              speed={state.gameSpeed as 0 | 1 | 2 | 3} 
              onSpeedChange={setSpeed} 
            />
          </div>
          
          {/* Center section: Population and resources like IsoCity */}
          <div className="flex items-center gap-3">
            {currentPlayer && (
              <>
                <StatBadge 
                  value={`${currentPlayer.population}/${currentPlayer.populationCap}`} 
                  label="Population" 
                />
                <StatBadge 
                  value={Math.floor(currentPlayer.resources.food).toString()} 
                  label="Food"
                  variant={currentPlayer.resources.food < 50 ? 'warning' : 'default'}
                />
                <StatBadge 
                  value={Math.floor(currentPlayer.resources.wood).toString()} 
                  label="Wood"
                  variant={currentPlayer.resources.wood < 50 ? 'warning' : 'default'}
                />
                <StatBadge 
                  value={Math.floor(currentPlayer.resources.gold).toString()} 
                  label="Gold"
                  variant={currentPlayer.resources.gold < 50 ? 'warning' : 'default'}
                />
              </>
            )}
          </div>
          
          {/* Right section: Tick, Debug, and Exit - fixed width to prevent jitter */}
          <div className="flex items-center gap-2 min-w-[200px] justify-end">
            <span className="text-muted-foreground text-xs font-mono tabular-nums w-16 text-right">
              {state.tick}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={debugAddResources}
              title="Add 50 of each resource (debug)"
            >
              +50
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => newGame({
                gridSize: 50,
                playerConfigs: [
                  { name: 'Player', type: 'human', color: '#3b82f6' },
                  { name: 'AI Opponent', type: 'ai', difficulty: 'medium', color: '#ef4444' },
                ],
              })}
              title="Reset game (debug)"
            >
              Reset
            </Button>
            {onExit && (
              <Button size="sm" variant="ghost" onClick={onExit}>
                Exit
              </Button>
            )}
          </div>
        </div>
        
        {/* Canvas area - flex-1 relative like IsoCity */}
        <div className="flex-1 relative overflow-visible">
          <RoNCanvas 
            navigationTarget={navigationTarget}
            onNavigationComplete={() => setNavigationTarget(null)}
          />
          
          {/* MiniMap */}
          <RoNMiniMap onNavigate={handleNavigate} />
          
          {/* Building Info Panel - absolute within canvas area like IsoCity's TileInfoPanel */}
          {selectedBuildingPos && (
            <RoNBuildingPanel onClose={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
}

interface RoNGameProps {
  onExit?: () => void;
}

export function RoNGame({ onExit }: RoNGameProps) {
  return (
    <RoNProvider>
      <GameContent onExit={onExit} />
    </RoNProvider>
  );
}

export default RoNGame;
