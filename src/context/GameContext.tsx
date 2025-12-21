// Consolidated GameContext for the SimCity-like game
'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from 'react';
import {
  Budget,
  BuildingType,
  GameState,
  SavedCityMeta,
  Tool,
  TOOL_INFO,
  ZoneType,
  GameMode,
  MilitaryUnit,
  MilitaryUnitType,
  CompetitivePlayer,
  CompetitiveState,
  FogOfWarState,
  MILITARY_UNIT_STATS,
} from '@/types/game';
import {
  bulldozeTile,
  createInitialGameState,
  DEFAULT_GRID_SIZE,
  placeBuilding,
  placeSubway,
  simulateTick,
  checkForDiscoverableCities,
  generateRandomAdvancedCity,
} from '@/lib/simulation';
import {
  SPRITE_PACKS,
  DEFAULT_SPRITE_PACK_ID,
  getSpritePack,
  setActiveSpritePack,
  SpritePack,
} from '@/lib/renderConfig';

const STORAGE_KEY = 'isocity-game-state';
const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city'; // For restoring after viewing shared city
const SAVED_CITIES_INDEX_KEY = 'isocity-saved-cities-index'; // Index of all saved cities
const SAVED_CITY_PREFIX = 'isocity-city-'; // Prefix for individual saved city states
const SPRITE_PACK_STORAGE_KEY = 'isocity-sprite-pack';
const DAY_NIGHT_MODE_STORAGE_KEY = 'isocity-day-night-mode';

export type DayNightMode = 'auto' | 'day' | 'night';

// Info about a saved city (for restore functionality)
export type SavedCityInfo = {
  cityName: string;
  population: number;
  money: number;
  savedAt: number;
} | null;

type GameContextValue = {
  state: GameState;
  setTool: (tool: Tool) => void;
  setSpeed: (speed: 0 | 1 | 2 | 3) => void;
  setTaxRate: (rate: number) => void;
  setActivePanel: (panel: GameState['activePanel']) => void;
  setBudgetFunding: (key: keyof Budget, funding: number) => void;
  placeAtTile: (x: number, y: number) => void;
  connectToCity: (cityId: string) => void;
  discoverCity: (cityId: string) => void;
  checkAndDiscoverCities: (onDiscover?: (city: { id: string; direction: 'north' | 'south' | 'east' | 'west'; name: string }) => void) => void;
  setDisastersEnabled: (enabled: boolean) => void;
  newGame: (name?: string, size?: number) => void;
  loadState: (stateString: string) => boolean;
  exportState: () => string;
  generateRandomCity: () => void;
  hasExistingGame: boolean;
  isSaving: boolean;
  addMoney: (amount: number) => void;
  addNotification: (title: string, description: string, icon: string) => void;
  // Sprite pack management
  currentSpritePack: SpritePack;
  availableSpritePacks: SpritePack[];
  setSpritePack: (packId: string) => void;
  // Day/night mode override
  dayNightMode: DayNightMode;
  setDayNightMode: (mode: DayNightMode) => void;
  visualHour: number; // The hour to use for rendering (respects day/night mode override)
  // Save/restore city for shared links
  saveCurrentCityForRestore: () => void;
  restoreSavedCity: () => boolean;
  getSavedCityInfo: () => SavedCityInfo;
  clearSavedCity: () => void;
  // Multi-city save system
  savedCities: SavedCityMeta[];
  saveCity: () => void;
  loadSavedCity: (cityId: string) => boolean;
  deleteSavedCity: (cityId: string) => void;
  renameSavedCity: (cityId: string, newName: string) => void;
  // Competitive mode functions
  isCompetitiveMode: boolean;
  trainUnit: (unitType: MilitaryUnitType) => boolean;
  selectUnits: (unitIds: number[]) => void;
  setSelectionBox: (box: { startX: number; startY: number; endX: number; endY: number } | null) => void;
  commandUnitsToMove: (targetX: number, targetY: number) => void;
  commandUnitsToAttack: (targetTileX: number, targetTileY: number) => void;
  updateCompetitiveState: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const toolBuildingMap: Partial<Record<Tool, BuildingType>> = {
  road: 'road',
  rail: 'rail',
  rail_station: 'rail_station',
  tree: 'tree',
  barracks: 'barracks',
  police_station: 'police_station',
  fire_station: 'fire_station',
  hospital: 'hospital',
  school: 'school',
  university: 'university',
  park: 'park',
  park_large: 'park_large',
  tennis: 'tennis',
  power_plant: 'power_plant',
  water_tower: 'water_tower',
  subway_station: 'subway_station',
  stadium: 'stadium',
  museum: 'museum',
  airport: 'airport',
  space_program: 'space_program',
  city_hall: 'city_hall',
  amusement_park: 'amusement_park',
  // New parks
  basketball_courts: 'basketball_courts',
  playground_small: 'playground_small',
  playground_large: 'playground_large',
  baseball_field_small: 'baseball_field_small',
  soccer_field_small: 'soccer_field_small',
  football_field: 'football_field',
  baseball_stadium: 'baseball_stadium',
  community_center: 'community_center',
  office_building_small: 'office_building_small',
  swimming_pool: 'swimming_pool',
  skate_park: 'skate_park',
  mini_golf_course: 'mini_golf_course',
  bleachers_field: 'bleachers_field',
  go_kart_track: 'go_kart_track',
  amphitheater: 'amphitheater',
  greenhouse_garden: 'greenhouse_garden',
  animal_pens_farm: 'animal_pens_farm',
  cabin_house: 'cabin_house',
  campground: 'campground',
  marina_docks_small: 'marina_docks_small',
  pier_large: 'pier_large',
  roller_coaster_small: 'roller_coaster_small',
  community_garden: 'community_garden',
  pond_park: 'pond_park',
  park_gate: 'park_gate',
  mountain_lodge: 'mountain_lodge',
  mountain_trailhead: 'mountain_trailhead',
};

const toolZoneMap: Partial<Record<Tool, ZoneType>> = {
  zone_residential: 'residential',
  zone_commercial: 'commercial',
  zone_industrial: 'industrial',
  zone_dezone: 'none',
};

// Load game state from localStorage
function loadGameState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate it has essential properties
      if (parsed && 
          parsed.grid && 
          Array.isArray(parsed.grid) &&
          parsed.gridSize && 
          typeof parsed.gridSize === 'number' &&
          parsed.stats &&
          parsed.stats.money !== undefined &&
          parsed.stats.population !== undefined) {
        // Migrate park_medium to park_large
        if (parsed.grid) {
          for (let y = 0; y < parsed.grid.length; y++) {
            for (let x = 0; x < parsed.grid[y].length; x++) {
              if (parsed.grid[y][x]?.building?.type === 'park_medium') {
                parsed.grid[y][x].building.type = 'park_large';
              }
            }
          }
        }
        // Migrate selectedTool if it's park_medium
        if (parsed.selectedTool === 'park_medium') {
          parsed.selectedTool = 'park_large';
        }
        // Ensure adjacentCities and waterBodies exist for backward compatibility
        if (!parsed.adjacentCities) {
          parsed.adjacentCities = [];
        }
        // Migrate adjacentCities to have 'discovered' property
        for (const city of parsed.adjacentCities) {
          if (city.discovered === undefined) {
            // Old cities that exist are implicitly discovered (they were visible in the old system)
            city.discovered = true;
          }
        }
        if (!parsed.waterBodies) {
          parsed.waterBodies = [];
        }
        // Ensure hour exists for day/night cycle
        if (parsed.hour === undefined) {
          parsed.hour = 12; // Default to noon
        }
        // Ensure effectiveTaxRate exists for lagging tax effect
        if (parsed.effectiveTaxRate === undefined) {
          parsed.effectiveTaxRate = parsed.taxRate ?? 9; // Start at current tax rate
        }
        // Migrate constructionProgress for existing buildings (they're already built)
        if (parsed.grid) {
          for (let y = 0; y < parsed.grid.length; y++) {
            for (let x = 0; x < parsed.grid[y].length; x++) {
              if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.constructionProgress === undefined) {
                parsed.grid[y][x].building.constructionProgress = 100; // Existing buildings are complete
              }
              // Migrate abandoned property for existing buildings (they're not abandoned)
              if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.abandoned === undefined) {
                parsed.grid[y][x].building.abandoned = false;
              }
            }
          }
        }
        // Ensure gameVersion exists for backward compatibility
        if (parsed.gameVersion === undefined) {
          parsed.gameVersion = 0;
        }
        // Migrate to include UUID if missing
        if (!parsed.id) {
          parsed.id = generateUUID();
        }
        return parsed as GameState;
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (e) {
    console.error('Failed to load game state:', e);
    // Clear corrupted data
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (clearError) {
      console.error('Failed to clear corrupted game state:', clearError);
    }
  }
  return null;
}

// Save game state to localStorage
function saveGameState(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    // Validate state before saving
    if (!state || !state.grid || !state.gridSize || !state.stats) {
      console.error('Invalid game state, cannot save', { state, hasGrid: !!state?.grid, hasGridSize: !!state?.gridSize, hasStats: !!state?.stats });
      return;
    }
    
    const serialized = JSON.stringify(state);
    
    // Check if data is too large (localStorage has ~5-10MB limit)
    if (serialized.length > 5 * 1024 * 1024) {
      return;
    }
    
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    // Handle quota exceeded errors
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014)) {
      console.error('localStorage quota exceeded, cannot save game state');
    } else {
      console.error('Failed to save game state:', e);
    }
  }
}

// Clear saved game state
function clearGameState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear game state:', e);
  }
}

// Load sprite pack from localStorage
function loadSpritePackId(): string {
  if (typeof window === 'undefined') return DEFAULT_SPRITE_PACK_ID;
  try {
    const saved = localStorage.getItem(SPRITE_PACK_STORAGE_KEY);
    if (saved && SPRITE_PACKS.some(p => p.id === saved)) {
      return saved;
    }
  } catch (e) {
    console.error('Failed to load sprite pack preference:', e);
  }
  return DEFAULT_SPRITE_PACK_ID;
}

// Save sprite pack to localStorage
function saveSpritePackId(packId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SPRITE_PACK_STORAGE_KEY, packId);
  } catch (e) {
    console.error('Failed to save sprite pack preference:', e);
  }
}

// Load day/night mode from localStorage
function loadDayNightMode(): DayNightMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = localStorage.getItem(DAY_NIGHT_MODE_STORAGE_KEY);
    if (saved === 'auto' || saved === 'day' || saved === 'night') {
      return saved;
    }
  } catch (e) {
    console.error('Failed to load day/night mode preference:', e);
  }
  return 'auto';
}

// Save day/night mode to localStorage
function saveDayNightMode(mode: DayNightMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DAY_NIGHT_MODE_STORAGE_KEY, mode);
  } catch (e) {
    console.error('Failed to save day/night mode preference:', e);
  }
}

// Save current city for later restoration (when viewing shared cities)
function saveCityForRestore(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const savedData = {
      state: state,
      info: {
        cityName: state.cityName,
        population: state.stats.population,
        money: state.stats.money,
        savedAt: Date.now(),
      },
    };
    localStorage.setItem(SAVED_CITY_STORAGE_KEY, JSON.stringify(savedData));
  } catch (e) {
    console.error('Failed to save city for restore:', e);
  }
}

// Load saved city info (just metadata, not full state)
function loadSavedCityInfo(): SavedCityInfo {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.info) {
        return parsed.info as SavedCityInfo;
      }
    }
  } catch (e) {
    console.error('Failed to load saved city info:', e);
  }
  return null;
}

// Load full saved city state
function loadSavedCityState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.state && parsed.state.grid && parsed.state.gridSize && parsed.state.stats) {
        return parsed.state as GameState;
      }
    }
  } catch (e) {
    console.error('Failed to load saved city state:', e);
  }
  return null;
}

// Clear saved city
function clearSavedCityStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SAVED_CITY_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear saved city:', e);
  }
}

// Generate a UUID v4
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Load saved cities index from localStorage
function loadSavedCitiesIndex(): SavedCityMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(SAVED_CITIES_INDEX_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed as SavedCityMeta[];
      }
    }
  } catch (e) {
    console.error('Failed to load saved cities index:', e);
  }
  return [];
}

// Save saved cities index to localStorage
function saveSavedCitiesIndex(cities: SavedCityMeta[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_CITIES_INDEX_KEY, JSON.stringify(cities));
  } catch (e) {
    console.error('Failed to save cities index:', e);
  }
}

// Save a city state to localStorage
function saveCityState(cityId: string, state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    // Check if data is too large
    if (serialized.length > 5 * 1024 * 1024) {
      console.error('City state too large to save');
      return;
    }
    localStorage.setItem(SAVED_CITY_PREFIX + cityId, serialized);
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014)) {
      console.error('localStorage quota exceeded');
    } else {
      console.error('Failed to save city state:', e);
    }
  }
}

// Load a saved city state from localStorage
function loadCityState(cityId: string): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_PREFIX + cityId);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.grid && parsed.gridSize && parsed.stats) {
        return parsed as GameState;
      }
    }
  } catch (e) {
    console.error('Failed to load city state:', e);
  }
  return null;
}

// Delete a saved city from localStorage
function deleteCityState(cityId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SAVED_CITY_PREFIX + cityId);
  } catch (e) {
    console.error('Failed to delete city state:', e);
  }
}

// Player colors for competitive mode
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308']; // Blue, Red, Green, Yellow

// Create initial competitive state
function createInitialCompetitiveState(gridSize: number, numPlayers: number = 4): CompetitiveState {
  const players: CompetitivePlayer[] = [];
  const margin = Math.floor(gridSize * 0.15);
  
  // Player positions (corners of the map)
  const positions = [
    { x: margin, y: margin }, // Top-left (Player)
    { x: gridSize - margin, y: margin }, // Top-right
    { x: margin, y: gridSize - margin }, // Bottom-left
    { x: gridSize - margin, y: gridSize - margin }, // Bottom-right
  ];
  
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: i,
      name: i === 0 ? 'You' : `AI ${i}`,
      color: PLAYER_COLORS[i],
      isAI: i !== 0,
      isEliminated: false,
      money: 5000, // Starting resources for competitive
      score: 0,
      startX: positions[i].x,
      startY: positions[i].y,
      ownedTiles: new Set<string>(),
    });
  }
  
  // Initialize fog of war (only player's starting area is visible)
  const explored: boolean[][] = [];
  const visible: boolean[][] = [];
  for (let y = 0; y < gridSize; y++) {
    explored[y] = [];
    visible[y] = [];
    for (let x = 0; x < gridSize; x++) {
      // Player starts with 10 tile radius explored
      const distToPlayer = Math.sqrt(
        Math.pow(x - positions[0].x, 2) + Math.pow(y - positions[0].y, 2)
      );
      explored[y][x] = distToPlayer <= 12;
      visible[y][x] = distToPlayer <= 12;
    }
  }
  
  return {
    mode: 'competitive',
    players,
    currentPlayerId: 0,
    units: [],
    unitIdCounter: 0,
    fogOfWar: { explored, visible },
    selectedUnitIds: [],
    selectionBox: null,
    gameOver: false,
    winnerId: null,
    aiUpdateTimer: 0,
  };
}

export function GameProvider({ children, initialMode = 'sandbox' }: { children: React.ReactNode; initialMode?: GameMode }) {
  // Start with a default state, we'll load from localStorage after mount
  const [state, setState] = useState<GameState>(() => createInitialGameState(DEFAULT_GRID_SIZE, 'IsoCity'));
  
  const [hasExistingGame, setHasExistingGame] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(false);
  const hasLoadedRef = useRef(false);
  
  // Sprite pack state
  const [currentSpritePack, setCurrentSpritePack] = useState<SpritePack>(() => getSpritePack(DEFAULT_SPRITE_PACK_ID));
  
  // Day/night mode state
  const [dayNightMode, setDayNightModeState] = useState<DayNightMode>('auto');
  
  // Saved cities state for multi-city save system
  const [savedCities, setSavedCities] = useState<SavedCityMeta[]>([]);
  
  // Load game state and sprite pack from localStorage on mount (client-side only)
  useEffect(() => {
    // Load sprite pack preference
    const savedPackId = loadSpritePackId();
    const pack = getSpritePack(savedPackId);
    setCurrentSpritePack(pack);
    setActiveSpritePack(pack);
    
    // Load day/night mode preference
    const savedDayNightMode = loadDayNightMode();
    setDayNightModeState(savedDayNightMode);
    
    // Load saved cities index
    const cities = loadSavedCitiesIndex();
    setSavedCities(cities);
    
    // Handle competitive mode - start fresh with larger map
    if (initialMode === 'competitive') {
      const competitiveGridSize = 100; // Larger map for competitive
      const freshState = createInitialGameState(competitiveGridSize, 'Battleground');
      freshState.stats.money = 5000; // Fewer starting resources
      freshState.competitive = createInitialCompetitiveState(competitiveGridSize, 4);
      
      // Place initial buildings for each player (city hall + barracks)
      const players = freshState.competitive.players;
      for (const player of players) {
        // Place city hall at player's starting position
        const chX = player.startX;
        const chY = player.startY;
        if (freshState.grid[chY] && freshState.grid[chY][chX]) {
          freshState.grid[chY][chX].building = {
            type: 'city_hall',
            level: 1,
            population: 0,
            jobs: 60,
            powered: true,
            watered: true,
            onFire: false,
            fireProgress: 0,
            age: 0,
            constructionProgress: 100,
            abandoned: false,
          };
          // Mark tiles as owned by this player
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              player.ownedTiles.add(`${chX + dx},${chY + dy}`);
            }
          }
        }
        
        // Place barracks nearby
        const bX = chX + 3;
        const bY = chY + 1;
        if (freshState.grid[bY] && freshState.grid[bY][bX]) {
          freshState.grid[bY][bX].building = {
            type: 'barracks',
            level: 1,
            population: 0,
            jobs: 30,
            powered: true,
            watered: true,
            onFire: false,
            fireProgress: 0,
            age: 0,
            constructionProgress: 100,
            abandoned: false,
          };
        }
        
        // Place some roads
        for (let i = 1; i <= 2; i++) {
          const roadX = chX + i;
          if (freshState.grid[chY] && freshState.grid[chY][roadX]) {
            freshState.grid[chY][roadX].building = {
              type: 'road',
              level: 1,
              population: 0,
              jobs: 0,
              powered: false,
              watered: false,
              onFire: false,
              fireProgress: 0,
              age: 0,
              constructionProgress: 100,
              abandoned: false,
            };
          }
        }
      }
      
      skipNextSaveRef.current = true;
      setState(freshState);
      setHasExistingGame(false);
      hasLoadedRef.current = true;
      return;
    }
    
    // Load game state (sandbox mode)
    const saved = loadGameState();
    if (saved) {
      skipNextSaveRef.current = true; // Set skip flag BEFORE updating state
      setState(saved);
      setHasExistingGame(true);
    } else {
      setHasExistingGame(false);
    }
    // Mark as loaded immediately - the skipNextSaveRef will handle skipping the first save
    hasLoadedRef.current = true;
  }, [initialMode]);
  
  // Track the state that needs to be saved
  const stateToSaveRef = useRef<GameState | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Update the state to save whenever state changes
  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }
    
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      lastSaveTimeRef.current = Date.now();
      return;
    }
    
    // Store current state for saving (deep copy)
    stateToSaveRef.current = JSON.parse(JSON.stringify(state));
  }, [state]);
  
  // Separate effect that actually performs saves on an interval
  useEffect(() => {
    // Wait for initial load
    const checkLoaded = setInterval(() => {
      if (!hasLoadedRef.current) {
        return;
      }
      
      // Clear the check interval
      clearInterval(checkLoaded);
      
      // Clear any existing save interval
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      
      // Set up interval to save every 3 seconds if there's pending state
      saveIntervalRef.current = setInterval(() => {
        // Don't save if we just loaded
        if (skipNextSaveRef.current) {
          return;
        }
        
        // Don't save too frequently
        const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
        if (timeSinceLastSave < 2000) {
          return;
        }
        
        // Don't save if there's no state to save
        if (!stateToSaveRef.current) {
          return;
        }
        
        // Perform the save
        setIsSaving(true);
        try {
          saveGameState(stateToSaveRef.current);
          lastSaveTimeRef.current = Date.now();
          setHasExistingGame(true);
        } finally {
          setIsSaving(false);
        }
      }, 3000); // Check every 3 seconds
    }, 100);
    
    return () => {
      clearInterval(checkLoaded);
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // Simulation loop - with mobile performance optimization
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (state.speed > 0) {
      // Check if running on mobile for performance optimization
      const isMobileDevice = typeof window !== 'undefined' && (
        window.innerWidth < 768 || 
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      );
      
      // Slower tick intervals on mobile to reduce CPU load
      // Desktop: 500ms, 220ms, 50ms for speeds 1, 2, 3
      // Mobile: 750ms, 400ms, 150ms for speeds 1, 2, 3 (50% slower)
      const interval = isMobileDevice
        ? (state.speed === 1 ? 750 : state.speed === 2 ? 400 : 150)
        : (state.speed === 1 ? 500 : state.speed === 2 ? 220 : 50);
        
      timer = setInterval(() => {
        setState((prev) => simulateTick(prev));
      }, interval);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [state.speed]);

  const setTool = useCallback((tool: Tool) => {
    setState((prev) => ({ ...prev, selectedTool: tool, activePanel: 'none' }));
  }, []);

  const setSpeed = useCallback((speed: 0 | 1 | 2 | 3) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  const setTaxRate = useCallback((rate: number) => {
    setState((prev) => ({ ...prev, taxRate: clamp(rate, 0, 100) }));
  }, []);

  const setActivePanel = useCallback(
    (panel: GameState['activePanel']) => {
      setState((prev) => ({ ...prev, activePanel: panel }));
    },
    [],
  );

  const setBudgetFunding = useCallback(
    (key: keyof Budget, funding: number) => {
      const clamped = clamp(funding, 0, 100);
      setState((prev) => ({
        ...prev,
        budget: {
          ...prev.budget,
          [key]: { ...prev.budget[key], funding: clamped },
        },
      }));
    },
    [],
  );

  const placeAtTile = useCallback((x: number, y: number) => {
    setState((prev) => {
      const tool = prev.selectedTool;
      if (tool === 'select') return prev;

      const info = TOOL_INFO[tool];
      const cost = info?.cost ?? 0;
      const tile = prev.grid[y]?.[x];

      if (!tile) return prev;
      if (cost > 0 && prev.stats.money < cost) return prev;

      // Prevent wasted spend if nothing would change
      if (tool === 'bulldoze' && tile.building.type === 'grass' && tile.zone === 'none') {
        return prev;
      }

      const building = toolBuildingMap[tool];
      const zone = toolZoneMap[tool];

      if (zone && tile.zone === zone) return prev;
      if (building && tile.building.type === building) return prev;
      
      // Handle subway tool separately (underground placement)
      if (tool === 'subway') {
        // Can't place subway under water
        if (tile.building.type === 'water') return prev;
        // Already has subway
        if (tile.hasSubway) return prev;
        
        const nextState = placeSubway(prev, x, y);
        if (nextState === prev) return prev;
        
        return {
          ...nextState,
          stats: { ...nextState.stats, money: nextState.stats.money - cost },
        };
      }

      let nextState: GameState;

      if (tool === 'bulldoze') {
        nextState = bulldozeTile(prev, x, y);
      } else if (zone) {
        nextState = placeBuilding(prev, x, y, null, zone);
      } else if (building) {
        nextState = placeBuilding(prev, x, y, building, null);
      } else {
        return prev;
      }

      if (nextState === prev) return prev;

      if (cost > 0) {
        nextState = {
          ...nextState,
          stats: { ...nextState.stats, money: nextState.stats.money - cost },
        };
      }

      return nextState;
    });
  }, []);

  const connectToCity = useCallback((cityId: string) => {
    setState((prev) => {
      const city = prev.adjacentCities.find(c => c.id === cityId);
      if (!city || city.connected) return prev;

      // Mark city as connected (and discovered if not already) and add trade income
      const updatedCities = prev.adjacentCities.map(c =>
        c.id === cityId ? { ...c, connected: true, discovered: true } : c
      );

      // Add trade income bonus (one-time bonus + monthly income)
      const tradeBonus = 5000;
      const tradeIncome = 200; // Monthly income from trade

      return {
        ...prev,
        adjacentCities: updatedCities,
        stats: {
          ...prev.stats,
          money: prev.stats.money + tradeBonus,
          income: prev.stats.income + tradeIncome,
        },
        notifications: [
          {
            id: `city-connect-${Date.now()}`,
            title: 'City Connected!',
            description: `Trade route established with ${city.name}. +$${tradeBonus} bonus and +$${tradeIncome}/month income.`,
            icon: 'road',
            timestamp: Date.now(),
          },
          ...prev.notifications.slice(0, 9), // Keep only 10 most recent
        ],
      };
    });
  }, []);

  const discoverCity = useCallback((cityId: string) => {
    setState((prev) => {
      const city = prev.adjacentCities.find(c => c.id === cityId);
      if (!city || city.discovered) return prev;

      // Mark city as discovered
      const updatedCities = prev.adjacentCities.map(c =>
        c.id === cityId ? { ...c, discovered: true } : c
      );

      return {
        ...prev,
        adjacentCities: updatedCities,
        notifications: [
          {
            id: `city-discover-${Date.now()}`,
            title: 'City Discovered!',
            description: `Your road has reached the ${city.direction} border! You can now connect to ${city.name}.`,
            icon: 'road',
            timestamp: Date.now(),
          },
          ...prev.notifications.slice(0, 9), // Keep only 10 most recent
        ],
      };
    });
  }, []);

  // Check for cities that should be discovered based on roads reaching edges
  // Calls onDiscover callback with city info if a new city was discovered
  const checkAndDiscoverCities = useCallback((onDiscover?: (city: { id: string; direction: 'north' | 'south' | 'east' | 'west'; name: string }) => void): void => {
    setState((prev) => {
      const newlyDiscovered = checkForDiscoverableCities(prev.grid, prev.gridSize, prev.adjacentCities);
      
      if (newlyDiscovered.length === 0) return prev;
      
      // Discover the first city found
      const cityToDiscover = newlyDiscovered[0];
      
      const updatedCities = prev.adjacentCities.map(c =>
        c.id === cityToDiscover.id ? { ...c, discovered: true } : c
      );
      
      // Call the callback after state update is scheduled
      if (onDiscover) {
        setTimeout(() => {
          onDiscover({
            id: cityToDiscover.id,
            direction: cityToDiscover.direction,
            name: cityToDiscover.name,
          });
        }, 0);
      }
      
      return {
        ...prev,
        adjacentCities: updatedCities,
      };
    });
  }, []);

  const setDisastersEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, disastersEnabled: enabled }));
  }, []);

  const setSpritePack = useCallback((packId: string) => {
    const pack = getSpritePack(packId);
    setCurrentSpritePack(pack);
    setActiveSpritePack(pack);
    saveSpritePackId(packId);
  }, []);

  const setDayNightMode = useCallback((mode: DayNightMode) => {
    setDayNightModeState(mode);
    saveDayNightMode(mode);
  }, []);

  // Compute the visual hour based on the day/night mode override
  // This doesn't affect time progression, just the rendering
  const visualHour = dayNightMode === 'auto' 
    ? state.hour 
    : dayNightMode === 'day' 
      ? 12  // Noon - full daylight
      : 22; // Night time

  const newGame = useCallback((name?: string, size?: number) => {
    clearGameState(); // Clear saved state when starting fresh
    const fresh = createInitialGameState(size ?? DEFAULT_GRID_SIZE, name || 'IsoCity');
    // Increment gameVersion from current state to ensure vehicles/entities are cleared
    setState((prev) => ({
      ...fresh,
      gameVersion: (prev.gameVersion ?? 0) + 1,
    }));
  }, []);

  const loadState = useCallback((stateString: string): boolean => {
    try {
      const parsed = JSON.parse(stateString);
      // Validate it has essential properties
      if (parsed && 
          parsed.grid && 
          Array.isArray(parsed.grid) &&
          parsed.gridSize && 
          typeof parsed.gridSize === 'number' &&
          parsed.stats &&
          parsed.stats.money !== undefined &&
          parsed.stats.population !== undefined) {
        // Ensure new fields exist for backward compatibility
        if (!parsed.adjacentCities) {
          parsed.adjacentCities = [];
        }
        // Migrate adjacentCities to have 'discovered' property
        for (const city of parsed.adjacentCities) {
          if (city.discovered === undefined) {
            // Old cities that exist are implicitly discovered (they were visible in the old system)
            city.discovered = true;
          }
        }
        if (!parsed.waterBodies) {
          parsed.waterBodies = [];
        }
        // Ensure effectiveTaxRate exists for lagging tax effect
        if (parsed.effectiveTaxRate === undefined) {
          parsed.effectiveTaxRate = parsed.taxRate ?? 9;
        }
        // Migrate constructionProgress for existing buildings (they're already built)
        if (parsed.grid) {
          for (let y = 0; y < parsed.grid.length; y++) {
            for (let x = 0; x < parsed.grid[y].length; x++) {
              if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.constructionProgress === undefined) {
                parsed.grid[y][x].building.constructionProgress = 100; // Existing buildings are complete
              }
              // Migrate abandoned property for existing buildings (they're not abandoned)
              if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.abandoned === undefined) {
                parsed.grid[y][x].building.abandoned = false;
              }
            }
          }
        }
        // Increment gameVersion to clear vehicles/entities when loading a new state
        setState((prev) => ({
          ...(parsed as GameState),
          gameVersion: (prev.gameVersion ?? 0) + 1,
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const exportState = useCallback((): string => {
    return JSON.stringify(state);
  }, [state]);

  const generateRandomCity = useCallback(() => {
    clearGameState(); // Clear saved state when generating a new city
    const randomCity = generateRandomAdvancedCity(DEFAULT_GRID_SIZE);
    // Increment gameVersion to ensure vehicles/entities are cleared
    setState((prev) => ({
      ...randomCity,
      gameVersion: (prev.gameVersion ?? 0) + 1,
    }));
  }, []);

  const addMoney = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        money: prev.stats.money + amount,
      },
    }));
  }, []);

  const addNotification = useCallback((title: string, description: string, icon: string) => {
    setState((prev) => {
      const newNotifications = [
        {
          id: `cheat-${Date.now()}-${Math.random()}`,
          title,
          description,
          icon,
          timestamp: Date.now(),
        },
        ...prev.notifications,
      ];
      // Keep only recent notifications
      while (newNotifications.length > 10) {
        newNotifications.pop();
      }
      return {
        ...prev,
        notifications: newNotifications,
      };
    });
  }, []);

  // Save current city for restore (when viewing shared cities)
  const saveCurrentCityForRestore = useCallback(() => {
    saveCityForRestore(state);
  }, [state]);

  // Restore saved city
  const restoreSavedCity = useCallback((): boolean => {
    const savedState = loadSavedCityState();
    if (savedState) {
      skipNextSaveRef.current = true;
      setState(savedState);
      clearSavedCityStorage();
      return true;
    }
    return false;
  }, []);

  // Get saved city info
  const getSavedCityInfo = useCallback((): SavedCityInfo => {
    return loadSavedCityInfo();
  }, []);

  // Clear saved city
  const clearSavedCity = useCallback(() => {
    clearSavedCityStorage();
  }, []);

  // Save current city to the multi-save system
  const saveCity = useCallback(() => {
    const cityMeta: SavedCityMeta = {
      id: state.id,
      cityName: state.cityName,
      population: state.stats.population,
      money: state.stats.money,
      year: state.year,
      month: state.month,
      gridSize: state.gridSize,
      savedAt: Date.now(),
    };
    
    // Save the city state
    saveCityState(state.id, state);
    
    // Update the index
    setSavedCities((prev) => {
      // Check if this city already exists in the list
      const existingIndex = prev.findIndex((c) => c.id === state.id);
      let newCities: SavedCityMeta[];
      
      if (existingIndex >= 0) {
        // Update existing entry
        newCities = [...prev];
        newCities[existingIndex] = cityMeta;
      } else {
        // Add new entry
        newCities = [...prev, cityMeta];
      }
      
      // Sort by savedAt descending (most recent first)
      newCities.sort((a, b) => b.savedAt - a.savedAt);
      
      // Persist to localStorage
      saveSavedCitiesIndex(newCities);
      
      return newCities;
    });
  }, [state]);

  // Load a saved city from the multi-save system
  const loadSavedCity = useCallback((cityId: string): boolean => {
    const cityState = loadCityState(cityId);
    if (!cityState) return false;
    
    // Ensure the loaded state has an ID
    if (!cityState.id) {
      cityState.id = cityId;
    }
    
    // Perform migrations for backward compatibility
    if (!cityState.adjacentCities) {
      cityState.adjacentCities = [];
    }
    for (const city of cityState.adjacentCities) {
      if (city.discovered === undefined) {
        city.discovered = true;
      }
    }
    if (!cityState.waterBodies) {
      cityState.waterBodies = [];
    }
    if (cityState.effectiveTaxRate === undefined) {
      cityState.effectiveTaxRate = cityState.taxRate ?? 9;
    }
    if (cityState.grid) {
      for (let y = 0; y < cityState.grid.length; y++) {
        for (let x = 0; x < cityState.grid[y].length; x++) {
          if (cityState.grid[y][x]?.building && cityState.grid[y][x].building.constructionProgress === undefined) {
            cityState.grid[y][x].building.constructionProgress = 100;
          }
          if (cityState.grid[y][x]?.building && cityState.grid[y][x].building.abandoned === undefined) {
            cityState.grid[y][x].building.abandoned = false;
          }
        }
      }
    }
    
    skipNextSaveRef.current = true;
    setState((prev) => ({
      ...cityState,
      gameVersion: (prev.gameVersion ?? 0) + 1,
    }));
    
    // Also update the current game in local storage
    saveGameState(cityState);
    
    return true;
  }, []);

  // Delete a saved city from the multi-save system
  const deleteSavedCity = useCallback((cityId: string) => {
    // Delete the city state
    deleteCityState(cityId);
    
    // Update the index
    setSavedCities((prev) => {
      const newCities = prev.filter((c) => c.id !== cityId);
      saveSavedCitiesIndex(newCities);
      return newCities;
    });
  }, []);

  // Rename a saved city
  const renameSavedCity = useCallback((cityId: string, newName: string) => {
    // Load the city state, update the name, and save it back
    const cityState = loadCityState(cityId);
    if (cityState) {
      cityState.cityName = newName;
      saveCityState(cityId, cityState);
    }
    
    // Update the index
    setSavedCities((prev) => {
      const newCities = prev.map((c) =>
        c.id === cityId ? { ...c, cityName: newName } : c
      );
      saveSavedCitiesIndex(newCities);
      return newCities;
    });
    
    // If the current game is the one being renamed, update its state too
    if (state.id === cityId) {
      setState((prev) => ({ ...prev, cityName: newName }));
    }
  }, [state.id]);

  // === COMPETITIVE MODE FUNCTIONS ===
  
  const isCompetitiveMode = state.competitive?.mode === 'competitive';
  
  // Train a military unit at the player's barracks
  const trainUnit = useCallback((unitType: MilitaryUnitType): boolean => {
    if (!state.competitive) return false;
    
    const stats = MILITARY_UNIT_STATS[unitType];
    const player = state.competitive.players[0]; // Human player
    
    if (state.stats.money < stats.cost) return false;
    
    // Find a barracks to spawn from
    let barracksX = player.startX + 3;
    let barracksY = player.startY + 1;
    
    // Search for any barracks owned by the player
    for (let y = 0; y < state.gridSize; y++) {
      for (let x = 0; x < state.gridSize; x++) {
        if (state.grid[y][x].building.type === 'barracks') {
          // Check if in explored area (player's territory)
          if (state.competitive.fogOfWar.explored[y][x]) {
            barracksX = x;
            barracksY = y;
            break;
          }
        }
      }
    }
    
    const newUnit: MilitaryUnit = {
      id: state.competitive.unitIdCounter,
      type: unitType,
      playerId: 0,
      x: barracksX * 64, // Approximate screen position
      y: barracksY * 32,
      tileX: barracksX,
      tileY: barracksY,
      health: stats.health,
      maxHealth: stats.health,
      damage: stats.damage,
      attackRange: stats.attackRange,
      moveSpeed: stats.moveSpeed,
      selected: false,
      targetX: null,
      targetY: null,
      attackTargetId: null,
      attackBuildingX: null,
      attackBuildingY: null,
      state: 'idle',
      direction: 0,
      animTimer: 0,
      altitude: unitType === 'military_helicopter' ? 1 : undefined,
    };
    
    setState((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        money: prev.stats.money - stats.cost,
      },
      competitive: prev.competitive ? {
        ...prev.competitive,
        units: [...prev.competitive.units, newUnit],
        unitIdCounter: prev.competitive.unitIdCounter + 1,
      } : prev.competitive,
    }));
    
    return true;
  }, [state.competitive, state.stats.money, state.gridSize, state.grid]);
  
  // Select units by their IDs
  const selectUnits = useCallback((unitIds: number[]) => {
    setState((prev) => {
      if (!prev.competitive) return prev;
      
      const updatedUnits = prev.competitive.units.map(unit => ({
        ...unit,
        selected: unitIds.includes(unit.id) && unit.playerId === 0,
      }));
      
      return {
        ...prev,
        competitive: {
          ...prev.competitive,
          units: updatedUnits,
          selectedUnitIds: unitIds.filter(id => 
            updatedUnits.find(u => u.id === id && u.playerId === 0)
          ),
        },
      };
    });
  }, []);
  
  // Set selection box for drag selection
  const setSelectionBox = useCallback((box: { startX: number; startY: number; endX: number; endY: number } | null) => {
    setState((prev) => {
      if (!prev.competitive) return prev;
      return {
        ...prev,
        competitive: {
          ...prev.competitive,
          selectionBox: box,
        },
      };
    });
  }, []);
  
  // Command selected units to move to a location
  const commandUnitsToMove = useCallback((targetX: number, targetY: number) => {
    setState((prev) => {
      if (!prev.competitive) return prev;
      
      const updatedUnits = prev.competitive.units.map(unit => {
        if (unit.selected && unit.playerId === 0) {
          return {
            ...unit,
            targetX,
            targetY,
            attackTargetId: null,
            attackBuildingX: null,
            attackBuildingY: null,
            state: 'moving' as const,
          };
        }
        return unit;
      });
      
      return {
        ...prev,
        competitive: {
          ...prev.competitive,
          units: updatedUnits,
        },
      };
    });
  }, []);
  
  // Command selected units to attack a building
  const commandUnitsToAttack = useCallback((targetTileX: number, targetTileY: number) => {
    setState((prev) => {
      if (!prev.competitive) return prev;
      
      const updatedUnits = prev.competitive.units.map(unit => {
        if (unit.selected && unit.playerId === 0) {
          return {
            ...unit,
            targetX: null,
            targetY: null,
            attackTargetId: null,
            attackBuildingX: targetTileX,
            attackBuildingY: targetTileY,
            state: 'attacking' as const,
          };
        }
        return unit;
      });
      
      return {
        ...prev,
        competitive: {
          ...prev.competitive,
          units: updatedUnits,
        },
      };
    });
  }, []);
  
  // Update competitive state (AI, unit movement, combat, fog of war)
  const updateCompetitiveState = useCallback(() => {
    setState((prev) => {
      if (!prev.competitive || prev.speed === 0) return prev;
      
      const delta = 0.1; // Base tick time
      const speedMult = prev.speed === 1 ? 1 : prev.speed === 2 ? 2 : 3;
      
      let updatedUnits = [...prev.competitive.units];
      let updatedGrid = prev.grid;
      let gridChanged = false;
      
      // Update each unit
      updatedUnits = updatedUnits.map(unit => {
        if (unit.state === 'destroyed') return unit;
        
        let newUnit = { ...unit, animTimer: unit.animTimer + delta };
        
        // Handle movement
        if (unit.state === 'moving' && unit.targetX !== null && unit.targetY !== null) {
          const dx = unit.targetX - unit.x;
          const dy = unit.targetY - unit.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 5) {
            const moveAmount = unit.moveSpeed * delta * speedMult;
            newUnit.x += (dx / dist) * moveAmount;
            newUnit.y += (dy / dist) * moveAmount;
            newUnit.direction = Math.atan2(dy, dx);
            
            // Update tile position
            newUnit.tileX = Math.floor(newUnit.x / 64);
            newUnit.tileY = Math.floor(newUnit.y / 32);
          } else {
            newUnit.state = 'idle';
            newUnit.targetX = null;
            newUnit.targetY = null;
          }
        }
        
        // Handle attacking buildings
        if (unit.state === 'attacking' && unit.attackBuildingX !== null && unit.attackBuildingY !== null) {
          const targetTileX = unit.attackBuildingX;
          const targetTileY = unit.attackBuildingY;
          
          // Calculate distance to target
          const distToTarget = Math.abs(unit.tileX - targetTileX) + Math.abs(unit.tileY - targetTileY);
          
          if (distToTarget <= unit.attackRange) {
            // In range - attack!
            // Deal damage by starting/increasing fire
            if (!gridChanged) {
              updatedGrid = JSON.parse(JSON.stringify(prev.grid));
              gridChanged = true;
            }
            
            const targetTile = updatedGrid[targetTileY]?.[targetTileX];
            if (targetTile && targetTile.building.type !== 'grass' && targetTile.building.type !== 'water') {
              if (!targetTile.building.onFire) {
                targetTile.building.onFire = true;
                targetTile.building.fireProgress = 0;
              }
              // Increase fire progress
              targetTile.building.fireProgress = Math.min(100, 
                targetTile.building.fireProgress + unit.damage * delta * speedMult * 0.5
              );
            }
          } else {
            // Move toward target
            const targetScreenX = targetTileX * 64;
            const targetScreenY = targetTileY * 32;
            const dx = targetScreenX - unit.x;
            const dy = targetScreenY - unit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
              const moveAmount = unit.moveSpeed * delta * speedMult;
              newUnit.x += (dx / dist) * moveAmount;
              newUnit.y += (dy / dist) * moveAmount;
              newUnit.direction = Math.atan2(dy, dx);
              newUnit.tileX = Math.floor(newUnit.x / 64);
              newUnit.tileY = Math.floor(newUnit.y / 32);
            }
          }
        }
        
        return newUnit;
      });
      
      // Update fog of war based on unit positions
      const newExplored = prev.competitive.fogOfWar.explored.map(row => [...row]);
      const newVisible = prev.competitive.fogOfWar.visible.map(row => row.map(() => false));
      
      // Player units reveal fog
      for (const unit of updatedUnits) {
        if (unit.playerId === 0 && unit.state !== 'destroyed') {
          const visionRange = unit.type === 'military_helicopter' ? 8 : 5;
          for (let dy = -visionRange; dy <= visionRange; dy++) {
            for (let dx = -visionRange; dx <= visionRange; dx++) {
              const checkX = unit.tileX + dx;
              const checkY = unit.tileY + dy;
              if (checkX >= 0 && checkX < prev.gridSize && checkY >= 0 && checkY < prev.gridSize) {
                if (dx * dx + dy * dy <= visionRange * visionRange) {
                  newExplored[checkY][checkX] = true;
                  newVisible[checkY][checkX] = true;
                }
              }
            }
          }
        }
      }
      
      // Player's starting area is always visible
      const playerStartX = prev.competitive.players[0].startX;
      const playerStartY = prev.competitive.players[0].startY;
      for (let dy = -12; dy <= 12; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
          const checkX = playerStartX + dx;
          const checkY = playerStartY + dy;
          if (checkX >= 0 && checkX < prev.gridSize && checkY >= 0 && checkY < prev.gridSize) {
            if (dx * dx + dy * dy <= 144) { // 12^2
              newVisible[checkY][checkX] = true;
            }
          }
        }
      }
      
      // Simple AI - spawn units and attack player
      let updatedPlayers = [...prev.competitive.players];
      const aiTimer = prev.competitive.aiUpdateTimer + delta * speedMult;
      
      if (aiTimer >= 5) { // AI acts every 5 seconds
        for (let i = 1; i < updatedPlayers.length; i++) {
          const aiPlayer = updatedPlayers[i];
          if (aiPlayer.isEliminated) continue;
          
          // AI spawns units periodically
          if (Math.random() < 0.3) {
            const unitType: MilitaryUnitType = Math.random() < 0.6 ? 'infantry' : (Math.random() < 0.7 ? 'tank' : 'military_helicopter');
            const stats = MILITARY_UNIT_STATS[unitType];
            
            const newAIUnit: MilitaryUnit = {
              id: prev.competitive.unitIdCounter + updatedUnits.length,
              type: unitType,
              playerId: aiPlayer.id,
              x: aiPlayer.startX * 64 + Math.random() * 64,
              y: aiPlayer.startY * 32 + Math.random() * 32,
              tileX: aiPlayer.startX,
              tileY: aiPlayer.startY,
              health: stats.health,
              maxHealth: stats.health,
              damage: stats.damage,
              attackRange: stats.attackRange,
              moveSpeed: stats.moveSpeed,
              selected: false,
              targetX: null,
              targetY: null,
              attackTargetId: null,
              attackBuildingX: null,
              attackBuildingY: null,
              state: 'idle',
              direction: 0,
              animTimer: 0,
              altitude: unitType === 'military_helicopter' ? 1 : undefined,
            };
            
            updatedUnits.push(newAIUnit);
          }
          
          // AI units attack toward player
          for (const unit of updatedUnits) {
            if (unit.playerId === aiPlayer.id && unit.state === 'idle') {
              // 20% chance to start attacking player's city hall
              if (Math.random() < 0.2) {
                unit.attackBuildingX = prev.competitive.players[0].startX;
                unit.attackBuildingY = prev.competitive.players[0].startY;
                unit.state = 'attacking';
              }
            }
          }
        }
      }
      
      // Check for elimination (city hall destroyed)
      for (const player of updatedPlayers) {
        if (player.isEliminated) continue;
        
        const cityHallTile = gridChanged 
          ? updatedGrid[player.startY]?.[player.startX]
          : prev.grid[player.startY]?.[player.startX];
        
        if (!cityHallTile || cityHallTile.building.type === 'grass' || cityHallTile.building.fireProgress >= 100) {
          player.isEliminated = true;
        }
      }
      
      // Check for game over
      const activePlayers = updatedPlayers.filter(p => !p.isEliminated);
      const gameOver = activePlayers.length <= 1;
      const winnerId = gameOver && activePlayers.length === 1 ? activePlayers[0].id : null;
      
      // Calculate scores
      for (const player of updatedPlayers) {
        const unitCount = updatedUnits.filter(u => u.playerId === player.id && u.state !== 'destroyed').length;
        player.score = player.isEliminated ? 0 : 1000 + unitCount * 100;
      }
      
      return {
        ...prev,
        grid: gridChanged ? updatedGrid : prev.grid,
        competitive: {
          ...prev.competitive,
          units: updatedUnits,
          unitIdCounter: prev.competitive.unitIdCounter + (updatedUnits.length - prev.competitive.units.length),
          fogOfWar: { explored: newExplored, visible: newVisible },
          players: updatedPlayers,
          gameOver,
          winnerId,
          aiUpdateTimer: aiTimer >= 5 ? 0 : aiTimer,
        },
      };
    });
  }, []);

  const value: GameContextValue = {
    state,
    setTool,
    setSpeed,
    setTaxRate,
    setActivePanel,
    setBudgetFunding,
    placeAtTile,
    connectToCity,
    discoverCity,
    checkAndDiscoverCities,
    setDisastersEnabled,
    newGame,
    loadState,
    exportState,
    generateRandomCity,
    hasExistingGame,
    isSaving,
    addMoney,
    addNotification,
    // Sprite pack management
    currentSpritePack,
    availableSpritePacks: SPRITE_PACKS,
    setSpritePack,
    // Day/night mode override
    dayNightMode,
    setDayNightMode,
    visualHour,
    // Save/restore city for shared links
    saveCurrentCityForRestore,
    restoreSavedCity,
    getSavedCityInfo,
    clearSavedCity,
    // Multi-city save system
    savedCities,
    saveCity,
    loadSavedCity,
    deleteSavedCity,
    renameSavedCity,
    // Competitive mode functions
    isCompetitiveMode,
    trainUnit,
    selectUnits,
    setSelectionBox,
    commandUnitsToMove,
    commandUnitsToAttack,
    updateCompetitiveState,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
