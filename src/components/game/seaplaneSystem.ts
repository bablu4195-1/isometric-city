/* eslint-disable react-hooks/immutability */
import { useCallback } from 'react';
import { Seaplane, WorldRenderState, TILE_WIDTH, TILE_HEIGHT, WakeParticle } from './types';
import {
  SEAPLANE_MIN_POPULATION,
  SEAPLANE_MIN_BAY_SIZE,
  SEAPLANE_COLORS,
  MAX_SEAPLANES,
  SEAPLANE_SPAWN_INTERVAL_MIN,
  SEAPLANE_SPAWN_INTERVAL_MAX,
  SEAPLANE_PRE_DOCK_TAXI_TIME_MIN,
  SEAPLANE_PRE_DOCK_TAXI_TIME_MAX,
  SEAPLANE_POST_DOCK_TAXI_TIME_MIN,
  SEAPLANE_POST_DOCK_TAXI_TIME_MAX,
  SEAPLANE_DOCK_TIME_MIN,
  SEAPLANE_DOCK_TIME_MAX,
  SEAPLANE_AIR_TIME_MIN,
  SEAPLANE_AIR_TIME_MAX,
  SEAPLANE_LEGS_MIN,
  SEAPLANE_LEGS_MAX,
  SEAPLANE_WATER_SPEED,
  SEAPLANE_TAKEOFF_SPEED,
  SEAPLANE_FLIGHT_SPEED_MIN,
  SEAPLANE_FLIGHT_SPEED_MAX,
  SEAPLANE_MIN_ZOOM,
  CONTRAIL_MAX_AGE,
  CONTRAIL_SPAWN_INTERVAL,
  WAKE_MAX_AGE,
  WAKE_SPAWN_INTERVAL,
} from './constants';
import {
  findAdjacentWaterTile,
  findAdjacentWaterTileForMarina,
  findBays,
  findMarinasAndPiers,
  getRandomBayTile,
  isOverWater,
  BayInfo,
  DockInfo,
} from './gridFinders';
import { gridToScreen } from './utils';

export interface SeaplaneSystemRefs {
  seaplanesRef: React.MutableRefObject<Seaplane[]>;
  seaplaneIdRef: React.MutableRefObject<number>;
  seaplaneSpawnTimerRef: React.MutableRefObject<number>;
}

export interface SeaplaneSystemState {
  worldStateRef: React.MutableRefObject<WorldRenderState>;
  gridVersionRef: React.MutableRefObject<number>;
  cachedPopulationRef: React.MutableRefObject<{ count: number; gridVersion: number }>;
  isMobile: boolean;
}

export function useSeaplaneSystem(
  refs: SeaplaneSystemRefs,
  systemState: SeaplaneSystemState
) {
  const { seaplanesRef, seaplaneIdRef, seaplaneSpawnTimerRef } = refs;
  const { worldStateRef, gridVersionRef, cachedPopulationRef, isMobile } = systemState;

  const pickDockTargetForBay = useCallback(
    (bay: BayInfo, docks: DockInfo[]) => {
      if (docks.length === 0) return null;

      const bayWaterKey = new Set(bay.waterTiles.map(t => `${t.x},${t.y}`));
      const candidates: Array<{ dockX: number; dockY: number; waterX: number; waterY: number; screenX: number; screenY: number }> = [];

      for (const dock of docks) {
        const waterTile =
          dock.type === 'marina'
            ? (findAdjacentWaterTileForMarina(worldStateRef.current.grid, worldStateRef.current.gridSize, dock.x, dock.y) ??
              findAdjacentWaterTile(worldStateRef.current.grid, worldStateRef.current.gridSize, dock.x, dock.y))
            : findAdjacentWaterTile(worldStateRef.current.grid, worldStateRef.current.gridSize, dock.x, dock.y);

        if (!waterTile) continue;
        if (!bayWaterKey.has(`${waterTile.x},${waterTile.y}`)) continue;

        const { screenX, screenY } = gridToScreen(waterTile.x, waterTile.y, 0, 0);
        candidates.push({
          dockX: dock.x,
          dockY: dock.y,
          waterX: waterTile.x,
          waterY: waterTile.y,
          screenX: screenX + TILE_WIDTH / 2,
          screenY: screenY + TILE_HEIGHT / 2,
        });
      }

      if (candidates.length === 0) return null;
      return candidates[Math.floor(Math.random() * candidates.length)];
    },
    [worldStateRef]
  );

  // Find bays callback
  const findBaysCallback = useCallback((): BayInfo[] => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return findBays(currentGrid, currentGridSize, SEAPLANE_MIN_BAY_SIZE);
  }, [worldStateRef]);

  // Check if screen position is over water callback
  const isOverWaterCallback = useCallback((screenX: number, screenY: number): boolean => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return isOverWater(currentGrid, currentGridSize, screenX, screenY);
  }, [worldStateRef]);

  // Update seaplanes - spawn, move, and manage lifecycle
  const updateSeaplanes = useCallback((delta: number) => {
    const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed, zoom: currentZoom } = worldStateRef.current;
    
    if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
      return;
    }

    // Clear seaplanes if zoomed out too far
    if (currentZoom < SEAPLANE_MIN_ZOOM) {
      seaplanesRef.current = [];
      return;
    }

    // Find bays
    const bays = findBaysCallback();
    const docks = findMarinasAndPiers(currentGrid, currentGridSize);
    
    // Get cached population count
    const currentGridVersion = gridVersionRef.current;
    let totalPopulation: number;
    if (cachedPopulationRef.current.gridVersion === currentGridVersion) {
      totalPopulation = cachedPopulationRef.current.count;
    } else {
      // Recalculate and cache
      totalPopulation = 0;
      for (let y = 0; y < currentGridSize; y++) {
        for (let x = 0; x < currentGridSize; x++) {
          totalPopulation += currentGrid[y][x].building.population || 0;
        }
      }
      cachedPopulationRef.current = { count: totalPopulation, gridVersion: currentGridVersion };
    }

    // No seaplanes if no bays or insufficient population
    if (bays.length === 0 || totalPopulation < SEAPLANE_MIN_POPULATION) {
      seaplanesRef.current = [];
      return;
    }

    // Calculate max seaplanes based on population and bay count
    const populationBased = Math.floor(totalPopulation / 2000);
    const bayBased = Math.floor(bays.length * 5);
    const maxSeaplanes = Math.min(MAX_SEAPLANES, Math.max(3, Math.min(populationBased, bayBased)));
    
    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Spawn timer
    seaplaneSpawnTimerRef.current -= delta;
    if (seaplanesRef.current.length < maxSeaplanes && seaplaneSpawnTimerRef.current <= 0) {
      // Pick a random bay
      const bay = bays[Math.floor(Math.random() * bays.length)];
      
      // Get a random tile in the bay for spawn position
      const spawnTile = getRandomBayTile(bay);
      
      // Random initial angle
      const angle = Math.random() * Math.PI * 2;
      
      const legsRemaining = SEAPLANE_LEGS_MIN + Math.floor(Math.random() * (SEAPLANE_LEGS_MAX - SEAPLANE_LEGS_MIN + 1));

      seaplanesRef.current.push({
        id: seaplaneIdRef.current++,
        x: spawnTile.screenX,
        y: spawnTile.screenY,
        angle: angle,
        targetAngle: angle,
        state: 'taxiing_water',
        speed: SEAPLANE_WATER_SPEED * (0.8 + Math.random() * 0.4),
        altitude: 0,
        targetAltitude: 0,
        bayTileX: bay.centerX,
        bayTileY: bay.centerY,
        bayScreenX: bay.screenX,
        bayScreenY: bay.screenY,
        stateProgress: 0,
        contrail: [],
        wake: [],
        wakeSpawnProgress: 0,
        airTimeRemaining: SEAPLANE_AIR_TIME_MIN + Math.random() * (SEAPLANE_AIR_TIME_MAX - SEAPLANE_AIR_TIME_MIN),
        legsRemaining,
        taxiTime:
          SEAPLANE_PRE_DOCK_TAXI_TIME_MIN +
          Math.random() * (SEAPLANE_PRE_DOCK_TAXI_TIME_MAX - SEAPLANE_PRE_DOCK_TAXI_TIME_MIN),
        needsDockBeforeTakeoff: true,
        dockTileX: null,
        dockTileY: null,
        dockTargetScreenX: null,
        dockTargetScreenY: null,
        dockTimeRemaining: 0,
        dockApproachTimeout: 0,
        color: SEAPLANE_COLORS[Math.floor(Math.random() * SEAPLANE_COLORS.length)],
      });
      
      // Set next spawn time
      seaplaneSpawnTimerRef.current = SEAPLANE_SPAWN_INTERVAL_MIN + Math.random() * (SEAPLANE_SPAWN_INTERVAL_MAX - SEAPLANE_SPAWN_INTERVAL_MIN);
    }

    // Update existing seaplanes
    const updatedSeaplanes: Seaplane[] = [];
    
    for (const seaplane of seaplanesRef.current) {
      let shouldRemove = false;
      const nearestBay =
        bays.length === 1
          ? bays[0]
          : bays.reduce((best, bay) => {
              const dBest = Math.hypot(seaplane.x - best.screenX, seaplane.y - best.screenY);
              const dBay = Math.hypot(seaplane.x - bay.screenX, seaplane.y - bay.screenY);
              return dBay < dBest ? bay : best;
            }, bays[0]);

      // Update contrail particles when at altitude
      const contrailMaxAge = isMobile ? 0.8 : CONTRAIL_MAX_AGE;
      const contrailSpawnInterval = isMobile ? 0.06 : CONTRAIL_SPAWN_INTERVAL;
      seaplane.contrail = seaplane.contrail
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / contrailMaxAge) }))
        .filter(p => p.age < contrailMaxAge);
      
      // Update wake particles when on water
      const wakeMaxAge = isMobile ? 0.6 : WAKE_MAX_AGE;
      seaplane.wake = seaplane.wake
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / wakeMaxAge) }))
        .filter(p => p.age < wakeMaxAge);

      // Add contrail particles at high altitude
      if (seaplane.altitude > 0.7) {
        seaplane.stateProgress += delta;
        if (seaplane.stateProgress >= contrailSpawnInterval) {
          seaplane.stateProgress -= contrailSpawnInterval;
          // Single contrail particle - offset behind plane
          const behindOffset = 25; // Distance behind the plane
          const downOffset = -2; // Vertical offset up
          const contrailX = seaplane.x - Math.cos(seaplane.angle) * behindOffset;
          const contrailY = seaplane.y - Math.sin(seaplane.angle) * behindOffset + downOffset;
          seaplane.contrail.push({ x: contrailX, y: contrailY, age: 0, opacity: 1 });
        }
      }

      // Calculate next position
      let nextX = seaplane.x;
      let nextY = seaplane.y;

      switch (seaplane.state) {
        case 'taxiing_water': {
          // Taxi around on water like a boat
          seaplane.taxiTime -= delta;
          
          // Normalize current angle to 0-2PI to prevent wraparound issues
          let normalizedAngle = seaplane.angle % (Math.PI * 2);
          if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
          seaplane.angle = normalizedAngle;
          
          // Normalize target angle
          let normalizedTargetAngle = seaplane.targetAngle % (Math.PI * 2);
          if (normalizedTargetAngle < 0) normalizedTargetAngle += Math.PI * 2;
          seaplane.targetAngle = normalizedTargetAngle;
          
          // Calculate distance from bay center
          const distFromCenter = Math.hypot(seaplane.x - seaplane.bayScreenX, seaplane.y - seaplane.bayScreenY);
          const angleToBayCenter = Math.atan2(seaplane.bayScreenY - seaplane.y, seaplane.bayScreenX - seaplane.x);
          
          // Normalize angleToBayCenter
          let normalizedAngleToCenter = angleToBayCenter % (Math.PI * 2);
          if (normalizedAngleToCenter < 0) normalizedAngleToCenter += Math.PI * 2;
          
          // If too far from center (>100px), steer back toward center
          if (distFromCenter > 100) {
            seaplane.targetAngle = normalizedAngleToCenter + (Math.random() - 0.5) * 0.5; // Slight randomness
            // Normalize again after adding randomness
            seaplane.targetAngle = seaplane.targetAngle % (Math.PI * 2);
            if (seaplane.targetAngle < 0) seaplane.targetAngle += Math.PI * 2;
          } else if (distFromCenter > 50) {
            // When moderately close to center, allow gentle random turning but less frequently
            if (Math.random() < 0.01) {
              // Smaller random turns to prevent flickering
              seaplane.targetAngle = seaplane.angle + (Math.random() - 0.5) * Math.PI / 4; // Reduced from PI/2
              // Normalize
              seaplane.targetAngle = seaplane.targetAngle % (Math.PI * 2);
              if (seaplane.targetAngle < 0) seaplane.targetAngle += Math.PI * 2;
            }
          } else {
            // When very close to center (<50px), DON'T target center anymore
            // This prevents flickering when crossing over the center point
            // Instead, just do occasional gentle random turns like a boat idling
            if (Math.random() < 0.005) { // Very infrequent turns
              seaplane.targetAngle = seaplane.angle + (Math.random() - 0.5) * Math.PI / 6; // Very gentle turns
              // Normalize
              seaplane.targetAngle = seaplane.targetAngle % (Math.PI * 2);
              if (seaplane.targetAngle < 0) seaplane.targetAngle += Math.PI * 2;
            }
            // Keep current targetAngle to maintain stability - don't chase the center
          }
          
          // Check if we're approaching the water boundary (look ahead)
          const lookAheadDist = seaplane.speed * 0.5; // Look ahead half a second
          const lookAheadX = seaplane.x + Math.cos(seaplane.angle) * lookAheadDist;
          const lookAheadY = seaplane.y + Math.sin(seaplane.angle) * lookAheadDist;
          const approachingBoundary = !isOverWaterCallback(lookAheadX, lookAheadY);
          
          // If approaching boundary, immediately target bay center
          if (approachingBoundary) {
            seaplane.targetAngle = normalizedAngleToCenter;
          }
          
          // Smooth turning with maximum rate limit to prevent rapid flipping
          let angleDiff = seaplane.targetAngle - seaplane.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          
          // Turn faster when approaching boundary, otherwise smooth turning
          const baseTurnRate = approachingBoundary ? 3.0 : 1.5; // Faster turn near boundary
          const maxAngleChange = Math.PI * delta * baseTurnRate;
          const clampedAngleDiff = Math.max(-maxAngleChange, Math.min(maxAngleChange, angleDiff));
          seaplane.angle += clampedAngleDiff;
          
          // Normalize angle after update
          seaplane.angle = seaplane.angle % (Math.PI * 2);
          if (seaplane.angle < 0) seaplane.angle += Math.PI * 2;
          
          // Move forward slowly
          nextX = seaplane.x + Math.cos(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          nextY = seaplane.y + Math.sin(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          
          // Final boundary check - don't actually leave water
          if (!isOverWaterCallback(nextX, nextY)) {
            // Stop and turn toward bay center
            seaplane.targetAngle = normalizedAngleToCenter;
            nextX = seaplane.x;
            nextY = seaplane.y;
          }
          
          // Spawn wake particles
          const wakeSpawnInterval = isMobile ? 0.08 : WAKE_SPAWN_INTERVAL;
          seaplane.wakeSpawnProgress += delta;
          if (seaplane.wakeSpawnProgress >= wakeSpawnInterval) {
            seaplane.wakeSpawnProgress -= wakeSpawnInterval;
            const behindSeaplane = -8;
            seaplane.wake.push({
              x: seaplane.x + Math.cos(seaplane.angle) * behindSeaplane,
              y: seaplane.y + Math.sin(seaplane.angle) * behindSeaplane,
              age: 0,
              opacity: 1
            });
          }
          
          // Time to take off - head toward bay center first
          if (seaplane.taxiTime <= 0) {
            if (seaplane.needsDockBeforeTakeoff && docks.length > 0) {
              const target = pickDockTargetForBay(nearestBay, docks);
              if (target) {
                seaplane.dockTileX = target.dockX;
                seaplane.dockTileY = target.dockY;
                seaplane.dockTargetScreenX = target.screenX;
                seaplane.dockTargetScreenY = target.screenY;
                seaplane.state = 'taxiing_to_dock';
                seaplane.dockApproachTimeout = 18;
                // Approach a bit slower for nicer docking
                seaplane.speed = SEAPLANE_WATER_SPEED * 0.85;
              } else {
                seaplane.needsDockBeforeTakeoff = false;
                seaplane.state = 'taking_off';
                seaplane.speed = SEAPLANE_TAKEOFF_SPEED;
                seaplane.angle = angleToBayCenter + (Math.random() - 0.5) * 0.8;
                seaplane.targetAngle = seaplane.angle;
              }
            } else {
              seaplane.needsDockBeforeTakeoff = false;
              seaplane.state = 'taking_off';
              seaplane.speed = SEAPLANE_TAKEOFF_SPEED;
              // Take off toward bay center (so we stay over water longer)
              seaplane.angle = angleToBayCenter + (Math.random() - 0.5) * 0.8; // Slight randomness
              seaplane.targetAngle = seaplane.angle;
            }
          }
          break;
        }
        
        case 'taxiing_to_dock': {
          seaplane.dockApproachTimeout -= delta;

          const targetX = seaplane.dockTargetScreenX ?? seaplane.bayScreenX;
          const targetY = seaplane.dockTargetScreenY ?? seaplane.bayScreenY;

          const distToDock = Math.hypot(seaplane.x - targetX, seaplane.y - targetY);
          const angleToDock = Math.atan2(targetY - seaplane.y, targetX - seaplane.x);
          seaplane.targetAngle = angleToDock;

          // Smooth turning, a bit more decisive than idle taxiing
          let angleDiff = seaplane.targetAngle - seaplane.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const maxAngleChange = Math.PI * delta * 2.4;
          seaplane.angle += Math.max(-maxAngleChange, Math.min(maxAngleChange, angleDiff));

          // Slow down as we get close
          const approachSpeed = Math.max(6, SEAPLANE_WATER_SPEED * (distToDock < 40 ? 0.45 : distToDock < 80 ? 0.7 : 0.9));
          seaplane.speed = approachSpeed;

          nextX = seaplane.x + Math.cos(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          nextY = seaplane.y + Math.sin(seaplane.angle) * seaplane.speed * delta * speedMultiplier;

          // Avoid leaving water
          if (!isOverWaterCallback(nextX, nextY)) {
            nextX = seaplane.x;
            nextY = seaplane.y;
            // Nudge angle toward bay center to recover
            const recoverAngle = Math.atan2(seaplane.bayScreenY - seaplane.y, seaplane.bayScreenX - seaplane.x);
            seaplane.angle += (recoverAngle - seaplane.angle) * Math.min(1, delta * 2);
          }

          // Spawn wake while moving
          if (seaplane.speed > 5) {
            const wakeSpawnInterval = isMobile ? 0.08 : WAKE_SPAWN_INTERVAL;
            seaplane.wakeSpawnProgress += delta;
            if (seaplane.wakeSpawnProgress >= wakeSpawnInterval) {
              seaplane.wakeSpawnProgress -= wakeSpawnInterval;
              const behindSeaplane = -7;
              seaplane.wake.push({
                x: seaplane.x + Math.cos(seaplane.angle) * behindSeaplane,
                y: seaplane.y + Math.sin(seaplane.angle) * behindSeaplane,
                age: 0,
                opacity: 1,
              });
            }
          }

          // Docked
          if (distToDock < 14) {
            seaplane.state = 'docked';
            seaplane.speed = 0;
            seaplane.wake = [];
            seaplane.dockTimeRemaining =
              SEAPLANE_DOCK_TIME_MIN + Math.random() * (SEAPLANE_DOCK_TIME_MAX - SEAPLANE_DOCK_TIME_MIN);
            nextX = targetX;
            nextY = targetY;
          }

          // Give up if stuck too long
          if (seaplane.dockApproachTimeout <= 0) {
            seaplane.state = 'taxiing_water';
            seaplane.speed = SEAPLANE_WATER_SPEED * (0.8 + Math.random() * 0.4);
            seaplane.taxiTime = 2 + Math.random() * 4;
          }
          break;
        }

        case 'docked': {
          seaplane.altitude = 0;
          seaplane.speed = 0;
          seaplane.dockTimeRemaining -= delta;

          if (seaplane.dockTimeRemaining <= 0) {
            // If no legs remain, despawn after this dock stop.
            if (seaplane.legsRemaining <= 0) {
              shouldRemove = true;
              break;
            }
            // After docking, taxi briefly then take off
            seaplane.state = 'taxiing_water';
            seaplane.needsDockBeforeTakeoff = false;
            seaplane.speed = SEAPLANE_WATER_SPEED * (0.85 + Math.random() * 0.25);
            seaplane.taxiTime =
              SEAPLANE_POST_DOCK_TAXI_TIME_MIN +
              Math.random() * (SEAPLANE_POST_DOCK_TAXI_TIME_MAX - SEAPLANE_POST_DOCK_TAXI_TIME_MIN);
          }
          nextX = seaplane.x;
          nextY = seaplane.y;
          break;
        }

        case 'taking_off': {
          // Accelerate and climb (faster takeoff)
          seaplane.speed = Math.min(SEAPLANE_FLIGHT_SPEED_MAX, seaplane.speed + delta * 50);
          seaplane.altitude = Math.min(1, seaplane.altitude + delta * 0.6);
          
          nextX = seaplane.x + Math.cos(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          nextY = seaplane.y + Math.sin(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          
          // Still spawn wake while on water
          if (seaplane.altitude < 0.3) {
            const wakeSpawnInterval = isMobile ? 0.04 : WAKE_SPAWN_INTERVAL / 2; // More frequent during takeoff
            seaplane.wakeSpawnProgress += delta;
            if (seaplane.wakeSpawnProgress >= wakeSpawnInterval) {
              seaplane.wakeSpawnProgress -= wakeSpawnInterval;
              const behindSeaplane = -10;
              seaplane.wake.push({
                x: seaplane.x + Math.cos(seaplane.angle) * behindSeaplane,
                y: seaplane.y + Math.sin(seaplane.angle) * behindSeaplane,
                age: 0,
                opacity: 1
              });
            }
          }
          
          // Transition to flying when at altitude
          if (seaplane.altitude >= 1) {
            seaplane.state = 'flying';
            seaplane.speed = SEAPLANE_FLIGHT_SPEED_MIN + Math.random() * (SEAPLANE_FLIGHT_SPEED_MAX - SEAPLANE_FLIGHT_SPEED_MIN);
            seaplane.airTimeRemaining = SEAPLANE_AIR_TIME_MIN + Math.random() * (SEAPLANE_AIR_TIME_MAX - SEAPLANE_AIR_TIME_MIN);
          }
          break;
        }
        
        case 'flying': {
          // Fly at cruising altitude
          nextX = seaplane.x + Math.cos(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          nextY = seaplane.y + Math.sin(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          
          seaplane.airTimeRemaining -= delta;
          
          // Time to land - head back to bay
          if (seaplane.airTimeRemaining <= 5) {
            const distToBay = Math.hypot(seaplane.x - seaplane.bayScreenX, seaplane.y - seaplane.bayScreenY);
            
            // Smoothly turn toward bay (prevents sudden angle jumps)
            const angleToBay = Math.atan2(seaplane.bayScreenY - seaplane.y, seaplane.bayScreenX - seaplane.x);
            let flyingAngleDiff = angleToBay - seaplane.angle;
            while (flyingAngleDiff > Math.PI) flyingAngleDiff -= Math.PI * 2;
            while (flyingAngleDiff < -Math.PI) flyingAngleDiff += Math.PI * 2;
            // Smooth turn toward bay
            const flyingTurnRate = Math.PI * delta * 0.8; // Max ~144 degrees per second
            seaplane.angle += Math.max(-flyingTurnRate, Math.min(flyingTurnRate, flyingAngleDiff));
            
            // Start landing approach when close to bay
            if (distToBay < 300) {
              seaplane.state = 'landing';
              seaplane.targetAltitude = 0;
              seaplane.legsRemaining = Math.max(0, seaplane.legsRemaining - 1);
            }
          } else if (seaplane.airTimeRemaining <= 0) {
            // If we're really out of time and still far, gently bias back to bay instead of despawning abruptly
            const angleToBay = Math.atan2(seaplane.bayScreenY - seaplane.y, seaplane.bayScreenX - seaplane.x);
            let flyingAngleDiff = angleToBay - seaplane.angle;
            while (flyingAngleDiff > Math.PI) flyingAngleDiff -= Math.PI * 2;
            while (flyingAngleDiff < -Math.PI) flyingAngleDiff += Math.PI * 2;
            seaplane.angle += Math.max(-Math.PI * delta, Math.min(Math.PI * delta, flyingAngleDiff));
          }
          
          // Gentle course corrections while flying
          if (Math.random() < 0.01) {
            seaplane.angle += (Math.random() - 0.5) * 0.2;
          }
          break;
        }
        
        case 'landing': {
          // Descend and slow down
          seaplane.speed = Math.max(SEAPLANE_TAKEOFF_SPEED, seaplane.speed - delta * 15);
          seaplane.altitude = Math.max(0, seaplane.altitude - delta * 0.25);
          
          // Smoothly adjust angle toward bay center (prevents sudden jumps)
          const angleToBay = Math.atan2(seaplane.bayScreenY - seaplane.y, seaplane.bayScreenX - seaplane.x);
          let landingAngleDiff = angleToBay - seaplane.angle;
          while (landingAngleDiff > Math.PI) landingAngleDiff -= Math.PI * 2;
          while (landingAngleDiff < -Math.PI) landingAngleDiff += Math.PI * 2;
          // Smooth turn toward landing target
          const landingTurnRate = Math.PI * delta * 0.5; // Max ~90 degrees per second
          seaplane.angle += Math.max(-landingTurnRate, Math.min(landingTurnRate, landingAngleDiff));
          
          nextX = seaplane.x + Math.cos(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          nextY = seaplane.y + Math.sin(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          
          // Transition to splashdown when very low
          if (seaplane.altitude <= 0.1) {
            seaplane.state = 'splashdown';
          }
          break;
        }
        
        case 'splashdown': {
          // Touch down on water and decelerate
          seaplane.altitude = 0;
          seaplane.speed = Math.max(0, seaplane.speed - delta * 25);
          
          nextX = seaplane.x + Math.cos(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          nextY = seaplane.y + Math.sin(seaplane.angle) * seaplane.speed * delta * speedMultiplier;
          
          // Check if over water during splashdown
          if (!isOverWaterCallback(nextX, nextY)) {
            // Stop if not over water
            nextX = seaplane.x;
            nextY = seaplane.y;
            seaplane.speed = 0;
          }
          
          // Spawn wake during splashdown
          if (seaplane.speed > 5) {
            const wakeSpawnInterval = isMobile ? 0.04 : WAKE_SPAWN_INTERVAL / 2;
            seaplane.wakeSpawnProgress += delta;
            if (seaplane.wakeSpawnProgress >= wakeSpawnInterval) {
              seaplane.wakeSpawnProgress -= wakeSpawnInterval;
              const behindSeaplane = -10;
              seaplane.wake.push({
                x: seaplane.x + Math.cos(seaplane.angle) * behindSeaplane,
                y: seaplane.y + Math.sin(seaplane.angle) * behindSeaplane,
                age: 0,
                opacity: 1
              });
            }
          }
          
          // Remove seaplane when stopped
          if (seaplane.speed <= 1) {
            // Instead of despawning immediately, try to taxi to a dock and depart again.
            // If no legs remain, we'll despawn after this dock stop (or immediately if no docks).
            const target = pickDockTargetForBay(nearestBay, docks);
            if (target) {
              seaplane.dockTileX = target.dockX;
              seaplane.dockTileY = target.dockY;
              seaplane.dockTargetScreenX = target.screenX;
              seaplane.dockTargetScreenY = target.screenY;
              seaplane.state = 'taxiing_to_dock';
              seaplane.dockApproachTimeout = 18;
              seaplane.speed = SEAPLANE_WATER_SPEED * 0.85;
            } else {
              // No dock available - if no legs remain, despawn; otherwise reset to taxi and attempt takeoff.
              if (seaplane.legsRemaining <= 0) {
                shouldRemove = true;
                break;
              }
              seaplane.state = 'taxiing_water';
              seaplane.needsDockBeforeTakeoff = false;
              seaplane.speed = SEAPLANE_WATER_SPEED * (0.8 + Math.random() * 0.4);
              seaplane.taxiTime =
                SEAPLANE_POST_DOCK_TAXI_TIME_MIN +
                Math.random() * (SEAPLANE_POST_DOCK_TAXI_TIME_MAX - SEAPLANE_POST_DOCK_TAXI_TIME_MIN);
            }
          }
          break;
        }
      }
      
      if (shouldRemove) {
        continue;
      }

      // Update position
      seaplane.x = nextX;
      seaplane.y = nextY;
      
      updatedSeaplanes.push(seaplane);
    }
    
    seaplanesRef.current = updatedSeaplanes;
  }, [worldStateRef, gridVersionRef, cachedPopulationRef, seaplanesRef, seaplaneIdRef, seaplaneSpawnTimerRef, findBaysCallback, isOverWaterCallback, isMobile]);

  return {
    updateSeaplanes,
    findBaysCallback,
  };
}
