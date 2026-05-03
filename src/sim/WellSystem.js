import { TERRAIN } from "../model/constants.js";
import { WELL_DRY_MONTHS } from "../model/formulas.js";
import { activeBuildings } from "./BuildingSystem.js";
import { addEvent } from "./GameState.js";
import { getTile } from "./TerrainSystem.js";

function nearRiver(state, x, y, radius = 3) {
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) > radius) continue;
      if (getTile(state, x + ox, y + oy)?.terrain === TERRAIN.RIVER) return true;
    }
  }
  return false;
}

function dryChance(state, well) {
  const month = state.monthIndex % 12;
  const summer = month >= 4 && month <= 7;
  const riverSafe = nearRiver(state, well.x, well.y);
  const levelReduction = Math.max(0, (well.level || 1) - 1) * 0.01;
  const base = (summer ? 0.07 : 0.025) + (riverSafe ? -0.015 : 0.01);
  return Math.max(0.005, base - levelReduction);
}

export function updateWells(state) {
  const recovered = new Set();
  for (const well of state.buildings.filter((building) => building.type === "well")) {
    if ((well.dryMonthsRemaining || 0) > 0) {
      well.dryMonthsRemaining -= 1;
      if (well.dryMonthsRemaining <= 0) {
        well.dryMonthsRemaining = 0;
        recovered.add(well.id);
        addEvent(state, `${well.name} 水脉恢复。`);
      }
    }
  }

  for (const well of activeBuildings(state, "well")) {
    if (recovered.has(well.id)) continue;
    if ((well.dryMonthsRemaining || 0) > 0) continue;
    if (state.rng.next() < dryChance(state, well)) {
      well.dryMonthsRemaining = WELL_DRY_MONTHS;
      addEvent(state, `${well.name} 暂时枯竭，${WELL_DRY_MONTHS} 月内不提供水源。`, "warn");
    }
  }
}

export function isWellDry(well) {
  return (well?.dryMonthsRemaining || 0) > 0;
}
