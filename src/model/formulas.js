import {
  BASE_GRAIN_CAPACITY,
  BASE_CLOTH_CAPACITY,
  BASE_WOOD_CAPACITY,
  HOUSING_TIERS,
  TRIBUTE_BASE,
  TRIBUTE_PER_MILESTONE,
  TRIBUTE_PER_PRESTIGE_TIER,
  TRIBUTE_PRESTIGE_TIER_SIZE
} from "./constants.js";

export const HOUSING_FILL_PER_MONTH = 2;
export const UPGRADE_STREAK_MONTHS = 2;
export const DOWNGRADE_STREAK_MONTHS = 2;
export const GRANARY_CAPACITY_PER_LEVEL = [160, 320, 540, 800, 1100];
export const WAREHOUSE_WOOD_CAPACITY_PER_LEVEL = 200;
export const WAREHOUSE_CLOTH_CAPACITY_PER_LEVEL = 500;
export const WELL_DRY_MONTHS = 2;

// Lumber camp: base output per month at level 1, multiplied by laborScale.
// Adjacent forest tiles (within radius) double the yield.
export const LUMBER_BASE_OUTPUT = 4;
export const LUMBER_FOREST_BONUS = 2;
export const LUMBER_FOREST_DEPLETION_CHANCE = 0.08;

export function laborScale(supply, demand) {
  if (demand <= 0) return 1;
  return Math.min(1, supply / demand);
}

export function farmSeasonInfo(monthIndex) {
  const monthInYear = monthIndex % 12;
  if (monthInYear <= 1 || monthInYear >= 10) return { key: "winter", label: "冬闲", baseOutput: 2 };
  if (monthInYear <= 4) return { key: "spring", label: "春耕", baseOutput: 8 };
  if (monthInYear <= 7) return { key: "summer", label: "夏长", baseOutput: 14 };
  return { key: "autumn", label: "秋收", baseOutput: 36 };
}

export function farmOutputForMonth(monthIndex, terrain, hasWater, scale, level = 1) {
  if (!hasWater) return 0;
  let output = farmSeasonInfo(monthIndex).baseOutput;
  if (terrain === "fertile") output *= 1.25;
  if (terrain === "riverbank") output *= 1.25;
  if (terrain === "wetland") output *= 0.5;
  return Math.floor(output * scale * level);
}

export function seasonalRandomizedAmount(rng, currentValue, baseAmount) {
  if (baseAmount <= 0) return 0;
  const baseLimit = Math.floor(baseAmount * 0.1);
  const valueLimit = Math.floor(Math.max(0, currentValue) * 0.1);
  const maxDelta = Math.max(0, Math.min(baseLimit, valueLimit));
  if (maxDelta === 0) return Math.floor(baseAmount);
  return Math.max(0, Math.floor(baseAmount + rng.integer(-maxDelta, maxDelta)));
}

export function workshopOutput(scale, level = 1) {
  return Math.floor(8 * scale * level);
}

// Lumber camp output. forestNearby is a count of adjacent forest tiles within
// the camp's radius (capped at 1 for the multiplier — we just need any forest).
export function lumberOutput(scale, level = 1, hasForest = false) {
  const base = LUMBER_BASE_OUTPUT * (hasForest ? LUMBER_FOREST_BONUS : 1);
  return Math.floor(base * scale * level);
}

export function granaryCapacity(level = 1) {
  return GRANARY_CAPACITY_PER_LEVEL[Math.max(0, Math.min(GRANARY_CAPACITY_PER_LEVEL.length - 1, level - 1))];
}

export function warehouseWoodCapacity(level = 1) {
  return WAREHOUSE_WOOD_CAPACITY_PER_LEVEL * Math.max(1, level || 1);
}

export function warehouseClothCapacity(level = 1) {
  return WAREHOUSE_CLOTH_CAPACITY_PER_LEVEL * Math.max(1, level || 1);
}

export function baseGrainCapacity() {
  return BASE_GRAIN_CAPACITY;
}

export function baseWoodCapacity() {
  return BASE_WOOD_CAPACITY;
}

export function baseClothCapacity() {
  return BASE_CLOTH_CAPACITY;
}

export function housingTax(residents, tier) {
  return Math.floor(residents * HOUSING_TIERS[tier].taxPerResident);
}

export function housingGrainUse(residents) {
  return Math.ceil(residents * 0.1);
}

// Maintenance cost grows quadratically with level so upgrading is a real
// trade-off, not just pay-for-better. Roads (cost 1) still round up to ≥1 but
// stay cheap.
export function upkeepCost(def, building) {
  const level = building.level || 1;
  const factor = 0.08 + 0.04 * level * level;  // L1: 0.12  L2: 0.24  L3: 0.44
  return Math.ceil(def.cost * factor);
}

// Upgrade pricing is formula-driven (M5a). Cost scales as base × (L−1)^1.7
// where L is the next level — so L2 costs 1× base, L3 ≈ 3.25×, L4 ≈ 6.5×,
// L5 ≈ 10.6×. Wood mirrors the same curve. Seasons scale linearly with level.
// Per-building override arrays are still consulted first for save-game and
// special-case compatibility.
export const UPGRADE_COST_EXPONENT = 1.7;

export function upgradeCost(def, building) {
  const nextLevel = (building.level || 1) + 1;
  if (!def.maxLevel || nextLevel > def.maxLevel) return null;
  if (def.upgradeCosts?.[nextLevel - 2] != null) return def.upgradeCosts[nextLevel - 2];
  return Math.ceil(def.cost * Math.pow(nextLevel - 1, UPGRADE_COST_EXPONENT));
}

export function upgradeWoodCost(def, building) {
  const nextLevel = (building.level || 1) + 1;
  if (!def.maxLevel || nextLevel > def.maxLevel) return null;
  if (def.upgradeWoodCosts?.[nextLevel - 2] != null) return def.upgradeWoodCosts[nextLevel - 2];
  const base = def.woodCost || 0;
  if (base <= 0) return 0;
  return Math.ceil(base * Math.pow(nextLevel - 1, UPGRADE_COST_EXPONENT));
}

export function upgradeClothCost(def, building) {
  const nextLevel = (building.level || 1) + 1;
  if (!def.maxLevel || nextLevel > def.maxLevel) return null;
  if (def.upgradeClothCosts?.[nextLevel - 2] != null) return def.upgradeClothCosts[nextLevel - 2];
  const base = def.clothCost || 0;
  if (base <= 0) return 0;
  return Math.ceil(base * Math.pow(nextLevel - 1, UPGRADE_COST_EXPONENT));
}

export function upgradeSeasons(def, building) {
  const nextLevel = (building.level || 1) + 1;
  if (!def.maxLevel || nextLevel > def.maxLevel) return null;
  if (def.upgradeSeasons?.[nextLevel - 2] != null) return def.upgradeSeasons[nextLevel - 2];
  return Math.max(2, nextLevel);
}

export function annualTribute(state) {
  const milestones = (state.milestonesAwarded || []).length;
  const prestigeTiers = Math.floor((state.indicators?.prestige ?? 0) / TRIBUTE_PRESTIGE_TIER_SIZE);
  return TRIBUTE_BASE + milestones * TRIBUTE_PER_MILESTONE + prestigeTiers * TRIBUTE_PER_PRESTIGE_TIER;
}

export function serviceRadius(def, building) {
  return (def.radius || 0) + Math.max(0, (building.level || 1) - 1) * 2;
}

export function clampIndicator(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateMorale({ foodRatio, waterCoverage, clothCoverage, shrineCoverage, disconnectedRatio, edictDelta = 0, eventDelta = 0 }) {
  return clampIndicator(
    50 +
      Math.round(foodRatio * 20) +
      Math.round(shrineCoverage * 10) -
      Math.round((1 - waterCoverage) * 20) -
      Math.round((1 - clothCoverage) * 10) -
      Math.round(disconnectedRatio * 15) +
      edictDelta +
      eventDelta
  );
}

export function schoolOrderBonus(levelTotal = 0) {
  return Math.min(8, Math.max(0, levelTotal) * 2);
}

export function magistrateOfficeOrderBonus(levelTotal = 0) {
  if (levelTotal <= 0) return 0;
  return Math.min(20, 3 + Math.max(0, levelTotal) * 5);
}

export function calculateOrder({
  marketCoverage,
  hasSchool,
  hasMagistrateOffice,
  schoolBonus,
  magistrateOfficeBonus,
  schoolLevelTotal,
  magistrateOfficeLevelTotal,
  disconnectedRatio,
  edictDelta = 0,
  eventDelta = 0
}) {
  const resolvedSchoolBonus = schoolBonus ?? (schoolLevelTotal != null ? schoolOrderBonus(schoolLevelTotal) : (hasSchool ? 2 : 0));
  const resolvedOfficeBonus = magistrateOfficeBonus ?? (magistrateOfficeLevelTotal != null ? magistrateOfficeOrderBonus(magistrateOfficeLevelTotal) : (hasMagistrateOffice ? 8 : 0));

  return clampIndicator(
    50 +
      resolvedSchoolBonus +
      resolvedOfficeBonus -
      Math.round((1 - marketCoverage) * 10) -
      Math.round(disconnectedRatio * 10) +
      edictDelta +
      eventDelta
  );
}

export function calculatePrestige({ hasSchool, hasMagistrateOffice, topTierHomes, milestoneCount = 0, civicLevels, eventDelta = 0 }) {
  return clampIndicator((hasSchool ? 10 : 0) + (hasMagistrateOffice ? 6 : 0) + topTierHomes * 3 + milestoneCount * 5 + civicLevels * 2 + eventDelta);
}
