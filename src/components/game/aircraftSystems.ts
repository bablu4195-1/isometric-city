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
  // Runway dynamics constants
  RUNWAY_HEADING,
  RUNWAY_HEADING_OPPOSITE,
  AIRPLANE_TAXI_SPEED,
  AIRPLANE_TAXI_TIME_MIN,
  AIRPLANE_TAXI_TIME_MAX,
  AIRPLANE_TAKEOFF_ROLL_SPEED_START,
  AIRPLANE_TAKEOFF_ROLL_SPEED_ROTATE,
  AIRPLANE_TAKEOFF_ROLL_ACCELERATION,
  AIRPLANE_ROTATION_DURATION,
  AIRPLANE_INITIAL_CLIMB_SPEED,
  AIRPLANE_CLIMB_RATE,
  AIRPLANE_APPROACH_SPEED,
  AIRPLANE_FLARE_DISTANCE,
  AIRPLANE_FLARE_SPEED,
  AIRPLANE_DESCENT_RATE,
  AIRPLANE_FLARE_DESCENT_RATE,
  AIRPLANE_APPROACH_TURN_RATE,
  AIRPLANE_APPROACH_ALTITUDE,
  AIRPLANE_TOUCHDOWN_SPEED,
  AIRPLANE_ROLLOUT_DECELERATION,
  AIRPLANE_ROLLOUT_END_SPEED,
  AIRPLANE_CRUISE_SPEED_MIN,
  AIRPLANE_CRUISE_SPEED_MAX,
  AIRPLANE_CRUISE_ALTITUDE,
  TIRE_SMOKE_MAX_AGE,
  TIRE_SMOKE_SPAWN_RATE,
  THRUST_PARTICLE_MAX_AGE,
  THRUST_PARTICLE_SPAWN_RATE,
  RUNWAY_THRESHOLD_OFFSET_X,
  RUNWAY_THRESHOLD_OFFSET_Y,
  RUNWAY_LENGTH,
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

  // Update airplanes - spawn, move, and manage lifecycle with runway dynamics
  const updateAirplanes = useCallback((delta: number) => {
    // Helper: normalize angle to -PI to PI
    const normalizeAngle = (angle: number): number => {
      let normalized = angle % (Math.PI * 2);
      if (normalized > Math.PI) normalized -= Math.PI * 2;
      if (normalized < -Math.PI) normalized += Math.PI * 2;
      return normalized;
    };

    // Helper: smooth turn toward target angle
    const smoothTurn = (currentAngle: number, targetAngle: number, maxTurnRate: number, dt: number): number => {
      const diff = normalizeAngle(targetAngle - currentAngle);
      const maxChange = maxTurnRate * dt;
      if (Math.abs(diff) <= maxChange) return normalizeAngle(targetAngle);
      return normalizeAngle(currentAngle + Math.sign(diff) * maxChange);
    };
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
      // 3x3 airport - center is at 1.5 tiles offset
      const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(airport.x, airport.y, 0, 0);
      const airportCenterX = airportScreenX + TILE_WIDTH * 1.5;
      const airportCenterY = airportScreenY + TILE_HEIGHT * 1.5;
      
      // Calculate runway threshold position (start of runway for takeoff)
      const runwayThresholdX = airportCenterX + RUNWAY_THRESHOLD_OFFSET_X;
      const runwayThresholdY = airportCenterY + RUNWAY_THRESHOLD_OFFSET_Y;
      
      // Decide if taking off or arriving from distance
      const isTakingOff = Math.random() < 0.5;
      const planeType = PLANE_TYPES[Math.floor(Math.random() * PLANE_TYPES.length)] as PlaneType;
      
      if (isTakingOff) {
        // Departing: Start at terminal area, taxi to runway
        const terminalOffsetX = (Math.random() - 0.5) * 30;
        const terminalOffsetY = (Math.random() - 0.5) * 30;
        
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: airportCenterX + terminalOffsetX,
          y: airportCenterY + terminalOffsetY,
          angle: RUNWAY_HEADING + (Math.random() - 0.5) * 0.3, // Start facing roughly toward runway
          targetAngle: RUNWAY_HEADING,
          state: 'taxiing_to_runway',
          speed: AIRPLANE_TAXI_SPEED * (0.8 + Math.random() * 0.4),
          altitude: 0,
          targetAltitude: 0,
          airportX: airport.x,
          airportY: airport.y,
          airportScreenX: airportCenterX,
          airportScreenY: airportCenterY,
          runwayAngle: RUNWAY_HEADING,
          stateProgress: 0,
          contrail: [],
          tireSmoke: [],
          thrustParticles: [],
          particleSpawnProgress: 0,
          lifeTime: 40 + Math.random() * 30, // 40-70 seconds of flight
          taxiTime: 0,
          maxTaxiTime: AIRPLANE_TAXI_TIME_MIN + Math.random() * (AIRPLANE_TAXI_TIME_MAX - AIRPLANE_TAXI_TIME_MIN),
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType: planeType,
          isArriving: false,
          pitch: 0,
          roll: 0,
        });
      } else {
        // Arriving: Start from edge of map at cruise altitude
        const edge = Math.floor(Math.random() * 4);
        let startX: number, startY: number;
        
        // Calculate map bounds in screen space
        const mapCenterX = 0;
        const mapCenterY = currentGridSize * TILE_HEIGHT / 2;
        const mapExtent = currentGridSize * TILE_WIDTH;
        
        switch (edge) {
          case 0: // From top
            startX = mapCenterX + (Math.random() - 0.5) * mapExtent;
            startY = mapCenterY - mapExtent / 2 - 300;
            break;
          case 1: // From right
            startX = mapCenterX + mapExtent / 2 + 300;
            startY = mapCenterY + (Math.random() - 0.5) * mapExtent / 2;
            break;
          case 2: // From bottom
            startX = mapCenterX + (Math.random() - 0.5) * mapExtent;
            startY = mapCenterY + mapExtent / 2 + 300;
            break;
          default: // From left
            startX = mapCenterX - mapExtent / 2 - 300;
            startY = mapCenterY + (Math.random() - 0.5) * mapExtent / 2;
            break;
        }
        
        // Calculate initial angle toward airport
        const angleToAirport = Math.atan2(airportCenterY - startY, airportCenterX - startX);
        
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: startX,
          y: startY,
          angle: angleToAirport,
          targetAngle: angleToAirport,
          state: 'flying',
          speed: AIRPLANE_CRUISE_SPEED_MIN + Math.random() * (AIRPLANE_CRUISE_SPEED_MAX - AIRPLANE_CRUISE_SPEED_MIN),
          altitude: AIRPLANE_CRUISE_ALTITUDE,
          targetAltitude: AIRPLANE_CRUISE_ALTITUDE,
          airportX: airport.x,
          airportY: airport.y,
          airportScreenX: airportCenterX,
          airportScreenY: airportCenterY,
          runwayAngle: RUNWAY_HEADING,
          stateProgress: 0,
          contrail: [],
          tireSmoke: [],
          thrustParticles: [],
          particleSpawnProgress: 0,
          lifeTime: 25 + Math.random() * 20, // Time until landing
          taxiTime: 0,
          maxTaxiTime: AIRPLANE_TAXI_TIME_MIN + Math.random() * (AIRPLANE_TAXI_TIME_MAX - AIRPLANE_TAXI_TIME_MIN),
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType: planeType,
          isArriving: true,
          pitch: 0,
          roll: 0,
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
      
      // Update tire smoke particles
      const tireSmokeMaxAge = isMobile ? 0.6 : TIRE_SMOKE_MAX_AGE;
      plane.tireSmoke = plane.tireSmoke
        .map(p => ({ 
          ...p, 
          age: p.age + delta, 
          x: p.x + p.vx * delta,
          y: p.y + p.vy * delta,
          vy: p.vy - 15 * delta, // Rise upward
          size: p.size + delta * 8, // Expand
          opacity: Math.max(0, p.opacity * (1 - delta * 1.5))
        }))
        .filter(p => p.age < tireSmokeMaxAge);
      
      // Update thrust particles
      const thrustMaxAge = isMobile ? 0.2 : THRUST_PARTICLE_MAX_AGE;
      plane.thrustParticles = plane.thrustParticles
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / thrustMaxAge) }))
        .filter(p => p.age < thrustMaxAge);
      
      // Add new contrail particles at high altitude
      if (plane.altitude > 0.7) {
        plane.particleSpawnProgress += delta;
        if (plane.particleSpawnProgress >= contrailSpawnInterval) {
          plane.particleSpawnProgress -= contrailSpawnInterval;
          const behindOffset = 40;
          const downOffset = 8;
          const contrailX = plane.x - Math.cos(plane.angle) * behindOffset;
          const contrailY = plane.y - Math.sin(plane.angle) * behindOffset + downOffset;
          plane.contrail.push({ x: contrailX, y: contrailY, age: 0, opacity: 1 });
        }
      }
      
      // Calculate runway threshold and end positions
      const runwayThresholdX = plane.airportScreenX + RUNWAY_THRESHOLD_OFFSET_X;
      const runwayThresholdY = plane.airportScreenY + RUNWAY_THRESHOLD_OFFSET_Y;
      const runwayEndX = runwayThresholdX + Math.cos(plane.runwayAngle) * RUNWAY_LENGTH;
      const runwayEndY = runwayThresholdY + Math.sin(plane.runwayAngle) * RUNWAY_LENGTH;
      
      // Update based on state
      switch (plane.state) {
        case 'taxiing_to_runway': {
          // Taxi from terminal toward runway threshold
          plane.taxiTime += delta;
          
          // Calculate distance to runway threshold
          const distToThreshold = Math.hypot(plane.x - runwayThresholdX, plane.y - runwayThresholdY);
          
          // Gradually turn toward runway heading
          const angleToThreshold = Math.atan2(runwayThresholdY - plane.y, runwayThresholdX - plane.x);
          plane.targetAngle = distToThreshold > 40 ? angleToThreshold : plane.runwayAngle;
          plane.angle = smoothTurn(plane.angle, plane.targetAngle, 1.5, delta);
          
          // Move forward
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Transition to takeoff roll when aligned and near threshold
          if (distToThreshold < 30 && plane.taxiTime > plane.maxTaxiTime * 0.5) {
            plane.state = 'takeoff_roll';
            plane.angle = plane.runwayAngle;
            plane.targetAngle = plane.runwayAngle;
            plane.speed = AIRPLANE_TAKEOFF_ROLL_SPEED_START;
            plane.stateProgress = 0;
            // Position at runway threshold
            plane.x = runwayThresholdX;
            plane.y = runwayThresholdY;
          }
          break;
        }
        
        case 'takeoff_roll': {
          // Accelerate down the runway
          plane.speed = Math.min(
            AIRPLANE_TAKEOFF_ROLL_SPEED_ROTATE * 1.1,
            plane.speed + AIRPLANE_TAKEOFF_ROLL_ACCELERATION * delta
          );
          
          // Keep aligned with runway
          plane.angle = plane.runwayAngle;
          
          // Move forward along runway
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Spawn thrust/heat particles during takeoff roll
          if (!isMobile) {
            plane.particleSpawnProgress += delta;
            if (plane.particleSpawnProgress >= THRUST_PARTICLE_SPAWN_RATE) {
              plane.particleSpawnProgress -= THRUST_PARTICLE_SPAWN_RATE;
              const behindOffset = 25;
              plane.thrustParticles.push({
                x: plane.x - Math.cos(plane.angle) * behindOffset + (Math.random() - 0.5) * 8,
                y: plane.y - Math.sin(plane.angle) * behindOffset + (Math.random() - 0.5) * 4,
                age: 0,
                opacity: 0.4 + Math.random() * 0.3,
              });
            }
          }
          
          // Transition to rotating when at rotation speed
          if (plane.speed >= AIRPLANE_TAKEOFF_ROLL_SPEED_ROTATE) {
            plane.state = 'rotating';
            plane.stateProgress = 0;
          }
          break;
        }
        
        case 'rotating': {
          // Brief nose-up rotation phase
          plane.stateProgress += delta;
          
          // Continue moving forward
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Pitch up (visual)
          plane.pitch = Math.min(0.15, plane.stateProgress / AIRPLANE_ROTATION_DURATION * 0.15);
          
          // Begin climbing
          plane.altitude = Math.min(0.15, plane.stateProgress * 0.3);
          plane.speed = Math.min(AIRPLANE_INITIAL_CLIMB_SPEED, plane.speed + 15 * delta);
          
          // Transition to initial climb
          if (plane.stateProgress >= AIRPLANE_ROTATION_DURATION) {
            plane.state = 'initial_climb';
            plane.stateProgress = 0;
          }
          break;
        }
        
        case 'initial_climb': {
          // Climb to cruise altitude
          plane.altitude = Math.min(AIRPLANE_CRUISE_ALTITUDE, plane.altitude + AIRPLANE_CLIMB_RATE * delta);
          plane.speed = Math.min(
            AIRPLANE_CRUISE_SPEED_MIN + (AIRPLANE_CRUISE_SPEED_MAX - AIRPLANE_CRUISE_SPEED_MIN) * 0.5,
            plane.speed + 10 * delta
          );
          
          // Gradually level off pitch
          plane.pitch = Math.max(0.05, plane.pitch - 0.1 * delta);
          
          // Move forward
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Gentle random heading changes for departure
          if (Math.random() < 0.02) {
            plane.targetAngle = plane.angle + (Math.random() - 0.5) * 0.4;
          }
          plane.angle = smoothTurn(plane.angle, plane.targetAngle, 0.8, delta);
          
          // Transition to cruising flight
          if (plane.altitude >= AIRPLANE_CRUISE_ALTITUDE * 0.95) {
            plane.state = 'flying';
            plane.altitude = AIRPLANE_CRUISE_ALTITUDE;
            plane.pitch = 0;
          }
          break;
        }
        
        case 'flying': {
          // Cruise at altitude
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          plane.lifeTime -= delta;
          plane.pitch = 0;
          
          // Calculate distance to airport
          const distToAirport = Math.hypot(plane.x - plane.airportScreenX, plane.y - plane.airportScreenY);
          
          // Planes that are arriving (isArriving=true) will land
          // Planes that departed will eventually head off-screen
          if (plane.isArriving) {
            // Arriving plane: start approach when close and lifetime running low
            if (plane.lifeTime < 15 || distToAirport < 400) {
              // Calculate the approach path: need to align with runway
              // Land on opposite heading (coming from SW, landing toward NE)
              const landingHeading = RUNWAY_HEADING_OPPOSITE;
              
              // Calculate ideal approach position (extended final)
              const approachDist = 250;
              const approachX = runwayThresholdX - Math.cos(plane.runwayAngle) * approachDist;
              const approachY = runwayThresholdY - Math.sin(plane.runwayAngle) * approachDist;
              
              // Start turning toward approach
              const angleToApproach = Math.atan2(approachY - plane.y, approachX - plane.x);
              plane.targetAngle = angleToApproach;
              
              // Begin descent
              if (distToAirport < 350) {
                plane.state = 'approach';
                plane.targetAltitude = 0;
              }
            }
          } else {
            // Departing plane: fly until lifetime expires, then despawn
            if (plane.lifeTime <= 0) {
              continue; // Remove plane
            }
          }
          
          // Gentle course corrections while flying
          plane.angle = smoothTurn(plane.angle, plane.targetAngle, 0.6, delta);
          if (Math.random() < 0.01) {
            plane.targetAngle = plane.angle + (Math.random() - 0.5) * 0.2;
          }
          break;
        }
        
        case 'approach': {
          // Final approach: descend while aligning with runway
          const landingHeading = RUNWAY_HEADING_OPPOSITE;
          
          // Calculate distance to runway threshold
          const distToThreshold = Math.hypot(plane.x - runwayThresholdX, plane.y - runwayThresholdY);
          
          // Calculate ideal position on approach path
          const approachPathX = runwayThresholdX - Math.cos(plane.runwayAngle) * distToThreshold;
          const approachPathY = runwayThresholdY - Math.sin(plane.runwayAngle) * distToThreshold;
          
          // Turn to align with runway approach
          if (distToThreshold > 150) {
            // Still far: aim for a point on the extended centerline
            const angleToApproachPath = Math.atan2(approachPathY - plane.y, approachPathX - plane.x);
            plane.targetAngle = angleToApproachPath;
          } else {
            // Close: lock onto runway heading
            plane.targetAngle = landingHeading;
          }
          
          plane.angle = smoothTurn(plane.angle, plane.targetAngle, AIRPLANE_APPROACH_TURN_RATE, delta);
          
          // Banking during turns (visual effect)
          const turnRate = normalizeAngle(plane.targetAngle - plane.angle);
          plane.roll = turnRate * 0.3;
          
          // Descend based on distance
          const descentProgress = Math.max(0, 1 - distToThreshold / 350);
          const targetAlt = AIRPLANE_CRUISE_ALTITUDE * (1 - descentProgress * 0.85);
          plane.altitude = Math.max(0.15, plane.altitude - AIRPLANE_DESCENT_RATE * delta);
          
          // Slow down on approach
          plane.speed = Math.max(AIRPLANE_APPROACH_SPEED, plane.speed - 20 * delta);
          
          // Move forward
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Slight nose-down pitch during descent
          plane.pitch = -0.05;
          
          // Transition to flare when close and low
          if (distToThreshold < AIRPLANE_FLARE_DISTANCE && plane.altitude < 0.25) {
            plane.state = 'flare';
            plane.stateProgress = 0;
          }
          break;
        }
        
        case 'flare': {
          // Final flare before touchdown
          plane.stateProgress += delta;
          
          // Lock onto runway heading
          plane.angle = smoothTurn(plane.angle, RUNWAY_HEADING_OPPOSITE, 2.0, delta);
          plane.roll = 0;
          
          // Pitch up slightly for flare
          plane.pitch = 0.08;
          
          // Final descent
          plane.altitude = Math.max(0, plane.altitude - AIRPLANE_FLARE_DESCENT_RATE * delta);
          plane.speed = Math.max(AIRPLANE_TOUCHDOWN_SPEED, plane.speed - 15 * delta);
          
          // Move toward runway
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Touchdown when altitude reaches 0
          if (plane.altitude <= 0.02) {
            plane.state = 'touchdown';
            plane.altitude = 0;
            plane.stateProgress = 0;
            plane.pitch = 0;
            
            // Spawn initial tire smoke burst
            const perpAngle = plane.angle + Math.PI / 2;
            for (let i = 0; i < 8; i++) {
              const side = i < 4 ? -1 : 1;
              const behindOffset = 15 + Math.random() * 10;
              const sideOffset = 8 * side;
              plane.tireSmoke.push({
                x: plane.x - Math.cos(plane.angle) * behindOffset + Math.cos(perpAngle) * sideOffset,
                y: plane.y - Math.sin(plane.angle) * behindOffset + Math.sin(perpAngle) * sideOffset,
                vx: (Math.random() - 0.5) * 20 - Math.cos(plane.angle) * 15,
                vy: (Math.random() - 0.5) * 10 - 5,
                age: 0,
                opacity: 0.6 + Math.random() * 0.3,
                size: 3 + Math.random() * 4,
              });
            }
          }
          break;
        }
        
        case 'touchdown': {
          // Brief touchdown phase with tire smoke
          plane.stateProgress += delta;
          plane.altitude = 0;
          plane.pitch = 0;
          
          // Keep aligned with runway
          plane.angle = smoothTurn(plane.angle, RUNWAY_HEADING_OPPOSITE, 1.5, delta);
          
          // Decelerate
          plane.speed = Math.max(AIRPLANE_ROLLOUT_END_SPEED + 20, plane.speed - AIRPLANE_ROLLOUT_DECELERATION * delta);
          
          // Move along runway
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Continue spawning tire smoke
          if (!isMobile && plane.stateProgress < 0.5) {
            plane.particleSpawnProgress += delta;
            if (plane.particleSpawnProgress >= TIRE_SMOKE_SPAWN_RATE) {
              plane.particleSpawnProgress -= TIRE_SMOKE_SPAWN_RATE;
              const perpAngle = plane.angle + Math.PI / 2;
              const side = Math.random() < 0.5 ? -1 : 1;
              plane.tireSmoke.push({
                x: plane.x - Math.cos(plane.angle) * 18 + Math.cos(perpAngle) * 8 * side,
                y: plane.y - Math.sin(plane.angle) * 18 + Math.sin(perpAngle) * 8 * side,
                vx: (Math.random() - 0.5) * 15,
                vy: -3 - Math.random() * 5,
                age: 0,
                opacity: 0.4 + Math.random() * 0.2,
                size: 2 + Math.random() * 3,
              });
            }
          }
          
          // Transition to rollout
          if (plane.stateProgress > 0.5) {
            plane.state = 'rollout';
            plane.stateProgress = 0;
          }
          break;
        }
        
        case 'rollout': {
          // Decelerate on runway after touchdown
          plane.altitude = 0;
          
          // Continue decelerating
          plane.speed = Math.max(AIRPLANE_ROLLOUT_END_SPEED, plane.speed - AIRPLANE_ROLLOUT_DECELERATION * 0.7 * delta);
          
          // Move along runway
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Keep aligned with runway, allow slight drift toward taxi
          const angleToAirport = Math.atan2(plane.airportScreenY - plane.y, plane.airportScreenX - plane.x);
          if (plane.speed <= AIRPLANE_ROLLOUT_END_SPEED * 1.5) {
            plane.targetAngle = angleToAirport;
          }
          plane.angle = smoothTurn(plane.angle, plane.targetAngle, 0.8, delta);
          
          // Transition to taxiing to terminal when slow enough
          if (plane.speed <= AIRPLANE_ROLLOUT_END_SPEED) {
            plane.state = 'taxiing_to_terminal';
            plane.speed = AIRPLANE_TAXI_SPEED;
            plane.taxiTime = 0;
          }
          break;
        }
        
        case 'taxiing_to_terminal': {
          // Taxi from runway to terminal
          plane.taxiTime += delta;
          plane.altitude = 0;
          
          // Head toward airport center
          const angleToAirport = Math.atan2(plane.airportScreenY - plane.y, plane.airportScreenX - plane.x);
          plane.targetAngle = angleToAirport;
          plane.angle = smoothTurn(plane.angle, plane.targetAngle, 1.2, delta);
          
          // Move toward terminal
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Calculate distance to terminal
          const distToTerminal = Math.hypot(plane.x - plane.airportScreenX, plane.y - plane.airportScreenY);
          
          // Remove plane when reached terminal
          if (distToTerminal < 25 || plane.taxiTime > plane.maxTaxiTime * 2) {
            continue; // Remove plane
          }
          break;
        }
        
        // Legacy states for backwards compatibility
        case 'taking_off': {
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.altitude = Math.min(1, plane.altitude + delta * 0.3);
          plane.speed = Math.min(120, plane.speed + delta * 20);
          if (plane.altitude >= 1) plane.state = 'flying';
          break;
        }
        
        case 'landing': {
          const angleToAirport = Math.atan2(plane.airportScreenY - plane.y, plane.airportScreenX - plane.x);
          plane.angle = angleToAirport;
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.altitude = Math.max(0, plane.altitude - delta * 0.25);
          plane.speed = Math.max(30, plane.speed - delta * 15);
          const dist = Math.hypot(plane.x - plane.airportScreenX, plane.y - plane.airportScreenY);
          if (dist < 50 || plane.altitude <= 0) continue;
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





