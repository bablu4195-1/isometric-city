import { EmergencyVehicle, EmergencyVehicleType, CarDirection, WorldRenderState } from './types';
import { isRoadTile, findPathOnRoads, getDirectionToTile, gridToScreen } from './utils';
import { DIRECTION_META } from './constants';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { BuildingType, Tile } from '@/types/game';

// Dispatch emergency vehicle
export function dispatchEmergencyVehicle(
  type: EmergencyVehicleType,
  stationX: number,
  stationY: number,
  targetX: number,
  targetY: number,
  worldState: WorldRenderState,
  emergencyVehicles: EmergencyVehicle[],
  emergencyVehicleIdRef: React.MutableRefObject<number>
): boolean {
  const { grid: currentGrid, gridSize: currentGridSize } = worldState;
  if (!currentGrid || currentGridSize <= 0) return false;

  const path = findPathOnRoads(currentGrid, currentGridSize, stationX, stationY, targetX, targetY);
  if (!path || path.length === 0) return false;

  const startTile = path[0];
  let direction: CarDirection = 'south';
  
  if (path.length >= 2) {
    const nextTile = path[1];
    const dir = getDirectionToTile(startTile.x, startTile.y, nextTile.x, nextTile.y);
    if (dir) direction = dir;
  }

  emergencyVehicles.push({
    id: emergencyVehicleIdRef.current++,
    type,
    tileX: startTile.x,
    tileY: startTile.y,
    direction,
    progress: 0,
    speed: type === 'fire_truck' ? 0.8 : 0.9,
    state: 'dispatching',
    stationX,
    stationY,
    targetX,
    targetY,
    path,
    pathIndex: 0,
    respondTime: 0,
    laneOffset: 0,
    flashTimer: 0,
  });

  return true;
}

// Update emergency vehicles
export function updateEmergencyVehicles(
  delta: number,
  worldState: WorldRenderState,
  emergencyVehicles: EmergencyVehicle[],
  activeFiresRef: React.MutableRefObject<Set<string>>,
  activeCrimesRef: React.MutableRefObject<Set<string>>,
  activeCrimeIncidentsRef: React.MutableRefObject<Map<string, any>>
): EmergencyVehicle[] {
  const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldState;
  if (!currentGrid || currentGridSize <= 0) {
    return [];
  }

  const speedMultiplier = currentSpeed === 0 ? 0 : currentSpeed === 1 ? 1 : currentSpeed === 2 ? 2.5 : 4;
  const updatedVehicles: EmergencyVehicle[] = [];
  
  for (const vehicle of [...emergencyVehicles]) {
    vehicle.flashTimer += delta * 8;
    
    if (vehicle.state === 'responding') {
      if (!isRoadTile(currentGrid, currentGridSize, vehicle.tileX, vehicle.tileY)) {
        const targetKey = `${vehicle.targetX},${vehicle.targetY}`;
        if (vehicle.type === 'fire_truck') {
          activeFiresRef.current.delete(targetKey);
        } else {
          activeCrimesRef.current.delete(targetKey);
          activeCrimeIncidentsRef.current.delete(targetKey);
        }
        continue;
      }
      
      vehicle.respondTime += delta * speedMultiplier;
      const respondDuration = vehicle.type === 'fire_truck' ? 8 : 5;
      
      if (vehicle.respondTime >= respondDuration) {
        const targetKey = `${vehicle.targetX},${vehicle.targetY}`;
        
        if (vehicle.type === 'police_car') {
          activeCrimeIncidentsRef.current.delete(targetKey);
        }
        
        const returnPath = findPathOnRoads(
          currentGrid, currentGridSize,
          vehicle.tileX, vehicle.tileY,
          vehicle.stationX, vehicle.stationY
        );
        
        if (returnPath && returnPath.length >= 2) {
          vehicle.path = returnPath;
          vehicle.pathIndex = 0;
          vehicle.state = 'returning';
          vehicle.progress = 0;
          
          const nextTile = returnPath[1];
          const dir = getDirectionToTile(vehicle.tileX, vehicle.tileY, nextTile.x, nextTile.y);
          if (dir) vehicle.direction = dir;
        } else if (returnPath && returnPath.length === 1) {
          if (vehicle.type === 'fire_truck') {
            activeFiresRef.current.delete(targetKey);
          } else {
            activeCrimesRef.current.delete(targetKey);
          }
          continue;
        } else {
          if (vehicle.type === 'fire_truck') {
            activeFiresRef.current.delete(targetKey);
          } else {
            activeCrimesRef.current.delete(targetKey);
          }
          continue;
        }
      }
      
      updatedVehicles.push(vehicle);
      continue;
    }
    
    if (!isRoadTile(currentGrid, currentGridSize, vehicle.tileX, vehicle.tileY)) {
      const targetKey = `${vehicle.targetX},${vehicle.targetY}`;
      if (vehicle.type === 'fire_truck') {
        activeFiresRef.current.delete(targetKey);
      } else {
        activeCrimesRef.current.delete(targetKey);
        activeCrimeIncidentsRef.current.delete(targetKey);
      }
      continue;
    }
    
    if (vehicle.tileX < 0 || vehicle.tileX >= currentGridSize || 
        vehicle.tileY < 0 || vehicle.tileY >= currentGridSize) {
      const targetKey = `${vehicle.targetX},${vehicle.targetY}`;
      if (vehicle.type === 'fire_truck') {
        activeFiresRef.current.delete(targetKey);
      } else {
        activeCrimesRef.current.delete(targetKey);
        activeCrimeIncidentsRef.current.delete(targetKey);
      }
      continue;
    }
    
    vehicle.progress += vehicle.speed * delta * speedMultiplier;
    let shouldRemove = false;
    
    if (vehicle.path.length === 1 && vehicle.state === 'dispatching') {
      vehicle.state = 'responding';
      vehicle.respondTime = 0;
      vehicle.progress = 0;
      updatedVehicles.push(vehicle);
      continue;
    }
    
    while (vehicle.progress >= 1 && vehicle.pathIndex < vehicle.path.length - 1) {
      vehicle.pathIndex++;
      vehicle.progress -= 1;
      
      const currentTile = vehicle.path[vehicle.pathIndex];
      
      if (currentTile.x < 0 || currentTile.x >= currentGridSize || 
          currentTile.y < 0 || currentTile.y >= currentGridSize) {
        shouldRemove = true;
        break;
      }
      
      vehicle.tileX = currentTile.x;
      vehicle.tileY = currentTile.y;
      
      if (vehicle.pathIndex >= vehicle.path.length - 1) {
        if (vehicle.state === 'dispatching') {
          vehicle.state = 'responding';
          vehicle.respondTime = 0;
          vehicle.progress = 0;
        } else if (vehicle.state === 'returning') {
          shouldRemove = true;
        }
        break;
      }
      
      if (vehicle.pathIndex + 1 < vehicle.path.length) {
        const nextTile = vehicle.path[vehicle.pathIndex + 1];
        const dir = getDirectionToTile(vehicle.tileX, vehicle.tileY, nextTile.x, nextTile.y);
        if (dir) vehicle.direction = dir;
      }
    }
    
    if (shouldRemove) {
      const targetKey = `${vehicle.targetX},${vehicle.targetY}`;
      if (vehicle.type === 'fire_truck') {
        activeFiresRef.current.delete(targetKey);
      } else {
        activeCrimesRef.current.delete(targetKey);
        activeCrimeIncidentsRef.current.delete(targetKey);
      }
      continue;
    }
    
    updatedVehicles.push(vehicle);
  }
  
  return updatedVehicles;
}

// Draw emergency vehicles
export function drawEmergencyVehicles(
  ctx: CanvasRenderingContext2D,
  worldState: WorldRenderState,
  emergencyVehicles: EmergencyVehicle[]
): void {
  const { offset: currentOffset, zoom: currentZoom, grid: currentGrid, gridSize: currentGridSize } = worldState;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  
  if (!currentGrid || currentGridSize <= 0 || emergencyVehicles.length === 0) {
    return;
  }
  
  ctx.save();
  ctx.scale(dpr * currentZoom, dpr * currentZoom);
  ctx.translate(currentOffset.x / currentZoom, currentOffset.y / currentZoom);
  
  const viewWidth = canvas.width / (dpr * currentZoom);
  const viewHeight = canvas.height / (dpr * currentZoom);
  const viewLeft = -currentOffset.x / currentZoom - TILE_WIDTH;
  const viewTop = -currentOffset.y / currentZoom - TILE_HEIGHT * 2;
  const viewRight = viewWidth - currentOffset.x / currentZoom + TILE_WIDTH;
  const viewBottom = viewHeight - currentOffset.y / currentZoom + TILE_HEIGHT * 2;
  
  emergencyVehicles.forEach(vehicle => {
    const { screenX, screenY } = gridToScreen(vehicle.tileX, vehicle.tileY, 0, 0);
    const centerX = screenX + TILE_WIDTH / 2;
    const centerY = screenY + TILE_HEIGHT / 2;
    const meta = DIRECTION_META[vehicle.direction];
    const vehicleX = centerX + meta.vec.dx * vehicle.progress + meta.normal.nx * vehicle.laneOffset;
    const vehicleY = centerY + meta.vec.dy * vehicle.progress + meta.normal.ny * vehicle.laneOffset;
    
    if (vehicleX < viewLeft - 40 || vehicleX > viewRight + 40 || vehicleY < viewTop - 60 || vehicleY > viewBottom + 60) {
      return;
    }
    
    ctx.save();
    ctx.translate(vehicleX, vehicleY);
    ctx.rotate(meta.angle);
    
    const scale = 0.6;
    const bodyColor = vehicle.type === 'fire_truck' ? '#dc2626' : '#1e40af';
    const length = vehicle.type === 'fire_truck' ? 14 : 11;
    
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-length * scale, -5 * scale);
    ctx.lineTo(length * scale, -5 * scale);
    ctx.lineTo((length + 2) * scale, 0);
    ctx.lineTo(length * scale, 5 * scale);
    ctx.lineTo(-length * scale, 5 * scale);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = vehicle.type === 'fire_truck' ? '#fbbf24' : '#ffffff';
    ctx.fillRect(-length * scale * 0.5, -3 * scale, length * scale, 6 * scale * 0.3);
    
    ctx.fillStyle = 'rgba(200, 220, 255, 0.7)';
    ctx.fillRect(-2 * scale, -3 * scale, 5 * scale, 6 * scale);
    
    const flashOn = Math.sin(vehicle.flashTimer) > 0;
    const flashOn2 = Math.sin(vehicle.flashTimer + Math.PI) > 0;
    
    if (vehicle.type === 'fire_truck') {
      ctx.fillStyle = flashOn ? '#ff0000' : '#880000';
      ctx.fillRect(-6 * scale, -7 * scale, 3 * scale, 3 * scale);
      ctx.fillStyle = flashOn2 ? '#ff0000' : '#880000';
      ctx.fillRect(3 * scale, -7 * scale, 3 * scale, 3 * scale);
      
      if (flashOn || flashOn2) {
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.fillRect(-8 * scale, -8 * scale, 16 * scale, 4 * scale);
        ctx.shadowBlur = 0;
      }
    } else {
      ctx.fillStyle = flashOn ? '#ff0000' : '#880000';
      ctx.fillRect(-5 * scale, -7 * scale, 3 * scale, 3 * scale);
      ctx.fillStyle = flashOn2 ? '#0066ff' : '#003388';
      ctx.fillRect(2 * scale, -7 * scale, 3 * scale, 3 * scale);
      
      if (flashOn || flashOn2) {
        ctx.shadowColor = flashOn ? '#ff0000' : '#0066ff';
        ctx.shadowBlur = 6;
        ctx.fillStyle = flashOn ? 'rgba(255, 0, 0, 0.4)' : 'rgba(0, 100, 255, 0.4)';
        ctx.fillRect(-7 * scale, -8 * scale, 14 * scale, 4 * scale);
        ctx.shadowBlur = 0;
      }
    }
    
    ctx.fillStyle = '#111827';
    ctx.fillRect(-length * scale, -4 * scale, 2 * scale, 8 * scale);
    
    ctx.restore();
  });
  
  ctx.restore();
}
