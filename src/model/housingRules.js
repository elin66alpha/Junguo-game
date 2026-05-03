import { HOUSING_TIER_ORDER } from "./constants.js";

export const MANSION_TIER_ORDER = ["mansion1", "mansion2", "mansion3"];

export const HOUSING_UPGRADE_COSTS = {
  tile: { coin: 20, wood: 6, months: 2 },
  courtyard: { coin: 60, wood: 12, months: 3 },
  compound: { coin: 110, wood: 18, months: 4 },
  manor: { coin: 180, wood: 28, months: 5 },
  estate: { coin: 280, wood: 42, months: 6 },
  noble: { coin: 420, wood: 60, months: 7 }
};

export function tierIndex(tier) {
  return HOUSING_TIER_ORDER.indexOf(tier);
}

export function mansionTierIndex(tier) {
  return MANSION_TIER_ORDER.indexOf(tier);
}

export function isMansionTier(tier) {
  return mansionTierIndex(tier) >= 0;
}

export function isPrestigeHousingTier(tier) {
  return tierIndex(tier) >= tierIndex("manor") || isMansionTier(tier);
}

export function nextHousingTier(tier) {
  if (isMansionTier(tier)) {
    return MANSION_TIER_ORDER[Math.min(MANSION_TIER_ORDER.length - 1, mansionTierIndex(tier) + 1)];
  }
  if (tierIndex(tier) < 0) return tier;
  return HOUSING_TIER_ORDER[Math.min(HOUSING_TIER_ORDER.length - 1, tierIndex(tier) + 1)];
}

export function lowerHousingTier(tier) {
  if (isMansionTier(tier)) {
    return MANSION_TIER_ORDER[Math.max(0, mansionTierIndex(tier) - 1)];
  }
  if (tierIndex(tier) < 0) return tier;
  return HOUSING_TIER_ORDER[Math.max(0, tierIndex(tier) - 1)];
}

export function housingRequirementsForTier(state, tier, service) {
  if (tier === "hut") return true;
  if (tier === "tile") return service.water && service.grain && state.indicators.morale >= 40;
  if (tier === "courtyard") return service.water && service.grain && service.cloth && service.shrine && service.schoolCountywide && state.indicators.morale >= 60;
  if (tier === "compound") return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 68 && state.indicators.order >= 45;
  if (tier === "manor") return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 75 && state.indicators.order >= 55 && state.indicators.prestige >= 15;
  if (tier === "estate") return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 80 && state.indicators.order >= 60 && state.indicators.prestige >= 25;
  if (tier === "mansion1") return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 65 && state.indicators.order >= 45 && state.indicators.prestige >= 10;
  if (tier === "mansion2") return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 76 && state.indicators.order >= 55 && state.indicators.prestige >= 25;
  if (tier === "mansion3") return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 84 && state.indicators.order >= 65 && state.indicators.prestige >= 40;
  return service.water && service.grain && service.cloth && service.market && service.shrine && service.schoolCountywide && state.indicators.morale >= 85 && state.indicators.order >= 65 && state.indicators.prestige >= 40;
}

export function housingUpgradeCost(tier) {
  return HOUSING_UPGRADE_COSTS[tier] || null;
}
