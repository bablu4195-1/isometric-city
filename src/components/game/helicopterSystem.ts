import { Helicopter, WorldRenderState } from './types';
import { gridToScreen } from './utils';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { HELICOPTER_MIN_POPULATION, HELICOPTER_COLORS, ROTOR_WASH_MAX_AGE, ROTOR_WASH_SPAWN_INTERVAL } from './constants';

export function updateHelicopters(
  delta: number,
  worldState: WorldRenderState,
  helicopters: Helicopter[],
  helicopterIdRef: React.MutableRefObject<number>,
  helicopterSpawnTimerRef: React.MutableRefObject<number>,
  heliports: { x: number; y: number; type: 'hospital' | 'airport' | 'police' | 'mall'; size: number }[],
  totalPopulation: number,
  isMobile: boolean
): Helicopter[] {
  const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldState;
  
  if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
    return helicopters;
  }

  if (heliports.length < 2 || totalPopulation < HELICOPTER_MIN_POPULATION) {
    return [];
  }

  const populationBased = Math.floor(totalPopulation / 1000);
  const heliportBased = Math.floor(heliports.length * 2.5);
  const maxHelicopters = Math.min(60, Math.max(6, Math.min(populationBased, heliportBased)));
  
  const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

  helicopterSpawnTimerRef.current -= delta;
  if (helicopters.length < maxHelicopters && helicopterSpawnTimerRef.current <= 0) {
    const originIndex = Math.floor(Math.random() * heliports.length);
    const origin = heliports[originIndex];
    
    const otherHeliports = heliports.filter((_, i) => i !== originIndex);
    if (otherHeliports.length > 0) {
      const dest = otherHeliports[Math.floor(Math.random() * otherHeliports.length)];
      
      const { screenX: originScreenX, screenY: originScreenY } = gridToScreen(origin.x, origin.y, 0, 0);
      const originCenterX = originScreenX + TILE_WIDTH * origin.size / 2;
      const originCenterY = originScreenY + TILE_HEIGHT * origin.size / 2;
      
      const { screenX: destScreenX, screenY: destScreenY } = gridToScreen(dest.x, dest.y, 0, 0);
      const destCenterX = destScreenX + TILE_WIDTH * dest.size / 2;
      const destCenterY = destScreenY + TILE_HEIGHT * dest.size / 2;
      
      const angleToDestination = Math.atan2(destCenterY - originCenterY, destCenterX - originCenterX);
      
      helicopters.push({
        id: helicopterIdRef.current++,
        x: originCenterX,
        y: originCenterY,
        angle: angleToDestination,
        state: 'taking_off',
        speed: 15 + Math.random() * 10,
        altitude: 0,
        targetAltitude: 0.5,
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
      });
    }
    
    helicopterSpawnTimerRef.current = 0.8 + Math.random() * 2.2;
  }

  const updatedHelicopters: Helicopter[] = [];
  
  for (const heli of helicopters) {
    heli.rotorAngle += delta * 25;
    
    const washMaxAge = isMobile ? 0.4 : ROTOR_WASH_MAX_AGE;
    const washSpawnInterval = isMobile ? 0.08 : ROTOR_WASH_SPAWN_INTERVAL;
    heli.rotorWash = heli.rotorWash
      .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / washMaxAge) }))
      .filter(p => p.age < washMaxAge);
    
    if (heli.altitude > 0.2 && heli.state === 'flying') {
      heli.stateProgress += delta;
      if (heli.stateProgress >= washSpawnInterval) {
        heli.stateProgress -= washSpawnInterval;
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
    
    switch (heli.state) {
      case 'taking_off': {
        heli.altitude = Math.min(0.5, heli.altitude + delta * 0.4);
        heli.speed = Math.min(50, heli.speed + delta * 15);
        
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
        heli.x += Math.cos(heli.angle) * heli.speed * delta * speedMultiplier;
        heli.y += Math.sin(heli.angle) * heli.speed * delta * speedMultiplier;
        
        const distToDest = Math.hypot(heli.x - heli.destScreenX, heli.y - heli.destScreenY);
        
        if (distToDest < 80) {
          heli.state = 'landing';
          heli.targetAltitude = 0;
        }
        break;
      }
      
      case 'landing': {
        const distToDest = Math.hypot(heli.x - heli.destScreenX, heli.y - heli.destScreenY);
        
        heli.speed = Math.max(10, heli.speed - delta * 20);
        
        if (distToDest > 15) {
          const angleToDestination = Math.atan2(heli.destScreenY - heli.y, heli.destScreenX - heli.x);
          heli.angle = angleToDestination;
          heli.x += Math.cos(heli.angle) * heli.speed * delta * speedMultiplier;
          heli.y += Math.sin(heli.angle) * heli.speed * delta * speedMultiplier;
        }
        
        heli.altitude = Math.max(0, heli.altitude - delta * 0.3);
        
        if (heli.altitude <= 0 && distToDest < 20) {
          continue;
        }
        break;
      }
      
      case 'hovering':
        break;
    }
    
    updatedHelicopters.push(heli);
  }
  
  return updatedHelicopters;
}
