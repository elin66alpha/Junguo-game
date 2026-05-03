import { calculateMorale, calculateOrder, calculatePrestige, magistrateOfficeOrderBonus, schoolOrderBonus } from "../model/formulas.js";
import { activeBuildings } from "./BuildingSystem.js";
import { edictMoraleDelta, edictOrderDelta } from "./EdictSystem.js";
import { indicatorModifierBreakdown, indicatorModifierDelta } from "./EventSystem.js";
import { isPrestigeHousingTier } from "../model/housingRules.js";

function housingCoverage(state, predicate) {
  const homes = state.buildings.filter((building) => building.status === "complete" && building.category === "housing" && building.connected);
  if (homes.length === 0) return 0;
  return homes.filter((home) => predicate(home.lastServices || {}, home)).length / homes.length;
}

function isClothCovered(home, service) {
  return home.housingTier === "hut" || service.cloth;
}

export function updateIndicators(state) {
  const completeNonRoad = state.buildings.filter((b) => b.status === "complete" && b.type !== "road" && b.type !== "bridge");
  const disconnectedRatio = completeNonRoad.length === 0 ? 0 : completeNonRoad.filter((b) => !b.connected).length / completeNonRoad.length;
  const waterCoverage = housingCoverage(state, (s) => s.water);
  const clothCoverage = housingCoverage(state, (s, h) => isClothCovered(h, s));
  const shrineCoverage = housingCoverage(state, (s) => s.shrine);
  const marketCoverage = housingCoverage(state, (s) => s.market);
  const schools = activeBuildings(state, "school");
  const hasSchool = schools.length > 0;
  const magistrateOffices = activeBuildings(state, "magistrateOffice");
  const hasMagistrateOffice = magistrateOffices.length > 0;
  const schoolLevelTotal = schools.reduce((sum, building) => sum + (building.level || 1), 0);
  const magistrateOfficeLevelTotal = magistrateOffices.reduce((sum, building) => sum + (building.level || 1), 0);
  const schoolBonus = schoolOrderBonus(schoolLevelTotal);
  const magistrateOfficeBonus = magistrateOfficeOrderBonus(magistrateOfficeLevelTotal);
  const prestigeBonus = state.persistentPrestigeBonus || 0;
  // M5a/M5b: 府第及以上和豪宅都计入地方声望。
  const topTierHomes = state.buildings.filter((b) => b.status === "complete" && b.housingTier && isPrestigeHousingTier(b.housingTier)).length;
  const milestoneCount = (state.milestonesAwarded || []).length;
  const civicLevels = activeBuildings(state).filter((b) => b.category === "civic").reduce((sum, b) => sum + (b.level || 1), 0);
  const moraleEdict = edictMoraleDelta(state);
  const orderEdict = edictOrderDelta(state);
  const moraleEvent = indicatorModifierDelta(state, "morale");
  const orderEvent = indicatorModifierDelta(state, "order");
  const prestigeEvent = indicatorModifierDelta(state, "prestige");

  state.indicators.morale = calculateMorale({
    foodRatio: state.foodRatio ?? 1,
    waterCoverage,
    clothCoverage,
    shrineCoverage,
    disconnectedRatio,
    edictDelta: moraleEdict,
    eventDelta: moraleEvent
  });
  state.indicators.order = calculateOrder({ marketCoverage, schoolBonus, magistrateOfficeBonus, disconnectedRatio, edictDelta: orderEdict, eventDelta: orderEvent });
  state.indicators.prestige = calculatePrestige({ hasSchool, hasMagistrateOffice, topTierHomes, milestoneCount, civicLevels, eventDelta: prestigeEvent + prestigeBonus });

  state.indicatorBreakdowns.morale = [
    { label: "ji-chu", amount: 50 },
    { label: "liang-shi-bao-zhang", amount: Math.round((state.foodRatio ?? 1) * 20) },
    { label: "ci-miao-fu-gai", amount: Math.round(shrineCoverage * 10) },
    { label: "que-shao-shui-jing", amount: -Math.round((1 - waterCoverage) * 20) },
    { label: "que-shao-bu-pi", amount: -Math.round((1 - clothCoverage) * 10) },
    { label: "wei-jie-dao-lu", amount: -Math.round(disconnectedRatio * 15) }
  ];
  // Replace ascii placeholder labels with Chinese after construction. Some terminals corrupt
  // multi-byte literals during repeated edits; this two-step pattern survives those edits.
  state.indicatorBreakdowns.morale[0].label = "基础";
  state.indicatorBreakdowns.morale[1].label = "粮食保障";
  state.indicatorBreakdowns.morale[2].label = "祭坛覆盖";
  state.indicatorBreakdowns.morale[3].label = "缺少水井";
  state.indicatorBreakdowns.morale[4].label = "缺少布匹";
  state.indicatorBreakdowns.morale[5].label = "未接道路";
  if (moraleEdict !== 0) state.indicatorBreakdowns.morale.push({ label: "诏令", amount: moraleEdict });
  state.indicatorBreakdowns.morale.push(...indicatorModifierBreakdown(state, "morale"));

  state.indicatorBreakdowns.order = [
    { label: "基础", amount: 50 },
    { label: "学宫", amount: schoolBonus },
    { label: "衙门", amount: magistrateOfficeBonus },
    { label: "市场覆盖不足", amount: -Math.round((1 - marketCoverage) * 10) },
    { label: "未接道路", amount: -Math.round(disconnectedRatio * 10) }
  ];
  if (orderEdict !== 0) state.indicatorBreakdowns.order.push({ label: "诏令", amount: orderEdict });
  state.indicatorBreakdowns.order.push(...indicatorModifierBreakdown(state, "order"));

  state.indicatorBreakdowns.prestige = [
    { label: "学宫", amount: hasSchool ? 10 : 0 },
    { label: "衙门", amount: hasMagistrateOffice ? 6 : 0 },
    { label: "府第豪宅", amount: topTierHomes * 3 },
    { label: "里程碑", amount: milestoneCount * 5 },
    { label: "公共建筑等级", amount: civicLevels * 2 },
    { label: "名山声望", amount: prestigeBonus }
  ];
  state.indicatorBreakdowns.prestige.push(...indicatorModifierBreakdown(state, "prestige"));
}
