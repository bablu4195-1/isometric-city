/**
 * Rise of Nations - Agentic AI Hook (Simplified)
 * 
 * Just calls the AI every few seconds - no complex state management.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { RoNGameState, RoNPlayer } from '../types/game';
import { Unit } from '../types/units';

export interface AgenticAIConfig {
  enabled: boolean;
  aiPlayerId: string;
  actionInterval: number;
}

export interface AgenticAIMessage {
  id: string;
  message: string;
  timestamp: number;
  isRead: boolean;
}

export interface UseAgenticAIResult {
  messages: AgenticAIMessage[];
  isThinking: boolean;
  lastError: string | null;
  thoughts: string | null;
  markMessageRead: (messageId: string) => void;
  clearMessages: () => void;
}

const POLL_INTERVAL_MS = 10000; // 10 seconds between AI calls (agent needs time to think)

export function useAgenticAI(
  gameState: RoNGameState,
  setGameState: (updater: (prev: RoNGameState) => RoNGameState) => void,
  config: AgenticAIConfig
): UseAgenticAIResult {
  const [messages, setMessages] = useState<AgenticAIMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  
  const isProcessingRef = useRef(false);
  const latestStateRef = useRef(gameState);
  const responseIdRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    latestStateRef.current = gameState;
  }, [gameState]);

  const processAITurn = useCallback(async () => {
    if (isProcessingRef.current || !config.enabled) return;
    
    const state = latestStateRef.current;
    if (state.gameSpeed === 0 || state.gameOver) return;
    
    const aiPlayer = state.players.find(p => p.id === config.aiPlayerId);
    if (!aiPlayer || aiPlayer.isDefeated) return;

    isProcessingRef.current = true;
    setIsThinking(true);

    try {
      const response = await fetch('/api/ron-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState: state,
          aiPlayerId: config.aiPlayerId,
          previousResponseId: responseIdRef.current,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setLastError(result.error);
        // Reset response ID on errors to start fresh
        if (result.error.includes('400') || result.error.includes('invalid')) {
          responseIdRef.current = undefined;
        }
      } else {
        setLastError(null);
        
        // Save response ID for conversation continuity
        if (result.responseId) {
          responseIdRef.current = result.responseId;
        }
        
        // Add messages
        if (result.messages?.length > 0) {
          setMessages(prev => [
            ...prev,
            ...result.messages.map((msg: string) => ({
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              message: msg,
              timestamp: Date.now(),
              isRead: false,
            })),
          ]);
        }

        // Apply AI changes to CURRENT state (not replace with old state)
        // The AI modifies units, buildings, resources - we need to merge those changes
        if (result.newState?.tick) {
          setGameState((currentState) => {
            // Don't apply if the response is too old (more than 500 ticks behind)
            if (currentState.tick - result.newState.tick > 500) {
              console.log('[AI] Discarding stale response from tick', result.newState.tick, 'current:', currentState.tick);
              return currentState;
            }
            
            // Merge AI changes into current state
            // Key changes: units (positions, tasks, new units), buildings, player resources
            const aiState = result.newState;
            
            // Find new units added by AI (queued units that don't exist in current state)
            const currentUnitIds = new Set(currentState.units.map((u: Unit) => u.id));
            const newUnits = aiState.units.filter((u: Unit) => !currentUnitIds.has(u.id));
            
            // Apply AI's unit task changes to current units
            const updatedUnits = currentState.units.map(unit => {
              const aiUnit = aiState.units.find((u: Unit) => u.id === unit.id);
              if (aiUnit && aiUnit.ownerId === aiState.players.find((p: RoNPlayer) => p.type === 'ai')?.id) {
                // Only update AI-owned units' tasks/targets
                return {
                  ...unit,
                  task: aiUnit.task,
                  taskTarget: aiUnit.taskTarget,
                  targetX: aiUnit.targetX,
                  targetY: aiUnit.targetY,
                };
              }
              return unit;
            });
            
            // Merge new buildings from AI state
            const mergedGrid = currentState.grid.map((row, y) =>
              row.map((tile, x) => {
                const aiTile = aiState.grid[y]?.[x];
                // If AI added a building that doesn't exist in current state, add it
                if (aiTile?.building && !tile.building) {
                  return { ...tile, building: aiTile.building, ownerId: aiTile.ownerId };
                }
                // If AI queued units at a building, update the queue
                if (tile.building && aiTile?.building && tile.building.type === aiTile.building.type) {
                  return {
                    ...tile,
                    building: {
                      ...tile.building,
                      queuedUnits: aiTile.building.queuedUnits,
                    },
                  };
                }
                return tile;
              })
            );
            
            // Update AI player resources (they may have spent resources)
            const mergedPlayers = currentState.players.map(player => {
              const aiPlayer = aiState.players.find((p: RoNPlayer) => p.id === player.id);
              if (aiPlayer && player.type === 'ai') {
                return {
                  ...player,
                  resources: aiPlayer.resources,
                  age: aiPlayer.age,
                };
              }
              return player;
            });
            
            const merged = {
              ...currentState,
              units: [...updatedUnits, ...newUnits],
              grid: mergedGrid,
              players: mergedPlayers,
            };
            
            latestStateRef.current = merged;
            return merged;
          });
        }
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Error');
    } finally {
      isProcessingRef.current = false;
      setIsThinking(false);
    }
  }, [config.enabled, config.aiPlayerId, setGameState]);

  useEffect(() => {
    if (!config.enabled) return;

    const interval = setInterval(processAITurn, POLL_INTERVAL_MS);
    const initial = setTimeout(processAITurn, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(initial);
    };
  }, [config.enabled, processAITurn]);

  const markMessageRead = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, isRead: true } : msg
    ));
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages,
    isThinking,
    lastError,
    thoughts: null,
    markMessageRead,
    clearMessages,
  };
}
