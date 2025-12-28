/**
 * SimCity Game Module
 * 
 * This module contains all SimCity-specific game logic, including:
 * - City simulation (economy, zones, services)
 * - Building types and evolution
 * - Traffic and vehicle systems
 * - Budget and tax management
 * 
 * The architecture separates game-specific logic from the shared
 * core rendering engine, enabling future game modes to reuse the
 * isometric renderer while implementing different gameplay.
 */

// SimCity-specific types
export * from './types';
