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
} from './constants';
import { gridToScreen } from './utils';
import { findAirports, findHeliports } from './gridFinders';
import { getBuildingSize } from '@/lib/simulation';

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

  // Update airplanes - spawn, move, and manage lifecycle
  const updateAirplanes = useCallback((delta: number) => {
    const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldStateRef.current;
    
    if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
      return;
    }

    // Find airports and check population
    const airports = findAirportsCallback();
    const airportKeySet = new Set(airports.map(a => `${a.x},${a.y}`));
    
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

    // Calculate max airplanes based on population (scaled, but keep a healthy floor so airports feel alive)
    const maxAirplanes = Math.min(80, Math.max(18, Math.floor(totalPopulation / 2000) * 3));
    const desiredPerAirport = Math.min(10, Math.max(4, 4 + Math.floor(totalPopulation / 15000))); // 4-10 per airport
    const desiredTotal = Math.min(maxAirplanes, Math.max(airports.length * 4, airports.length * desiredPerAirport));
    
    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Airport runway is aligned toward the top-right of the screen (NE): +X, -Y.
    const RUNWAY_ANGLE = -Math.PI / 4;
    const RUNWAY_DIR_X = Math.cos(RUNWAY_ANGLE);
    const RUNWAY_DIR_Y = Math.sin(RUNWAY_ANGLE);
    // Perpendicular axis (points down-right). Negative points up-left (terminal side).
    const PERP_DIR_X = -RUNWAY_DIR_Y;
    const PERP_DIR_Y = RUNWAY_DIR_X;

    // Use the airport footprint size for centering, but keep a conservative 3x3 operational envelope
    // inside the footprint so taxi/roll never stray outside the visible airport area.
    const airportFootprint = getBuildingSize('airport');
    const airportOperationalTiles = Math.min(3, airportFootprint.width, airportFootprint.height);

    const getAirportCenter = (ax: number, ay: number) => {
      const half = (airportFootprint.width - 1) / 2;
      const { screenX, screenY } = gridToScreen(ax + half, ay + half, 0, 0);
      return { x: screenX + TILE_WIDTH / 2, y: screenY + TILE_HEIGHT / 2 };
    };

    const getAirportFrame = (ax: number, ay: number) => {
      const center = getAirportCenter(ax, ay);

      // Tuned to stay well within the airport art footprint
      const runwayHalfLen = TILE_WIDTH * (0.85 * airportOperationalTiles + 0.6);
      const apronHalfWidth = TILE_HEIGHT * (0.7 * airportOperationalTiles + 0.2);

      const runwayStart = {
        x: center.x - RUNWAY_DIR_X * runwayHalfLen,
        y: center.y - RUNWAY_DIR_Y * runwayHalfLen,
      };
      const runwayEnd = {
        x: center.x + RUNWAY_DIR_X * runwayHalfLen,
        y: center.y + RUNWAY_DIR_Y * runwayHalfLen,
      };

      // A small holding point slightly offset from runway centerline (still inside envelope)
      const holdShort = {
        x: runwayStart.x + PERP_DIR_X * (apronHalfWidth * 0.25),
        y: runwayStart.y + PERP_DIR_Y * (apronHalfWidth * 0.25),
      };

      // Three gate/stand positions near the terminal side (up-left of center)
      const gateBase = {
        x: center.x - PERP_DIR_X * (apronHalfWidth * 0.55) - RUNWAY_DIR_X * (runwayHalfLen * 0.15),
        y: center.y - PERP_DIR_Y * (apronHalfWidth * 0.55) - RUNWAY_DIR_Y * (runwayHalfLen * 0.15),
      };
      const gateOffsets = [-0.28, 0, 0.28];
      const gates = gateOffsets.map(t => ({
        x: gateBase.x + RUNWAY_DIR_X * (t * runwayHalfLen),
        y: gateBase.y + RUNWAY_DIR_Y * (t * runwayHalfLen),
      }));

      return { center, runwayStart, runwayEnd, holdShort, gates, runwayHalfLen, apronHalfWidth };
    };

    const clampToAirportEnvelope = (
      pos: { x: number; y: number },
      frame: { center: { x: number; y: number }; runwayHalfLen: number; apronHalfWidth: number }
    ) => {
      const dx = pos.x - frame.center.x;
      const dy = pos.y - frame.center.y;
      // Convert to runway-aligned coordinates
      const u = dx * RUNWAY_DIR_X + dy * RUNWAY_DIR_Y;
      const v = dx * PERP_DIR_X + dy * PERP_DIR_Y;
      const cu = Math.max(-frame.runwayHalfLen, Math.min(frame.runwayHalfLen, u));
      const cv = Math.max(-frame.apronHalfWidth, Math.min(frame.apronHalfWidth, v));
      return {
        x: frame.center.x + RUNWAY_DIR_X * cu + PERP_DIR_X * cv,
        y: frame.center.y + RUNWAY_DIR_Y * cu + PERP_DIR_Y * cv,
      };
    };

    const moveToward = (plane: Airplane, targetX: number, targetY: number, maxTurnRate: number, deltaSec: number) => {
      const angleToTarget = Math.atan2(targetY - plane.y, targetX - plane.x);
      let diff = angleToTarget - plane.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxDelta = maxTurnRate * deltaSec;
      plane.angle += Math.max(-maxDelta, Math.min(maxDelta, diff));

      const step = plane.speed * deltaSec * speedMultiplier;
      const nx = plane.y === targetY && plane.x === targetX ? plane.x : plane.x + Math.cos(plane.angle) * step;
      const ny = plane.y === targetY && plane.x === targetX ? plane.y : plane.y + Math.sin(plane.angle) * step;
      return { x: nx, y: ny };
    };

    // Spawn timer
    airplaneSpawnTimerRef.current -= delta;
    if (airplaneSpawnTimerRef.current <= 0 && airplanesRef.current.length < desiredTotal) {
      // Pick the airport with the fewest planes currently assigned (keeps all airports active)
      const counts = new Map<string, number>();
      for (const p of airplanesRef.current) {
        const k = `${p.airportX},${p.airportY}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      let chosen = airports[0];
      let best = Number.POSITIVE_INFINITY;
      for (const a of airports) {
        const c = counts.get(`${a.x},${a.y}`) || 0;
        if (c < best) {
          best = c;
          chosen = a;
        }
      }

      const frame = getAirportFrame(chosen.x, chosen.y);
      const gateIndex = Math.floor(Math.random() * frame.gates.length);
      const gate = frame.gates[gateIndex];
      const planeType = PLANE_TYPES[Math.floor(Math.random() * PLANE_TYPES.length)] as PlaneType;

      // Mix: mostly spawn parked/taxiing (keeps airport busy), sometimes spawn as inbound approach.
      const spawnInbound = best >= desiredPerAirport && Math.random() < 0.45;
      if (spawnInbound) {
        // Spawn slightly beyond runway end, aligned for landing roll toward bottom-left.
        const spawnX = frame.runwayEnd.x + RUNWAY_DIR_X * (240 + Math.random() * 120) + PERP_DIR_X * ((Math.random() - 0.5) * frame.apronHalfWidth * 0.4);
        const spawnY = frame.runwayEnd.y + RUNWAY_DIR_Y * (240 + Math.random() * 120) + PERP_DIR_Y * ((Math.random() - 0.5) * frame.apronHalfWidth * 0.4);
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: spawnX,
          y: spawnY,
          angle: RUNWAY_ANGLE + Math.PI, // heading toward runway end for touchdown
          state: 'approach',
          speed: 110 + Math.random() * 25,
          altitude: 1,
          targetAltitude: 0,
          airportX: chosen.x,
          airportY: chosen.y,
          targetX: frame.runwayEnd.x,
          targetY: frame.runwayEnd.y,
          gateIndex,
          phaseTimer: 0,
          stateProgress: 0,
          contrail: [],
          // Force landing soon
          lifeTime: 6 + Math.random() * 4,
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType,
        });
      } else {
        // Spawn parked at a gate
        airplanesRef.current.push({
          id: airplaneIdRef.current++,
          x: gate.x,
          y: gate.y,
          angle: RUNWAY_ANGLE, // idle facing roughly toward runway
          state: 'parked',
          speed: 0,
          altitude: 0,
          targetAltitude: 0,
          airportX: chosen.x,
          airportY: chosen.y,
          targetX: gate.x,
          targetY: gate.y,
          gateIndex,
          phaseTimer: 2.5 + Math.random() * 6.5, // short turnaround
          stateProgress: 0,
          contrail: [],
          lifeTime: 22 + Math.random() * 18, // time spent flying before returning
          color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
          planeType,
        });
      }

      // Faster spawns if we're below the desired busy level
      const deficit = desiredTotal - airplanesRef.current.length;
      airplaneSpawnTimerRef.current = deficit > 8 ? 0.35 : deficit > 4 ? 0.7 : 1.2 + Math.random() * 1.6;
    }

    // Update existing airplanes
    const updatedAirplanes: Airplane[] = [];
    
    for (const prevPlane of airplanesRef.current) {
      // Remove planes whose home airport no longer exists
      if (!airportKeySet.has(`${prevPlane.airportX},${prevPlane.airportY}`)) {
        continue;
      }
      // IMPORTANT: treat ref contents immutably (eslint react-hooks/immutability)
      const plane: Airplane = {
        ...prevPlane,
        contrail: [...prevPlane.contrail],
      };
      // Update contrail particles - shorter duration on mobile for performance
      const contrailMaxAge = isMobile ? 0.8 : CONTRAIL_MAX_AGE;
      const contrailSpawnInterval = isMobile ? 0.06 : CONTRAIL_SPAWN_INTERVAL;
      plane.contrail = plane.contrail
        .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / contrailMaxAge) }))
        .filter(p => p.age < contrailMaxAge);
      
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
      
      // Update based on state
      switch (plane.state) {
        case 'parked': {
          // Short turnaround, then taxi out toward runway hold-short.
          plane.phaseTimer -= delta * speedMultiplier;
          plane.speed = 0;
          plane.altitude = 0;
          plane.targetAltitude = 0;

          if (plane.phaseTimer <= 0) {
            const frame = getAirportFrame(plane.airportX, plane.airportY);
            plane.state = 'taxi_to_runway';
            plane.speed = 22 + Math.random() * 8;
            plane.targetX = frame.holdShort.x;
            plane.targetY = frame.holdShort.y;
            // Start turning smoothly toward taxi path
          }
          break;
        }

        case 'taxi_to_runway': {
          const frame = getAirportFrame(plane.airportX, plane.airportY);
          const next = moveToward(plane, plane.targetX, plane.targetY, 3.2, delta);
          const clamped = clampToAirportEnvelope(next, frame);
          plane.x = clamped.x;
          plane.y = clamped.y;
          plane.altitude = 0;
          plane.targetAltitude = 0;

          const dist = Math.hypot(plane.x - plane.targetX, plane.y - plane.targetY);
          if (dist < 10) {
            plane.state = 'lineup';
            plane.phaseTimer = 0.6 + Math.random() * 1.0;
            plane.speed = 0;
            plane.angle = RUNWAY_ANGLE; // align with runway heading (takeoff to top-right)
          }
          break;
        }

        case 'lineup': {
          plane.phaseTimer -= delta * speedMultiplier;
          plane.altitude = 0;
          plane.targetAltitude = 0;
          plane.speed = 0;
          plane.angle = RUNWAY_ANGLE;
          if (plane.phaseTimer <= 0) {
            plane.state = 'takeoff_roll';
            plane.speed = 35 + Math.random() * 10;
          }
          break;
        }

        case 'takeoff_roll': {
          const frame = getAirportFrame(plane.airportX, plane.airportY);
          plane.angle = RUNWAY_ANGLE;
          plane.altitude = 0;
          plane.targetAltitude = 1;
          // Accelerate hard on the runway
          plane.speed = Math.min(140, plane.speed + delta * 55 * speedMultiplier);

          const nx = plane.x + RUNWAY_DIR_X * plane.speed * delta * speedMultiplier;
          const ny = plane.y + RUNWAY_DIR_Y * plane.speed * delta * speedMultiplier;
          const clamped = clampToAirportEnvelope({ x: nx, y: ny }, frame);
          plane.x = clamped.x;
          plane.y = clamped.y;

          // Transition when we reach runway end (or get close)
          const distToEnd = Math.hypot(plane.x - frame.runwayEnd.x, plane.y - frame.runwayEnd.y);
          if (distToEnd < 18 || plane.speed >= 135) {
            plane.state = 'taking_off';
            // Begin climb from runway end, continue along runway direction
            plane.angle = RUNWAY_ANGLE;
          }
          break;
        }

        case 'taking_off': {
          // Climb out from runway, then transition to cruise
          plane.x += RUNWAY_DIR_X * plane.speed * delta * speedMultiplier;
          plane.y += RUNWAY_DIR_Y * plane.speed * delta * speedMultiplier;
          plane.altitude = Math.min(1, plane.altitude + delta * 0.45);
          plane.speed = Math.min(150, plane.speed + delta * 22);
          plane.targetAltitude = 1;

          if (plane.altitude >= 1) {
            plane.state = 'flying';
            plane.speed = 95 + Math.random() * 35;
            // small course variation while cruising
            plane.angle = RUNWAY_ANGLE + (Math.random() - 0.5) * 0.25;
          }
          break;
        }

        case 'flying': {
          // Move forward at cruising speed
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;

          // Gentle course corrections for variety
          if (Math.random() < 0.01) {
            plane.angle += (Math.random() - 0.5) * 0.12;
          }

          plane.lifeTime -= delta * speedMultiplier;

          // Start landing sequence when flight time is nearly over
          if (plane.lifeTime < 7) {
            const frame = getAirportFrame(plane.airportX, plane.airportY);
            plane.state = 'approach';
            plane.targetAltitude = 0;
            plane.targetX = frame.runwayEnd.x;
            plane.targetY = frame.runwayEnd.y;
            // Align for landing roll toward bottom-left
            plane.angle = RUNWAY_ANGLE + Math.PI;
            // Keep some speed but begin slowing
            plane.speed = Math.max(95, plane.speed * 0.9);
          } else if (plane.lifeTime <= 0) {
            // If something went wrong and we never got an approach, recycle to approach.
            const frame = getAirportFrame(plane.airportX, plane.airportY);
            plane.state = 'approach';
            plane.lifeTime = 5;
            plane.targetAltitude = 0;
            plane.targetX = frame.runwayEnd.x;
            plane.targetY = frame.runwayEnd.y;
            plane.angle = RUNWAY_ANGLE + Math.PI;
          }
          break;
        }

        case 'approach': {
          const frame = getAirportFrame(plane.airportX, plane.airportY);
          // Steer toward touchdown while converging to runway inbound heading (toward bottom-left).
          const runwayInbound = RUNWAY_ANGLE + Math.PI;
          const angleToTouchdown = Math.atan2(frame.runwayEnd.y - plane.y, frame.runwayEnd.x - plane.x);
          // Limit how far we can deviate from runway heading (prevents unrealistic sideways approaches)
          let desired = angleToTouchdown;
          let desiredDiff = desired - runwayInbound;
          while (desiredDiff > Math.PI) desiredDiff -= Math.PI * 2;
          while (desiredDiff < -Math.PI) desiredDiff += Math.PI * 2;
          desiredDiff = Math.max(-0.55, Math.min(0.55, desiredDiff));
          desired = runwayInbound + desiredDiff;

          let turn = desired - plane.angle;
          while (turn > Math.PI) turn -= Math.PI * 2;
          while (turn < -Math.PI) turn += Math.PI * 2;
          const maxTurn = 1.8 * delta * speedMultiplier;
          plane.angle += Math.max(-maxTurn, Math.min(maxTurn, turn));

          plane.speed = Math.max(85, plane.speed - delta * 18 * speedMultiplier);
          plane.altitude = Math.max(0, plane.altitude - delta * 0.35 * speedMultiplier);
          plane.targetAltitude = 0;

          // Move toward runway end (touchdown point)
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;

          const distToTouchdown = Math.hypot(plane.x - frame.runwayEnd.x, plane.y - frame.runwayEnd.y);
          if (distToTouchdown < 35 || plane.altitude <= 0.12) {
            // Touchdown: snap to runway end envelope and begin rollout
            const snapped = clampToAirportEnvelope({ x: plane.x, y: plane.y }, frame);
            plane.x = snapped.x;
            plane.y = snapped.y;
            plane.altitude = 0;
            plane.state = 'landing_roll';
            plane.speed = Math.max(60, plane.speed);
          }
          break;
        }

        case 'landing_roll': {
          const frame = getAirportFrame(plane.airportX, plane.airportY);
          // Roll along runway toward bottom-left, decelerating
          plane.angle = RUNWAY_ANGLE + Math.PI;
          plane.altitude = 0;
          plane.targetAltitude = 0;
          plane.speed = Math.max(22, plane.speed - delta * 42 * speedMultiplier);

          const nx = plane.x + Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          const ny = plane.y + Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          const clamped = clampToAirportEnvelope({ x: nx, y: ny }, frame);
          plane.x = clamped.x;
          plane.y = clamped.y;

          const distToStart = Math.hypot(plane.x - frame.runwayStart.x, plane.y - frame.runwayStart.y);
          if (plane.speed <= 26 || distToStart < 22) {
            // Exit runway and taxi to assigned gate
            const gate = frame.gates[Math.max(0, Math.min(frame.gates.length - 1, plane.gateIndex))];
            plane.state = 'taxi_to_gate';
            plane.speed = 20 + Math.random() * 7;
            plane.targetX = gate.x;
            plane.targetY = gate.y;
          }
          break;
        }

        case 'taxi_to_gate': {
          const frame = getAirportFrame(plane.airportX, plane.airportY);
          const next = moveToward(plane, plane.targetX, plane.targetY, 3.4, delta);
          const clamped = clampToAirportEnvelope(next, frame);
          plane.x = clamped.x;
          plane.y = clamped.y;
          plane.altitude = 0;
          plane.targetAltitude = 0;

          const dist = Math.hypot(plane.x - plane.targetX, plane.y - plane.targetY);
          if (dist < 10) {
            // Park and reset for another cycle
            plane.state = 'parked';
            plane.speed = 0;
            plane.phaseTimer = 3 + Math.random() * 7;
            // Refresh flight lifetime for next departure
            plane.lifeTime = 22 + Math.random() * 18;
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
    
    for (const prevHeli of helicoptersRef.current) {
      // IMPORTANT: treat ref contents immutably (eslint react-hooks/immutability)
      const heli: Helicopter = {
        ...prevHeli,
        rotorWash: [...prevHeli.rotorWash],
      };
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





