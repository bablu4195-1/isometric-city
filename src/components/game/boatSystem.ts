import { Boat, WorldRenderState } from './types';
import { gridToScreen } from './utils';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { BOAT_COLORS, BOAT_MIN_ZOOM, WAKE_MAX_AGE, WAKE_SPAWN_INTERVAL } from './constants';

export function updateBoats(
  delta: number,
  worldState: WorldRenderState,
  boats: Boat[],
  boatIdRef: React.MutableRefObject<number>,
  boatSpawnTimerRef: React.MutableRefObject<number>,
  docks: { x: number; y: number }[],
  findAdjacentWaterTile: (dockX: number, dockY: number) => { x: number; y: number } | null,
  generateTourWaypoints: (startTileX: number, startTileY: number) => any[],
  isOverWater: (screenX: number, screenY: number) => boolean,
  isMobile: boolean
): Boat[] {
  const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed, zoom: currentZoom } = worldState;
  
  if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
    return boats;
  }

  if (currentZoom < BOAT_MIN_ZOOM) {
    return [];
  }

  if (docks.length === 0) {
    return [];
  }

  const maxBoats = Math.min(25, docks.length * 3);
  const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 1.5 : 2;

  boatSpawnTimerRef.current -= delta;
  if (boats.length < maxBoats && boatSpawnTimerRef.current <= 0) {
    const homeDock = docks[Math.floor(Math.random() * docks.length)];
    const waterTile = findAdjacentWaterTile(homeDock.x, homeDock.y);
    
    if (waterTile) {
      const tourWaypoints = generateTourWaypoints(waterTile.x, waterTile.y);
      const { screenX: originScreenX, screenY: originScreenY } = gridToScreen(waterTile.x, waterTile.y, 0, 0);
      const homeScreenX = originScreenX + TILE_WIDTH / 2;
      const homeScreenY = originScreenY + TILE_HEIGHT / 2;
      
      let firstDestScreenX = homeScreenX;
      let firstDestScreenY = homeScreenY;
      if (tourWaypoints.length > 0) {
        firstDestScreenX = tourWaypoints[0].screenX;
        firstDestScreenY = tourWaypoints[0].screenY;
      }
      
      const angle = Math.atan2(firstDestScreenY - originScreenY, firstDestScreenX - originScreenX);
      
      boats.push({
        id: boatIdRef.current++,
        x: homeScreenX,
        y: homeScreenY,
        angle: angle,
        targetAngle: angle,
        state: 'departing',
        speed: 15 + Math.random() * 10,
        originX: homeDock.x,
        originY: homeDock.y,
        destX: homeDock.x,
        destY: homeDock.y,
        destScreenX: firstDestScreenX,
        destScreenY: firstDestScreenY,
        age: 0,
        color: BOAT_COLORS[Math.floor(Math.random() * BOAT_COLORS.length)],
        wake: [],
        wakeSpawnProgress: 0,
        sizeVariant: Math.random() < 0.7 ? 0 : 1,
        tourWaypoints: tourWaypoints,
        tourWaypointIndex: 0,
        homeScreenX: homeScreenX,
        homeScreenY: homeScreenY,
      });
    }
    
    boatSpawnTimerRef.current = 1 + Math.random() * 2;
  }

  const updatedBoats: Boat[] = [];
  
  for (const boat of boats) {
    boat.age += delta;
    
    const wakeMaxAge = isMobile ? 0.6 : WAKE_MAX_AGE;
    boat.wake = boat.wake
      .map(p => ({ ...p, age: p.age + delta, opacity: Math.max(0, 1 - p.age / wakeMaxAge) }))
      .filter(p => p.age < wakeMaxAge);
    
    const distToDest = Math.hypot(boat.x - boat.destScreenX, boat.y - boat.destScreenY);
    let nextX = boat.x;
    let nextY = boat.y;
    
    switch (boat.state) {
      case 'departing': {
        nextX = boat.x + Math.cos(boat.angle) * boat.speed * delta * speedMultiplier;
        nextY = boat.y + Math.sin(boat.angle) * boat.speed * delta * speedMultiplier;
        
        if (boat.age > 2) {
          if (boat.tourWaypoints.length > 0) {
            boat.state = 'touring';
            boat.tourWaypointIndex = 0;
            boat.destScreenX = boat.tourWaypoints[0].screenX;
            boat.destScreenY = boat.tourWaypoints[0].screenY;
          } else {
            boat.state = 'sailing';
            boat.destScreenX = boat.homeScreenX;
            boat.destScreenY = boat.homeScreenY;
          }
        }
        break;
      }
      
      case 'touring': {
        const angleToWaypoint = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
        boat.targetAngle = angleToWaypoint;
        
        let angleDiff = boat.targetAngle - boat.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        boat.angle += angleDiff * Math.min(1, delta * 1.8);
        
        nextX = boat.x + Math.cos(boat.angle) * boat.speed * delta * speedMultiplier;
        nextY = boat.y + Math.sin(boat.angle) * boat.speed * delta * speedMultiplier;
        
        if (distToDest < 40) {
          boat.tourWaypointIndex++;
          
          if (boat.tourWaypointIndex < boat.tourWaypoints.length) {
            const nextWaypoint = boat.tourWaypoints[boat.tourWaypointIndex];
            boat.destScreenX = nextWaypoint.screenX;
            boat.destScreenY = nextWaypoint.screenY;
          } else {
            boat.state = 'sailing';
            boat.destScreenX = boat.homeScreenX;
            boat.destScreenY = boat.homeScreenY;
            boat.age = 0;
          }
        }
        
        if (boat.age > 120) {
          continue;
        }
        break;
      }
      
      case 'sailing': {
        const angleToDestination = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
        boat.targetAngle = angleToDestination;
        
        let angleDiff = boat.targetAngle - boat.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        boat.angle += angleDiff * Math.min(1, delta * 2);
        
        nextX = boat.x + Math.cos(boat.angle) * boat.speed * delta * speedMultiplier;
        nextY = boat.y + Math.sin(boat.angle) * boat.speed * delta * speedMultiplier;
        
        if (distToDest < 60) {
          boat.state = 'arriving';
        }
        
        if (boat.age > 60) {
          continue;
        }
        break;
      }
      
      case 'arriving': {
        boat.speed = Math.max(5, boat.speed - delta * 8);
        
        const angleToDestination = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
        boat.targetAngle = angleToDestination;
        
        let angleDiff = boat.targetAngle - boat.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        boat.angle += angleDiff * Math.min(1, delta * 3);
        
        nextX = boat.x + Math.cos(boat.angle) * boat.speed * delta * speedMultiplier;
        nextY = boat.y + Math.sin(boat.angle) * boat.speed * delta * speedMultiplier;
        
        if (distToDest < 15) {
          boat.state = 'docked';
          boat.age = 0;
          boat.wake = [];
        }
        break;
      }
      
      case 'docked': {
        if (boat.age > 3 + Math.random() * 3) {
          const waterTile = findAdjacentWaterTile(boat.originX, boat.originY);
          if (waterTile) {
            boat.tourWaypoints = generateTourWaypoints(waterTile.x, waterTile.y);
            boat.tourWaypointIndex = 0;
          }
          
          boat.state = 'departing';
          boat.speed = 15 + Math.random() * 10;
          boat.age = 0;
          
          if (boat.tourWaypoints.length > 0) {
            boat.destScreenX = boat.tourWaypoints[0].screenX;
            boat.destScreenY = boat.tourWaypoints[0].screenY;
          } else {
            boat.destScreenX = boat.homeScreenX + (Math.random() - 0.5) * 200;
            boat.destScreenY = boat.homeScreenY + (Math.random() - 0.5) * 200;
          }
          
          const angle = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
          boat.angle = angle;
          boat.targetAngle = angle;
        }
        break;
      }
    }
    
    if (boat.state !== 'docked') {
      if (!isOverWater(nextX, nextY)) {
        continue;
      }
      
      boat.x = nextX;
      boat.y = nextY;
      
      const wakeSpawnInterval = isMobile ? 0.08 : WAKE_SPAWN_INTERVAL;
      boat.wakeSpawnProgress += delta;
      if (boat.wakeSpawnProgress >= wakeSpawnInterval) {
        boat.wakeSpawnProgress -= wakeSpawnInterval;
        const behindBoat = -6;
        boat.wake.push({
          x: boat.x + Math.cos(boat.angle) * behindBoat,
          y: boat.y + Math.sin(boat.angle) * behindBoat,
          age: 0,
          opacity: 1
        });
      }
    }
    
    updatedBoats.push(boat);
  }
  
  return updatedBoats;
}

export function drawBoats(
  ctx: CanvasRenderingContext2D,
  worldState: WorldRenderState,
  boats: Boat[],
  hour: number
): void {
  const { offset: currentOffset, zoom: currentZoom, grid: currentGrid, gridSize: currentGridSize } = worldState;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  
  if (currentZoom < BOAT_MIN_ZOOM) {
    return;
  }
  
  if (!currentGrid || currentGridSize <= 0 || boats.length === 0) {
    return;
  }
  
  ctx.save();
  ctx.scale(dpr * currentZoom, dpr * currentZoom);
  ctx.translate(currentOffset.x / currentZoom, currentOffset.y / currentZoom);
  
  const viewWidth = canvas.width / (dpr * currentZoom);
  const viewHeight = canvas.height / (dpr * currentZoom);
  const viewLeft = -currentOffset.x / currentZoom - 100;
  const viewTop = -currentOffset.y / currentZoom - 100;
  const viewRight = viewWidth - currentOffset.x / currentZoom + 100;
  const viewBottom = viewHeight - currentOffset.y / currentZoom + 100;
  
  for (const boat of boats) {
    // Draw wake particles first
    if (boat.wake.length > 0) {
      for (const particle of boat.wake) {
        if (particle.x < viewLeft || particle.x > viewRight || particle.y < viewTop || particle.y > viewBottom) {
          continue;
        }
        
        const size = 1.2 + particle.age * 2;
        const opacity = particle.opacity * 0.5;
        
        ctx.fillStyle = `rgba(200, 220, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    if (boat.x < viewLeft || boat.x > viewRight || boat.y < viewTop || boat.y > viewBottom) {
      continue;
    }
    
    ctx.save();
    ctx.translate(boat.x, boat.y);
    ctx.rotate(boat.angle);
    
    const scale = boat.sizeVariant === 0 ? 0.5 : 0.65;
    ctx.scale(scale, scale);
    
    // Draw foam when moving
    if (boat.state !== 'docked') {
      const foamOpacity = Math.min(0.5, boat.speed / 30);
      ctx.fillStyle = `rgba(255, 255, 255, ${foamOpacity})`;
      ctx.beginPath();
      ctx.ellipse(-7, 0, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw boat hull
    ctx.fillStyle = boat.color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(8, -4, 0, -4);
    ctx.lineTo(-8, -3);
    ctx.lineTo(-8, 3);
    ctx.lineTo(0, 4);
    ctx.quadraticCurveTo(8, 4, 10, 0);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    const hullHSL = boat.color === '#ffffff' ? 'hsl(0, 0%, 95%)' : 
                    boat.color === '#1e3a5f' ? 'hsl(210, 52%, 35%)' :
                    boat.color === '#8b4513' ? 'hsl(30, 75%, 40%)' :
                    boat.color === '#2f4f4f' ? 'hsl(180, 25%, 35%)' :
                    boat.color === '#c41e3a' ? 'hsl(350, 75%, 50%)' :
                    'hsl(210, 80%, 50%)';
    ctx.fillStyle = hullHSL;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(-3, -1.5, 4, 3);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(-3, -1.5, 4, 3);
    
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(2, -8);
    ctx.stroke();
    
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(5, -7);
    ctx.lineTo(2, -6);
    ctx.closePath();
    ctx.fill();
    
    const isNight = hour >= 20 || hour < 6;
    if (isNight) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffcc';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(2, -9, 0.8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ff3333';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(-6, 2, 0.6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#33ff33';
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(-6, -2, 0.6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    }
    
    ctx.restore();
  }
  
  ctx.restore();
}
