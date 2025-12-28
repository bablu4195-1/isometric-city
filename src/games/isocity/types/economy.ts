/**
 * SimCity Economy Types
 * 
 * Types for the economic simulation including taxes, budget, and city statistics.
 */

// ============================================================================
// City Statistics
// ============================================================================

/** Demand levels for each zone type */
export interface ZoneDemand {
  residential: number;
  commercial: number;
  industrial: number;
}

/** City-wide statistics */
export interface CityStats {
  /** Total population */
  population: number;
  /** Total jobs available */
  jobs: number;
  /** Current money in treasury */
  money: number;
  /** Monthly income */
  income: number;
  /** Monthly expenses */
  expenses: number;
  /** Overall happiness (0-100) */
  happiness: number;
  /** Health rating (0-100) */
  health: number;
  /** Education rating (0-100) */
  education: number;
  /** Safety rating (0-100) */
  safety: number;
  /** Environment rating (0-100) */
  environment: number;
  /** Zone demand levels */
  demand: ZoneDemand;
}

// ============================================================================
// Budget System
// ============================================================================

/** Budget category */
export interface BudgetCategory {
  /** Category name */
  name: string;
  /** Funding level (0-100%) */
  funding: number;
  /** Base cost per month */
  cost: number;
}

/** City budget with all categories */
export interface CityBudget {
  police: BudgetCategory;
  fire: BudgetCategory;
  health: BudgetCategory;
  education: BudgetCategory;
  transportation: BudgetCategory;
  parks: BudgetCategory;
  power: BudgetCategory;
  water: BudgetCategory;
}

/** Default budget configuration */
export function createDefaultBudget(): CityBudget {
  return {
    police: { name: 'Police', funding: 100, cost: 0 },
    fire: { name: 'Fire Department', funding: 100, cost: 0 },
    health: { name: 'Health', funding: 100, cost: 0 },
    education: { name: 'Education', funding: 100, cost: 0 },
    transportation: { name: 'Transportation', funding: 100, cost: 0 },
    parks: { name: 'Parks & Recreation', funding: 100, cost: 0 },
    power: { name: 'Power', funding: 100, cost: 0 },
    water: { name: 'Water', funding: 100, cost: 0 },
  };
}

// ============================================================================
// Tax System
// ============================================================================

/** Tax rate configuration */
export interface TaxConfig {
  /** Current tax rate (0-100) */
  rate: number;
  /** Effective rate (lags behind actual rate) */
  effectiveRate: number;
  /** Speed at which effective rate catches up */
  adjustmentSpeed: number;
}

/** Default tax configuration */
export function createDefaultTaxConfig(): TaxConfig {
  return {
    rate: 9,
    effectiveRate: 9,
    adjustmentSpeed: 0.1, // 10% per month
  };
}

// ============================================================================
// History Tracking
// ============================================================================

/** Historical data point */
export interface HistoryPoint {
  year: number;
  month: number;
  population: number;
  money: number;
  happiness: number;
}

// ============================================================================
// City Info
// ============================================================================

/** Multi-city support - economy data for a city region */
export interface CityEconomy {
  population: number;
  jobs: number;
  income: number;
  expenses: number;
  happiness: number;
  lastCalculated: number;
}

/** City definition for multi-city maps */
export interface City {
  id: string;
  name: string;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  economy: CityEconomy;
  color: string;
}
