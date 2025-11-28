import { Car, CarDirection, WorldRenderState } from './types';
import { isRoadTile, getDirectionOptions, pickNextDirection, gridToScreen } from './utils';
import { CAR_COLORS, DIRECTION_META } from './constants';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { BuildingType, Tile } from '@/types/game';

// Car spawning
export function spawnRandomCar(
  worldState: WorldRenderState,
  cars: Car[],
  carIdRef: React.MutableRefObject<number>
): boolean {
  const { grid: currentGrid, gridSize: currentGridSize } = worldState;
  if (!currentGrid || currentGridSize <= 0) return false;
  
  for (let attempt = 0; attempt < 20; attempt++) {
    const tileX = Math.floor(Math.random() * currentGridSize);
    const tileY = Math.floor(Math.random() * currentGridSize);
    if (!isRoadTile(currentGrid, currentGridSize, tileX, tileY)) continue;
    
    const options = getDirectionOptions(currentGrid, currentGridSize, tileX, tileY);
    if (options.length === 0) continue;
    
    const direction = options[Math.floor(Math.random() * options.length)];
    cars.push({
      id: carIdRef.current++,
      tileX,
      tileY,
      direction,
      progress: Math.random() * 0.8,
      speed: (0.35 + Math.random() * 0.35) * 0.7,
      age: 0,
      maxAge: 1800 + Math.random() * 2700,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      laneOffset: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3),
    });
    return true;
  }
  
  return false;
}

// Car updates
export function updateCars(
  delta: number,
  worldState: WorldRenderState,
  cars: Car[],
  carIdRef: React.MutableRefObject<number>,
  carSpawnTimerRef: React.MutableRefObject<number>,
  isMobile: boolean
): Car[] {
  const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldState;
  if (!currentGrid || currentGridSize <= 0) {
    return [];
  }
  
  // Speed multiplier: 0 = paused, 1 = normal, 2 = fast (2x), 3 = very fast (4x)
  const speedMultiplier = currentSpeed === 0 ? 0 : currentSpeed === 1 ? 1 : currentSpeed === 2 ? 2.5 : 4;
  
  // Reduce max cars on mobile for better performance
  const baseMaxCars = 160;
  const maxCars = Math.min(baseMaxCars, Math.max(16, Math.floor(currentGridSize * 2)));
  carSpawnTimerRef.current -= delta;
  if (cars.length < maxCars && carSpawnTimerRef.current <= 0) {
    if (spawnRandomCar(worldState, cars, carIdRef)) {
      carSpawnTimerRef.current = 0.9 + Math.random() * 1.3;
    } else {
      carSpawnTimerRef.current = 0.5;
    }
  }
  
  const updatedCars: Car[] = [];
  for (const car of [...cars]) {
    let alive = true;
    
    car.age += delta;
    if (car.age > car.maxAge) {
      continue;
    }
    
    if (!isRoadTile(currentGrid, currentGridSize, car.tileX, car.tileY)) {
      continue;
    }
    
    car.progress += car.speed * delta * speedMultiplier;
    let guard = 0;
    while (car.progress >= 1 && guard < 4) {
      guard++;
      const meta = DIRECTION_META[car.direction];
      car.tileX += meta.step.x;
      car.tileY += meta.step.y;
      
      if (!isRoadTile(currentGrid, currentGridSize, car.tileX, car.tileY)) {
        alive = false;
        break;
      }
      
      car.progress -= 1;
      const nextDirection = pickNextDirection(car.direction, currentGrid, currentGridSize, car.tileX, car.tileY);
      if (!nextDirection) {
        alive = false;
        break;
      }
      car.direction = nextDirection;
    }
    
    if (alive) {
      updatedCars.push(car);
    }
  }
  
  return updatedCars;
}

// Check if car is behind a building
function isCarBehindBuilding(
  carTileX: number,
  carTileY: number,
  currentGrid: Tile[][],
  currentGridSize: number
): boolean {
  const carDepth = carTileX + carTileY;
  
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const checkX = carTileX + dx;
      const checkY = carTileY + dy;
      
      if (checkX < 0 || checkY < 0 || checkX >= currentGridSize || checkY >= currentGridSize) {
        continue;
      }
      
      const tile = currentGrid[checkY]?.[checkX];
      if (!tile) continue;
      
      const buildingType = tile.building.type;
      const skipTypes: BuildingType[] = ['road', 'grass', 'empty', 'water', 'tree'];
      if (skipTypes.includes(buildingType)) {
        continue;
      }
      
      const buildingDepth = checkX + checkY;
      if (buildingDepth > carDepth) {
        return true;
      }
    }
  }
  
  return false;
}

// Draw cars
export function drawCars(
  ctx: CanvasRenderingContext2D,
  worldState: WorldRenderState,
  cars: Car[]
): void {
  const { offset: currentOffset, zoom: currentZoom, grid: currentGrid, gridSize: currentGridSize } = worldState;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!currentGrid || currentGridSize <= 0 || cars.length === 0) {
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
  
  cars.forEach(car => {
    const { screenX, screenY } = gridToScreen(car.tileX, car.tileY, 0, 0);
    const centerX = screenX + TILE_WIDTH / 2;
    const centerY = screenY + TILE_HEIGHT / 2;
    const meta = DIRECTION_META[car.direction];
    const carX = centerX + meta.vec.dx * car.progress + meta.normal.nx * car.laneOffset;
    const carY = centerY + meta.vec.dy * car.progress + meta.normal.ny * car.laneOffset;
    
    if (carX < viewLeft - 40 || carX > viewRight + 40 || carY < viewTop - 60 || carY > viewBottom + 60) {
      return;
    }
    
    // Check if car is behind a building
    if (isCarBehindBuilding(car.tileX, car.tileY, currentGrid, currentGridSize)) {
      return;
    }
    
    ctx.save();
    ctx.translate(carX, carY);
    ctx.rotate(meta.angle);
    
    const scale = 0.7;
    
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.moveTo(-10 * scale, -5 * scale);
    ctx.lineTo(10 * scale, -5 * scale);
    ctx.lineTo(12 * scale, 0);
    ctx.lineTo(10 * scale, 5 * scale);
    ctx.lineTo(-10 * scale, 5 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Windshield
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(-4 * scale, -2.8 * scale, 7 * scale, 5.6 * scale);
    
    // Rear
    ctx.fillStyle = '#111827';
    ctx.fillRect(-10 * scale, -4 * scale, 2.4 * scale, 8 * scale);
    
    ctx.restore();
  });
  
  ctx.restore();
}
