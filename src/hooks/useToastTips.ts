'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameState, Tile, BuildingType } from '@/types/game';
import {
  getTipsEnabled,
  getTipsLastShownAt,
  getTipsShown,
  markTipShown,
  onTipsEnabledChange,
  setTipsEnabled,
  setTipsLastShownAt,
} from '@/lib/tips';

const MIN_MS_BETWEEN_TIPS = 45_000;
const MIN_MS_BETWEEN_EVALUATIONS = 2_000;

type Tip = {
  id: string;
  title: string;
  description: string;
};

const ZONED_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>([
  // Residential
  'house_small',
  'house_medium',
  'mansion',
  'apartment_low',
  'apartment_high',
  // Commercial
  'shop_small',
  'shop_medium',
  'office_low',
  'office_high',
  'mall',
  // Industrial
  'factory_small',
  'factory_medium',
  'factory_large',
  'warehouse',
]);

function hasAdjacentRoad(grid: Tile[][], x: number, y: number): boolean {
  const up = grid[y - 1]?.[x];
  const down = grid[y + 1]?.[x];
  const left = grid[y]?.[x - 1];
  const right = grid[y]?.[x + 1];
  const neighbors = [up, down, left, right].filter(Boolean) as Tile[];
  return neighbors.some((t) => t.building.type === 'road' || t.building.type === 'bridge');
}

function pickNextTip(state: GameState, alreadyShown: Record<string, true>): Tip | null {
  const cityTipId = (suffix: string) => `${state.id}:${suffix}`;

  const anyDemandNegative =
    state.stats.demand.residential < 0 ||
    state.stats.demand.commercial < 0 ||
    state.stats.demand.industrial < 0;

  let zonedTiles = 0;
  let zonedBuildings = 0;
  let zonedNeedsBasics = 0;

  let policeStations = 0;
  let fireStations = 0;
  let hospitals = 0;
  let schools = 0;

  // Single pass over grid for signals.
  const size = state.gridSize;
  for (let y = 0; y < size; y++) {
    const row = state.grid[y];
    for (let x = 0; x < size; x++) {
      const tile = row[x];
      const b = tile.building.type;

      if (tile.zone !== 'none') {
        zonedTiles++;

        if (ZONED_BUILDING_TYPES.has(b)) {
          zonedBuildings++;
        }

        // Only flag "needs basics" when the player is actually trying to develop (zoned).
        const hasPower = state.services.power[y]?.[x] ?? false;
        const hasWater = state.services.water[y]?.[x] ?? false;
        const hasRoad = hasAdjacentRoad(state.grid, x, y);
        if (!hasPower || !hasWater || !hasRoad) {
          zonedNeedsBasics++;
        }
      }

      switch (b) {
        case 'police_station':
          policeStations++;
          break;
        case 'fire_station':
          fireStations++;
          break;
        case 'hospital':
          hospitals++;
          break;
        case 'school':
          schools++;
          break;
      }
    }
  }

  // 1) Zoned but missing basics (power/water/roads)
  {
    const id = cityTipId('basics-power-water-roads');
    if (!alreadyShown[id] && zonedTiles > 0 && zonedNeedsBasics > 0) {
      return {
        id,
        title: 'City basics',
        description: 'Buildings need power, water, and roads nearby.',
      };
    }
  }

  // 2) Any demand negative
  {
    const id = cityTipId('demand-negative');
    if (!alreadyShown[id] && anyDemandNegative) {
      return {
        id,
        title: 'Zone demand',
        description: 'Keep an eye on zone demand.',
      };
    }
  }

  // 3) Buildings but no fire/police
  {
    const id = cityTipId('no-fire-police');
    if (!alreadyShown[id] && zonedBuildings > 0 && policeStations === 0 && fireStations === 0) {
      return {
        id,
        title: 'City safety',
        description: 'Add fire and police stations to keep your city safe.',
      };
    }
  }

  // 4) Bad environment
  {
    const id = cityTipId('bad-environment');
    if (!alreadyShown[id] && state.stats.environment < 40 && state.stats.population > 0) {
      return {
        id,
        title: 'Environment',
        description: 'Add parks and trees to improve the environment.',
      };
    }
  }

  // 5) Population but no hospitals or schools
  {
    const id = cityTipId('no-hospital');
    if (!alreadyShown[id] && state.stats.population > 0 && hospitals === 0) {
      return {
        id,
        title: 'Healthcare',
        description: 'Build a hospital so citizens can get care.',
      };
    }
  }
  {
    const id = cityTipId('no-school');
    if (!alreadyShown[id] && state.stats.population > 0 && schools === 0) {
      return {
        id,
        title: 'Education',
        description: 'Build schools to improve education.',
      };
    }
  }

  return null;
}

export function useToastTips(state: GameState) {
  const [tipsEnabled, setTipsEnabledState] = useState<boolean>(() => getTipsEnabled());
  const [activeTip, setActiveTip] = useState<Tip | null>(null);
  const [shown, setShown] = useState<Record<string, true>>(() => getTipsShown());

  const lastEvalAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return onTipsEnabledChange(setTipsEnabledState);
  }, []);

  useEffect(() => {
    // New city -> reload shown tips (tips are keyed per-city via state.id).
    if (typeof window === 'undefined') return;
    const raf = window.requestAnimationFrame(() => setShown(getTipsShown()));
    return () => window.cancelAnimationFrame(raf);
  }, [state.id]);

  useEffect(() => {
    if (!tipsEnabled) return;
    if (activeTip) return;

    // Avoid evaluating too often.
    const now = Date.now();
    if (now - lastEvalAtRef.current < MIN_MS_BETWEEN_EVALUATIONS) return;
    lastEvalAtRef.current = now;

    const lastShownAt = getTipsLastShownAt();
    if (now - lastShownAt < MIN_MS_BETWEEN_TIPS) return;

    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      const next = pickNextTip(state, shown);
      if (next) setActiveTip(next);
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [state.tick, state.stats, state.gridSize, tipsEnabled, activeTip, shown, state]);

  const continueTip = () => {
    if (!activeTip) return;
    markTipShown(activeTip.id);
    setShown((prev) => ({ ...prev, [activeTip.id]: true }));
    setTipsLastShownAt(Date.now());
    setActiveTip(null);
  };

  const skipAllTips = () => {
    setTipsEnabled(false);
    setTipsLastShownAt(Date.now());
    setActiveTip(null);
    setTipsEnabledState(false);
  };

  return {
    tipsEnabled,
    activeTip,
    continueTip,
    skipAllTips,
  };
}

