import { WorldRenderState } from './types';
import { gridToScreen } from './utils';
import { TILE_WIDTH, TILE_HEIGHT } from './types';
import { GameState } from '@/types/game';

// Crime incident type
export type CrimeIncident = {
  x: number;
  y: number;
  type: 'robbery' | 'burglary' | 'disturbance' | 'traffic';
  timeRemaining: number;
};

// Spawn crime incidents
export function spawnCrimeIncidents(
  delta: number,
  worldState: WorldRenderState,
  state: GameState,
  activeCrimeIncidentsRef: React.MutableRefObject<Map<string, CrimeIncident>>,
  crimeSpawnTimerRef: React.MutableRefObject<number>
): void {
  const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed } = worldState;
  if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) return;
  
  const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 2 : 3;
  crimeSpawnTimerRef.current -= delta * speedMultiplier;
  
  if (crimeSpawnTimerRef.current > 0) return;
  crimeSpawnTimerRef.current = 3 + Math.random() * 2;
  
  const eligibleTiles: { x: number; y: number; policeCoverage: number }[] = [];
  
  for (let y = 0; y < currentGridSize; y++) {
    for (let x = 0; x < currentGridSize; x++) {
      const tile = currentGrid[y][x];
      const isBuilding = tile.building.type !== 'grass' && 
          tile.building.type !== 'water' && 
          tile.building.type !== 'road' && 
          tile.building.type !== 'tree' &&
          tile.building.type !== 'empty';
      const hasActivity = tile.building.population > 0 || tile.building.jobs > 0;
      
      if (isBuilding && hasActivity) {
        const policeCoverage = state.services.police[y]?.[x] || 0;
        eligibleTiles.push({ x, y, policeCoverage });
      }
    }
  }
  
  if (eligibleTiles.length === 0) return;
  
  const avgCoverage = eligibleTiles.reduce((sum, t) => sum + t.policeCoverage, 0) / eligibleTiles.length;
  const baseChance = avgCoverage < 20 ? 0.4 : avgCoverage < 40 ? 0.25 : avgCoverage < 60 ? 0.15 : 0.08;
  
  const population = state.stats.population;
  const maxActiveCrimes = Math.max(2, Math.floor(population / 500));
  
  if (activeCrimeIncidentsRef.current.size >= maxActiveCrimes) return;
  
  const crimesToSpawn = Math.random() < 0.3 ? 2 : 1;
  
  for (let i = 0; i < crimesToSpawn; i++) {
    if (activeCrimeIncidentsRef.current.size >= maxActiveCrimes) break;
    if (Math.random() > baseChance) continue;
    
    const weightedTiles = eligibleTiles.filter(t => {
      const key = `${t.x},${t.y}`;
      if (activeCrimeIncidentsRef.current.has(key)) return false;
      const weight = Math.max(0.1, 1 - t.policeCoverage / 100);
      return Math.random() < weight;
    });
    
    if (weightedTiles.length === 0) continue;
    
    const target = weightedTiles[Math.floor(Math.random() * weightedTiles.length)];
    const key = `${target.x},${target.y}`;
    
    const crimeTypes: Array<'robbery' | 'burglary' | 'disturbance' | 'traffic'> = 
      ['robbery', 'burglary', 'disturbance', 'traffic'];
    const crimeType = crimeTypes[Math.floor(Math.random() * crimeTypes.length)];
    const duration = crimeType === 'traffic' ? 15 : crimeType === 'disturbance' ? 20 : 30;
    
    activeCrimeIncidentsRef.current.set(key, {
      x: target.x,
      y: target.y,
      type: crimeType,
      timeRemaining: duration,
    });
  }
}

// Update crime incidents
export function updateCrimeIncidents(
  delta: number,
  worldState: WorldRenderState,
  activeCrimeIncidentsRef: React.MutableRefObject<Map<string, CrimeIncident>>,
  activeCrimesRef: React.MutableRefObject<Set<string>>
): void {
  const { speed: currentSpeed } = worldState;
  if (currentSpeed === 0) return;
  
  const speedMultiplier = currentSpeed === 1 ? 1 : currentSpeed === 2 ? 2 : 3;
  const keysToDelete: string[] = [];
  
  activeCrimeIncidentsRef.current.forEach((crime, key) => {
    if (activeCrimesRef.current.has(key)) return;
    
    const newTimeRemaining = crime.timeRemaining - delta * speedMultiplier;
    if (newTimeRemaining <= 0) {
      keysToDelete.push(key);
    } else {
      activeCrimeIncidentsRef.current.set(key, { ...crime, timeRemaining: newTimeRemaining });
    }
  });
  
  keysToDelete.forEach(key => activeCrimeIncidentsRef.current.delete(key));
}

// Draw incident indicators
export function drawIncidentIndicators(
  ctx: CanvasRenderingContext2D,
  delta: number,
  worldState: WorldRenderState,
  activeCrimeIncidentsRef: React.MutableRefObject<Map<string, CrimeIncident>>,
  incidentAnimTimeRef: React.MutableRefObject<number>
): void {
  const { offset: currentOffset, zoom: currentZoom, grid: currentGrid, gridSize: currentGridSize } = worldState;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  
  if (!currentGrid || currentGridSize <= 0) return;
  
  incidentAnimTimeRef.current += delta;
  const animTime = incidentAnimTimeRef.current;
  
  ctx.save();
  ctx.scale(dpr * currentZoom, dpr * currentZoom);
  ctx.translate(currentOffset.x / currentZoom, currentOffset.y / currentZoom);
  
  const viewWidth = canvas.width / (dpr * currentZoom);
  const viewHeight = canvas.height / (dpr * currentZoom);
  const viewLeft = -currentOffset.x / currentZoom - TILE_WIDTH * 2;
  const viewTop = -currentOffset.y / currentZoom - TILE_HEIGHT * 4;
  const viewRight = viewWidth - currentOffset.x / currentZoom + TILE_WIDTH * 2;
  const viewBottom = viewHeight - currentOffset.y / currentZoom + TILE_HEIGHT * 4;
  
  // Draw crime incident indicators
  activeCrimeIncidentsRef.current.forEach((crime) => {
    const { screenX, screenY } = gridToScreen(crime.x, crime.y, 0, 0);
    const centerX = screenX + TILE_WIDTH / 2;
    const centerY = screenY + TILE_HEIGHT / 2;
    
    if (centerX < viewLeft || centerX > viewRight || centerY < viewTop || centerY > viewBottom) {
      return;
    }
    
    const pulse = Math.sin(animTime * 4) * 0.3 + 0.7;
    const outerPulse = Math.sin(animTime * 3) * 0.5 + 0.5;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY - 8, 18 + outerPulse * 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(59, 130, 246, ${0.25 * (1 - outerPulse)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    const gradient = ctx.createRadialGradient(centerX, centerY - 8, 0, centerX, centerY - 8, 14 * pulse);
    gradient.addColorStop(0, `rgba(59, 130, 246, ${0.5 * pulse})`);
    gradient.addColorStop(0.5, `rgba(59, 130, 246, ${0.2 * pulse})`);
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.beginPath();
    ctx.arc(centerX, centerY - 8, 14 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.save();
    ctx.translate(centerX, centerY - 12);
    
    ctx.fillStyle = `rgba(30, 64, 175, ${0.9 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, -4);
    ctx.lineTo(6, 2);
    ctx.quadraticCurveTo(0, 8, 0, 8);
    ctx.quadraticCurveTo(0, 8, -6, 2);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = `rgba(147, 197, 253, ${pulse})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-1, -4, 2, 5);
    ctx.beginPath();
    ctx.arc(0, 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
  
  // Draw fire indicators
  for (let y = 0; y < currentGridSize; y++) {
    for (let x = 0; x < currentGridSize; x++) {
      const tile = currentGrid[y][x];
      if (!tile.building.onFire) continue;
      
      const { screenX, screenY } = gridToScreen(x, y, 0, 0);
      const centerX = screenX + TILE_WIDTH / 2;
      const centerY = screenY + TILE_HEIGHT / 2;
      
      if (centerX < viewLeft || centerX > viewRight || centerY < viewTop || centerY > viewBottom) {
        continue;
      }
      
      const pulse = Math.sin(animTime * 6) * 0.3 + 0.7;
      const outerPulse = Math.sin(animTime * 4) * 0.5 + 0.5;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY - 12, 22 + outerPulse * 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 * (1 - outerPulse)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.save();
      ctx.translate(centerX, centerY - 15);
      
      ctx.fillStyle = `rgba(220, 38, 38, ${0.9 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(8, 5);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = `rgba(252, 165, 165, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.quadraticCurveTo(2.5, 0, 2, 2.5);
      ctx.quadraticCurveTo(0.5, 1.5, 0, 2.5);
      ctx.quadraticCurveTo(-0.5, 1.5, -2, 2.5);
      ctx.quadraticCurveTo(-2.5, 0, 0, -3);
      ctx.fill();
      
      ctx.restore();
    }
  }
  
  ctx.restore();
}
