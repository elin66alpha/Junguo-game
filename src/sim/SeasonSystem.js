import { MONTHS } from "../model/constants.js";
import { completeConstruction, tickUpgrades } from "./BuildingSystem.js";
import { addEvent } from "./GameState.js";
import { updateHousing } from "./HousingSystem.js";
import { updateIndicators } from "./IndicatorSystem.js";
import { runConsumption, runProduction, updateResourceCaps } from "./ResourceSystem.js";
import { evaluateTerm } from "./EvaluationSystem.js";
import { recomputeRoadAccess } from "./RoadSystem.js";
import { recomputeServiceCache } from "./ServiceSystem.js";
import { initializeEdicts } from "./EdictSystem.js";
import { initializeEvents, rollMonthlyEvent, tickModifiers } from "./EventSystem.js";
import { checkMilestones, initializeMilestones } from "./MilestoneSystem.js";
import { initializeQishu, updateQishu } from "./QishuSystem.js";
import { updateWells } from "./WellSystem.js";
import { runAnnualTribute } from "./TributeSystem.js";
import { initializeMarket, recoverTradeInflation } from "./MarketSystem.js";
import { initializeNeighbors, neighborEventChanceBonus, tickNeighbors } from "./NeighborSystem.js";
import { initializeRiverTransport, runRiverTransport } from "./RiverTransportSystem.js";
import { initializeFestivals, maybeOpenFestival } from "./FestivalSystem.js";
import { tickWonderPrestige } from "./WonderSystem.js";

export function initializeSeasonState(state) {
  initializeEdicts(state);
  initializeEvents(state);
  initializeMilestones(state);
  initializeQishu(state);
  initializeMarket(state);
  initializeNeighbors(state);
  initializeRiverTransport(state);
  initializeFestivals(state);
  state.neighborEventChanceBonus = neighborEventChanceBonus(state);
  if (state.lastTributeYear == null) state.lastTributeYear = 0;
  recomputeRoadAccess(state);
  updateResourceCaps(state);
  recomputeServiceCache(state);
  updateIndicators(state);
}

export function advanceSeason(state) {
  if (state.evaluation) return;
  if (state.pendingEvent) {
    addEvent(state, "请先回应当前事件，再推进时间。", "warn");
    return;
  }
  state.totalMonthsElapsed += 1;
  state.floatingNumbers = (state.floatingNumbers || []).filter((n) => n.ttl > 0);
  completeConstruction(state);
  tickUpgrades(state);
  recomputeRoadAccess(state);
  updateWells(state);
  updateResourceCaps(state);
  recomputeServiceCache(state);
  runProduction(state);
  runRiverTransport(state);
  recomputeServiceCache(state);
  runConsumption(state);
  // 岁贡 is collected at the start of each new 正月 — do this AFTER consumption
  // so the tribute fights for whatever coin is left after upkeep, the way a
  // Han-era county would actually feel the squeeze.
  runAnnualTribute(state);
  updateHousing(state);
  tickWonderPrestige(state);
  updateIndicators(state);
  updateQishu(state);
  tickModifiers(state);
  recoverTradeInflation(state);
  tickNeighbors(state);
  checkMilestones(state);
  state.neighborEventChanceBonus = neighborEventChanceBonus(state);
  maybeOpenFestival(state);
  rollMonthlyEvent(state);
  evaluateTerm(state);
  addEvent(state, `本月结算完成：第 ${state.year} 年 ${state.monthName}。`);

  state.monthIndex = (state.monthIndex + 1) % MONTHS.length;
  if (state.monthIndex === 0) state.year += 1;
  state.monthName = MONTHS[state.monthIndex];
}
