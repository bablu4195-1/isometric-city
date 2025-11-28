import { useEffect, useRef } from 'react';
import { Car, EmergencyVehicle, Airplane, Helicopter, Boat, Pedestrian, Firework, FactorySmog, WorldRenderState } from './types';
import { updateCars, drawCars } from './vehicleSystem';
import { updateEmergencyVehicles, drawEmergencyVehicles } from './emergencyVehicleSystem';
import { updateAirplanes } from './airplaneSystem';
import { updateHelicopters } from './helicopterSystem';
import { updateBoats, drawBoats } from './boatSystem';
import { spawnCrimeIncidents, updateCrimeIncidents, drawIncidentIndicators, CrimeIncident } from './incidentSystem';
import { updateFireworks, drawFireworks } from './fireworkSystem';
import { updateSmog, drawSmog } from './smogSystem';
import { drawAirplanes as drawAirplanesUtil, drawHelicopters as drawHelicoptersUtil } from './drawAircraft';
import { drawPedestrians as drawPedestriansUtil } from './drawPedestrians';
import { GameState } from '@/types/game';

export function useAnimationLoop(
  carsCanvasRef: React.RefObject<HTMLCanvasElement>,
  worldStateRef: React.MutableRefObject<WorldRenderState>,
  carsRef: React.MutableRefObject<Car[]>,
  carIdRef: React.MutableRefObject<number>,
  carSpawnTimerRef: React.MutableRefObject<number>,
  emergencyVehiclesRef: React.MutableRefObject<EmergencyVehicle[]>,
  emergencyVehicleIdRef: React.MutableRefObject<number>,
  emergencyDispatchTimerRef: React.MutableRefObject<number>,
  activeFiresRef: React.MutableRefObject<Set<string>>,
  activeCrimesRef: React.MutableRefObject<Set<string>>,
  activeCrimeIncidentsRef: React.MutableRefObject<Map<string, CrimeIncident>>,
  crimeSpawnTimerRef: React.MutableRefObject<number>,
  pedestriansRef: React.MutableRefObject<Pedestrian[]>,
  pedestrianIdRef: React.MutableRefObject<number>,
  pedestrianSpawnTimerRef: React.MutableRefObject<number>,
  airplanesRef: React.MutableRefObject<Airplane[]>,
  airplaneIdRef: React.MutableRefObject<number>,
  airplaneSpawnTimerRef: React.MutableRefObject<number>,
  helicoptersRef: React.MutableRefObject<Helicopter[]>,
  helicopterIdRef: React.MutableRefObject<number>,
  helicopterSpawnTimerRef: React.MutableRefObject<number>,
  boatsRef: React.MutableRefObject<Boat[]>,
  boatIdRef: React.MutableRefObject<number>,
  boatSpawnTimerRef: React.MutableRefObject<number>,
  navLightFlashTimerRef: React.MutableRefObject<number>,
  fireworksRef: React.MutableRefObject<Firework[]>,
  fireworkIdRef: React.MutableRefObject<number>,
  fireworkSpawnTimerRef: React.MutableRefObject<number>,
  fireworkShowActiveRef: React.MutableRefObject<boolean>,
  fireworkShowStartTimeRef: React.MutableRefObject<number>,
  fireworkLastHourRef: React.MutableRefObject<number>,
  factorySmogRef: React.MutableRefObject<FactorySmog[]>,
  gridVersionRef: React.MutableRefObject<number>,
  smogLastGridVersionRef: React.MutableRefObject<number>,
  incidentAnimTimeRef: React.MutableRefObject<number>,
  state: GameState,
  hour: number,
  isMobile: boolean,
  findAirportsCallback: () => { x: number; y: number }[],
  findHeliportsCallback: () => { x: number; y: number; type: 'hospital' | 'airport' | 'police' | 'mall'; size: number }[],
  findMarinasAndPiersCallback: () => { x: number; y: number }[],
  findAdjacentWaterTileCallback: (dockX: number, dockY: number) => { x: number; y: number } | null,
  generateTourWaypointsCallback: (startTileX: number, startTileY: number) => any[],
  isOverWaterCallback: (screenX: number, screenY: number) => boolean,
  findFireworkBuildingsCallback: () => { x: number; y: number; type: any }[],
  findSmogFactoriesCallback: () => { x: number; y: number; type: 'factory_medium' | 'factory_large' }[],
  updateEmergencyDispatch: () => void,
  spawnPedestrian: () => boolean,
  cachedPopulationRef: React.MutableRefObject<{ count: number; gridVersion: number }>
) {
  useEffect(() => {
    let animationFrameId = 0;
    let lastTime = performance.now();

    const animationLoop = (time: number) => {
      animationFrameId = requestAnimationFrame(animationLoop);
      
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      // Update all systems
      carsRef.current = updateCars(delta, worldStateRef.current, carsRef.current, carIdRef, carSpawnTimerRef, isMobile);
      
      emergencyVehiclesRef.current = updateEmergencyVehicles(
        delta,
        worldStateRef.current,
        emergencyVehiclesRef.current,
        activeFiresRef,
        activeCrimesRef,
        activeCrimeIncidentsRef
      );

      // Crime incidents
      spawnCrimeIncidents(delta, worldStateRef.current, state, activeCrimeIncidentsRef, crimeSpawnTimerRef);
      updateCrimeIncidents(delta, worldStateRef.current, activeCrimeIncidentsRef, activeCrimesRef);

      // Pedestrians (handled separately - already has update logic in component)
      // updatePedestrians is already called in the main component

      // Aircraft
      const airports = findAirportsCallback();
      const currentGridVersion = gridVersionRef.current;
      let totalPopulation: number;
      if (cachedPopulationRef.current.gridVersion === currentGridVersion) {
        totalPopulation = cachedPopulationRef.current.count;
      } else {
        totalPopulation = 0;
        const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
        if (currentGrid && currentGridSize > 0) {
          for (let y = 0; y < currentGridSize; y++) {
            for (let x = 0; x < currentGridSize; x++) {
              totalPopulation += currentGrid[y][x].building.population || 0;
            }
          }
        }
        cachedPopulationRef.current = { count: totalPopulation, gridVersion: currentGridVersion };
      }

      airplanesRef.current = updateAirplanes(
        delta,
        worldStateRef.current,
        airplanesRef.current,
        airplaneIdRef,
        airplaneSpawnTimerRef,
        airports,
        totalPopulation,
        isMobile
      );

      const heliports = findHeliportsCallback();
      helicoptersRef.current = updateHelicopters(
        delta,
        worldStateRef.current,
        helicoptersRef.current,
        helicopterIdRef,
        helicopterSpawnTimerRef,
        heliports,
        totalPopulation,
        isMobile
      );

      // Boats
      const docks = findMarinasAndPiersCallback();
      boatsRef.current = updateBoats(
        delta,
        worldStateRef.current,
        boatsRef.current,
        boatIdRef,
        boatSpawnTimerRef,
        docks,
        findAdjacentWaterTileCallback,
        generateTourWaypointsCallback,
        isOverWaterCallback,
        isMobile
      );

      // Fireworks
      const fireworkBuildings = findFireworkBuildingsCallback();
      fireworksRef.current = updateFireworks(
        delta,
        hour,
        worldStateRef.current,
        fireworksRef.current,
        fireworkIdRef,
        fireworkSpawnTimerRef,
        fireworkShowActiveRef,
        fireworkShowStartTimeRef,
        fireworkLastHourRef,
        fireworkBuildings,
        isMobile
      );

      // Smog
      const smogFactories = findSmogFactoriesCallback();
      factorySmogRef.current = updateSmog(
        delta,
        worldStateRef.current,
        factorySmogRef.current,
        smogFactories,
        gridVersionRef,
        smogLastGridVersionRef,
        isMobile
      );

      // Navigation lights timer
      navLightFlashTimerRef.current += delta;

      // Draw on cars canvas
      const carsCanvas = carsCanvasRef.current;
      if (carsCanvas) {
        const ctx = carsCanvas.getContext('2d');
        if (ctx) {
          // Clear canvas
          ctx.clearRect(0, 0, carsCanvas.width, carsCanvas.height);

          // Draw all dynamic entities
          drawCars(ctx, worldStateRef.current, carsRef.current);
          drawEmergencyVehicles(ctx, worldStateRef.current, emergencyVehiclesRef.current);
          
          // Draw pedestrians
          const { offset: currentOffset, zoom: currentZoom, grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
          if (currentGrid && currentGridSize > 0 && pedestriansRef.current.length > 0) {
            const canvas = ctx.canvas;
            const dpr = window.devicePixelRatio || 1;
            const PEDESTRIAN_MIN_ZOOM = 0.5;
            const minZoomForPedestrians = isMobile ? 0.8 : PEDESTRIAN_MIN_ZOOM;
            
            if (currentZoom >= minZoomForPedestrians) {
              ctx.save();
              ctx.scale(dpr * currentZoom, dpr * currentZoom);
              ctx.translate(currentOffset.x / currentZoom, currentOffset.y / currentZoom);
              
              const viewWidth = canvas.width / (dpr * currentZoom);
              const viewHeight = canvas.height / (dpr * currentZoom);
              const TILE_WIDTH = 64;
              const TILE_HEIGHT = 32;
              const viewBounds = {
                viewLeft: -currentOffset.x / currentZoom - TILE_WIDTH,
                viewTop: -currentOffset.y / currentZoom - TILE_HEIGHT * 2,
                viewRight: viewWidth - currentOffset.x / currentZoom + TILE_WIDTH,
                viewBottom: viewHeight - currentOffset.y / currentZoom + TILE_HEIGHT * 2,
              };
              
              drawPedestriansUtil(ctx, pedestriansRef.current, currentGrid, currentGridSize, viewBounds);
              ctx.restore();
            }
          }

          drawAirplanesUtil(
            ctx,
            airplanesRef.current,
            {
              viewLeft: 0,
              viewTop: 0,
              viewRight: carsCanvas.width,
              viewBottom: carsCanvas.height,
            },
            hour,
            navLightFlashTimerRef.current
          );

          drawHelicoptersUtil(
            ctx,
            helicoptersRef.current,
            {
              viewLeft: 0,
              viewTop: 0,
              viewRight: carsCanvas.width,
              viewBottom: carsCanvas.height,
            },
            hour,
            navLightFlashTimerRef.current
          );

          drawBoats(ctx, worldStateRef.current, boatsRef.current, hour);
          drawFireworks(ctx, worldStateRef.current, fireworksRef.current);
          drawSmog(ctx, worldStateRef.current, factorySmogRef.current);
          drawIncidentIndicators(ctx, delta, worldStateRef.current, activeCrimeIncidentsRef, incidentAnimTimeRef);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animationLoop);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    carsCanvasRef,
    worldStateRef,
    carsRef,
    carIdRef,
    carSpawnTimerRef,
    emergencyVehiclesRef,
    emergencyVehicleIdRef,
    emergencyDispatchTimerRef,
    activeFiresRef,
    activeCrimesRef,
    activeCrimeIncidentsRef,
    crimeSpawnTimerRef,
    pedestriansRef,
    pedestrianIdRef,
    pedestrianSpawnTimerRef,
    airplanesRef,
    airplaneIdRef,
    airplaneSpawnTimerRef,
    helicoptersRef,
    helicopterIdRef,
    helicopterSpawnTimerRef,
    boatsRef,
    boatIdRef,
    boatSpawnTimerRef,
    navLightFlashTimerRef,
    fireworksRef,
    fireworkIdRef,
    fireworkSpawnTimerRef,
    fireworkShowActiveRef,
    fireworkShowStartTimeRef,
    fireworkLastHourRef,
    factorySmogRef,
    gridVersionRef,
    smogLastGridVersionRef,
    incidentAnimTimeRef,
    state,
    hour,
    isMobile,
    findAirportsCallback,
    findHeliportsCallback,
    findMarinasAndPiersCallback,
    findAdjacentWaterTileCallback,
    generateTourWaypointsCallback,
    isOverWaterCallback,
    findFireworkBuildingsCallback,
    findSmogFactoriesCallback,
    updateEmergencyDispatch,
    spawnPedestrian,
    cachedPopulationRef,
  ]);
}
