'use client';

import React from 'react';
import { useGame } from '@/context/GameContext';

export function Scoreboard() {
  const { state, isCompetitiveMode } = useGame();
  
  if (!isCompetitiveMode || !state.competitive) {
    return null;
  }
  
  const { players, units, gameOver, winnerId } = state.competitive;
  
  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  
  return (
    <div className="absolute top-14 right-4 w-56 bg-card/90 backdrop-blur border border-border rounded-lg shadow-xl z-40 overflow-hidden">
      <div className="p-2 border-b border-border bg-muted/50">
        <h2 className="font-semibold text-xs text-center uppercase tracking-wider">
          {gameOver ? '🏆 Game Over' : '⚔️ Scoreboard'}
        </h2>
      </div>
      
      <div className="p-2 space-y-1">
        {sortedPlayers.map((player, index) => {
          const playerUnits = units.filter(u => u.playerId === player.id && u.state !== 'destroyed').length;
          const isWinner = gameOver && winnerId === player.id;
          const isPlayer = player.id === 0;
          
          return (
            <div
              key={player.id}
              className={`flex items-center gap-2 p-2 rounded text-sm ${
                player.isEliminated 
                  ? 'opacity-50 line-through' 
                  : isWinner 
                    ? 'bg-yellow-500/20 border border-yellow-500/50' 
                    : isPlayer 
                      ? 'bg-blue-500/10 border border-blue-500/30'
                      : 'bg-muted/30'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: player.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-medium truncate">
                    {isWinner && '👑 '}{player.name}
                  </span>
                  {player.isEliminated && (
                    <span className="text-red-500 text-xs">☠️</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>🪖 {playerUnits}</span>
                  <span>⭐ {player.score}</span>
                </div>
              </div>
              <div className="text-lg font-bold text-muted-foreground">
                #{index + 1}
              </div>
            </div>
          );
        })}
      </div>
      
      {gameOver && winnerId !== null && (
        <div className="p-2 border-t border-border bg-muted/30 text-center">
          <p className="text-sm font-medium">
            {winnerId === 0 ? '🎉 Victory!' : '💀 Defeat'}
          </p>
        </div>
      )}
    </div>
  );
}
