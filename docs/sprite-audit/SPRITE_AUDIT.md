# Rise of Nations Sprite Audit Report

**Generated: December 2024**
**Status: COMPREHENSIVE AUDIT COMPLETE**

## Executive Summary

This audit reviewed all 5 age-specific sprite sheets and IsoCity sprite sheets to find the optimal sprite mapping for each RoN building type across all ages.

### Key Improvements Made:
1. **Age-specific sprite mappings** - Each age now uses the most appropriate sprite for each building
2. **Farm sprites** - Now use IsoCity farm sheet with era-appropriate sprites (windmill for medieval, greenhouse for modern, etc.)
3. **Fixed incorrect mappings** - Market, stable, library, university, and many more now use correct sprites

---

## Sprite Sheets Audited

| Sheet | Path | Grid | Status |
|-------|------|------|--------|
| Classical | `/assets/ages/classics.png` | 5×6 | ✅ Audited |
| Medieval | `/assets/ages/medeival.png` | 5×6 | ✅ Audited |
| Enlightenment | `/assets/ages/enlightenment.png` | 5×6 | ✅ Audited |
| Industrial | `/assets/ages/industrial.png` | 5×6 | ✅ Audited |
| Modern | `/assets/ages/modern.png` | 5×6 | ✅ Audited |
| IsoCity Farm | `/assets/sprites_red_water_new_farm.png` | 5×6 | ✅ Audited |
| IsoCity Main | `/assets/sprites_red_water_new.png` | 5×6 | ✅ Audited |

---

## Farm Sprites - IsoCity Farm Sheet

Farms now use age-appropriate sprites from the IsoCity farm sheet:

| Age | Position | Sprite | Description |
|-----|----------|--------|-------------|
| **Classical** | (3,1) | 🍇 Vineyard | Ancient Mediterranean agriculture |
| **Medieval** | (2,4) | 🌬️ Windmill | ICONIC medieval farming symbol |
| **Enlightenment** | (2,2) | 🏚️ Storage Barn | Larger-scale agricultural operations |
| **Industrial** | (1,0) | 🐄 Dairy Farm | Red barn with silo - quintessential industrial farm |
| **Modern** | (3,4) | 🏠 Greenhouse | High-tech modern agriculture |

---

## Classical Age Mappings

| Building | Row | Col | Sprite Description |
|----------|-----|-----|-------------------|
| city_center | 5 | 2 | Large temple |
| market | 3 | 2 | Open-air market stalls |
| **library** | **0** | **1** | **Parthenon-style temple - impressive!** |
| university | 2 | 0 | Theater/amphitheater |
| temple | 2 | 2 | Fire temple/sanctuary |
| senate | 1 | 3 | Large government building |
| barracks | 2 | 3 | Colosseum (training arena) |
| stable | 3 | 4 | Small temple/cart area |
| dock | 4 | 4 | Dock with crane |
| mine | 4 | 2 | Quarry |
| smelter | 4 | 3 | Kilns/furnaces |
| granary | 5 | 0 | Warehouse |
| lumber_mill | 4 | 1 | Industrial complex |
| factory | 4 | 0 | Workshop |
| siege_factory | 4 | 1 | Industrial complex |
| tower | 2 | 1 | Watchtower |
| fort | 2 | 4 | Lighthouse/tower |
| fortress | 3 | 0 | Pantheon-style rotunda |
| castle | 0 | 0 | Large palace |

---

## Medieval Age Mappings

| Building | Row | Col | Sprite Description |
|----------|-----|-----|-------------------|
| city_center | 1 | 0 | Walled courtyard/garden |
| market | 2 | 0 | Market square with stalls |
| library | 0 | 4 | Church/chapel |
| university | 3 | 2 | Gothic stone university |
| temple | 5 | 3 | Gothic cathedral |
| senate | 5 | 2 | Classical dome building |
| barracks | 1 | 3 | Walled fortress compound |
| **stable** | **1** | **2** | **Horse paddock - PERFECT!** |
| dock | 5 | 0 | Waterfront building |
| mine | 4 | 2 | Mining complex with hoist |
| smelter | 0 | 2 | Windmill + forge |
| granary | 4 | 1 | Large barn |
| lumber_mill | 0 | 3 | Windmill |
| tower | 0 | 1 | Stone keep |
| fort | 5 | 1 | Stone fortress |
| castle | 0 | 0 | Gray stone castle |
| siege_factory | 3 | 4 | Workshop |

---

## Enlightenment Age Mappings

| Building | Row | Col | Sprite Description |
|----------|-----|-----|-------------------|
| city_center | 0 | 0 | Georgian mansion |
| market | 0 | 3 | Colonnade building |
| library | 0 | 4 | Classical columns building |
| **university** | **2** | **0** | **OBSERVATORY - Perfect for Age of Science!** |
| temple | 5 | 3 | Greek temple |
| senate | 5 | 2 | Domed capitol |
| barracks | 1 | 4 | Civic building with courtyard |
| **stable** | **5** | **0** | **Stagecoach station - PERFECT!** |
| dock | 2 | 4 | Amphitheater with harbor |
| mine | 4 | 3 | Stone mill |
| smelter | 3 | 3 | Blacksmith forge |
| granary | 4 | 1 | Warehouse with cart |
| lumber_mill | 2 | 2 | Watermill |
| factory | 0 | 2 | Early factory with waterwheel |
| fort | 5 | 1 | Stone arch/tunnel |

---

## Industrial Age Mappings

| Building | Row | Col | Sprite Description |
|----------|-----|-----|-------------------|
| city_center | 5 | 2 | Grand city hall with clock tower |
| market | 3 | 4 | Storefront shop |
| **library** | **3** | **2** | **Victorian mansion with turret - distinctive!** |
| university | 2 | 0 | Large Victorian school |
| temple | 1 | 4 | Church with steeple |
| senate | 5 | 3 | Classical columns building |
| **barracks** | **5** | **1** | **Large hangar/military depot** |
| stable | 3 | 1 | Victorian house (carriage house) |
| dock | 5 | 0 | Train station |
| mine | 4 | 2 | Mining complex |
| smelter | 4 | 3 | Steel facility |
| granary | 4 | 0 | Warehouse |
| lumber_mill | 0 | 2 | Red brick industrial building |
| **factory** | **0** | **1** | **Large factory - PERFECT!** |
| **oil_well** | **2** | **4** | **Oil derrick - PERFECT!** |
| **refinery** | **4** | **4** | **Industrial refinery** |
| siege_factory | 4 | 1 | Factory |
| bunker | 4 | 0 | Warehouse/fortified |
| fort | 0 | 3 | Gray brick building (fortified) |

---

## Modern Age Mappings

| Building | Row | Col | Sprite Description |
|----------|-----|-----|-------------------|
| city_center | 0 | 1 | Tall skyscraper |
| small_city | 0 | 0 | Glass office tower |
| large_city | 0 | 1 | Dark skyscraper |
| market | 1 | 3 | Parking garage/commercial |
| **library** | **5** | **3** | **Classical columns building** |
| university | 0 | 3 | Brick institution |
| temple | 0 | 4 | Modern church |
| **senate** | **5** | **2** | **Domed capitol - PERFECT!** |
| barracks | 5 | 1 | Military radar base |
| **airbase** | **5** | **0** | **AIRPORT with runway - native sprite!** |
| dock | 4 | 1 | Large hangar |
| smelter | 0 | 2 | Power plant |
| factory | 4 | 2 | Smokestack factory |
| **oil_well** | **4** | **4** | **Refinery towers** |
| refinery | 4 | 3 | Heavy industrial |
| auto_plant | 1 | 4 | Brick factory |
| siege_factory | 4 | 1 | Hangar |
| bunker | 5 | 1 | Military base |
| fort/fortress | 5 | 1 | Military compound |
| stable | 3 | 1 | Suburban house (garage) |

---

## Problem Sprites Identified

### Era-Inappropriate Sprites in Medieval Sheet:
- (2,1) Water tower - Should be medieval well
- (2,2) Industrial factory - Should be blacksmith
- (2,3) Modern stadium - Should be jousting grounds
- (2,4) Observatory - Should be scriptorium
- (4,4) Industrial refinery - Should be brewery

### Era-Inappropriate Sprites in Enlightenment Sheet:
- (1,2) Tennis court - Wrong era
- (2,3) Wind turbines - 21st century!
- (4,4) Modern oil refinery - Too modern
- (5,4) Carousel - 19th century

---

## Missing Building Types

Buildings that need special handling:
- **Airbase** - Uses IsoCity airport sprite (`/assets/buildings/airport.webp`)
- **Farms** - Uses IsoCity farm sheet with age-specific sprites
- **Dock** - Some ages lack proper waterfront buildings

---

## Scripts Created

### `scripts/extract-sprite.mjs`
Extract RoN building sprites:
```bash
node scripts/extract-sprite.mjs farm classical
node scripts/extract-sprite.mjs --all
node scripts/extract-sprite.mjs --list medieval
```

### `scripts/extract-isocity-sprite.mjs`
Extract IsoCity sprites:
```bash
node scripts/extract-isocity-sprite.mjs farm 2 4  # Windmill
node scripts/extract-isocity-sprite.mjs --list
node scripts/extract-isocity-sprite.mjs --farm-recommendations
```

---

## Implementation

The sprite mappings are implemented in:
- `src/games/ron/lib/renderConfig.ts` - `AGE_BUILDING_OVERRIDES` for age-specific mappings
- `src/games/ron/components/RoNCanvas.tsx` - Uses `getAgeSpritePosition()` for rendering

Age-specific farm sprites are hardcoded in `RoNCanvas.tsx` for each age.
