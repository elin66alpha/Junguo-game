import { HOUSING_TIERS } from "../model/constants.js";
import { DOWNGRADE_STREAK_MONTHS, HOUSING_FILL_PER_MONTH, UPGRADE_STREAK_MONTHS } from "../model/formulas.js";
import { housingRequirementsForTier, lowerHousingTier, mansionTierIndex, nextHousingTier, tierIndex } from "../model/housingRules.js";
import { addEvent } from "./GameState.js";
import { servicesAt } from "./ServiceSystem.js";

function canFill(state, building, service) {
  if (!building.housingTier) return false;
  if (!building.connected) return false;
  return housingRequirementsForTier(state, building.housingTier, service) || housingRequirementsForTier(state, nextHousingTier(building.housingTier), service);
}

function levelForHousingTier(tier) {
  const mansionIndex = mansionTierIndex(tier);
  if (mansionIndex >= 0) return mansionIndex + 1;
  return tierIndex(tier) + 1;
}

export function updateHousing(state) {
  for (const building of state.buildings.filter((item) => item.status === "complete" && item.category === "housing")) {
    const service = servicesAt(state, building.x, building.y);
    building.lastServices = service;
    const tierInfo = HOUSING_TIERS[building.housingTier];
    if (!tierInfo) continue;
    if (canFill(state, building, service)) {
      building.residents = Math.min(tierInfo.maxResidents, (building.residents || 0) + HOUSING_FILL_PER_MONTH);
    }

    const currentOk = building.connected && housingRequirementsForTier(state, building.housingTier, service);
    const targetTier = nextHousingTier(building.housingTier);
    const canAutoUpgradeHousing = building.type === "hut" &&
      targetTier !== building.housingTier &&
      !building.upgradePending &&
      !building.onWasteland &&
      building.connected &&
      housingRequirementsForTier(state, targetTier, service);
    if (canAutoUpgradeHousing) {
      building.upgradeStreak += 1;
      if (building.upgradeStreak >= UPGRADE_STREAK_MONTHS) {
        building.housingTier = targetTier;
        building.level = levelForHousingTier(targetTier);
        building.residents = Math.min(building.residents || 0, HOUSING_TIERS[targetTier].maxResidents);
        building.upgradeStreak = 0;
        building.downgradeStreak = 0;
        addEvent(state, `小屋升为 ${HOUSING_TIERS[targetTier].label}。`);
      }
    } else if (building.type === "hut") {
      building.upgradeStreak = 0;
    }

    if (!currentOk && building.housingTier !== "hut") {
      building.downgradeStreak += 1;
      if (building.downgradeStreak >= DOWNGRADE_STREAK_MONTHS) {
        const lowerTier = lowerHousingTier(building.housingTier);
        if (lowerTier === building.housingTier) {
          building.downgradeStreak = 0;
          continue;
        }
        building.housingTier = lowerTier;
        building.level = levelForHousingTier(lowerTier);
        building.residents = Math.min(building.residents, HOUSING_TIERS[building.housingTier].maxResidents);
        building.downgradeStreak = 0;
        building.upgradeStreak = 0;
        addEvent(state, `住房降为 ${HOUSING_TIERS[building.housingTier].label}。`, "warn");
      }
    } else {
      building.downgradeStreak = 0;
    }
  }
  state.population = state.buildings.reduce((sum, building) => sum + (building.residents || 0), 0);
}
