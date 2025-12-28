/**
 * SimCity Building Types
 * 
 * Defines all building types available in the SimCity game mode.
 * These include residential, commercial, industrial, and special buildings.
 */

import { BaseBuilding } from '../../../core/types/grid';

// ============================================================================
// Building Type Enums
// ============================================================================

/** All SimCity building types */
export type SimCityBuildingType =
  // Terrain
  | 'empty'
  | 'grass'
  | 'water'
  // Infrastructure
  | 'road'
  | 'bridge'
  | 'rail'
  | 'tree'
  // Residential
  | 'house_small'
  | 'house_medium'
  | 'mansion'
  | 'apartment_low'
  | 'apartment_high'
  // Commercial
  | 'shop_small'
  | 'shop_medium'
  | 'office_low'
  | 'office_high'
  | 'mall'
  // Industrial
  | 'factory_small'
  | 'factory_medium'
  | 'factory_large'
  | 'warehouse'
  // Services
  | 'police_station'
  | 'fire_station'
  | 'hospital'
  | 'school'
  | 'university'
  // Parks & Recreation
  | 'park'
  | 'park_large'
  | 'tennis'
  | 'basketball_courts'
  | 'playground_small'
  | 'playground_large'
  | 'baseball_field_small'
  | 'soccer_field_small'
  | 'football_field'
  | 'baseball_stadium'
  | 'community_center'
  | 'office_building_small'
  | 'swimming_pool'
  | 'skate_park'
  | 'mini_golf_course'
  | 'bleachers_field'
  | 'go_kart_track'
  | 'amphitheater'
  | 'greenhouse_garden'
  | 'animal_pens_farm'
  | 'cabin_house'
  | 'campground'
  | 'marina_docks_small'
  | 'pier_large'
  | 'roller_coaster_small'
  | 'community_garden'
  | 'pond_park'
  | 'park_gate'
  | 'mountain_lodge'
  | 'mountain_trailhead'
  // Utilities
  | 'power_plant'
  | 'water_tower'
  // Transportation
  | 'subway_station'
  | 'rail_station'
  // Special
  | 'stadium'
  | 'museum'
  | 'airport'
  | 'space_program'
  | 'city_hall'
  | 'amusement_park';

// ============================================================================
// SimCity Building Interface
// ============================================================================

/** Bridge configuration types */
export type BridgeType = 'small' | 'medium' | 'large' | 'suspension';
export type BridgeOrientation = 'ns' | 'ew';
export type BridgeTrackType = 'road' | 'rail';

/**
 * SimCity Building - extends BaseBuilding with city-builder specific properties
 */
export interface SimCityBuilding extends BaseBuilding {
  type: SimCityBuildingType;
  /** Building level (1-5 for evolving buildings) */
  level: number;
  /** Current population living in this building */
  population: number;
  /** Current jobs provided by this building */
  jobs: number;
  /** Is this building powered? */
  powered: boolean;
  /** Is this building connected to water? */
  watered: boolean;
  /** Is this building on fire? */
  onFire: boolean;
  /** Fire damage progress (0-100) */
  fireProgress: number;
  /** Is this building abandoned? */
  abandoned: boolean;
  /** Horizontally flip the sprite (for waterfront buildings) */
  flipped?: boolean;
  /** City ID for multi-city support */
  cityId?: string;
  // Bridge-specific properties
  bridgeType?: BridgeType;
  bridgeOrientation?: BridgeOrientation;
  bridgeVariant?: number;
  bridgePosition?: 'start' | 'middle' | 'end';
  bridgeIndex?: number;
  bridgeSpan?: number;
  bridgeTrackType?: BridgeTrackType;
}

// ============================================================================
// Building Stats
// ============================================================================

/** Stats for each building type */
export interface BuildingStats {
  /** Maximum population capacity */
  maxPop: number;
  /** Maximum jobs provided */
  maxJobs: number;
  /** Pollution generated (negative = reduces pollution) */
  pollution: number;
  /** Land value effect */
  landValue: number;
}

/** Building size (for placement validation) */
export function getBuildingSize(buildingType: SimCityBuildingType): number {
  const sizes: Partial<Record<SimCityBuildingType, number>> = {
    hospital: 2,
    school: 2,
    university: 3,
    park_large: 3,
    power_plant: 2,
    rail_station: 2,
    stadium: 3,
    museum: 3,
    airport: 4,
    space_program: 3,
    city_hall: 2,
    amusement_park: 4,
    playground_large: 2,
    baseball_field_small: 2,
    football_field: 2,
    baseball_stadium: 3,
    mini_golf_course: 2,
    go_kart_track: 2,
    amphitheater: 2,
    greenhouse_garden: 2,
    marina_docks_small: 2,
    roller_coaster_small: 2,
    mountain_lodge: 2,
    mountain_trailhead: 3,
  };
  
  return sizes[buildingType] ?? 1;
}

// ============================================================================
// Building Categories
// ============================================================================

/** Residential buildings in evolution order */
export const RESIDENTIAL_BUILDINGS: SimCityBuildingType[] = [
  'house_small',
  'house_medium',
  'mansion',
  'apartment_low',
  'apartment_high',
];

/** Commercial buildings in evolution order */
export const COMMERCIAL_BUILDINGS: SimCityBuildingType[] = [
  'shop_small',
  'shop_medium',
  'office_low',
  'office_high',
  'mall',
];

/** Industrial buildings in evolution order */
export const INDUSTRIAL_BUILDINGS: SimCityBuildingType[] = [
  'factory_small',
  'factory_medium',
  'warehouse',
  'factory_large',
  'factory_large',
];

/** Service buildings */
export const SERVICE_BUILDINGS: SimCityBuildingType[] = [
  'police_station',
  'fire_station',
  'hospital',
  'school',
  'university',
];

/** Park and recreation buildings */
export const RECREATION_BUILDINGS: SimCityBuildingType[] = [
  'park',
  'park_large',
  'tennis',
  'basketball_courts',
  'playground_small',
  'playground_large',
  'baseball_field_small',
  'soccer_field_small',
  'football_field',
  'baseball_stadium',
  'swimming_pool',
  'skate_park',
  'mini_golf_course',
  'amphitheater',
  'stadium',
  'amusement_park',
];
