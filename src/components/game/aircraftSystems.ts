import { useCallback } from 'react';
import { Airplane, Helicopter, WorldRenderState, TILE_WIDTH, TILE_HEIGHT, PlaneType } from './types';
import {
  AIRPLANE_MIN_POPULATION,
  AIRPLANE_COLORS,
  CONTRAIL_MAX_AGE,
  CONTRAIL_SPAWN_INTERVAL,
  HELICOPTER_MIN_POPULATION,
  HELICOPTER_COLORS,
  ROTOR_WASH_MAX_AGE,
  ROTOR_WASH_SPAWN_INTERVAL,
  PLANE_TYPES,
  AIRPLANE_TAXI_SPEED,
  AIRPLANE_TAKEOFF_ROLL_SPEED,
  AIRPLANE_TAKEOFF_SPEED,
  AIRPLANE_FLIGHT_SPEED_MIN,
  AIRPLANE_FLIGHT_SPEED_MAX,
  AIRPLANE_APPROACH_SPEED,
  AIRPLANE_TOUCHDOWN_SPEED,
  AIRPLANE_TAXI_TIME_MIN,
  AIRPLANE_TAXI_TIME_MAX,
  AIRPLANE_FLIGHT_TIME_MIN,
  AIRPLANE_FLIGHT_TIME_MAX,
  AIRPLANE_MIN_ZOOM,
  RUNWAY_SMOKE_MAX_AGE,
  RUNWAY_SMOKE_SPAWN_INTERVAL,
  RUNWAY_SMOKE_MAX_PARTICLES,
} from './constants';
import { gridToScreen } from './utils';
import { findAirports, findHeliports, AirportInfo } from './gridFinders';

export interface AircraftSystemRefs {
  airplanesRef: React.MutableRefObject<Airplane[]>;
  airplaneIdRef: React.MutableRefObject<number>;
  airplaneSpawnTimerRef: React.MutableRefObject<number>;
  helicoptersRef: React.MutableRefObject<Helicopter[]>;
  helicopterIdRef: React.MutableRefObject<number>;
  helicopterSpawnTimerRef: React.MutableRefObject<number>;
}

export interface AircraftSystemState {
  worldStateRef: React.MutableRefObject<WorldRenderState>;
  gridVersionRef: React.MutableRefObject<number>;
  cachedPopulationRef: React.MutableRefObject<{ count: number; gridVersion: number }>;
  isMobile: boolean;
}

export function useAircraftSystems(
  refs: AircraftSystemRefs,
  systemState: AircraftSystemState
) {
  const {
    airplanesRef,
    airplaneIdRef,
    airplaneSpawnTimerRef,
    helicoptersRef,
    helicopterIdRef,
    helicopterSpawnTimerRef,
  } = refs;

  const { worldStateRef, gridVersionRef, cachedPopulationRef, isMobile } = systemState;

  // Find airports callback
  const findAirportsCallback = useCallback((): AirportInfo[] => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return findAirports(currentGrid, currentGridSize);
  }, [worldStateRef]);

  // Find heliports callback
  const findHeliportsCallback = useCallback(() => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return findHeliports(currentGrid, currentGridSize);
  }, [worldStateRef]);

  // Update airplanes - spawn, move, and manage lifecycle with realistic runway dynamics
  const updateAirplanes = useCallback((delta: number) => {
    const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed, zoom: currentZoom } = worldStateRef.current;
    
    if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
      return;
    }

    // Clear airplanes if zoomed out too far
    if (currentZoom < AIRPLANE_MIN_ZOOM) {
      airplanesRef.current = [];
      return;
    }

    // Find airports and check population
    const airports = findAirportsCallback();
    
    // Get cached population count (only recalculate when grid changes)
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

    // No airplanes if no airport or insufficient population
    if (airports.length === 0 || totalPopulation < AIRPLANE_MIN_POPULATION) {
      airplanesRef.current = [];
      return;
    }

    // Calculate max airplanes based on population and number of airports
    const populationBased = Math.floor(totalPopulation / 2000) * 2;
    const airportBased = airports.length * 8;
    const maxAirplanes = Math.min(60, Math.max(10, Math.min(populationBased, airportBased)));
    
    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Spawn timer
    airplaneSpawnTimerRef.current -= delta;
    if (airplanesRef.current.length < maxAirplanes && airplaneSpawnTimerRef.current <= 0) {
      // Pick a random airport
      const airport = airports[Math.floor(Math.random() * airports.length)];
      
      // Decide if taking off or arriving from distance
      const isTakingOff = Math.random() < 0.5;
      
      const planeType = PLANE_TYPES[Math.floor(Math.random() * PLANE_TYPES.length)] as PlaneType;
      
      if (isTakingOff) {
        // Taking off from airport - start at runway start position
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: airport.runwayStartX,
          y: airport.runwayStartY,
          angle: airport.runwayAngle,
          targetAngle: airport.runwayAngle,
          state: 'taxiing',
          speed: AIRPLANE_TAXI_SPEED * (0.8 + Math.random() * 0.4),
          altitude: 0,
          targetAltitude: 0,
          airportX: airport.x,
          airportY: airport.y,
          airportFlipped: airport.isFlipped,
          runwayAngle: airport.runwayAngle,
          runwayCenterX: airport.runwayCenterX,
          runwayCenterY: airport.runwayCenterY,
          runwayStartX: airport.runwayStartX,
          runwayStartY: airport.runwayStartY,
          runwayEndX: airport.runwayEndX,
          runwayEndY: airport.runwayEndY,
          stateProgress: 0,
          contrail: [],
          runwaySmoke: [],
          lifeTime: AIRPLANE_FLIGHT_TIME_MIN + Math.random() * (AIRPLANE_FLIGHT_TIME_MAX - AIRPLANE_FLIGHT_TIME_MIN),
          taxiTime: AIRPLANE_TAXI_TIME_MIN + Math.random() * (AIRPLANE_TAXI_TIME_MAX - AIRPLANE_TAXI_TIME_MIN),
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType: planeType,
        });
      } else {
        // Arriving from the edge of the map
        // Spawn from the direction opposite to the runway angle (approach from behind the runway)
        const approachAngle = airport.runwayAngle + Math.PI; // Opposite direction
        const spawnDistance = currentGridSize * TILE_WIDTH * 0.8;
        
        // Spawn position is behind the runway approach path
        const startX = airport.runwayStartX - Math.cos(airport.runwayAngle) * spawnDistance;
        const startY = airport.runwayStartY - Math.sin(airport.runwayAngle) * spawnDistance;
        
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: startX,
          y: startY,
          angle: airport.runwayAngle, // Flying toward the runway
          targetAngle: airport.runwayAngle,
          state: 'flying',
          speed: AIRPLANE_FLIGHT_SPEED_MIN + Math.random() * (AIRPLANE_FLIGHT_SPEED_MAX - AIRPLANE_FLIGHT_SPEED_MIN),
          altitude: 1,
          targetAltitude: 1,
          airportX: airport.x,
          airportY: airport.y,
          airportFlipped: airport.isFlipped,
          runwayAngle: airport.runwayAngle,
          runwayCenterX: airport.runwayCenterX,
          runwayCenterY: airport.runwayCenterY,
          runwayStartX: airport.runwayStartX,
          runwayStartY: airport.runwayStartY,
          runwayEndX: airport.runwayEndX,
          runwayEndY: airport.runwayEndY,
          stateProgress: 0,
          contrail: [],
          runwaySmoke: [],
          lifeTime: AIRPLANE_FLIGHT_TIME_MIN + Math.random() * (AIRPLANE_FLIGHT_TIME_MAX - AIRPLANE_FLIGHT_TIME_MIN),
          taxiTime: 0,
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType: planeType,
        });
      }
      
      airplaneSpawnTimerRef.current = 3 + Math.random() * 6; // 3-9 seconds between spawns
    }

    // Update existing airplanes
    const updatedAirplanes: Airplane[] = [];
    
    for (const plane of airplanesRef.current) {
      // Update contrail particles - shorter duration on mobile for performance
      const contrailMaxAge = isMobile ? 0.8 : CONTRAIL_MAX_AGE;
      const contrailSpawnInterval = isMobile ? 0.06 : CONTRAIL_SPAWN_INTERVAL;
      plane.contrail = plane.contrail
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / contrailMaxAge) }))
        .filter(p => p.age < contrailMaxAge);
      
      // Update runway smoke particles
      const smokeMaxAge = isMobile ? 0.8 : RUNWAY_SMOKE_MAX_AGE;
      plane.runwaySmoke = plane.runwaySmoke
        .map(p => ({
          ...p,
          x: p.x + p.vx * delta,
          y: p.y + p.vy * delta,
          age: p.age + delta,
          opacity: Math.max(0, 1 - p.age / smokeMaxAge),
          size: p.size + delta * 15, // Smoke expands
        }))
        .filter(p => p.age < smokeMaxAge && plane.runwaySmoke.length <= RUNWAY_SMOKE_MAX_PARTICLES);
      
      // Add new contrail particles at high altitude (less frequent on mobile)
      if (plane.altitude > 0.7) {
        plane.stateProgress += delta;
        if (plane.stateProgress >= contrailSpawnInterval) {
          plane.stateProgress -= contrailSpawnInterval;
          // Single centered contrail particle - offset behind plane and down
          const behindOffset = 40; // Distance behind the plane
          const downOffset = 8; // Vertical offset down
          const contrailX = plane.x - Math.cos(plane.angle) * behindOffset;
          const contrailY = plane.y - Math.sin(plane.angle) * behindOffset + downOffset;
          plane.contrail.push({ x: contrailX, y: contrailY, age: 0, opacity: 1 });
        }
      }
      
      // Helper function for smooth angle interpolation
      const smoothTurnToward = (currentAngle: number, targetAngle: number, maxTurnRate: number): number => {
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxChange = maxTurnRate * delta;
        return currentAngle + Math.max(-maxChange, Math.min(maxChange, angleDiff));
      };
      
      // Update based on state
      switch (plane.state) {
        case 'taxiing': {
          // Taxi around on ground before reaching runway
          plane.taxiTime -= delta;
          
          // Move slowly toward runway start position
          const distToRunwayStart = Math.hypot(plane.x - plane.runwayStartX, plane.y - plane.runwayStartY);
          
          if (distToRunwayStart > 20) {
            // Move toward runway start
            const angleToStart = Math.atan2(plane.runwayStartY - plane.y, plane.runwayStartX - plane.x);
            plane.angle = smoothTurnToward(plane.angle, angleToStart, Math.PI * 0.8);
            plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
            plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          }
          
          // Ready for takeoff roll when taxi time is up and aligned with runway
          if (plane.taxiTime <= 0) {
            // Align with runway angle
            plane.angle = plane.runwayAngle;
            plane.targetAngle = plane.runwayAngle;
            plane.state = 'rolling_takeoff';
            plane.speed = AIRPLANE_TAXI_SPEED;
          }
          break;
        }
        
        case 'rolling_takeoff': {
          // Accelerate down the runway
          plane.speed = Math.min(AIRPLANE_TAKEOFF_ROLL_SPEED, plane.speed + delta * 40);
          
          // Move along runway
          plane.x += Math.cos(plane.runwayAngle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.runwayAngle) * plane.speed * delta * speedMultiplier;
          
          // Check if past runway center (rotation point)
          const distFromStart = Math.hypot(plane.x - plane.runwayStartX, plane.y - plane.runwayStartY);
          const runwayLength = Math.hypot(plane.runwayEndX - plane.runwayStartX, plane.runwayEndY - plane.runwayStartY);
          
          if (distFromStart > runwayLength * 0.6 && plane.speed >= AIRPLANE_TAKEOFF_ROLL_SPEED * 0.9) {
            plane.state = 'rotating';
          }
          break;
        }
        
        case 'rotating': {
          // Nose up, about to lift off - continue accelerating
          plane.speed = Math.min(AIRPLANE_TAKEOFF_SPEED, plane.speed + delta * 25);
          
          // Move along runway
          plane.x += Math.cos(plane.runwayAngle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.runwayAngle) * plane.speed * delta * speedMultiplier;
          
          // Begin climbing very slightly
          plane.altitude = Math.min(0.15, plane.altitude + delta * 0.4);
          
          // Check if past runway end - time to actually take off
          const distFromEnd = Math.hypot(plane.x - plane.runwayEndX, plane.y - plane.runwayEndY);
          const distFromStart = Math.hypot(plane.x - plane.runwayStartX, plane.y - plane.runwayStartY);
          
          if (distFromEnd < 30 || distFromStart > 180) {
            plane.state = 'taking_off';
          }
          break;
        }
        
        case 'taking_off': {
          // Climb out from the airport
          plane.speed = Math.min(AIRPLANE_FLIGHT_SPEED_MAX, plane.speed + delta * 15);
          plane.altitude = Math.min(1, plane.altitude + delta * 0.35);
          
          // Continue on runway heading initially, then can turn
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Gentle random course corrections after leaving ground
          if (plane.altitude > 0.5 && Math.random() < 0.02) {
            plane.targetAngle = plane.angle + (Math.random() - 0.5) * 0.4;
          }
          plane.angle = smoothTurnToward(plane.angle, plane.targetAngle, Math.PI * 0.3);
          
          if (plane.altitude >= 1) {
            plane.state = 'flying';
            plane.speed = AIRPLANE_FLIGHT_SPEED_MIN + Math.random() * (AIRPLANE_FLIGHT_SPEED_MAX - AIRPLANE_FLIGHT_SPEED_MIN);
          }
          break;
        }
        
        case 'flying': {
          // Cruise at altitude
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Gentle course corrections
          if (Math.random() < 0.01) {
            plane.targetAngle = plane.angle + (Math.random() - 0.5) * 0.3;
          }
          plane.angle = smoothTurnToward(plane.angle, plane.targetAngle, Math.PI * 0.2);
          
          plane.lifeTime -= delta;
          
          // Check if should start approach
          if (plane.lifeTime < 15) {
            // Calculate approach entry point - line up with runway
            const approachDistance = 400;
            const approachEntryX = plane.runwayStartX - Math.cos(plane.runwayAngle) * approachDistance;
            const approachEntryY = plane.runwayStartY - Math.sin(plane.runwayAngle) * approachDistance;
            const distToApproach = Math.hypot(plane.x - approachEntryX, plane.y - approachEntryY);
            
            // Turn toward approach entry point
            const angleToApproach = Math.atan2(approachEntryY - plane.y, approachEntryX - plane.x);
            plane.targetAngle = angleToApproach;
            plane.angle = smoothTurnToward(plane.angle, plane.targetAngle, Math.PI * 0.5);
            
            // Start descending and slowing when close to approach path
            if (distToApproach < approachDistance * 1.5) {
              plane.state = 'approaching';
            }
          }
          
          // Despawn if out of time and too far away
          if (plane.lifeTime <= 0) {
            const distToRunway = Math.hypot(plane.x - plane.runwayCenterX, plane.y - plane.runwayCenterY);
            if (distToRunway > 600) {
              continue; // Remove this plane
            }
          }
          break;
        }
        
        case 'approaching': {
          // Descend and slow down while lining up with runway
          plane.speed = Math.max(AIRPLANE_APPROACH_SPEED, plane.speed - delta * 12);
          plane.altitude = Math.max(0.3, plane.altitude - delta * 0.15);
          
          // Turn toward runway start
          const angleToRunwayStart = Math.atan2(plane.runwayStartY - plane.y, plane.runwayStartX - plane.x);
          plane.angle = smoothTurnToward(plane.angle, angleToRunwayStart, Math.PI * 0.6);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Check if lined up with runway and close enough for final approach
          const distToRunwayStart = Math.hypot(plane.x - plane.runwayStartX, plane.y - plane.runwayStartY);
          const angleDiffToRunway = Math.abs(plane.angle - plane.runwayAngle);
          const normalizedAngleDiff = angleDiffToRunway > Math.PI ? Math.PI * 2 - angleDiffToRunway : angleDiffToRunway;
          
          if (distToRunwayStart < 200 && normalizedAngleDiff < 0.3) {
            plane.state = 'landing';
            // Lock onto runway heading
            plane.angle = plane.runwayAngle;
            plane.targetAngle = plane.runwayAngle;
          }
          break;
        }
        
        case 'landing': {
          // Final approach - descend to runway
          plane.speed = Math.max(AIRPLANE_TOUCHDOWN_SPEED, plane.speed - delta * 8);
          plane.altitude = Math.max(0, plane.altitude - delta * 0.4);
          
          // Stay on runway heading
          plane.angle = plane.runwayAngle;
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Touch down when altitude reaches 0
          if (plane.altitude <= 0.05) {
            plane.altitude = 0;
            plane.state = 'touchdown';
            plane.stateProgress = 0;
          }
          break;
        }
        
        case 'touchdown': {
          // Just touched down - generate tire smoke and decelerate rapidly
          plane.altitude = 0;
          plane.speed = Math.max(AIRPLANE_TAXI_SPEED * 2, plane.speed - delta * 35);
          
          // Stay on runway heading
          plane.angle = plane.runwayAngle;
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Spawn tire smoke during touchdown
          plane.stateProgress += delta;
          const smokeSpawnInterval = isMobile ? 0.06 : RUNWAY_SMOKE_SPAWN_INTERVAL;
          if (plane.stateProgress >= smokeSpawnInterval && plane.runwaySmoke.length < RUNWAY_SMOKE_MAX_PARTICLES) {
            plane.stateProgress -= smokeSpawnInterval;
            
            // Spawn smoke behind the plane (at wheel positions)
            const wheelOffset = 12;
            for (let side = -1; side <= 1; side += 2) {
              const perpAngle = plane.angle + Math.PI / 2;
              const smokeX = plane.x - Math.cos(plane.angle) * wheelOffset + Math.cos(perpAngle) * side * 6;
              const smokeY = plane.y - Math.sin(plane.angle) * wheelOffset + Math.sin(perpAngle) * side * 6;
              
              plane.runwaySmoke.push({
                x: smokeX,
                y: smokeY,
                vx: (Math.random() - 0.5) * 15 - Math.cos(plane.angle) * 8,
                vy: (Math.random() - 0.5) * 8 - 5, // Rise up
                age: 0,
                opacity: 0.7,
                size: 4 + Math.random() * 4,
              });
            }
          }
          
          // Transition to rolling when speed drops enough
          if (plane.speed <= AIRPLANE_TAXI_SPEED * 3) {
            plane.state = 'rolling_land';
          }
          break;
        }
        
        case 'rolling_land': {
          // Rolling on runway after landing, slowing to taxi speed
          plane.altitude = 0;
          plane.speed = Math.max(AIRPLANE_TAXI_SPEED, plane.speed - delta * 20);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Remove plane when it slows to taxi speed (completed landing)
          if (plane.speed <= AIRPLANE_TAXI_SPEED * 1.1) {
            // Plane has landed successfully, remove it
            continue;
          }
          break;
        }
      }
      
      updatedAirplanes.push(plane);
    }
    
    airplanesRef.current = updatedAirplanes;
  }, [worldStateRef, gridVersionRef, cachedPopulationRef, airplanesRef, airplaneIdRef, airplaneSpawnTimerRef, findAirportsCallback, isMobile]);

  // Update helicopters - spawn, move between hospitals/airports, and manage lifecycle
  const updateHelicopters = useCallback((delta: number) => {
    const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldStateRef.current;
    
    if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
      return;
    }

    // Find heliports
    const heliports = findHeliportsCallback();
    
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

    // No helicopters if fewer than 2 heliports or insufficient population
    if (heliports.length < 2 || totalPopulation < HELICOPTER_MIN_POPULATION) {
      helicoptersRef.current = [];
      return;
    }

    // Calculate max helicopters based on heliports and population (1 per 1k population, min 6, max 60)
    // Also scale with number of heliports available
    const populationBased = Math.floor(totalPopulation / 1000);
    const heliportBased = Math.floor(heliports.length * 2.5);
    const maxHelicopters = Math.min(60, Math.max(6, Math.min(populationBased, heliportBased)));
    
    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Spawn timer
    helicopterSpawnTimerRef.current -= delta;
    if (helicoptersRef.current.length < maxHelicopters && helicopterSpawnTimerRef.current <= 0) {
      // Pick a random origin heliport
      const originIndex = Math.floor(Math.random() * heliports.length);
      const origin = heliports[originIndex];
      
      // Pick a different destination heliport
      const otherHeliports = heliports.filter((_, i) => i !== originIndex);
      if (otherHeliports.length > 0) {
        const dest = otherHeliports[Math.floor(Math.random() * otherHeliports.length)];
        
        // Convert origin tile to screen coordinates
        const { screenX: originScreenX, screenY: originScreenY } = gridToScreen(origin.x, origin.y, 0, 0);
        const originCenterX = originScreenX + TILE_WIDTH * origin.size / 2;
        const originCenterY = originScreenY + TILE_HEIGHT * origin.size / 2;
        
        // Convert destination tile to screen coordinates
        const { screenX: destScreenX, screenY: destScreenY } = gridToScreen(dest.x, dest.y, 0, 0);
        const destCenterX = destScreenX + TILE_WIDTH * dest.size / 2;
        const destCenterY = destScreenY + TILE_HEIGHT * dest.size / 2;
        
        // Calculate angle to destination
        const angleToDestination = Math.atan2(destCenterY - originCenterY, destCenterX - originCenterX);
        
        // Initialize searchlight with randomized sweep pattern
        const searchlightSweepSpeed = 0.8 + Math.random() * 0.6; // 0.8-1.4 radians per second
        const searchlightSweepRange = Math.PI / 4 + Math.random() * (Math.PI / 6); // 45-75 degree sweep range
        
        helicoptersRef.current.push({
          id: helicopterIdRef.current++,
          x: originCenterX,
          y: originCenterY,
          angle: angleToDestination,
          state: 'taking_off',
          speed: 15 + Math.random() * 10, // Slow during takeoff
          altitude: 0,
          targetAltitude: 0.5, // Helicopters fly lower than planes
          originX: origin.x,
          originY: origin.y,
          originType: origin.type,
          destX: dest.x,
          destY: dest.y,
          destType: dest.type,
          destScreenX: destCenterX,
          destScreenY: destCenterY,
          stateProgress: 0,
          rotorWash: [],
          rotorAngle: 0,
          color: HELICOPTER_COLORS[Math.floor(Math.random() * HELICOPTER_COLORS.length)],
          // Searchlight starts pointing forward-down, sweeps side to side
          searchlightAngle: 0,
          searchlightSweepSpeed,
          searchlightSweepRange,
          searchlightBaseAngle: angleToDestination + Math.PI / 2, // Perpendicular to flight path
        });
      }
      
      helicopterSpawnTimerRef.current = 0.8 + Math.random() * 2.2; // 0.8-3 seconds between spawns
    }

    // Update existing helicopters
    const updatedHelicopters: Helicopter[] = [];
    
    for (const heli of helicoptersRef.current) {
      // Update rotor animation
      heli.rotorAngle += delta * 25; // Fast rotor spin
      
      // Update searchlight sweep animation (sinusoidal motion)
      heli.searchlightAngle += delta * heli.searchlightSweepSpeed;
      // Update base angle to follow helicopter direction for more natural sweep
      heli.searchlightBaseAngle = heli.angle + Math.PI / 2;
      
      // Update rotor wash particles - shorter duration on mobile
      const washMaxAge = isMobile ? 0.4 : ROTOR_WASH_MAX_AGE;
      const washSpawnInterval = isMobile ? 0.08 : ROTOR_WASH_SPAWN_INTERVAL;
      heli.rotorWash = heli.rotorWash
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / washMaxAge) }))
        .filter(p => p.age < washMaxAge);
      
      // Add new rotor wash particles when flying
      if (heli.altitude > 0.2 && heli.state === 'flying') {
        heli.stateProgress += delta;
        if (heli.stateProgress >= washSpawnInterval) {
          heli.stateProgress -= washSpawnInterval;
          // Single small rotor wash particle behind helicopter
          const behindAngle = heli.angle + Math.PI;
          const offsetDist = 6;
          heli.rotorWash.push({
            x: heli.x + Math.cos(behindAngle) * offsetDist,
            y: heli.y + Math.sin(behindAngle) * offsetDist,
            age: 0,
            opacity: 1
          });
        }
      }
      
      // Update based on state
      switch (heli.state) {
        case 'taking_off': {
          // Rise vertically first, then start moving
          heli.altitude = Math.min(0.5, heli.altitude + delta * 0.4);
          heli.speed = Math.min(50, heli.speed + delta * 15);
          
          // Start moving once at cruising altitude
          if (heli.altitude >= 0.3) {
            heli.x += Math.cos(heli.angle) * heli.speed * delta * speedMultiplier * 0.5;
            heli.y += Math.sin(heli.angle) * heli.speed * delta * speedMultiplier * 0.5;
          }
          
          if (heli.altitude >= 0.5) {
            heli.state = 'flying';
          }
          break;
        }
        
        case 'flying': {
          // Move toward destination
          heli.x += Math.cos(heli.angle) * heli.speed * delta * speedMultiplier;
          heli.y += Math.sin(heli.angle) * heli.speed * delta * speedMultiplier;
          
          // Check if near destination
          const distToDest = Math.hypot(heli.x - heli.destScreenX, heli.y - heli.destScreenY);
          
          if (distToDest < 80) {
            heli.state = 'landing';
            heli.targetAltitude = 0;
          }
          break;
        }
        
        case 'landing': {
          // Approach destination and descend
          const distToDest = Math.hypot(heli.x - heli.destScreenX, heli.y - heli.destScreenY);
          
          // Slow down as we get closer
          heli.speed = Math.max(10, heli.speed - delta * 20);
          
          // Keep moving toward destination if not there yet
          if (distToDest > 15) {
            const angleToDestination = Math.atan2(heli.destScreenY - heli.y, heli.destScreenX - heli.x);
            heli.angle = angleToDestination;
            heli.x += Math.cos(heli.angle) * heli.speed * delta * speedMultiplier;
            heli.y += Math.sin(heli.angle) * heli.speed * delta * speedMultiplier;
          }
          
          // Descend
          heli.altitude = Math.max(0, heli.altitude - delta * 0.3);
          
          // Landed - remove helicopter
          if (heli.altitude <= 0 && distToDest < 20) {
            continue;
          }
          break;
        }
        
        case 'hovering':
          // Not used currently - helicopters just fly direct
          break;
      }
      
      updatedHelicopters.push(heli);
    }
    
    helicoptersRef.current = updatedHelicopters;
  }, [worldStateRef, gridVersionRef, cachedPopulationRef, helicoptersRef, helicopterIdRef, helicopterSpawnTimerRef, findHeliportsCallback, isMobile]);

  return {
    updateAirplanes,
    updateHelicopters,
    findAirportsCallback,
    findHeliportsCallback,
  };
}





