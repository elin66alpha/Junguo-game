import { HOUSING_TIERS, TERRAIN } from "../model/constants.js";
import {
  baseGrainCapacity,
  baseClothCapacity,
  baseWoodCapacity,
  farmOutputForMonth,
  farmSeasonInfo,
  granaryCapacity,
  housingGrainUse,
  housingTax,
  laborScale,
  lumberOutput,
  seasonalRandomizedAmount,
  upkeepCost,
  workshopOutput,
  warehouseClothCapacity,
  warehouseWoodCapacity,
  LUMBER_FOREST_DEPLETION_CHANCE
} from "../model/formulas.js";
import { activeBuildings, effectiveLaborLevel, getBuildingDef } from "./BuildingSystem.js";
import { getTile } from "./TerrainSystem.js";
import { servicesAt } from "./ServiceSystem.js";
import { workshopHotspotBonus } from "./HotspotSystem.js";
import { edictGrainConsumeMultiplier, edictTaxMultiplier } from "./EdictSystem.js";
import { modifierMultiplier } from "./EventSystem.js";
import { marketCommercialTax } from "./MarketSystem.js";
import { farmWonderMultiplier } from "./WonderSystem.js";
import { addEvent } from "./GameState.js";

function resetBreakdowns(state) {
  for (const key of Object.keys(state.resourceBreakdowns)) {
    state.resourceBreakdowns[key] = { sources: [], sinks: [] };
    state.lastDeltas[key] = 0;
  }
}

function addSource(state, key, label, amount) {
  if (amount <= 0) return;
  state.resourceBreakdowns[key].sources.push({ label, amount });
  state.lastDeltas[key] += amount;
}

function addSink(state, key, label, amount) {
  if (amount <= 0) return;
  state.resourceBreakdowns[key].sinks.push({ label, amount });
  state.lastDeltas[key] -= amount;
}

function setDerivedResource(state, key, previousValue, nextValue, label) {
  state.resources[key] = nextValue;
  state.lastDeltas[key] = nextValue - previousValue;
  state.resourceBreakdowns[key].sources.push({ label, amount: nextValue });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function calculateLabor(state) {
  const previousPopulation = state.resources.labor;
  state.population = state.buildings.reduce((sum, building) => sum + (building.residents || 0), 0);

  // Active completed buildings consume labor at their effective level
  // (upgrade-in-progress treats the new level as already drawing workers).
  let demand = activeBuildings(state).reduce((sum, building) => {
    const def = getBuildingDef(state, building.type);
    return sum + def.labor * effectiveLaborLevel(building);
  }, 0);
  // Buildings under construction also draw labor. Without this, building
  // sprees were free of workforce cost.
  demand += state.buildings
    .filter((b) => b.status === "constructing")
    .reduce((sum, b) => sum + getBuildingDef(state, b.type).labor, 0);

  state.laborDemand = demand;
  state.laborScale = laborScale(state.population, demand);
  setDerivedResource(state, "labor", previousPopulation, state.population, "现有人口");
}

export function updateResourceCaps(state) {
  const granaryCap = activeBuildings(state, "granary")
    .reduce((sum, building) => sum + granaryCapacity(building.level || 1), 0);
  const warehouseWoodCap = activeBuildings(state, "warehouse")
    .reduce((sum, building) => sum + warehouseWoodCapacity(building.level || 1), 0);
  const warehouseClothCap = activeBuildings(state, "warehouse")
    .reduce((sum, building) => sum + warehouseClothCapacity(building.level || 1), 0);
  state.resourceCaps = {
    ...(state.resourceCaps || {}),
    grain: baseGrainCapacity() + granaryCap,
    wood: baseWoodCapacity() + warehouseWoodCap,
    cloth: baseClothCapacity() + warehouseClothCap
  };
}

// Returns true if the lumber camp has any forest tile within its radius.
// As a side effect, randomly converts an adjacent forest tile to plain to
// represent lumber depletion. Deterministic via state.rng.
function lumberHasForestAndDeplete(state, camp, def) {
  const r = def.radius || 3;
  const cx = camp.x + Math.floor(def.footprint.w / 2);
  const cy = camp.y + Math.floor(def.footprint.h / 2);
  const forestTiles = [];
  for (let oy = -r; oy <= r; oy += 1) {
    for (let ox = -r; ox <= r; ox += 1) {
      const tx = cx + ox;
      const ty = cy + oy;
      const tile = getTile(state, tx, ty);
      if (tile?.terrain === TERRAIN.FOREST) forestTiles.push(tile);
    }
  }
  if (forestTiles.length === 0) return false;
  // Random chance to deplete one tile per camp per month, scaled by camp level.
  const level = effectiveLaborLevel(camp);
  if (state.rng.next() < LUMBER_FOREST_DEPLETION_CHANCE * level) {
    const idx = state.rng.integer(0, forestTiles.length - 1);
    const tile = forestTiles[idx];
    tile.terrain = TERRAIN.PLAIN;
    addEvent(state, `${camp.name} 砍伐了一块林地。`);
  }
  return true;
}

export function runProduction(state) {
  resetBreakdowns(state);
  calculateLabor(state);
  updateResourceCaps(state);

  let baseGrainProduced = 0;
  const farmYieldModifier = modifierMultiplier(state, "farmYield") * farmWonderMultiplier(state);
  for (const farm of activeBuildings(state, "farm")) {
    const tile = getTile(state, farm.x, farm.y);
    const service = servicesAt(state, farm.x, farm.y);
    const base = farmOutputForMonth(state.monthIndex, tile.terrain, service.water, state.laborScale, farm.level || 1);
    baseGrainProduced += Math.floor(base * farmYieldModifier);
  }

  let baseClothProduced = 0;
  for (const workshop of activeBuildings(state, "workshop")) {
    const bonus = workshopHotspotBonus(state, workshop);
    baseClothProduced += Math.floor(workshopOutput(state.laborScale, workshop.level || 1) * bonus);
  }

  let baseWoodProduced = 0;
  for (const camp of activeBuildings(state, "lumberCamp")) {
    const def = getBuildingDef(state, camp.type);
    const hasForest = lumberHasForestAndDeplete(state, camp, def);
    baseWoodProduced += lumberOutput(state.laborScale, camp.level || 1, hasForest);
  }

  const taxMultiplier = edictTaxMultiplier(state);
  const baseCoinProduced = Math.floor(activeBuildings(state)
    .filter((building) => building.category === "housing" && HOUSING_TIERS[building.housingTier])
    .reduce((sum, building) => sum + housingTax(building.residents || 0, building.housingTier), 0) * taxMultiplier);
  const baseMarketTax = Math.floor(marketCommercialTax(state) * taxMultiplier);

  const grainProduced = seasonalRandomizedAmount(state.rng, state.resources.grain, baseGrainProduced);
  const clothProduced = seasonalRandomizedAmount(state.rng, state.resources.cloth, baseClothProduced);
  const woodProduced = seasonalRandomizedAmount(state.rng, state.resources.wood ?? 0, baseWoodProduced);
  const coinProduced = seasonalRandomizedAmount(state.rng, state.resources.coin, baseCoinProduced);
  const marketTaxProduced = seasonalRandomizedAmount(state.rng, state.resources.coin, baseMarketTax);

  const grainCapacity = state.resourceCaps?.grain ?? baseGrainCapacity();
  const grainRoom = Math.max(0, grainCapacity - state.resources.grain);
  const grainStored = Math.min(grainRoom, grainProduced);
  const grainOverflow = Math.max(0, grainProduced - grainStored);
  state.resources.grain += grainStored;
  const clothCapacity = state.resourceCaps?.cloth ?? baseClothCapacity();
  const clothRoom = Math.max(0, clothCapacity - (state.resources.cloth ?? 0));
  const clothStored = Math.min(clothRoom, clothProduced);
  const clothOverflow = Math.max(0, clothProduced - clothStored);
  state.resources.cloth = (state.resources.cloth ?? 0) + clothStored;

  // Wood stockpile cap: overflow rots like grain.
  const woodCap = state.resourceCaps?.wood ?? baseWoodCapacity();
  const currentWood = state.resources.wood ?? 0;
  const woodRoom = Math.max(0, woodCap - currentWood);
  const woodStored = Math.min(woodRoom, woodProduced);
  const woodOverflow = Math.max(0, woodProduced - woodStored);
  state.resources.wood = currentWood + woodStored;

  state.resources.coin += coinProduced;
  state.resources.coin += marketTaxProduced;
  addSource(state, "grain", `农田产出（${farmSeasonInfo(state.monthIndex).label}）`, grainProduced);
  if (grainOverflow > 0) addSink(state, "grain", "仓容不足损耗", grainOverflow);
  addSource(state, "cloth", "作坊产出", clothProduced);
  if (clothOverflow > 0) addSink(state, "cloth", "布仓不足损耗", clothOverflow);
  addSource(state, "wood", "伐木场产出", woodProduced);
  if (woodOverflow > 0) addSink(state, "wood", "木仓不足损耗", woodOverflow);
  addSource(state, "coin", `住房税收 ${taxMultiplier !== 1 ? `×${taxMultiplier.toFixed(1)}` : ""}`.trim(), coinProduced);
  addSource(state, "coin", "市场商税", marketTaxProduced);

  // Floating numbers for visible production at building level
  state.floatingNumbers = state.floatingNumbers || [];
  for (const farm of activeBuildings(state, "farm")) {
    const tile = getTile(state, farm.x, farm.y);
    const service = servicesAt(state, farm.x, farm.y);
    const out = Math.floor(farmOutputForMonth(state.monthIndex, tile.terrain, service.water, state.laborScale, farm.level || 1) * farmYieldModifier);
    if (out > 0) state.floatingNumbers.push({ x: farm.x + 1, y: farm.y, text: `+${out} 粮`, ttl: 90, color: "#f7d57b" });
  }
  for (const workshop of activeBuildings(state, "workshop")) {
    const bonus = workshopHotspotBonus(state, workshop);
    const out = Math.floor(workshopOutput(state.laborScale, workshop.level || 1) * bonus);
    if (out > 0) state.floatingNumbers.push({ x: workshop.x + 1, y: workshop.y, text: `+${out} 布`, ttl: 90, color: "#cfe7ff" });
  }
  for (const camp of activeBuildings(state, "lumberCamp")) {
    const def = getBuildingDef(state, camp.type);
    const r = def.radius || 3;
    const cx = camp.x + Math.floor(def.footprint.w / 2);
    const cy = camp.y + Math.floor(def.footprint.h / 2);
    let hasForest = false;
    for (let oy = -r; oy <= r && !hasForest; oy += 1) {
      for (let ox = -r; ox <= r && !hasForest; ox += 1) {
        const tile = getTile(state, cx + ox, cy + oy);
        if (tile?.terrain === TERRAIN.FOREST) hasForest = true;
      }
    }
    const out = lumberOutput(state.laborScale, camp.level || 1, hasForest);
    if (out > 0) state.floatingNumbers.push({ x: camp.x + 1, y: camp.y, text: `+${out} 木`, ttl: 90, color: "#d6c89a" });
  }
}

export function runConsumption(state) {
  const consumeMultiplier = edictGrainConsumeMultiplier(state);
  const activeHousing = activeBuildings(state).filter((building) => building.category === "housing" && HOUSING_TIERS[building.housingTier]);
  const baseGrainNeed = Math.ceil(activeHousing.reduce((sum, building) => sum + housingGrainUse(building.residents || 0), 0) * consumeMultiplier);
  const baseClothNeed = activeHousing.reduce((sum, building) => sum + HOUSING_TIERS[building.housingTier].clothUse, 0);
  const baseUpkeep = activeBuildings(state).reduce((sum, building) => sum + upkeepCost(getBuildingDef(state, building.type), building), 0);

  const grainNeed = seasonalRandomizedAmount(state.rng, state.resources.grain, baseGrainNeed);
  const clothNeed = seasonalRandomizedAmount(state.rng, state.resources.cloth, baseClothNeed);
  const upkeep = seasonalRandomizedAmount(state.rng, state.resources.coin, baseUpkeep);

  const grainUsed = Math.min(state.resources.grain, grainNeed);
  const clothUsed = Math.min(state.resources.cloth, clothNeed);
  const coinUsed = upkeep;
  state.resources.grain -= grainUsed;
  state.resources.cloth -= clothUsed;
  state.resources.coin -= coinUsed;
  addSink(state, "grain", consumeMultiplier !== 1 ? `住房口粮 ×${consumeMultiplier.toFixed(2)}` : "住房口粮", grainUsed);
  addSink(state, "cloth", "高级住房用布", clothUsed);
  addSink(state, "coin", "建筑维护（按等级递增）", coinUsed);

  state.foodRatio = grainNeed <= 0 ? 1 : grainUsed / grainNeed;
  state.clothRatio = clothNeed <= 0 ? 1 : clothUsed / clothNeed;
}
