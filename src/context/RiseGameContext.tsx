'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ResourceNodeType, RiseGameState } from '@/games/rise/types';
import {
  ageUp,
  canAfford,
  initializeRiseState,
  issueOrder,
  placeBuilding,
  setSpeed as setSpeedUtil,
  spawnUnit as spawnUnitUtil,
  tickState,
} from '@/games/rise/state';
import { AGE_CONFIGS, POP_COST, UNIT_COSTS } from '@/games/rise/constants';

type RiseGameContextValue = {
  state: RiseGameState;
  setSpeed: (speed: 0 | 1 | 2 | 3) => void;
  tick: () => void;
  spawnCitizen: () => void;
  issueMove: (unitIds: string[], target: { x: number; y: number }) => void;
  issueGather: (unitIds: string[], target: { x: number; y: number }, resource: ResourceNodeType) => void;
  issueAttack: (unitIds: string[], target: { x: number; y: number }, unitId?: string, buildingId?: string) => void;
  selectUnits: (unitIds: string[]) => void;
  placeBuilding: (type: string, tileX: number, tileY: number) => void;
  ageUp: () => void;
};

const RiseGameContext = createContext<RiseGameContextValue | null>(null);

export function RiseGameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RiseGameState>(() => initializeRiseState());
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const step = (timestamp: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      }
      const deltaMs = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;
      const deltaSeconds = deltaMs / 1000;
      setState(prev => tickState(prev, deltaSeconds));
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const setSpeed = useCallback((speed: 0 | 1 | 2 | 3) => {
    setState(prev => setSpeedUtil(prev, speed));
  }, []);

  const spawnCitizen = useCallback(() => {
    const city = state.buildings.find(b => b.ownerId === state.localPlayerId && b.type === 'city_center');
    if (!city) return;
    setState(prev => spawnUnitUtil(prev, prev.localPlayerId, 'citizen', { x: city.tile.x + 1, y: city.tile.y + 1 }));
  }, [state.buildings, state.localPlayerId]);

  const issueMove = useCallback((unitIds: string[], target: { x: number; y: number }) => {
    setState(prev => issueOrder(prev, unitIds, { kind: 'move', target }));
  }, []);

  const issueGather = useCallback(
    (unitIds: string[], target: { x: number; y: number }, resource: ResourceNodeType) => {
      setState(prev => issueOrder(prev, unitIds, { kind: 'gather', target, resource }));
    },
    []
  );

  const issueAttack = useCallback(
    (unitIds: string[], target: { x: number; y: number }, unitId?: string, buildingId?: string) => {
      setState(prev => issueOrder(prev, unitIds, { kind: 'attack', target, targetUnitId: unitId, targetBuildingId: buildingId }));
    },
    []
  );

  const selectUnits = useCallback((unitIds: string[]) => {
    setState(prev => ({ ...prev, selectedUnitIds: new Set(unitIds) }));
  }, []);

  const handlePlaceBuilding = useCallback((type: string, x: number, y: number) => {
    setState(prev => placeBuilding(prev, prev.localPlayerId, type as any, x, y));
  }, []);

  const handleAgeUp = useCallback(() => {
    setState(prev => {
      const player = prev.players.find(p => p.id === prev.localPlayerId);
      if (!player) return prev;
      const currentIndex = AGE_CONFIGS.findIndex(a => a.id === player.age);
      const next = AGE_CONFIGS[currentIndex + 1];
      if (!next) return prev;
      return ageUp(prev, player.id, next.id, next.nextCost);
    });
  }, []);

  // Lightweight AI loop (resource gather + spawn citizens)
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        if (!prev.aiEnabled) return prev;
        const ai = prev.players.find(p => p.id === 'ai');
        if (!ai) return prev;

        let next = prev;

        // Spawn citizen if affordable and under pop cap
        const city = prev.buildings.find(b => b.ownerId === 'ai' && b.type === 'city_center');
        const popCost = POP_COST['citizen'] ?? 1;
        if (city && ai.resources.population + popCost <= ai.resources.popCap) {
          const cost = UNIT_COSTS.citizen;
          if (canAfford(ai.resources, cost)) {
            next = spawnUnitUtil(prev, 'ai', 'citizen', { x: city.tile.x + 1, y: city.tile.y + 1 });
          }
        }

        // Assign idle citizens to nearest resource
        const aiUnits = next.units.filter(u => u.ownerId === 'ai' && u.type === 'citizen');
        const idle = aiUnits.filter(u => u.order.kind === 'idle');
        if (idle.length > 0) {
          const nodes: { x: number; y: number; type: ResourceNodeType }[] = [];
          for (const row of next.tiles) {
            for (const tile of row) {
              if (tile.node) nodes.push({ x: tile.x, y: tile.y, type: tile.node.type });
            }
          }
          const assignments: { id: string; target: { x: number; y: number }; type: ResourceNodeType }[] = [];
          for (const unit of idle) {
            let best: { x: number; y: number; dist: number; type: ResourceNodeType } | null = null;
            for (const node of nodes) {
              if (node.type === 'oil') continue; // gated later by age
              const dist = Math.hypot(node.x - unit.position.x, node.y - unit.position.y);
              if (!best || dist < best.dist) {
                best = { ...node, dist };
              }
            }
            if (best) {
              assignments.push({ id: unit.id, target: { x: best.x, y: best.y }, type: best.type });
            }
          }
          if (assignments.length > 0) {
            const assignmentMap = assignments.reduce((acc, cur) => {
              acc[cur.id] = cur;
              return acc;
            }, {} as Record<string, { target: { x: number; y: number }; type: ResourceNodeType }>);
            next = {
              ...next,
              units: next.units.map(u =>
                assignmentMap[u.id]
                  ? { ...u, order: { kind: 'gather', target: assignmentMap[u.id].target, resource: assignmentMap[u.id].type } }
                  : u
              ),
            };
          }
        }

        return next;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const value: RiseGameContextValue = useMemo(
    () => ({
      state,
      setSpeed,
      tick: () => setState(prev => tickState(prev, 0.016)),
      spawnCitizen,
      issueMove,
      issueGather,
      issueAttack,
      selectUnits,
      placeBuilding: handlePlaceBuilding,
      ageUp: handleAgeUp,
    }),
    [state, setSpeed, spawnCitizen, issueMove, issueGather, issueAttack, selectUnits, handlePlaceBuilding, handleAgeUp]
  );

  return <RiseGameContext.Provider value={value}>{children}</RiseGameContext.Provider>;
}

export function useRiseGame() {
  const ctx = useContext(RiseGameContext);
  if (!ctx) throw new Error('useRiseGame must be used within RiseGameProvider');
  return ctx;
}
