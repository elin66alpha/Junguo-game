import { addEvent, createGameState, stateHash } from "../sim/GameState.js";
import { cancelUpgrade, demolishBuilding, upgradeBuilding } from "../sim/BuildingSystem.js";
import { evaluateTerm } from "../sim/EvaluationSystem.js";
import { advanceSeason, initializeSeasonState } from "../sim/SeasonSystem.js";
import { recomputeRoadAccess } from "../sim/RoadSystem.js";
import { updateResourceCaps } from "../sim/ResourceSystem.js";
import { setEdict } from "../sim/EdictSystem.js";
import { forceMonthlyEvent, resolveEventChoice } from "../sim/EventSystem.js";
import { dismissMilestone } from "../sim/MilestoneSystem.js";
import {
  appendHallOfFameEntry, clearAutosave, downloadSaveFile, loadAutosave,
  loadStateFromSaveFile, replaceState, writeAutosave
} from "../sim/SaveSystem.js";
import { buyTradeResource, sellTradeResource } from "../sim/MarketSystem.js";
import { sendNeighborEnvoy as sendNeighborEnvoyImpl } from "../sim/NeighborSystem.js";

export class TurnController {
  constructor(state, render) {
    this.state = state;
    this.render = render;
  }

  nextSeason() {
    advanceSeason(this.state);
    this.persistOrFinalize();
    this.render();
  }

  // M6: every successful month tick autosaves to localStorage so 「继续」 works
  // next time the page loads. When 气数 hits 0 we instead write a hall-of-fame
  // entry and drop the autosave so the menu stops offering 「继续」.
  persistOrFinalize() {
    if (this.state.evaluation) {
      this.recordHallEntry();
      clearAutosave();
    } else {
      writeAutosave(this.state);
    }
  }

  recordHallEntry() {
    if (!this.state.evaluation) return;
    const evalSnap = this.state.evaluation;
    const log = (this.state.eventLog || []).filter((entry) => entry.level !== "warn").slice(0, 3);
    appendHallOfFameEntry({
      endedAt: new Date().toISOString(),
      archetype: this.state.archetype,
      archetypeLabel: evalSnap.archetypeLabel || this.state.archetypeLabel,
      months: evalSnap.months,
      year: evalSnap.year,
      monthName: evalSnap.monthName,
      title: evalSnap.title,
      blurb: evalSnap.blurb,
      population: evalSnap.population,
      qishuFinal: evalSnap.qishu ?? this.state.qishu,
      indicators: { ...(evalSnap.indicators || this.state.indicators || {}) },
      topEvents: log.map((entry) => ({ year: entry.year, month: entry.month, message: entry.message }))
    });
  }

  addCoin(amount = 100) {
    this.state.resources.coin += amount;
    addEvent(this.state, `调试：增加 ${amount} 钱。`);
    this.render();
  }

  addGrain(amount = 100) {
    updateResourceCaps(this.state);
    const room = Math.max(0, (this.state.resourceCaps?.grain || Infinity) - this.state.resources.grain);
    const stored = Math.min(room, amount);
    this.state.resources.grain += stored;
    addEvent(this.state, `调试：增加 ${stored} 粮食${stored < amount ? "（仓容已满）" : ""}。`);
    this.render();
  }

  addWood(amount = 50) {
    updateResourceCaps(this.state);
    const room = Math.max(0, (this.state.resourceCaps?.wood || Infinity) - (this.state.resources.wood ?? 0));
    const stored = Math.min(room, amount);
    this.state.resources.wood = (this.state.resources.wood ?? 0) + stored;
    addEvent(this.state, `调试：增加 ${stored} 木材${stored < amount ? "（木仓已满）" : ""}。`);
    this.render();
  }

  printState() {
    addEvent(this.state, `状态 ${stateHash(this.state)}，未接道路建筑 ${this.state.disconnectedCount || 0}。`);
    this.render();
  }

  forceEvaluation() {
    evaluateTerm(this.state, true);
    addEvent(this.state, "调试：已强制进入任期考评。");
    this.persistOrFinalize();
    this.render();
  }

  forceEvent() {
    forceMonthlyEvent(this.state);
    addEvent(this.state, "调试：触发一次事件。");
    this.render();
  }

  downloadSave() {
    try {
      downloadSaveFile(this.state);
      addEvent(this.state, "存档已写出到浏览器下载文件。");
    } catch (error) {
      addEvent(this.state, `存档失败：${error.message}`, "warn");
    }
    this.render();
  }

  async loadSaveFile(file) {
    try {
      const nextState = await loadStateFromSaveFile(file, this.state.buildingDefs);
      replaceState(this.state, nextState);
      addEvent(this.state, "存档已读取。");
      if (typeof this.onStateReplaced === "function") this.onStateReplaced();
    } catch (error) {
      addEvent(this.state, `读档失败：${error.message}`, "warn");
    }
    this.render();
  }

  buyResource(resourceKey, amount) {
    buyTradeResource(this.state, resourceKey, amount);
    this.render();
  }

  sellResource(resourceKey, amount) {
    sellTradeResource(this.state, resourceKey, amount);
    this.render();
  }

  sendNeighborEnvoy(resourceKey) {
    sendNeighborEnvoyImpl(this.state, resourceKey);
    this.render();
  }

  setEdict(slot, optionId) {
    setEdict(this.state, slot, optionId);
    this.render();
  }

  resolveEvent(choiceId) {
    resolveEventChoice(this.state, choiceId);
    this.render();
  }

  dismissMilestone() {
    dismissMilestone(this.state);
    this.render();
  }

  upgradeSelectedBuilding() {
    if (!this.state.selectedBuildingId) return;
    upgradeBuilding(this.state, this.state.selectedBuildingId);
    recomputeRoadAccess(this.state);
    updateResourceCaps(this.state);
    this.render();
  }

  cancelSelectedUpgrade() {
    if (!this.state.selectedBuildingId) return;
    cancelUpgrade(this.state, this.state.selectedBuildingId);
    this.render();
  }

  demolishSelectedBuilding() {
    if (!this.state.selectedBuildingId) return;
    demolishBuilding(this.state, this.state.selectedBuildingId);
    recomputeRoadAccess(this.state);
    updateResourceCaps(this.state);
    if (this.state.resources.grain > this.state.resourceCaps.grain) this.state.resources.grain = this.state.resourceCaps.grain;
    if ((this.state.resources.wood ?? 0) > this.state.resourceCaps.wood) this.state.resources.wood = this.state.resourceCaps.wood;
    if ((this.state.resources.cloth ?? 0) > this.state.resourceCaps.cloth) this.state.resources.cloth = this.state.resourceCaps.cloth;
    this.render();
  }

  newTerm() {
    const nextSeed = this.state.seed + 1;
    const nextState = createGameState(this.state.buildingDefs, nextSeed);
    this.replaceWithNewState(nextState);
    addEvent(this.state, `新地图已生成（${this.state.archetypeLabel}），随机种子 ${nextSeed}。`);
    writeAutosave(this.state);
    this.render();
  }

  selectMap(archetype) {
    const nextSeed = this.state.seed + 1;
    const nextState = createGameState(this.state.buildingDefs, nextSeed, archetype);
    this.replaceWithNewState(nextState);
    addEvent(this.state, `新任郡守抵达${this.state.archetypeLabel}（种子 ${nextSeed}）。`);
    writeAutosave(this.state);
    this.render();
  }

  // M6 main-menu helpers ---------------------------------------------------

  openMainMenu(view = "main") {
    this.state.mainMenuOpen = true;
    this.state.mainMenuView = view;
    this.state.mapPickerOpen = false;
    this.render();
  }

  closeMainMenu() {
    this.state.mainMenuOpen = false;
    this.state.mainMenuView = "main";
    this.render();
  }

  setMainMenuView(view) {
    this.state.mainMenuView = view;
    this.render();
  }

  startNewTermFromMenu(archetype) {
    // Clear any prior autosave to prevent the user from "going back" to a
    // dead term once they explicitly chose a new one.
    clearAutosave();
    this.state.mainMenuOpen = false;
    this.state.mapPickerOpen = false;
    this.selectMap(archetype);
  }

  continueAutosave() {
    const nextState = loadAutosave(this.state.buildingDefs);
    if (!nextState) {
      addEvent(this.state, "没有可继续的存档。", "warn");
      this.render();
      return false;
    }
    this.replaceWithNewState(nextState);
    this.state.mainMenuOpen = false;
    this.state.mainMenuView = "main";
    addEvent(this.state, "已读取自动存档，继续上次任期。");
    this.render();
    return true;
  }

  returnToMainMenu() {
    if (this.state.evaluation) {
      this.recordHallEntry();
      clearAutosave();
    }
    this.state.evaluation = null;
    this.state.mainMenuOpen = true;
    this.state.mainMenuView = "main";
    this.render();
  }

  replaceWithNewState(nextState) {
    const debugEnabled = !!this.state.debugEnabled;
    Object.keys(this.state).forEach((key) => delete this.state[key]);
    Object.assign(this.state, nextState);
    this.state.debugEnabled = debugEnabled;
    initializeSeasonState(this.state);
    if (typeof this.onStateReplaced === "function") this.onStateReplaced();
    else if (typeof this.onNewTerm === "function") this.onNewTerm();
  }
}
