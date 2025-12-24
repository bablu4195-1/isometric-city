import { useCallback } from 'react';
import { Airplane, Helicopter, WorldRenderState, TILE_WIDTH, TILE_HEIGHT, PlaneType, RunwayParticle } from './types';
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
  // Runway dynamics
  RUNWAY_ANGLE,
  RUNWAY_LENGTH,
  AIRPLANE_TAXI_SPEED,
  AIRPLANE_TAKEOFF_ROLL_SPEED_INITIAL,
  AIRPLANE_TAKEOFF_ROLL_ACCELERATION,
  AIRPLANE_ROTATION_SPEED,
  AIRPLANE_LIFTOFF_SPEED,
  AIRPLANE_CLIMB_SPEED,
  AIRPLANE_CRUISE_SPEED_MIN,
  AIRPLANE_CRUISE_SPEED_MAX,
  AIRPLANE_APPROACH_SPEED,
  AIRPLANE_FINAL_APPROACH_SPEED,
  AIRPLANE_FLARE_SPEED,
  AIRPLANE_TOUCHDOWN_SPEED,
  AIRPLANE_ROLLOUT_DECELERATION,
  AIRPLANE_TAXI_TIME_MIN,
  AIRPLANE_TAXI_TIME_MAX,
  AIRPLANE_TAKEOFF_ROLL_DISTANCE,
  AIRPLANE_ROTATION_TIME,
  AIRPLANE_FLARE_TIME,
  AIRPLANE_TOUCHDOWN_SMOKE_DURATION,
  AIRPLANE_ROLLOUT_DISTANCE,
  AIRPLANE_CLIMB_RATE,
  AIRPLANE_DESCENT_RATE,
  AIRPLANE_FINAL_DESCENT_RATE,
  RUNWAY_PARTICLE_MAX_AGE,
  RUNWAY_PARTICLE_SPAWN_INTERVAL,
  TOUCHDOWN_SMOKE_INTENSITY,
} from './constants';
import { gridToScreen } from './utils';
import { findAirports, findHeliports } from './gridFinders';

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
  const findAirportsCallback = useCallback((): { x: number; y: number }[] => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return findAirports(currentGrid, currentGridSize);
  }, [worldStateRef]);

  // Find heliports callback
  const findHeliportsCallback = useCallback(() => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return findHeliports(currentGrid, currentGridSize);
  }, [worldStateRef]);

  // Update airplanes - spawn, move, and manage lifecycle with proper runway dynamics
  const updateAirplanes = useCallback((delta: number) => {
    const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldStateRef.current;
    
    if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
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

    // Calculate max airplanes based on population (1 per 2k population, min 25, max 80)
    const maxAirplanes = Math.min(80, Math.max(25, Math.floor(totalPopulation / 2000) * 3));
    
    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Spawn timer
    airplaneSpawnTimerRef.current -= delta;
    if (airplanesRef.current.length < maxAirplanes && airplaneSpawnTimerRef.current <= 0) {
      // Pick a random airport
      const airport = airports[Math.floor(Math.random() * airports.length)];
      
      // Convert airport tile to screen coordinates
      // Airport is 3x3, so center is at +1.5 tiles
      const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(airport.x, airport.y, 0, 0);
      const airportCenterX = airportScreenX + TILE_WIDTH * 1.5;
      const airportCenterY = airportScreenY + TILE_HEIGHT * 1.5;
      
      // Calculate runway positions
      // Runway runs from SW to NE through the airport center
      // Takeoff direction is toward NE (top-right of screen)
      const runwayAngle = RUNWAY_ANGLE;
      const runwayStartX = airportCenterX - Math.cos(runwayAngle) * RUNWAY_LENGTH * 0.5;
      const runwayStartY = airportCenterY - Math.sin(runwayAngle) * RUNWAY_LENGTH * 0.5;
      const runwayEndX = airportCenterX + Math.cos(runwayAngle) * RUNWAY_LENGTH * 0.5;
      const runwayEndY = airportCenterY + Math.sin(runwayAngle) * RUNWAY_LENGTH * 0.5;
      
      // Decide if taking off or arriving from distance
      const isTakingOff = Math.random() < 0.5;
      const planeType = PLANE_TYPES[Math.floor(Math.random() * PLANE_TYPES.length)] as PlaneType;
      
      if (isTakingOff) {
        // Taking off from airport - start at taxi position near runway start
        const taxiOffsetX = (Math.random() - 0.5) * 30;
        const taxiOffsetY = (Math.random() - 0.5) * 20;
        const startX = runwayStartX + taxiOffsetX;
        const startY = runwayStartY + taxiOffsetY + 20; // Start slightly off runway
        
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: startX,
          y: startY,
          angle: runwayAngle + (Math.random() - 0.5) * 0.3, // Slight angle variation while taxiing
          targetAngle: runwayAngle,
          state: 'taxiing_to_runway',
          speed: AIRPLANE_TAXI_SPEED * (0.8 + Math.random() * 0.4),
          altitude: 0,
          targetAltitude: 1,
          airportX: airport.x,
          airportY: airport.y,
          runwayAngle: runwayAngle,
          runwayStartX: runwayStartX,
          runwayStartY: runwayStartY,
          runwayEndX: runwayEndX,
          runwayEndY: runwayEndY,
          stateProgress: 0,
          contrail: [],
          runwayParticles: [],
          wakeSpawnProgress: 0,
          lifeTime: 30 + Math.random() * 20, // 30-50 seconds of flight
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType: planeType,
          pitch: 0,
          stateTime: AIRPLANE_TAXI_TIME_MIN + Math.random() * (AIRPLANE_TAXI_TIME_MAX - AIRPLANE_TAXI_TIME_MIN),
          isDeparting: true,
        });
      } else {
        // Arriving from the edge of the map - spawn at approach position
        // Planes approach from the opposite direction of takeoff (from NE toward SW)
        const approachAngle = runwayAngle + Math.PI; // Opposite of takeoff direction
        const approachDistance = 400 + Math.random() * 200;
        
        // Add some lateral offset for approach variety
        const lateralOffset = (Math.random() - 0.5) * 100;
        const perpAngle = approachAngle + Math.PI / 2;
        
        const startX = airportCenterX + Math.cos(approachAngle) * approachDistance + Math.cos(perpAngle) * lateralOffset;
        const startY = airportCenterY + Math.sin(approachAngle) * approachDistance + Math.sin(perpAngle) * lateralOffset;
        
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: startX,
          y: startY,
          angle: approachAngle + Math.PI, // Point toward airport initially
          targetAngle: runwayAngle + Math.PI, // Will align to this for landing
          state: 'approach',
          speed: AIRPLANE_APPROACH_SPEED * (0.9 + Math.random() * 0.2),
          altitude: 0.9 + Math.random() * 0.1, // High but not cruising
          targetAltitude: 0,
          airportX: airport.x,
          airportY: airport.y,
          runwayAngle: runwayAngle,
          runwayStartX: runwayStartX,
          runwayStartY: runwayStartY,
          runwayEndX: runwayEndX,
          runwayEndY: runwayEndY,
          stateProgress: 0,
          contrail: [],
          runwayParticles: [],
          wakeSpawnProgress: 0,
          lifeTime: 60, // Plenty of time to land
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType: planeType,
          pitch: 0,
          stateTime: 0,
          isDeparting: false,
        });
      }
      
      airplaneSpawnTimerRef.current = 2 + Math.random() * 5; // 2-7 seconds between spawns
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
      
      // Update runway particles (tire smoke, dust)
      const runwayParticleMaxAge = isMobile ? 0.6 : RUNWAY_PARTICLE_MAX_AGE;
      plane.runwayParticles = plane.runwayParticles
        .map(p => ({
          ...p,
          x: p.x + p.vx * delta,
          y: p.y + p.vy * delta,
          vy: p.vy - delta * 20, // Rise up
          age: p.age + delta,
          opacity: Math.max(0, 1 - p.age / runwayParticleMaxAge),
          size: p.size + delta * 8, // Expand
        }))
        .filter(p => p.age < runwayParticleMaxAge);
      
      // Add new contrail particles at high altitude (less frequent on mobile)
      if (plane.altitude > 0.7 && plane.state === 'flying') {
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
      const lerpAngle = (from: number, to: number, t: number): number => {
        let diff = to - from;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return from + diff * Math.min(1, t);
      };
      
      // Spawn runway particles for ground effects
      const spawnRunwayParticle = (intensity: number, isTakeoff: boolean) => {
        if (isMobile && Math.random() > 0.5) return; // Less frequent on mobile
        
        const behind = 15;
        const spread = 8;
        for (let i = 0; i < intensity; i++) {
          plane.runwayParticles.push({
            x: plane.x - Math.cos(plane.angle) * behind + (Math.random() - 0.5) * spread,
            y: plane.y - Math.sin(plane.angle) * behind + (Math.random() - 0.5) * spread,
            vx: (Math.random() - 0.5) * 15,
            vy: -Math.random() * 10 - 5, // Rise up
            age: 0,
            opacity: 0.6 + Math.random() * 0.3,
            size: isTakeoff ? 3 + Math.random() * 4 : 4 + Math.random() * 6,
          });
        }
      };
      
      // Update based on state
      switch (plane.state) {
        // ========== DEPARTURE SEQUENCE ==========
        case 'taxiing_to_runway': {
          // Move toward runway start position
          const distToRunwayStart = Math.hypot(plane.x - plane.runwayStartX, plane.y - plane.runwayStartY);
          
          // Smoothly rotate toward runway
          plane.angle = lerpAngle(plane.angle, plane.targetAngle, delta * 2);
          
          // Move forward
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          plane.stateTime -= delta;
          
          // Transition to takeoff roll when close to runway start and timer elapsed
          if (distToRunwayStart < 30 || plane.stateTime <= 0) {
            plane.state = 'takeoff_roll';
            plane.angle = plane.runwayAngle; // Align with runway
            plane.speed = AIRPLANE_TAKEOFF_ROLL_SPEED_INITIAL;
            plane.stateProgress = 0;
            plane.stateTime = 0;
          }
          break;
        }
        
        case 'takeoff_roll': {
          // Accelerate along runway
          plane.speed = Math.min(AIRPLANE_ROTATION_SPEED, plane.speed + AIRPLANE_TAKEOFF_ROLL_ACCELERATION * delta * speedMultiplier);
          plane.angle = plane.runwayAngle; // Stay aligned with runway
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          plane.stateProgress += plane.speed * delta * speedMultiplier;
          
          // Spawn dust/exhaust particles during roll
          plane.wakeSpawnProgress += delta;
          if (plane.wakeSpawnProgress >= RUNWAY_PARTICLE_SPAWN_INTERVAL) {
            plane.wakeSpawnProgress = 0;
            spawnRunwayParticle(1, true);
          }
          
          // Transition to rotation when we've traveled enough distance and reached rotation speed
          if (plane.stateProgress >= AIRPLANE_TAKEOFF_ROLL_DISTANCE && plane.speed >= AIRPLANE_ROTATION_SPEED * 0.9) {
            plane.state = 'rotating';
            plane.stateTime = 0;
          }
          break;
        }
        
        case 'rotating': {
          // Nose up, about to lift off
          plane.speed = Math.min(AIRPLANE_LIFTOFF_SPEED, plane.speed + AIRPLANE_TAKEOFF_ROLL_ACCELERATION * delta * speedMultiplier * 0.5);
          plane.angle = plane.runwayAngle;
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Pitch up gradually
          plane.stateTime += delta;
          plane.pitch = Math.min(0.15, plane.stateTime / AIRPLANE_ROTATION_TIME * 0.15);
          
          // Spawn more intense particles at rotation
          plane.wakeSpawnProgress += delta;
          if (plane.wakeSpawnProgress >= RUNWAY_PARTICLE_SPAWN_INTERVAL * 0.5) {
            plane.wakeSpawnProgress = 0;
            spawnRunwayParticle(2, true);
          }
          
          // Start climbing after rotation time
          if (plane.stateTime >= AIRPLANE_ROTATION_TIME) {
            plane.state = 'climbing';
            plane.altitude = 0.05; // Just off the ground
            plane.stateTime = 0;
          }
          break;
        }
        
        case 'climbing': {
          // Initial climb after liftoff
          plane.speed = Math.min(AIRPLANE_CLIMB_SPEED, plane.speed + delta * 15);
          plane.altitude = Math.min(1, plane.altitude + AIRPLANE_CLIMB_RATE * delta * speedMultiplier);
          
          // Maintain pitch during climb, gradually reduce
          plane.pitch = Math.max(0, 0.15 - plane.altitude * 0.12);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Slight random course adjustments as we climb
          if (plane.altitude > 0.3 && Math.random() < 0.02) {
            plane.angle += (Math.random() - 0.5) * 0.1;
          }
          
          // Transition to flying when at cruise altitude
          if (plane.altitude >= 1) {
            plane.state = 'flying';
            plane.pitch = 0;
            plane.speed = AIRPLANE_CRUISE_SPEED_MIN + Math.random() * (AIRPLANE_CRUISE_SPEED_MAX - AIRPLANE_CRUISE_SPEED_MIN);
          }
          break;
        }
        
        // ========== CRUISING ==========
        case 'flying': {
          // Move forward at cruising speed
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          plane.lifeTime -= delta;
          plane.pitch = 0;
          
          // Gentle course corrections while flying (departures only)
          if (plane.isDeparting && Math.random() < 0.01) {
            plane.angle += (Math.random() - 0.5) * 0.15;
          }
          
          // Despawn when out of time (departures just fly off)
          if (plane.lifeTime <= 0) {
            continue;
          }
          break;
        }
        
        // ========== ARRIVAL SEQUENCE ==========
        case 'approach': {
          // Descending toward airport, not yet aligned with runway
          const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(plane.airportX, plane.airportY, 0, 0);
          const airportCenterX = airportScreenX + TILE_WIDTH * 1.5;
          const airportCenterY = airportScreenY + TILE_HEIGHT * 1.5;
          
          // Landing direction is opposite of takeoff (approach from NE, land toward SW)
          const landingAngle = plane.runwayAngle + Math.PI;
          
          // Calculate final approach point (extended runway centerline)
          const finalApproachDist = 180;
          const finalApproachX = plane.runwayEndX + Math.cos(landingAngle) * finalApproachDist;
          const finalApproachY = plane.runwayEndY + Math.sin(landingAngle) * finalApproachDist;
          
          // Steer toward final approach point
          const angleToFinal = Math.atan2(finalApproachY - plane.y, finalApproachX - plane.x);
          plane.angle = lerpAngle(plane.angle, angleToFinal, delta * 1.5);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Descend
          plane.altitude = Math.max(0.3, plane.altitude - AIRPLANE_DESCENT_RATE * delta * speedMultiplier);
          
          // Slow down
          plane.speed = Math.max(AIRPLANE_APPROACH_SPEED, plane.speed - delta * 8);
          
          const distToFinal = Math.hypot(plane.x - finalApproachX, plane.y - finalApproachY);
          
          // Transition to final approach when close and aligned
          const angleDiff = Math.abs(plane.angle - landingAngle);
          const normalizedDiff = angleDiff > Math.PI ? 2 * Math.PI - angleDiff : angleDiff;
          
          if (distToFinal < 100 && normalizedDiff < 0.3) {
            plane.state = 'final_approach';
            plane.angle = landingAngle;
            plane.stateTime = 0;
          }
          
          plane.lifeTime -= delta;
          if (plane.lifeTime <= 0) continue;
          break;
        }
        
        case 'final_approach': {
          // On final, aligned with runway, descending to touchdown
          const landingAngle = plane.runwayAngle + Math.PI;
          plane.angle = landingAngle; // Stay aligned
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Descend more steeply on final
          plane.altitude = Math.max(0, plane.altitude - AIRPLANE_FINAL_DESCENT_RATE * delta * speedMultiplier);
          
          // Slow to final approach speed
          plane.speed = Math.max(AIRPLANE_FINAL_APPROACH_SPEED, plane.speed - delta * 10);
          
          // Calculate distance to runway threshold (runway end from approach direction)
          const distToThreshold = Math.hypot(plane.x - plane.runwayEndX, plane.y - plane.runwayEndY);
          
          // Transition to flare when close to threshold and low
          if (distToThreshold < 60 && plane.altitude < 0.15) {
            plane.state = 'flare';
            plane.stateTime = 0;
          }
          break;
        }
        
        case 'flare': {
          // Pitch up just before touchdown
          const landingAngle = plane.runwayAngle + Math.PI;
          plane.angle = landingAngle;
          
          plane.stateTime += delta;
          plane.pitch = Math.min(0.12, plane.stateTime / AIRPLANE_FLARE_TIME * 0.12); // Nose up
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Slow descent rate during flare
          plane.altitude = Math.max(0, plane.altitude - delta * 0.15 * speedMultiplier);
          plane.speed = Math.max(AIRPLANE_FLARE_SPEED, plane.speed - delta * 12);
          
          // Touchdown when flare time elapsed or altitude reaches 0
          if (plane.stateTime >= AIRPLANE_FLARE_TIME || plane.altitude <= 0) {
            plane.state = 'touchdown';
            plane.altitude = 0;
            plane.stateTime = 0;
            
            // Spawn intense tire smoke at touchdown
            for (let i = 0; i < TOUCHDOWN_SMOKE_INTENSITY; i++) {
              spawnRunwayParticle(1, false);
            }
          }
          break;
        }
        
        case 'touchdown': {
          // Wheels just touched, rubber smoke
          const landingAngle = plane.runwayAngle + Math.PI;
          plane.angle = landingAngle;
          plane.altitude = 0;
          
          plane.stateTime += delta;
          plane.pitch = Math.max(0, 0.12 - plane.stateTime * 0.3); // Nose coming down
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Decelerate
          plane.speed = Math.max(AIRPLANE_TOUCHDOWN_SPEED * 0.8, plane.speed - delta * 8);
          
          // Spawn tire smoke
          plane.wakeSpawnProgress += delta;
          if (plane.wakeSpawnProgress >= RUNWAY_PARTICLE_SPAWN_INTERVAL) {
            plane.wakeSpawnProgress = 0;
            spawnRunwayParticle(2, false);
          }
          
          // Transition to rollout after smoke duration
          if (plane.stateTime >= AIRPLANE_TOUCHDOWN_SMOKE_DURATION) {
            plane.state = 'rollout';
            plane.stateProgress = 0;
          }
          break;
        }
        
        case 'rollout': {
          // Decelerating on runway after landing
          const landingAngle = plane.runwayAngle + Math.PI;
          plane.angle = landingAngle;
          plane.altitude = 0;
          plane.pitch = 0;
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          plane.stateProgress += plane.speed * delta * speedMultiplier;
          
          // Strong deceleration
          plane.speed = Math.max(0, plane.speed - AIRPLANE_ROLLOUT_DECELERATION * delta * speedMultiplier);
          
          // Light dust particles during rollout
          if (plane.speed > 20) {
            plane.wakeSpawnProgress += delta;
            if (plane.wakeSpawnProgress >= RUNWAY_PARTICLE_SPAWN_INTERVAL * 2) {
              plane.wakeSpawnProgress = 0;
              if (Math.random() > 0.5) spawnRunwayParticle(1, true);
            }
          }
          
          // Remove plane when stopped or traveled rollout distance
          if (plane.speed <= 5 || plane.stateProgress >= AIRPLANE_ROLLOUT_DISTANCE) {
            continue; // Remove from array
          }
          break;
        }
        
        // Legacy states for backwards compatibility
        case 'taking_off': {
          // Map to new climbing state behavior
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.altitude = Math.min(1, plane.altitude + delta * 0.3);
          plane.speed = Math.min(120, plane.speed + delta * 20);
          
          if (plane.altitude >= 1) {
            plane.state = 'flying';
          }
          break;
        }
        
        case 'landing': {
          // Map to new approach behavior
          const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(plane.airportX, plane.airportY, 0, 0);
          const airportCenterX = airportScreenX + TILE_WIDTH * 1.5;
          const airportCenterY = airportScreenY + TILE_HEIGHT * 1.5;
          
          const angleToAirport = Math.atan2(airportCenterY - plane.y, airportCenterX - plane.x);
          plane.angle = angleToAirport;
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.altitude = Math.max(0, plane.altitude - delta * 0.25);
          plane.speed = Math.max(30, plane.speed - delta * 15);
          
          const distToAirport = Math.hypot(plane.x - airportCenterX, plane.y - airportCenterY);
          if (distToAirport < 50 || plane.altitude <= 0) {
            continue;
          }
          break;
        }
        
        case 'taxiing':
          continue;
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





