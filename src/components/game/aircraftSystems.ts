import { useCallback } from 'react';
import { Airplane, Helicopter, WorldRenderState, TILE_WIDTH, TILE_HEIGHT, PlaneType, AirplaneState } from './types';
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
  AIRPLANE_TAKEOFF_SPEED_MIN,
  AIRPLANE_TAKEOFF_SPEED_MAX,
  AIRPLANE_LANDING_APPROACH_SPEED,
  AIRPLANE_LANDING_TOUCHDOWN_SPEED,
  AIRPLANE_ROLLOUT_DECEL,
  AIRPLANE_PARKED_TIME_MIN,
  AIRPLANE_PARKED_TIME_MAX,
  AIRPLANE_WAIT_TAKEOFF_TIME,
  AIRPLANE_CLIMB_RATE,
  AIRPLANE_DESCENT_RATE,
  AIRPLANE_APPROACH_ALTITUDE,
  AIRPLANE_TURN_RATE,
  AIRPLANE_CRUISE_SPEED_MIN,
  AIRPLANE_CRUISE_SPEED_MAX,
  AIRPLANE_SPAWN_INTERVAL_MIN,
  AIRPLANE_SPAWN_INTERVAL_MAX,
  AIRPLANE_FLIGHT_TIME_MIN,
  AIRPLANE_FLIGHT_TIME_MAX,
  MAX_AIRPLANES_PER_AIRPORT,
  MAX_GROUND_PLANES_PER_AIRPORT,
  EXHAUST_MAX_AGE,
  EXHAUST_SPAWN_INTERVAL,
  EXHAUST_SPAWN_INTERVAL_TAKEOFF,
} from './constants';
import { gridToScreen } from './utils';
import { findAirports, findHeliports } from './gridFinders';

// Airport runway configuration
// The runway is oriented towards top-right (NE) in isometric view
// Runway angle in screen space: -45 degrees = -π/4 radians (pointing up-right)
const RUNWAY_ANGLE = -Math.PI / 4;

// Airport layout positions (relative to airport origin tile in screen coordinates)
// Airport is 4x4 tiles. Origin is top-left tile.
// Runway runs from SW to NE diagonally

/**
 * Calculate key positions within an airport for airplane operations
 * All positions are in screen coordinates
 */
function getAirportPositions(airportX: number, airportY: number) {
  // Get the screen position of the airport origin tile
  const { screenX, screenY } = gridToScreen(airportX, airportY, 0, 0);
  
  // Airport center (center of 4x4 building)
  const centerX = screenX + TILE_WIDTH * 2;
  const centerY = screenY + TILE_HEIGHT * 2;
  
  // Gate positions (SW corner of airport - where planes park)
  // Offset towards bottom-left of the airport
  const gateX = centerX - TILE_WIDTH * 1.2;
  const gateY = centerY + TILE_HEIGHT * 0.8;
  
  // Runway threshold (where takeoff begins) - middle-SW of airport
  const runwayStartX = centerX - TILE_WIDTH * 0.3;
  const runwayStartY = centerY + TILE_HEIGHT * 0.3;
  
  // Runway end (where planes lift off) - NE edge of airport
  const runwayEndX = centerX + TILE_WIDTH * 1.5;
  const runwayEndY = centerY - TILE_HEIGHT * 1.0;
  
  // Approach point (where planes start final descent) - far NE of airport
  const approachX = runwayEndX + TILE_WIDTH * 6;
  const approachY = runwayEndY - TILE_HEIGHT * 4;
  
  return {
    centerX,
    centerY,
    gateX,
    gateY,
    runwayStartX,
    runwayStartY,
    runwayEndX,
    runwayEndY,
    approachX,
    approachY,
    runwayAngle: RUNWAY_ANGLE,
  };
}

/**
 * Smoothly turn an angle towards a target angle
 */
function smoothTurnTowards(currentAngle: number, targetAngle: number, turnRate: number, delta: number): number {
  // Normalize angles to -PI to PI
  let diff = targetAngle - currentAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  
  const maxTurn = turnRate * delta;
  const actualTurn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  
  return currentAngle + actualTurn;
}

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

  // Update airplanes - spawn, move, and manage lifecycle with proper taxi/takeoff/landing
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

    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Count planes per airport for spawn limiting
    const planeCountByAirport = new Map<string, { total: number; ground: number }>();
    for (const airport of airports) {
      planeCountByAirport.set(`${airport.x},${airport.y}`, { total: 0, ground: 0 });
    }
    for (const plane of airplanesRef.current) {
      const key = `${plane.airportX},${plane.airportY}`;
      const counts = planeCountByAirport.get(key);
      if (counts) {
        counts.total++;
        const groundStates: AirplaneState[] = ['parked', 'taxiing_to_runway', 'waiting_for_takeoff', 'taking_off', 'rollout', 'taxiing_to_gate'];
        if (groundStates.includes(plane.state)) {
          counts.ground++;
        }
      }
    }

    // Spawn timer
    airplaneSpawnTimerRef.current -= delta;
    if (airplaneSpawnTimerRef.current <= 0) {
      // Try to spawn at a random airport that has room
      const shuffledAirports = [...airports].sort(() => Math.random() - 0.5);
      
      for (const airport of shuffledAirports) {
        const key = `${airport.x},${airport.y}`;
        const counts = planeCountByAirport.get(key);
        if (!counts || counts.total >= MAX_AIRPLANES_PER_AIRPORT) continue;
        
        const positions = getAirportPositions(airport.x, airport.y);
        const planeType = PLANE_TYPES[Math.floor(Math.random() * PLANE_TYPES.length)] as PlaneType;
        
        // Decide if spawning a departing plane (parked at gate) or arriving plane (in air)
        // Prefer departing planes if ground has room, to keep airport busy
        const canSpawnGround = counts.ground < MAX_GROUND_PLANES_PER_AIRPORT;
        const spawnDeparting = canSpawnGround && Math.random() < 0.6;
        
        if (spawnDeparting) {
          // Spawn parked at gate (departing)
          const gateOffsetX = (Math.random() - 0.5) * TILE_WIDTH * 0.4;
          const gateOffsetY = (Math.random() - 0.5) * TILE_HEIGHT * 0.3;
          
          airplanesRef.current.push({
            id: airplaneIdRef.current++,
            x: positions.gateX + gateOffsetX,
            y: positions.gateY + gateOffsetY,
            angle: positions.runwayAngle, // Face runway direction
            targetAngle: positions.runwayAngle,
            state: 'parked',
            speed: 0,
            altitude: 0,
            targetAltitude: 0,
            airportX: airport.x,
            airportY: airport.y,
            stateProgress: 0,
            contrail: [],
            exhaust: [],
            lifeTime: AIRPLANE_FLIGHT_TIME_MIN + Math.random() * (AIRPLANE_FLIGHT_TIME_MAX - AIRPLANE_FLIGHT_TIME_MIN),
            stateTimer: AIRPLANE_PARKED_TIME_MIN + Math.random() * (AIRPLANE_PARKED_TIME_MAX - AIRPLANE_PARKED_TIME_MIN),
            color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
            planeType,
            runwayAngle: positions.runwayAngle,
            gateX: positions.gateX + gateOffsetX,
            gateY: positions.gateY + gateOffsetY,
            runwayStartX: positions.runwayStartX,
            runwayStartY: positions.runwayStartY,
            runwayEndX: positions.runwayEndX,
            runwayEndY: positions.runwayEndY,
            isDeparting: true,
          });
          counts.total++;
          counts.ground++;
        } else {
          // Spawn arriving from distance (in air approaching)
          // Calculate map bounds for spawning
          const mapCenterX = 0;
          const mapCenterY = currentGridSize * TILE_HEIGHT / 2;
          const mapExtent = currentGridSize * TILE_WIDTH;
          
          // Spawn from a direction that allows approach from NE (opposite of runway direction)
          // Planes should come from NE to land heading SW, or circle around
          const approachAngle = positions.runwayAngle + Math.PI; // Opposite of runway direction
          const spawnDist = mapExtent * 0.6 + 200;
          const angleVariation = (Math.random() - 0.5) * Math.PI * 0.5; // Some angle variation
          const spawnAngle = approachAngle + angleVariation;
          
          const startX = positions.approachX + Math.cos(spawnAngle) * spawnDist;
          const startY = positions.approachY + Math.sin(spawnAngle) * spawnDist;
          
          // Angle toward the approach point
          const angleToApproach = Math.atan2(positions.approachY - startY, positions.approachX - startX);
          
          airplanesRef.current.push({
            id: airplaneIdRef.current++,
            x: startX,
            y: startY,
            angle: angleToApproach,
            targetAngle: angleToApproach,
            state: 'flying',
            speed: AIRPLANE_CRUISE_SPEED_MIN + Math.random() * (AIRPLANE_CRUISE_SPEED_MAX - AIRPLANE_CRUISE_SPEED_MIN),
            altitude: 1,
            targetAltitude: 1,
            airportX: airport.x,
            airportY: airport.y,
            stateProgress: 0,
            contrail: [],
            exhaust: [],
            lifeTime: AIRPLANE_FLIGHT_TIME_MIN + Math.random() * (AIRPLANE_FLIGHT_TIME_MAX - AIRPLANE_FLIGHT_TIME_MIN),
            stateTimer: 0,
            color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
            planeType,
            runwayAngle: positions.runwayAngle,
            gateX: positions.gateX + (Math.random() - 0.5) * TILE_WIDTH * 0.4,
            gateY: positions.gateY + (Math.random() - 0.5) * TILE_HEIGHT * 0.3,
            runwayStartX: positions.runwayStartX,
            runwayStartY: positions.runwayStartY,
            runwayEndX: positions.runwayEndX,
            runwayEndY: positions.runwayEndY,
            isDeparting: false,
          });
          counts.total++;
        }
        
        break; // Only spawn one plane per timer tick
      }
      
      // Reset spawn timer
      airplaneSpawnTimerRef.current = AIRPLANE_SPAWN_INTERVAL_MIN + Math.random() * (AIRPLANE_SPAWN_INTERVAL_MAX - AIRPLANE_SPAWN_INTERVAL_MIN);
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
      
      // Update exhaust particles
      const exhaustMaxAge = isMobile ? 0.6 : EXHAUST_MAX_AGE;
      plane.exhaust = plane.exhaust
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / exhaustMaxAge), size: p.size + delta * 3 }))
        .filter(p => p.age < exhaustMaxAge);
      
      // Add contrail particles at high altitude
      if (plane.altitude > 0.7) {
        plane.stateProgress += delta;
        if (plane.stateProgress >= contrailSpawnInterval) {
          plane.stateProgress -= contrailSpawnInterval;
          const behindOffset = 40;
          const downOffset = 8;
          const contrailX = plane.x - Math.cos(plane.angle) * behindOffset;
          const contrailY = plane.y - Math.sin(plane.angle) * behindOffset + downOffset;
          plane.contrail.push({ x: contrailX, y: contrailY, age: 0, opacity: 1 });
        }
      }
      
      // Add exhaust particles when on ground and moving (taxiing or takeoff)
      const isMovingOnGround = plane.altitude < 0.1 && plane.speed > 5;
      const isTakingOff = plane.state === 'taking_off';
      if (isMovingOnGround || isTakingOff) {
        const exhaustInterval = isTakingOff ? EXHAUST_SPAWN_INTERVAL_TAKEOFF : EXHAUST_SPAWN_INTERVAL;
        plane.stateProgress += delta;
        if (plane.stateProgress >= exhaustInterval) {
          plane.stateProgress -= exhaustInterval;
          const behindOffset = 25;
          const exhaustX = plane.x - Math.cos(plane.angle) * behindOffset + (Math.random() - 0.5) * 4;
          const exhaustY = plane.y - Math.sin(plane.angle) * behindOffset + (Math.random() - 0.5) * 4;
          plane.exhaust.push({ x: exhaustX, y: exhaustY, age: 0, opacity: 0.5, size: 2 + Math.random() * 2 });
        }
      }
      
      // Update based on state
      switch (plane.state) {
        case 'parked': {
          // Wait at gate before taxiing to runway
          plane.stateTimer -= delta;
          if (plane.stateTimer <= 0) {
            plane.state = 'taxiing_to_runway';
            plane.speed = AIRPLANE_TAXI_SPEED;
            // Calculate angle to runway threshold
            plane.targetAngle = Math.atan2(plane.runwayStartY - plane.y, plane.runwayStartX - plane.x);
          }
          break;
        }
        
        case 'taxiing_to_runway': {
          // Taxi from gate to runway threshold
          const distToRunway = Math.hypot(plane.runwayStartX - plane.x, plane.runwayStartY - plane.y);
          
          // Smooth turning towards target
          plane.angle = smoothTurnTowards(plane.angle, plane.targetAngle, AIRPLANE_TURN_RATE * 2, delta);
          
          // Move forward
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Update target angle to point at runway
          plane.targetAngle = Math.atan2(plane.runwayStartY - plane.y, plane.runwayStartX - plane.x);
          
          if (distToRunway < 15) {
            plane.state = 'waiting_for_takeoff';
            plane.speed = 0;
            plane.stateTimer = AIRPLANE_WAIT_TAKEOFF_TIME;
            // Align with runway
            plane.angle = plane.runwayAngle;
            plane.targetAngle = plane.runwayAngle;
            plane.x = plane.runwayStartX;
            plane.y = plane.runwayStartY;
          }
          break;
        }
        
        case 'waiting_for_takeoff': {
          // Brief pause at runway before takeoff
          plane.stateTimer -= delta;
          if (plane.stateTimer <= 0) {
            plane.state = 'taking_off';
            plane.speed = AIRPLANE_TAKEOFF_SPEED_MIN;
          }
          break;
        }
        
        case 'taking_off': {
          // Accelerate down runway, then lift off
          const accel = (AIRPLANE_TAKEOFF_SPEED_MAX - AIRPLANE_TAKEOFF_SPEED_MIN) / 2; // Accelerate over ~2 seconds
          plane.speed = Math.min(AIRPLANE_TAKEOFF_SPEED_MAX, plane.speed + accel * delta);
          
          // Move along runway
          plane.x += Math.cos(plane.runwayAngle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.runwayAngle) * plane.speed * delta * speedMultiplier;
          plane.angle = plane.runwayAngle;
          
          // Check if past runway end - lift off
          const distToEnd = Math.hypot(plane.runwayEndX - plane.x, plane.runwayEndY - plane.y);
          const pastEnd = distToEnd < 20 || plane.speed >= AIRPLANE_TAKEOFF_SPEED_MAX;
          
          if (pastEnd) {
            plane.state = 'climbing';
            plane.targetAltitude = 1;
          }
          break;
        }
        
        case 'climbing': {
          // Climb to cruising altitude
          plane.altitude = Math.min(1, plane.altitude + AIRPLANE_CLIMB_RATE * delta);
          plane.speed = Math.min(AIRPLANE_CRUISE_SPEED_MAX, plane.speed + 10 * delta);
          
          // Slight course variations during climb
          if (Math.random() < 0.02) {
            plane.targetAngle = plane.runwayAngle + (Math.random() - 0.5) * 0.3;
          }
          plane.angle = smoothTurnTowards(plane.angle, plane.targetAngle, AIRPLANE_TURN_RATE * 0.5, delta);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          if (plane.altitude >= 1) {
            plane.state = 'flying';
            plane.speed = AIRPLANE_CRUISE_SPEED_MIN + Math.random() * (AIRPLANE_CRUISE_SPEED_MAX - AIRPLANE_CRUISE_SPEED_MIN);
          }
          break;
        }
        
        case 'flying': {
          // Cruise at altitude
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          plane.lifeTime -= delta;
          
          // Gentle course corrections
          if (Math.random() < 0.01) {
            plane.targetAngle = plane.angle + (Math.random() - 0.5) * 0.2;
          }
          plane.angle = smoothTurnTowards(plane.angle, plane.targetAngle, AIRPLANE_TURN_RATE * 0.3, delta);
          
          // Check if should start approach (lifetime low)
          if (plane.lifeTime < 15) {
            // Get positions for approach
            const positions = getAirportPositions(plane.airportX, plane.airportY);
            const distToApproach = Math.hypot(plane.x - positions.approachX, plane.y - positions.approachY);
            
            // Start turning toward approach point
            plane.targetAngle = Math.atan2(positions.approachY - plane.y, positions.approachX - plane.x);
            plane.angle = smoothTurnTowards(plane.angle, plane.targetAngle, AIRPLANE_TURN_RATE * 0.5, delta);
            
            if (distToApproach < 300 && plane.lifeTime < 10) {
              plane.state = 'approaching';
              plane.targetAltitude = AIRPLANE_APPROACH_ALTITUDE;
            }
          }
          
          // Despawn if way out of time and too far
          if (plane.lifeTime <= 0) {
            continue;
          }
          break;
        }
        
        case 'approaching': {
          // Descend to approach altitude, line up with runway
          const positions = getAirportPositions(plane.airportX, plane.airportY);
          
          // Descend gradually
          if (plane.altitude > AIRPLANE_APPROACH_ALTITUDE) {
            plane.altitude = Math.max(AIRPLANE_APPROACH_ALTITUDE, plane.altitude - AIRPLANE_DESCENT_RATE * 0.5 * delta);
          }
          
          // Slow down
          plane.speed = Math.max(AIRPLANE_LANDING_APPROACH_SPEED, plane.speed - 10 * delta);
          
          // Turn to line up with runway (from NE, landing heading SW)
          const landingAngle = positions.runwayAngle + Math.PI; // Opposite direction for landing
          const distToRunwayEnd = Math.hypot(plane.x - positions.runwayEndX, plane.y - positions.runwayEndY);
          
          if (distToRunwayEnd > 200) {
            // Still far, turn toward runway end
            plane.targetAngle = Math.atan2(positions.runwayEndY - plane.y, positions.runwayEndX - plane.x);
          } else {
            // Close to runway, align with landing direction
            plane.targetAngle = landingAngle;
          }
          
          plane.angle = smoothTurnTowards(plane.angle, plane.targetAngle, AIRPLANE_TURN_RATE, delta);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Check if aligned and close to runway - start landing
          const alignmentDiff = Math.abs(plane.angle - landingAngle);
          const alignmentNormalized = alignmentDiff > Math.PI ? Math.PI * 2 - alignmentDiff : alignmentDiff;
          
          if (distToRunwayEnd < 150 && alignmentNormalized < 0.3) {
            plane.state = 'landing';
            plane.targetAltitude = 0;
          }
          break;
        }
        
        case 'landing': {
          // Final descent to runway
          const positions = getAirportPositions(plane.airportX, plane.airportY);
          const landingAngle = positions.runwayAngle + Math.PI;
          
          // Keep aligned with runway
          plane.angle = smoothTurnTowards(plane.angle, landingAngle, AIRPLANE_TURN_RATE * 2, delta);
          
          // Descend to ground
          const distToRunwayEnd = Math.hypot(plane.x - positions.runwayEndX, plane.y - positions.runwayEndY);
          const descentRate = Math.max(0.3, distToRunwayEnd / 500) * AIRPLANE_DESCENT_RATE;
          plane.altitude = Math.max(0, plane.altitude - descentRate * delta);
          
          // Slow to touchdown speed
          plane.speed = Math.max(AIRPLANE_LANDING_TOUCHDOWN_SPEED, plane.speed - 15 * delta);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Touchdown when on runway and low
          if (plane.altitude <= 0.02 || distToRunwayEnd < 30) {
            plane.state = 'rollout';
            plane.altitude = 0;
          }
          break;
        }
        
        case 'rollout': {
          // Decelerate on runway after landing
          plane.altitude = 0;
          plane.speed = Math.max(AIRPLANE_TAXI_SPEED, plane.speed - AIRPLANE_ROLLOUT_DECEL * delta);
          
          // Keep rolling along runway (landing direction)
          const landingAngle = plane.runwayAngle + Math.PI;
          plane.angle = landingAngle;
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // When slow enough, start taxiing to gate
          if (plane.speed <= AIRPLANE_TAXI_SPEED + 5) {
            plane.state = 'taxiing_to_gate';
            plane.speed = AIRPLANE_TAXI_SPEED;
            plane.targetAngle = Math.atan2(plane.gateY - plane.y, plane.gateX - plane.x);
          }
          break;
        }
        
        case 'taxiing_to_gate': {
          // Taxi from runway to gate
          const distToGate = Math.hypot(plane.gateX - plane.x, plane.gateY - plane.y);
          
          // Update target angle to gate
          plane.targetAngle = Math.atan2(plane.gateY - plane.y, plane.gateX - plane.x);
          plane.angle = smoothTurnTowards(plane.angle, plane.targetAngle, AIRPLANE_TURN_RATE * 2, delta);
          
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          
          // Arrived at gate - remove plane (completing cycle)
          if (distToGate < 15) {
            continue; // Remove plane
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





