import { activeBuildings } from "./BuildingSystem.js";

export function hasWonder(state, type) {
  return activeBuildings(state, type).length > 0;
}

export function farmWonderMultiplier(state) {
  return hasWonder(state, "lingqu") ? 1.2 : 1;
}

export function marketWonderMultiplier(state) {
  return hasWonder(state, "grandMarketTower") ? 1.4 : 1;
}

export function tradeVolatilityMultiplier(state) {
  return hasWonder(state, "grandMarketTower") ? 0.5 : 1;
}

export function festivalWonderMultiplier(state) {
  return hasWonder(state, "mountainShrine") ? 1.5 : 1;
}

export function canalGrainDiscountMultiplier(state) {
  return hasWonder(state, "lingqu") ? 0.75 : 1;
}

export function floodImmune(state) {
  return hasWonder(state, "lingqu");
}

export function tickWonderPrestige(state) {
  if (!hasWonder(state, "mountainShrine")) return;
  state.persistentPrestigeBonus = Math.min(20, (state.persistentPrestigeBonus || 0) + 1);
}
