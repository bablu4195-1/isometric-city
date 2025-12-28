/**
 * SimCity Zone Types
 * 
 * Defines the zone system for residential, commercial, and industrial development.
 */

// ============================================================================
// Zone Types
// ============================================================================

/** Zone type for land use designation */
export type ZoneType = 'none' | 'residential' | 'commercial' | 'industrial';

/** Zone colors for rendering */
export const ZONE_COLORS: Record<ZoneType, string> = {
  none: 'transparent',
  residential: 'rgba(0, 200, 0, 0.3)',    // Green
  commercial: 'rgba(0, 0, 200, 0.3)',     // Blue
  industrial: 'rgba(200, 200, 0, 0.3)',   // Yellow
};

/** Zone outline colors */
export const ZONE_OUTLINE_COLORS: Record<ZoneType, string> = {
  none: 'transparent',
  residential: 'rgba(0, 150, 0, 0.5)',
  commercial: 'rgba(0, 0, 150, 0.5)',
  industrial: 'rgba(150, 150, 0, 0.5)',
};

// ============================================================================
// Zone Demand Calculations
// ============================================================================

/**
 * Factors that affect zone demand
 */
export interface DemandFactors {
  /** Population affects commercial demand */
  population: number;
  /** Jobs affects residential demand */
  jobs: number;
  /** Commercial capacity affects industrial demand */
  commercialCapacity: number;
  /** Tax rate affects all demand */
  taxRate: number;
  /** Happiness bonus */
  happiness: number;
  /** Service coverage bonus */
  serviceCoverage: number;
}

/**
 * Calculate demand levels based on city factors
 */
export function calculateDemand(factors: DemandFactors): {
  residential: number;
  commercial: number;
  industrial: number;
} {
  const {
    population,
    jobs,
    commercialCapacity,
    taxRate,
    happiness,
    serviceCoverage,
  } = factors;
  
  // Base demand calculations
  const baseResidential = Math.max(0, jobs - population * 0.5);
  const baseCommercial = Math.max(0, population * 0.3 - commercialCapacity * 0.5);
  const baseIndustrial = Math.max(0, commercialCapacity * 0.4);
  
  // Tax penalty (higher taxes reduce demand)
  const taxPenalty = Math.max(0, 1 - (taxRate - 5) * 0.02);
  
  // Happiness bonus
  const happinessBonus = 1 + (happiness - 50) * 0.01;
  
  // Service bonus
  const serviceBonus = 1 + serviceCoverage * 0.1;
  
  // Apply modifiers
  const modifier = taxPenalty * happinessBonus * serviceBonus;
  
  return {
    residential: Math.round(baseResidential * modifier),
    commercial: Math.round(baseCommercial * modifier),
    industrial: Math.round(baseIndustrial * modifier),
  };
}

// ============================================================================
// Zone Growth
// ============================================================================

/**
 * Factors that determine if a zone tile can grow/develop
 */
export interface GrowthFactors {
  /** Zone type */
  zone: ZoneType;
  /** Has power connection */
  powered: boolean;
  /** Has water connection */
  watered: boolean;
  /** Adjacent to road */
  hasRoadAccess: boolean;
  /** Land value of tile */
  landValue: number;
  /** Current demand for this zone type */
  demand: number;
  /** Pollution level */
  pollution: number;
  /** Crime level */
  crime: number;
}

/**
 * Check if a zone tile can develop
 */
export function canZoneDevelop(factors: GrowthFactors): boolean {
  const { zone, powered, watered, hasRoadAccess, demand } = factors;
  
  // Must be a valid zone type
  if (zone === 'none') return false;
  
  // Must have basic infrastructure (or be a starter building)
  if (!hasRoadAccess) return false;
  
  // Must have positive demand (or enough for starter buildings)
  if (demand <= 0) return false;
  
  // Utilities required for larger buildings
  const requiresUtilities = demand > 10;
  if (requiresUtilities && (!powered || !watered)) return false;
  
  return true;
}
