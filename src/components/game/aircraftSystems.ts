/* eslint-disable react-hooks/immutability */
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

type Point = { x: number; y: number };

const AIRPORT_FOOTPRINT_SIZE = 3; // Airport asset footprint (3x3)

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

function shortestAngleDelta(from: number, to: number): number {
  let d = normalizeAngle(to) - normalizeAngle(from);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function normalizeVec(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  // Ray-casting algorithm (works for convex + concave)
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function tileCenter(tileX: number, tileY: number): Point {
  const { screenX, screenY } = gridToScreen(tileX, tileY, 0, 0);
  return { x: screenX + TILE_WIDTH / 2, y: screenY + TILE_HEIGHT / 2 };
}

function getAirportGeometry(airportX: number, airportY: number) {
  const size = AIRPORT_FOOTPRINT_SIZE;
  const top = tileCenter(airportX, airportY);
  const right = tileCenter(airportX + (size - 1), airportY);
  const bottom = tileCenter(airportX + (size - 1), airportY + (size - 1));
  const left = tileCenter(airportX, airportY + (size - 1));
  const polygon: Point[] = [top, right, bottom, left];
  const center = tileCenter(airportX + 1, airportY + 1);

  // Runway axis is aligned toward the top-right of the screen in isometric space.
  // That corresponds to the "east" screen vector: (+TILE_WIDTH/2, -TILE_HEIGHT/2).
  const runwayAxis = normalizeVec(TILE_WIDTH / 2, -TILE_HEIGHT / 2);
  const runwayPerp = { x: runwayAxis.y, y: -runwayAxis.x };

  // Pick runway endpoints inside the airport polygon. Start near the "bottom-left" end, end near "top-right".
  let runwayHalfLength = TILE_WIDTH * 1.35;
  let runwayStart: Point = {
    x: center.x - runwayAxis.x * runwayHalfLength,
    y: center.y - runwayAxis.y * runwayHalfLength,
  };
  let runwayEnd: Point = {
    x: center.x + runwayAxis.x * runwayHalfLength,
    y: center.y + runwayAxis.y * runwayHalfLength,
  };
  for (let i = 0; i < 10; i++) {
    if (pointInPolygon(runwayStart, polygon) && pointInPolygon(runwayEnd, polygon)) break;
    runwayHalfLength *= 0.9;
    runwayStart = {
      x: center.x - runwayAxis.x * runwayHalfLength,
      y: center.y - runwayAxis.y * runwayHalfLength,
    };
    runwayEnd = {
      x: center.x + runwayAxis.x * runwayHalfLength,
      y: center.y + runwayAxis.y * runwayHalfLength,
    };
  }

  // Gate positions: slightly offset from center, kept within bounds.
  const gates: Point[] = [
    { x: center.x - runwayAxis.x * 42 - runwayPerp.x * 26, y: center.y - runwayAxis.y * 42 - runwayPerp.y * 26 },
    { x: center.x - runwayAxis.x * 28 - runwayPerp.x * 8, y: center.y - runwayAxis.y * 28 - runwayPerp.y * 8 },
    { x: center.x - runwayAxis.x * 18 + runwayPerp.x * 16, y: center.y - runwayAxis.y * 18 + runwayPerp.y * 16 },
    { x: center.x - runwayAxis.x * 8 + runwayPerp.x * 32, y: center.y - runwayAxis.y * 8 + runwayPerp.y * 32 },
  ].filter(p => pointInPolygon(p, polygon));

  const holdShort: Point = {
    x: runwayStart.x + runwayAxis.x * 22,
    y: runwayStart.y + runwayAxis.y * 22,
  };

  return { polygon, center, runwayAxis, runwayPerp, runwayStart, runwayEnd, holdShort, gates };
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

  // Update airplanes - spawn, move, and manage lifecycle
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

    // Target airplanes based on population and airport count.
    // Keep a visible amount of ground activity even for smaller cities.
    const populationBased = Math.floor(totalPopulation / 1500) * 3;
    const airportBased = airports.length * 10;
    const maxAirplanes = Math.min(90, Math.max(18, Math.min(populationBased, airportBased)));
    
    // Speed multiplier based on game speed
    const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

    // Spawn timer
    airplaneSpawnTimerRef.current -= delta;
    if (airplanesRef.current.length < maxAirplanes && airplaneSpawnTimerRef.current <= 0) {
      const airport = airports[Math.floor(Math.random() * airports.length)];
      const geom = getAirportGeometry(airport.x, airport.y);

      const planeType = PLANE_TYPES[Math.floor(Math.random() * PLANE_TYPES.length)] as PlaneType;
      const basePlane = {
        id: airplaneIdRef.current++,
        x: geom.center.x,
        y: geom.center.y,
        angle: 0,
        speed: 0,
        altitude: 0,
        targetAltitude: 0,
        airportX: airport.x,
        airportY: airport.y,
        stateProgress: 0,
        contrail: [],
        lifeTime: 20 + Math.random() * 35,
        color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
        planeType,
        taxiRoute: undefined as Airplane['taxiRoute'],
        taxiRouteIndex: 0,
        phaseTimer: 0,
      };

      const parkedCount = airplanesRef.current.filter(p => p.state === 'parked' || p.state === 'taxi_out' || p.state === 'taxi_in' || p.state === 'holding_short' || p.state === 'takeoff_roll' || p.state === 'landing_roll').length;
      const airborneCount = airplanesRef.current.length - parkedCount;

      // Bias toward keeping visible ground ops: taxi/park/takeoff/landing.
      const wantMoreGround = parkedCount < airports.length * 5;
      const wantMoreArrivals = airplanesRef.current.filter(p => p.state === 'approach' || p.state === 'landing_roll').length < airports.length * 2;

      const spawnArrival = !wantMoreGround && (wantMoreArrivals || Math.random() < 0.45);
      if (spawnArrival) {
        // Spawn inbound on a stable approach aligned with runway (from top-right).
        const approachStartDist = TILE_WIDTH * (8 + Math.random() * 4);
        const approachX = geom.runwayEnd.x + geom.runwayAxis.x * approachStartDist;
        const approachY = geom.runwayEnd.y + geom.runwayAxis.y * approachStartDist;
        const landingHeading = Math.atan2(-geom.runwayAxis.y, -geom.runwayAxis.x);

        airplanesRef.current.push({
          ...basePlane,
          x: approachX,
          y: approachY,
          angle: landingHeading,
          state: 'approach',
          speed: 120 + Math.random() * 30,
          altitude: 1,
          targetAltitude: 0,
          lifeTime: 18 + Math.random() * 18,
        });
      } else {
        // Spawn parked at a gate, then taxi out to runway.
        const gate = geom.gates[Math.floor(Math.random() * Math.max(1, geom.gates.length))] || geom.center;
        const taxiRoute: Point[] = [gate, geom.holdShort, geom.runwayStart];
        const taxiHeading = Math.atan2(taxiRoute[1].y - taxiRoute[0].y, taxiRoute[1].x - taxiRoute[0].x);

        airplanesRef.current.push({
          ...basePlane,
          x: gate.x,
          y: gate.y,
          angle: taxiHeading,
          state: 'parked',
          speed: 0,
          altitude: 0,
          targetAltitude: 0,
          taxiRoute,
          taxiRouteIndex: 0,
          phaseTimer: 1.5 + Math.random() * 5.5,
          // Keep some ground units around longer so the airport feels alive.
          lifeTime: 40 + Math.random() * 40,
        });
      }

      // Faster cadence so there are almost always active planes
      const congestionFactor = clamp(airplanesRef.current.length / Math.max(1, maxAirplanes), 0, 1);
      airplaneSpawnTimerRef.current = lerp(0.75, 2.25, congestionFactor) + Math.random() * 0.6;
    }

    // Update existing airplanes
    const updatedAirplanes: Airplane[] = [];
    
    for (const plane of airplanesRef.current) {
      const geom = getAirportGeometry(plane.airportX, plane.airportY);

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
          plane.altitude = 0;
          plane.speed = 0;
          plane.phaseTimer = (plane.phaseTimer ?? 0) - delta * speedMultiplier;
          if ((plane.phaseTimer ?? 0) <= 0) {
            // Begin taxi to runway
            if (!plane.taxiRoute || plane.taxiRoute.length < 2) {
              const gate = geom.gates[Math.floor(Math.random() * Math.max(1, geom.gates.length))] || geom.center;
              plane.taxiRoute = [gate, geom.holdShort, geom.runwayStart];
              plane.taxiRouteIndex = 0;
              plane.x = gate.x;
              plane.y = gate.y;
            }
            plane.state = 'taxi_out';
          }
          break;
        }

        case 'taxi_out':
        case 'taxi_in': {
          const route = plane.taxiRoute;
          if (!route || route.length < 2) {
            plane.state = 'parked';
            plane.phaseTimer = 1 + Math.random() * 2;
            break;
          }
          const rawIdx = plane.taxiRouteIndex ?? 0;
          if (rawIdx >= route.length) {
            // Route already completed
            if (plane.state === 'taxi_out') {
              plane.state = 'holding_short';
              plane.phaseTimer = 0.8 + Math.random() * 1.8;
            } else {
              plane.state = 'parked';
              plane.phaseTimer = 2.0 + Math.random() * 6.0;
            }
            break;
          }
          const idx = clamp(rawIdx, 0, route.length - 1);
          const target = route[idx];
          const dx = target.x - plane.x;
          const dy = target.y - plane.y;
          const dist = Math.hypot(dx, dy);

          const taxiSpeed = (plane.state === 'taxi_in' ? 22 : 26) + (plane.planeType === 'g650' ? 6 : 0);
          plane.speed = taxiSpeed;

          const desiredAngle = Math.atan2(dy, dx);
          const turnRate = 2.6; // radians/sec
          plane.angle += clamp(shortestAngleDelta(plane.angle, desiredAngle), -turnRate * delta, turnRate * delta);

          if (dist < 6) {
            plane.taxiRouteIndex = idx + 1;
            // Completed route?
            if ((plane.taxiRouteIndex ?? 0) >= route.length) {
              if (plane.state === 'taxi_out') {
                plane.state = 'holding_short';
                plane.phaseTimer = 0.8 + Math.random() * 1.8;
              } else {
                plane.state = 'parked';
                plane.phaseTimer = 2.0 + Math.random() * 6.0;
              }
            }
          } else {
            const step = Math.min(dist, taxiSpeed * delta * speedMultiplier);
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            const nextX = plane.x + nx * step;
            const nextY = plane.y + ny * step;

            // Safety: do not taxi outside airport boundaries.
            if (pointInPolygon({ x: nextX, y: nextY }, geom.polygon)) {
              plane.x = nextX;
              plane.y = nextY;
            } else {
              // If we somehow got outside, steer gently back toward center and pause movement.
              const toCenter = Math.atan2(geom.center.y - plane.y, geom.center.x - plane.x);
              plane.angle += clamp(shortestAngleDelta(plane.angle, toCenter), -turnRate * delta, turnRate * delta);
            }
          }
          break;
        }

        case 'holding_short': {
          plane.altitude = 0;
          plane.speed = 0;
          plane.phaseTimer = (plane.phaseTimer ?? 0) - delta * speedMultiplier;
          const takeoffHeading = Math.atan2(geom.runwayAxis.y, geom.runwayAxis.x);
          plane.angle += clamp(shortestAngleDelta(plane.angle, takeoffHeading), -3.5 * delta, 3.5 * delta);
          if ((plane.phaseTimer ?? 0) <= 0) {
            plane.state = 'takeoff_roll';
            plane.speed = 34;
            // Snap to runway start to avoid edge-case drift
            plane.x = geom.runwayStart.x;
            plane.y = geom.runwayStart.y;
          }
          break;
        }

        case 'takeoff_roll': {
          plane.altitude = 0;
          const takeoffHeading = Math.atan2(geom.runwayAxis.y, geom.runwayAxis.x);
          plane.angle += clamp(shortestAngleDelta(plane.angle, takeoffHeading), -3.0 * delta, 3.0 * delta);

          // Accelerate hard on runway
          plane.speed = Math.min(150, plane.speed + delta * 85 * speedMultiplier);

          const nextX = plane.x + geom.runwayAxis.x * plane.speed * delta * speedMultiplier;
          const nextY = plane.y + geom.runwayAxis.y * plane.speed * delta * speedMultiplier;

          // Stay on runway within bounds until rotation point.
          if (pointInPolygon({ x: nextX, y: nextY }, geom.polygon)) {
            plane.x = nextX;
            plane.y = nextY;
          } else {
            // If we hit the boundary, transition to climb anyway (we're "past" the runway).
            plane.x = nextX;
            plane.y = nextY;
          }

          const distToRunwayEnd = Math.hypot(plane.x - geom.runwayEnd.x, plane.y - geom.runwayEnd.y);
          if (distToRunwayEnd < 18 || plane.speed > 135) {
            plane.state = 'climb';
            plane.targetAltitude = 1;
          }
          break;
        }

        case 'climb': {
          const takeoffHeading = Math.atan2(geom.runwayAxis.y, geom.runwayAxis.x);
          plane.angle += clamp(shortestAngleDelta(plane.angle, takeoffHeading), -1.8 * delta, 1.8 * delta);
          plane.speed = Math.min(200, plane.speed + delta * 22 * speedMultiplier);
          plane.altitude = Math.min(1, plane.altitude + delta * 0.55 * speedMultiplier);

          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;

          if (plane.altitude >= 1) {
            plane.state = 'cruise';
            // Small drift variation so cruising doesn't look too uniform.
            plane.angle = takeoffHeading + (Math.random() - 0.5) * 0.35;
            plane.speed = 150 + Math.random() * 70;
          }
          break;
        }

        case 'cruise': {
          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.lifeTime -= delta * speedMultiplier;
          if (plane.lifeTime <= 0) {
            continue;
          }
          // Gentle course corrections
          if (Math.random() < 0.01) {
            plane.angle += (Math.random() - 0.5) * 0.15;
          }
          break;
        }

        case 'approach': {
          // Align to runway inbound (from runwayEnd toward runwayStart).
          const landingHeading = Math.atan2(-geom.runwayAxis.y, -geom.runwayAxis.x);
          const desiredToThreshold = Math.atan2(geom.runwayEnd.y - plane.y, geom.runwayEnd.x - plane.x);
          // Blend between directly-to-threshold and runway heading for a stable lined-up approach.
          const distToThreshold = Math.hypot(plane.x - geom.runwayEnd.x, plane.y - geom.runwayEnd.y);
          const alignT = clamp(1 - distToThreshold / (TILE_WIDTH * 6), 0, 1);
          const desiredAngle = normalizeAngle(lerp(desiredToThreshold, landingHeading, alignT));
          plane.angle += clamp(shortestAngleDelta(plane.angle, desiredAngle), -1.6 * delta, 1.6 * delta);

          // Descend and slow
          plane.altitude = Math.max(0.12, plane.altitude - delta * 0.28 * speedMultiplier);
          plane.speed = Math.max(95, plane.speed - delta * 18 * speedMultiplier);

          plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;

          // Touchdown trigger near runway end
          if (distToThreshold < 26 || plane.altitude <= 0.18) {
            plane.state = 'landing_roll';
            plane.altitude = 0;
            plane.speed = Math.max(70, plane.speed);
            plane.angle = landingHeading;
            // Snap to threshold for clean rollout visuals
            plane.x = geom.runwayEnd.x;
            plane.y = geom.runwayEnd.y;
          }
          break;
        }

        case 'landing_roll': {
          plane.altitude = 0;
          const landingHeading = Math.atan2(-geom.runwayAxis.y, -geom.runwayAxis.x);
          plane.angle += clamp(shortestAngleDelta(plane.angle, landingHeading), -2.0 * delta, 2.0 * delta);
          plane.speed = Math.max(18, plane.speed - delta * 55 * speedMultiplier);

          const nextX = plane.x + Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
          const nextY = plane.y + Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;

          if (pointInPolygon({ x: nextX, y: nextY }, geom.polygon)) {
            plane.x = nextX;
            plane.y = nextY;
          } else {
            plane.x = nextX;
            plane.y = nextY;
          }

          const distToRunwayStart = Math.hypot(plane.x - geom.runwayStart.x, plane.y - geom.runwayStart.y);
          if (distToRunwayStart < 22 || plane.speed <= 22) {
            // Taxi back to a gate (always within airport bounds)
            const gate = geom.gates[Math.floor(Math.random() * Math.max(1, geom.gates.length))] || geom.center;
            plane.taxiRoute = [geom.runwayStart, gate];
            plane.taxiRouteIndex = 0;
            plane.state = 'taxi_in';
            plane.speed = 0;
            plane.x = geom.runwayStart.x;
            plane.y = geom.runwayStart.y;
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





