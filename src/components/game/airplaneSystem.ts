import { Airplane, WorldRenderState } from './types';
import { gridToScreen } from './utils';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { AIRPLANE_MIN_POPULATION, AIRPLANE_COLORS, CONTRAIL_MAX_AGE, CONTRAIL_SPAWN_INTERVAL } from './constants';

export function updateAirplanes(
  delta: number,
  worldState: WorldRenderState,
  airplanes: Airplane[],
  airplaneIdRef: React.MutableRefObject<number>,
  airplaneSpawnTimerRef: React.MutableRefObject<number>,
  airports: { x: number; y: number }[],
  totalPopulation: number,
  isMobile: boolean
): Airplane[] {
  const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldState;
  
  if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
    return airplanes;
  }

  if (airports.length === 0 || totalPopulation < AIRPLANE_MIN_POPULATION) {
    return [];
  }

  const maxAirplanes = Math.min(54, Math.max(18, Math.floor(totalPopulation / 3500) * 3));
  const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

  airplaneSpawnTimerRef.current -= delta;
  if (airplanes.length < maxAirplanes && airplaneSpawnTimerRef.current <= 0) {
    const airport = airports[Math.floor(Math.random() * airports.length)];
    const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(airport.x, airport.y, 0, 0);
    const airportCenterX = airportScreenX + TILE_WIDTH * 2;
    const airportCenterY = airportScreenY + TILE_HEIGHT * 2;
    
    const isTakingOff = Math.random() < 0.5;
    
    if (isTakingOff) {
      const angle = Math.random() * Math.PI * 2;
      airplanes.push({
        id: airplaneIdRef.current++,
        x: airportCenterX,
        y: airportCenterY,
        angle: angle,
        state: 'taking_off',
        speed: 30 + Math.random() * 20,
        altitude: 0,
        targetAltitude: 1,
        airportX: airport.x,
        airportY: airport.y,
        stateProgress: 0,
        contrail: [],
        lifeTime: 30 + Math.random() * 20,
        color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
      });
    } else {
      const edge = Math.floor(Math.random() * 4);
      let startX: number, startY: number, angle: number;
      
      const mapCenterX = 0;
      const mapCenterY = currentGridSize * TILE_HEIGHT / 2;
      const mapExtent = currentGridSize * TILE_WIDTH;
      
      switch (edge) {
        case 0:
          startX = mapCenterX + (Math.random() - 0.5) * mapExtent;
          startY = mapCenterY - mapExtent / 2 - 200;
          angle = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
          break;
        case 1:
          startX = mapCenterX + mapExtent / 2 + 200;
          startY = mapCenterY + (Math.random() - 0.5) * mapExtent / 2;
          angle = Math.PI + (Math.random() - 0.5) * 0.5;
          break;
        case 2:
          startX = mapCenterX + (Math.random() - 0.5) * mapExtent;
          startY = mapCenterY + mapExtent / 2 + 200;
          angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
          break;
        default:
          startX = mapCenterX - mapExtent / 2 - 200;
          startY = mapCenterY + (Math.random() - 0.5) * mapExtent / 2;
          angle = 0 + (Math.random() - 0.5) * 0.5;
          break;
      }
      
      const angleToAirport = Math.atan2(airportCenterY - startY, airportCenterX - startX);
      
      airplanes.push({
        id: airplaneIdRef.current++,
        x: startX,
        y: startY,
        angle: angleToAirport,
        state: 'flying',
        speed: 80 + Math.random() * 40,
        altitude: 1,
        targetAltitude: 1,
        airportX: airport.x,
        airportY: airport.y,
        stateProgress: 0,
        contrail: [],
        lifeTime: 30 + Math.random() * 20,
        color: AIRPLANE_COLORS[Math.floor(Math.random() * AIRPLANE_COLORS.length)],
      });
    }
    
    airplaneSpawnTimerRef.current = 5 + Math.random() * 10;
  }

  const updatedAirplanes: Airplane[] = [];
  
  for (const plane of airplanes) {
    const contrailMaxAge = isMobile ? 0.8 : CONTRAIL_MAX_AGE;
    const contrailSpawnInterval = isMobile ? 0.06 : CONTRAIL_SPAWN_INTERVAL;
    plane.contrail = plane.contrail
      .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / contrailMaxAge) }))
      .filter(p => p.age < contrailMaxAge);
    
    if (plane.altitude > 0.7) {
      plane.stateProgress += delta;
      if (plane.stateProgress >= contrailSpawnInterval) {
        plane.stateProgress -= contrailSpawnInterval;
        const perpAngle = plane.angle + Math.PI / 2;
        const engineOffset = 4 * (0.5 + plane.altitude * 0.5);
        if (isMobile) {
          plane.contrail.push({ x: plane.x, y: plane.y, age: 0, opacity: 1 });
        } else {
          plane.contrail.push(
            { x: plane.x + Math.cos(perpAngle) * engineOffset, y: plane.y + Math.sin(perpAngle) * engineOffset, age: 0, opacity: 1 },
            { x: plane.x - Math.cos(perpAngle) * engineOffset, y: plane.y - Math.sin(perpAngle) * engineOffset, age: 0, opacity: 1 }
          );
        }
      }
    }
    
    switch (plane.state) {
      case 'taking_off': {
        plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
        plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
        plane.altitude = Math.min(1, plane.altitude + delta * 0.3);
        plane.speed = Math.min(120, plane.speed + delta * 20);
        
        if (plane.altitude >= 1) {
          plane.state = 'flying';
        }
        break;
      }
      
      case 'flying': {
        plane.x += Math.cos(plane.angle) * plane.speed * delta * speedMultiplier;
        plane.y += Math.sin(plane.angle) * plane.speed * delta * speedMultiplier;
        
        plane.lifeTime -= delta;
        
        const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(plane.airportX, plane.airportY, 0, 0);
        const airportCenterX = airportScreenX + TILE_WIDTH * 2;
        const airportCenterY = airportScreenY + TILE_HEIGHT * 2;
        const distToAirport = Math.hypot(plane.x - airportCenterX, plane.y - airportCenterY);
        
        if (distToAirport < 400 && plane.lifeTime < 10) {
          plane.state = 'landing';
          plane.targetAltitude = 0;
          plane.angle = Math.atan2(airportCenterY - plane.y, airportCenterX - plane.x);
        } else if (plane.lifeTime <= 0) {
          continue;
        }
        break;
      }
      
      case 'landing': {
        const { screenX: airportScreenX, screenY: airportScreenY } = gridToScreen(plane.airportX, plane.airportY, 0, 0);
        const airportCenterX = airportScreenX + TILE_WIDTH * 2;
        const airportCenterY = airportScreenY + TILE_HEIGHT * 2;
        
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
  
  return updatedAirplanes;
}
