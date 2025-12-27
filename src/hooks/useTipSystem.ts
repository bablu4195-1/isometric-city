'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState } from '@/types/game';
import { msg } from 'gt-next';

// Tip definitions with their conditions and messages
export type TipId = 
  | 'needs_utilities'
  | 'negative_demand'
  | 'needs_safety_services'
  | 'needs_parks'
  | 'needs_health_education';

export interface TipDefinition {
  id: TipId;
  message: string;
  priority: number; // Lower number = higher priority
  check: (state: GameState) => boolean;
}

// Define all tips with their conditions
const TIP_DEFINITIONS: TipDefinition[] = [
  {
    id: 'needs_utilities',
    message: msg('Buildings need power, water, and roads nearby to grow and thrive.'),
    priority: 1,
    check: (state: GameState) => {
      // Check if there are zoned buildings that lack power, water, or road access
      let zonesWithoutUtilities = 0;
      let totalZones = 0;
      
      for (let y = 0; y < state.gridSize; y++) {
        for (let x = 0; x < state.gridSize; x++) {
          const tile = state.grid[y][x];
          if (tile.zone !== 'none' && tile.building.type !== 'grass') {
            totalZones++;
            const hasPower = state.services.power[y]?.[x] ?? false;
            const hasWater = state.services.water[y]?.[x] ?? false;
            
            if (!hasPower || !hasWater) {
              zonesWithoutUtilities++;
            }
          }
        }
      }
      
      // Also check if there are no power plants or water towers at all
      let hasPowerPlant = false;
      let hasWaterTower = false;
      let hasRoad = false;
      
      for (let y = 0; y < state.gridSize; y++) {
        for (let x = 0; x < state.gridSize; x++) {
          const type = state.grid[y][x].building.type;
          if (type === 'power_plant') hasPowerPlant = true;
          if (type === 'water_tower') hasWaterTower = true;
          if (type === 'road' || type === 'bridge') hasRoad = true;
        }
      }
      
      // Trigger if: have zones but no utilities infrastructure, OR many zones without power/water
      return totalZones >= 3 && (
        (!hasPowerPlant || !hasWaterTower || !hasRoad) ||
        (zonesWithoutUtilities / totalZones > 0.5 && zonesWithoutUtilities >= 5)
      );
    },
  },
  {
    id: 'negative_demand',
    message: msg('Keep an eye on zone demand. Negative demand can cause buildings to become abandoned.'),
    priority: 2,
    check: (state: GameState) => {
      const { residential, commercial, industrial } = state.stats.demand;
      // Check if any demand is significantly negative
      return residential < -20 || commercial < -20 || industrial < -20;
    },
  },
  {
    id: 'needs_safety_services',
    message: msg('Add fire and police stations to keep your city safe from crime and fires.'),
    priority: 3,
    check: (state: GameState) => {
      // Check if there are buildings but no fire/police stations
      let hasBuildings = false;
      let hasFireStation = false;
      let hasPoliceStation = false;
      
      for (let y = 0; y < state.gridSize; y++) {
        for (let x = 0; x < state.gridSize; x++) {
          const type = state.grid[y][x].building.type;
          if (type === 'fire_station') hasFireStation = true;
          if (type === 'police_station') hasPoliceStation = true;
          
          // Check for any developed zone buildings
          const zone = state.grid[y][x].zone;
          if (zone !== 'none' && type !== 'grass') {
            hasBuildings = true;
          }
        }
      }
      
      // Has at least 5 population but no safety services
      return hasBuildings && state.stats.population >= 50 && (!hasFireStation || !hasPoliceStation);
    },
  },
  {
    id: 'needs_parks',
    message: msg('Add parks and trees to improve your city\'s environment and make residents happier.'),
    priority: 4,
    check: (state: GameState) => {
      // Check if environment score is low
      return state.stats.environment < 40 && state.stats.population >= 100;
    },
  },
  {
    id: 'needs_health_education',
    message: msg('Build hospitals and schools to improve health and education for your citizens.'),
    priority: 5,
    check: (state: GameState) => {
      // Check if there's population but no hospitals or schools
      let hasHospital = false;
      let hasSchool = false;
      
      for (let y = 0; y < state.gridSize; y++) {
        for (let x = 0; x < state.gridSize; x++) {
          const type = state.grid[y][x].building.type;
          if (type === 'hospital') hasHospital = true;
          if (type === 'school' || type === 'university') hasSchool = true;
        }
      }
      
      // Has at least 100 population but no health/education
      return state.stats.population >= 100 && (!hasHospital || !hasSchool);
    },
  },
];

const STORAGE_KEY = 'isocity-tips-disabled';
const SHOWN_TIPS_KEY = 'isocity-tips-shown';
const MIN_TIP_INTERVAL_MS = 45000; // Minimum 45 seconds between tips
const TIP_CHECK_INTERVAL_MS = 5000; // Check for tip conditions every 5 seconds

interface UseTipSystemReturn {
  currentTip: string | null;
  isVisible: boolean;
  onContinue: () => void;
  onSkipAll: () => void;
  tipsEnabled: boolean;
  setTipsEnabled: (enabled: boolean) => void;
}

export function useTipSystem(state: GameState): UseTipSystemReturn {
  const [tipsEnabled, setTipsEnabledState] = useState(true);
  const [currentTip, setCurrentTip] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shownTips, setShownTips] = useState<Set<TipId>>(new Set());
  const lastTipTimeRef = useRef<number>(0);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoadedRef = useRef(false);

  // Load preferences from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const disabled = localStorage.getItem(STORAGE_KEY);
      if (disabled === 'true') {
        setTipsEnabledState(false);
      }
      
      const shown = localStorage.getItem(SHOWN_TIPS_KEY);
      if (shown) {
        const parsed = JSON.parse(shown);
        if (Array.isArray(parsed)) {
          setShownTips(new Set(parsed as TipId[]));
        }
      }
    } catch (e) {
      console.error('Failed to load tip preferences:', e);
    }
    
    hasLoadedRef.current = true;
  }, []);

  // Save shown tips to localStorage when they change
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(SHOWN_TIPS_KEY, JSON.stringify(Array.from(shownTips)));
    } catch (e) {
      console.error('Failed to save shown tips:', e);
    }
  }, [shownTips]);

  // Set tips enabled preference
  const setTipsEnabled = useCallback((enabled: boolean) => {
    setTipsEnabledState(enabled);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'false' : 'true');
      } catch (e) {
        console.error('Failed to save tip preference:', e);
      }
    }
    if (!enabled) {
      setIsVisible(false);
      setCurrentTip(null);
    }
  }, []);

  // Check for conditions and show tip
  const checkAndShowTip = useCallback(() => {
    if (!tipsEnabled || !hasLoadedRef.current) return;
    
    const now = Date.now();
    
    // Rate limiting - don't show tips too frequently
    if (now - lastTipTimeRef.current < MIN_TIP_INTERVAL_MS) {
      return;
    }
    
    // Don't show a new tip if one is already visible
    if (isVisible) {
      return;
    }
    
    // Find the first applicable tip that hasn't been shown
    // Sort by priority (lower number = higher priority)
    const applicableTips = TIP_DEFINITIONS
      .filter(tip => !shownTips.has(tip.id) && tip.check(state))
      .sort((a, b) => a.priority - b.priority);
    
    if (applicableTips.length > 0) {
      const tip = applicableTips[0];
      setCurrentTip(tip.message);
      setIsVisible(true);
      lastTipTimeRef.current = now;
      setShownTips(prev => new Set([...prev, tip.id]));
    }
  }, [tipsEnabled, isVisible, shownTips, state]);

  // Set up periodic check for tip conditions
  useEffect(() => {
    // Clear any existing interval
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }
    
    if (!tipsEnabled) return;
    
    // Initial check after a delay (give time for game to initialize)
    const initialTimeout = setTimeout(() => {
      checkAndShowTip();
    }, 10000); // Wait 10 seconds before first tip check
    
    // Set up periodic checking
    checkIntervalRef.current = setInterval(checkAndShowTip, TIP_CHECK_INTERVAL_MS);
    
    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [tipsEnabled, checkAndShowTip]);

  // Handle continue button - dismiss current tip
  const onContinue = useCallback(() => {
    setIsVisible(false);
    // Small delay before clearing the message to allow exit animation
    setTimeout(() => {
      setCurrentTip(null);
    }, 300);
  }, []);

  // Handle skip all button - disable tips permanently
  const onSkipAll = useCallback(() => {
    setTipsEnabled(false);
    setIsVisible(false);
    setCurrentTip(null);
  }, [setTipsEnabled]);

  return {
    currentTip,
    isVisible,
    onContinue,
    onSkipAll,
    tipsEnabled,
    setTipsEnabled,
  };
}
