import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWeiRiverValley, generateMap, pickArchetype } from "../src/map/generateMap.js";
import { ARCHETYPES, TERRAIN } from "../src/model/constants.js";
import { farmOutputForMonth, laborScale, seasonalRandomizedAmount } from "../src/model/formulas.js";
import { SeededRng } from "../src/model/rng.js";
import { demolishBuilding, effectiveBuildCost, getBulkUpgradeQuote, placeBuilding, upgradeBuilding, validatePlacement } from "../src/sim/BuildingSystem.js";
import { createGameState, stateHash } from "../src/sim/GameState.js";
import { recomputeRoadAccess } from "../src/sim/RoadSystem.js";
import { advanceSeason, initializeSeasonState } from "../src/sim/SeasonSystem.js";
import { setEdict } from "../src/sim/EdictSystem.js";
import { forceMonthlyEvent, resolveEventChoice } from "../src/sim/EventSystem.js";
import { buyTradeResource, sellTradeResource, tradePrice, tradeUnlocked } from "../src/sim/MarketSystem.js";
import { updateHousing } from "../src/sim/HousingSystem.js";

const buildingDefs = JSON.parse(await readFile(new URL("../src/data/buildings.json", import.meta.url), "utf8"));

function boot(seed = undefined) {
  const state = createGameState(buildingDefs, seed);
  initializeSeasonState(state);
  // Suppress random events during deterministic tests by holding the cooldown high.
  state.eventCooldown = 999;
  return state;
}

function plainSpot(state, type) {
  for (let y = 30; y < 60; y += 1) {
    for (let x = 30; x < 60; x += 1) {
      const tile = state.tiles[y * 80 + x];
      if (tile.terrain !== TERRAIN.PLAIN) continue;
      if (validatePlacement(state, type, x, y).ok) return { x, y };
    }
  }
  return null;
}

function buildStarterBlock(state) {
  // Place inside the central 9x9 plain hub carved by finalize() (rows/cols 36..44).
  placeBuilding(state, "road", 38, 38);
  placeBuilding(state, "road", 39, 38);
  placeBuilding(state, "road", 40, 38);
  placeBuilding(state, "well", 38, 39);
  placeBuilding(state, "granary", 39, 39);
  placeBuilding(state, "hut", 38, 37);
}

function buildTradeStation(state) {
  placeBuilding(state, "road", 37, 38);
  placeBuilding(state, "tradeStation", 38, 38);
  for (let i = 0; i < 2; i += 1) advanceSeason(state);
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

// ---------- determinism / map ----------

run("same map seed is stable and next seed changes terrain", () => {
  const a = createWeiRiverValley(100).map((tile) => tile.terrain).join("");
  const b = createWeiRiverValley(100).map((tile) => tile.terrain).join("");
  const c = createWeiRiverValley(101).map((tile) => tile.terrain).join("");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

run("map archetype picker is deterministic and covers all three", () => {
  const seen = new Set();
  for (let s = 100; s < 400; s += 1) seen.add(pickArchetype(s));
  assert.ok(seen.has(ARCHETYPES.WEI));
  assert.ok(seen.has(ARCHETYPES.PASS));
  assert.ok(seen.has(ARCHETYPES.DELTA));
});

run("each archetype generates a playable plain hub", () => {
  for (const archetype of [ARCHETYPES.WEI, ARCHETYPES.PASS, ARCHETYPES.DELTA]) {
    const map = generateMap(123, archetype);
    let plainCount = 0;
    for (const tile of map.tiles) if (tile.terrain === TERRAIN.PLAIN) plainCount += 1;
    assert.ok(plainCount > 200, `${archetype} should expose >200 plain tiles, got ${plainCount}`);
    assert.ok(map.difficulty.plainRatio > 0, `${archetype} difficulty should be set`);
  }
});

run("generated maps include fertile farmland terrain", () => {
  const map = generateMap(123, ARCHETYPES.WEI);
  assert.ok(map.tiles.some((tile) => tile.terrain === TERRAIN.FERTILE));
});

// ---------- placement / costs ----------

run("terrain placement rejects normal building on river", () => {
  const state = boot();
  const river = state.tiles.find((tile) => tile.terrain === TERRAIN.RIVER);
  assert.equal(validatePlacement(state, "hut", river.x, river.y).ok, false);
});

run("bridge placement accepts river", () => {
  const state = boot();
  const river = state.tiles.find((tile) => tile.terrain === TERRAIN.RIVER);
  assert.equal(validatePlacement(state, "bridge", river.x, river.y).ok, true);
});

run("placing a hut spends coin and completes after one month", () => {
  const state = boot();
  const spot = plainSpot(state, "hut");
  assert.ok(spot, "should find a plain spot for hut");
  const coin = state.resources.coin;
  assert.equal(placeBuilding(state, "hut", spot.x, spot.y), true);
  assert.equal(state.resources.coin, coin - 10);
  advanceSeason(state);
  assert.equal(state.buildings[0].status, "complete");
});

run("construction spending appears in coin breakdown", () => {
  const state = boot();
  const spot = plainSpot(state, "hut");
  placeBuilding(state, "hut", spot.x, spot.y);
  assert.equal(state.resourceBreakdowns.coin.sinks.at(-1).label, "建造 小屋");
  assert.equal(state.lastDeltas.coin, -10);
});

run("demolition refunds coin through building system", () => {
  const state = boot();
  const spot = plainSpot(state, "hut");
  placeBuilding(state, "hut", spot.x, spot.y);
  const hut = state.buildings.find((building) => building.type === "hut");
  const coinBeforeDemolish = state.resources.coin;
  demolishBuilding(state, hut.id);
  assert.equal(state.resources.coin, coinBeforeDemolish + 2);
  assert.equal(state.resourceBreakdowns.coin.sources.at(-1).amount, 2);
});

run("upgrading a building takes time, costs coin and wood, then bumps level", () => {
  const state = boot();
  const spot = plainSpot(state, "well");
  placeBuilding(state, "road", spot.x, spot.y + 1);
  placeBuilding(state, "well", spot.x, spot.y);
  advanceSeason(state);
  const well = state.buildings.find((building) => building.type === "well");
  const coinBefore = state.resources.coin;
  const woodBefore = state.resources.wood;
  assert.equal(upgradeBuilding(state, well.id), true);
  // Upgrade does not complete instantly — well is still level 1 with pending state.
  assert.equal(well.level, 1);
  assert.ok(well.upgradePending != null, "expected upgradePending to be set");
  assert.ok(state.resources.coin < coinBefore);
  assert.ok(state.resources.wood < woodBefore);
  // Advance enough months for the upgrade to complete (default 2 months).
  for (let i = 0; i < 3; i += 1) advanceSeason(state);
  assert.equal(well.level, 2);
  assert.equal(well.upgradePending, null);
});

run("wasteland tile applies 25 percent build cost surcharge", () => {
  const state = boot();
  const wasteland = state.tiles.find((tile) => tile.terrain === TERRAIN.WASTELAND);
  if (!wasteland) {
    // Map didn't roll any wasteland — that's allowed but skip.
    return;
  }
  const cost = effectiveBuildCost(state, "hut", wasteland.x, wasteland.y);
  assert.equal(cost, Math.ceil(10 * 1.25));
});

run("forest auto-clear converts terrain to plain and rebates 5 coin", () => {
  const state = boot();
  const forest = state.tiles.find((tile) => tile.terrain === TERRAIN.FOREST);
  if (!forest) return;
  const before = state.resources.coin;
  const placed = placeBuilding(state, "hut", forest.x, forest.y);
  assert.equal(placed, true);
  // -10 cost +5 rebate = -5 net.
  assert.equal(state.resources.coin, before - 10 + 5);
  assert.equal(forest.terrain, TERRAIN.PLAIN);
});

run("road access controls building usability", () => {
  const state = boot();
  // Place inside the carved 9x9 plain hub at (36..44, 36..44).
  placeBuilding(state, "farm", 38, 38);
  for (let i = 0; i < 3; i += 1) advanceSeason(state);
  const farm = state.buildings.find((building) => building.type === "farm");
  assert.equal(farm.connected, false);
  const grainWithoutRoad = state.resources.grain;
  placeBuilding(state, "road", 38, 41);
  advanceSeason(state);
  recomputeRoadAccess(state);
  assert.equal(farm.connected, true);
  assert.ok(state.resources.grain >= grainWithoutRoad);
});

// ---------- core resource semantics ----------

run("water is service-only", () => {
  const state = boot();
  assert.equal("water" in state.resources, false);
});

run("labor scaling is deterministic", () => {
  assert.equal(laborScale(10, 20), 0.5);
  assert.equal(laborScale(20, 10), 1);
  assert.equal(laborScale(0, 0), 1);
});

run("seasonal randomization is capped at ten percent and seeded", () => {
  const a = new SeededRng(123);
  const b = new SeededRng(123);
  const valueA = seasonalRandomizedAmount(a, 1000, 200);
  const valueB = seasonalRandomizedAmount(b, 1000, 200);
  assert.equal(valueA, valueB);
  assert.ok(valueA >= 180 && valueA <= 220);
});

run("fertile terrain improves farm output", () => {
  const plain = farmOutputForMonth(8, TERRAIN.PLAIN, true, 1, 1);
  const fertile = farmOutputForMonth(8, TERRAIN.FERTILE, true, 1, 1);
  assert.ok(fertile > plain);
});

run("coin can go negative for construction and upkeep", () => {
  const state = boot();
  const spot = plainSpot(state, "farm");
  state.resources.coin = 0;
  assert.equal(placeBuilding(state, "farm", spot.x, spot.y), true);
  assert.ok(state.resources.coin < 0);
});

run("trade station unlocks buying and selling resources", () => {
  const state = boot();
  assert.equal(tradeUnlocked(state), false);
  assert.equal(buyTradeResource(state, "wood", 5), false);
  buildTradeStation(state);
  assert.equal(tradeUnlocked(state), true);
  const priceBefore = tradePrice(state, "wood");
  const coinBefore = state.resources.coin;
  const woodBefore = state.resources.wood;
  assert.equal(buyTradeResource(state, "wood", 5), true);
  assert.equal(state.resources.wood, woodBefore + 5);
  assert.equal(state.resources.coin, coinBefore - priceBefore * 5);
  assert.ok(tradePrice(state, "wood") > priceBefore);
  const coinAfterBuy = state.resources.coin;
  assert.equal(sellTradeResource(state, "wood", 5), true);
  assert.ok(state.resources.coin > coinAfterBuy);
});

// ---------- gameplay ----------

run("hut auto-upgrades after sustained services", () => {
  const state = boot();
  buildStarterBlock(state);
  for (let i = 0; i < 4; i += 1) advanceSeason(state);
  const hut = state.buildings.find((building) => building.type === "hut");
  assert.equal(hut.housingTier, "tile");
});

run("hut auto-upgrades through every housing tier", () => {
  const state = boot();
  state.buildings = [{
    id: 1,
    type: "hut",
    name: "小屋",
    category: "housing",
    x: 1,
    y: 1,
    level: 1,
    connected: true,
    status: "complete",
    housingTier: "hut",
    residents: 4,
    upgradeStreak: 0,
    downgradeStreak: 0,
    onWasteland: false,
    upgradePending: null
  }];
  state.indicators = { morale: 100, order: 100, prestige: 100 };
  state.serviceCache = new Map([["1,1", {
    water: true,
    grain: true,
    cloth: true,
    market: true,
    shrine: true,
    schoolCountywide: true
  }]]);
  // 7 tiers (hut → tile → courtyard → compound → manor → estate → noble)
  // means 6 upgrades, each requiring UPGRADE_STREAK_MONTHS (=2) iterations.
  for (let i = 0; i < 16; i += 1) updateHousing(state);
  const hut = state.buildings[0];
  assert.equal(hut.housingTier, "noble");
  assert.equal(hut.level, 7);
});

run("manual and bulk upgrade do not upgrade huts", () => {
  const state = boot();
  placeBuilding(state, "road", 38, 38);
  placeBuilding(state, "hut", 38, 37);
  advanceSeason(state);
  const hut = state.buildings.find((building) => building.type === "hut");
  assert.equal(upgradeBuilding(state, hut.id), false);
  const quote = getBulkUpgradeQuote(state, [hut]);
  assert.equal(quote.eligible.length, 0);
});

run("state hash and evaluation inputs are reproducible from same actions", () => {
  const a = boot();
  const b = boot();
  for (const state of [a, b]) {
    buildStarterBlock(state);
    for (let i = 0; i < 6; i += 1) advanceSeason(state);
  }
  assert.equal(stateHash(a), stateHash(b));
});

// ---------- governance and events ----------

run("setEdict applies modifier and persists in state", () => {
  const state = boot();
  assert.equal(state.edicts.tax, "standard");
  assert.equal(setEdict(state, "tax", "heavy", { free: true }), true);
  assert.equal(state.edicts.tax, "heavy");
  assert.equal(state.edictModifiers.taxMultiplier, 1.4);
});

run("event resolution applies effect and clears pendingEvent", () => {
  const state = boot();
  state.pendingEvent = {
    id: "merchant",
    title: "测试",
    description: "测试事件",
    choices: [{ id: "tax", label: "x", effects: [{ type: "resources", coin: 25 }] }]
  };
  const before = state.resources.coin;
  resolveEventChoice(state, "tax");
  assert.equal(state.pendingEvent, null);
  assert.equal(state.resources.coin, before + 25);
});

run("event coin penalties scale with current treasury", () => {
  const state = boot();
  state.resources.coin = 12000;
  state.pendingEvent = { id: "bumper", title: "丰年祥兆", description: "test", choices: [] };
  resolveEventChoice(state, "celebrate");
  assert.ok(state.resources.coin <= 11520, `expected scaled penalty, got ${state.resources.coin}`);
});

run("event qishu penalty cannot directly end a term from low qishu", () => {
  const state = boot();
  state.qishu = 2;
  state.pendingEvent = { id: "locusts", title: "蝗虫掠食", description: "test", choices: [] };
  resolveEventChoice(state, "endure");
  assert.equal(state.qishu, 1);
});

run("debug force event bypasses warmup and creates a pending event", () => {
  const state = boot();
  state.totalMonthsElapsed = 0;
  state.eventCooldown = 999;
  forceMonthlyEvent(state);
  assert.ok(state.pendingEvent);
  assert.ok(state.pendingEvent.choices.length > 0);
});

run("event indicator effects persist as timed modifiers", () => {
  const state = boot();
  state.pendingEvent = {
    id: "scholar",
    title: "学子来访",
    description: "test",
    choices: []
  };
  resolveEventChoice(state, "host");
  assert.equal(state.pendingEvent, null);
  assert.equal(state.activeIndicatorModifiers.length, 1);
  assert.equal(state.activeIndicatorModifiers[0].key, "prestige");
  assert.equal(state.activeIndicatorModifiers[0].delta, 6);
  assert.equal(state.activeIndicatorModifiers[0].monthsLeft, 6);
  advanceSeason(state);
  assert.ok(state.indicatorBreakdowns.prestige.some((item) => item.label.includes("事件") && item.amount === 6));
});

// ---------- mandate (qishu) ----------

import { applyQishuDelta, initializeQishu, updateQishu } from "../src/sim/QishuSystem.js";
import { evaluateTerm } from "../src/sim/EvaluationSystem.js";

run("qishu starts at 20 and stays bounded", () => {
  const state = boot();
  initializeQishu(state);
  assert.equal(state.qishu, 20);
  updateQishu(state);
  assert.ok(state.qishu >= 0 && state.qishu <= 50);
});

run("empty county loses qishu after grace period", () => {
  const state = boot();
  state.qishu = 20;
  state.population = 0;
  state.totalMonthsElapsed = 12;
  updateQishu(state);
  // base attrition -2 + empty county -3 = -5
  assert.equal(state.qishu, 15);
});

run("qishu drops when morale collapses and famine hits", () => {
  const state = boot();
  state.qishu = 20;
  state.population = 50;
  state.indicators.morale = 10;
  state.indicators.order = 20;
  state.indicators.prestige = 0;
  state.foodRatio = 0.4;
  state.resources.grain = 0;
  updateQishu(state);
  assert.ok(state.qishu < 15, `expected sharp drop, got ${state.qishu}`);
});

run("qishu rises when indicators are excellent", () => {
  const state = boot();
  state.qishu = 20;
  state.population = 80;
  state.indicators.morale = 80;
  state.indicators.order = 75;
  state.indicators.prestige = 60;
  state.foodRatio = 1;
  state.resources.grain = 300;
  updateQishu(state);
  assert.ok(state.qishu > 20, `expected gain, got ${state.qishu}`);
});

run("qishu hitting 0 triggers evaluation with months and title", () => {
  const state = boot();
  state.qishu = 0;
  state.totalMonthsElapsed = 60;
  evaluateTerm(state);
  assert.ok(state.evaluation);
  assert.equal(state.evaluation.months, 60);
  assert.ok(state.evaluation.title);
});

run("event qishu effect updates the value and records one-time entry", () => {
  const state = boot();
  state.qishu = 20;
  applyQishuDelta(state, 8, "test");
  assert.equal(state.qishu, 28);
  assert.ok(state.qishuOneTime.length >= 1);
});

// ---------- wood, lumber chain, tribute, exponential upkeep ----------

import { cancelUpgrade } from "../src/sim/BuildingSystem.js";
import { runAnnualTribute } from "../src/sim/TributeSystem.js";
import { annualTribute, lumberOutput, upkeepCost } from "../src/model/formulas.js";

run("starting state includes wood resource", () => {
  const state = boot();
  assert.equal(state.resources.coin, 1000);
  assert.equal(state.resources.wood, 150);
  assert.equal(state.resourceCaps.cloth, 500);
});

run("warehouse increases wood and cloth caps by level", () => {
  const state = boot();
  const baseWood = state.resourceCaps.wood;
  const baseCloth = state.resourceCaps.cloth;
  placeBuilding(state, "road", 37, 38);
  placeBuilding(state, "warehouse", 38, 38);
  for (let i = 0; i < 2; i += 1) advanceSeason(state);
  assert.equal(state.resourceCaps.wood, baseWood + 200);
  assert.equal(state.resourceCaps.cloth, baseCloth + 500);
});

run("placing a building deducts wood when woodCost > 0", () => {
  const state = boot();
  const spot = plainSpot(state, "hut");
  const woodBefore = state.resources.wood;
  placeBuilding(state, "hut", spot.x, spot.y);
  // Hut costs 4 wood per the new buildings.json
  assert.equal(state.resources.wood, woodBefore - 4);
});

run("cannot place when out of wood", () => {
  const state = boot();
  // Resolve a valid spot before draining wood (validatePlacement would otherwise reject every tile).
  const spot = plainSpot(state, "hut");
  state.resources.wood = 0;
  const result = placeBuilding(state, "hut", spot.x, spot.y);
  assert.equal(result, false);
});

run("cancelling an upgrade refunds coin and wood", () => {
  const state = boot();
  const spot = plainSpot(state, "well");
  placeBuilding(state, "road", spot.x, spot.y + 1);
  placeBuilding(state, "well", spot.x, spot.y);
  advanceSeason(state);
  const well = state.buildings.find((b) => b.type === "well");
  const coinBefore = state.resources.coin;
  const woodBefore = state.resources.wood;
  upgradeBuilding(state, well.id);
  assert.ok(state.resources.coin < coinBefore);
  assert.ok(state.resources.wood < woodBefore);
  cancelUpgrade(state, well.id);
  assert.equal(state.resources.coin, coinBefore);
  assert.equal(state.resources.wood, woodBefore);
  assert.equal(well.upgradePending, null);
});

run("upkeep cost scales quadratically with level", () => {
  const def = { cost: 100 };
  // L1 = ceil(100 * (0.08 + 0.04)) = 12
  assert.equal(upkeepCost(def, { level: 1 }), 12);
  // L2 = ceil(100 * (0.08 + 0.16)) = 24
  assert.equal(upkeepCost(def, { level: 2 }), 24);
  // L3 = ceil(100 * (0.08 + 0.36)) = 44
  assert.equal(upkeepCost(def, { level: 3 }), 44);
});

run("annual tribute scales with milestones and prestige", () => {
  const state = boot();
  state.indicators.prestige = 0;
  state.milestonesAwarded = [];
  assert.equal(annualTribute(state), 30);
  state.milestonesAwarded = ["a", "b"];
  assert.equal(annualTribute(state), 30 + 40);
  state.indicators.prestige = 60;  // floor(60/30) = 2 tiers
  assert.equal(annualTribute(state), 30 + 40 + 20);
});

run("running tribute on the new year deducts coin and adds an event", () => {
  const state = boot();
  state.year = 2;
  state.monthIndex = 0;
  state.totalMonthsElapsed = 12;
  state.lastTributeYear = 0;
  const coinBefore = state.resources.coin;
  runAnnualTribute(state);
  assert.ok(state.resources.coin < coinBefore);
  assert.equal(state.lastTributeYear, 2);
});

run("missed tribute applies qishu penalty", () => {
  const state = boot();
  state.year = 2;
  state.monthIndex = 0;
  state.totalMonthsElapsed = 12;
  state.lastTributeYear = 0;
  state.resources.coin = 0;
  const qishuBefore = state.qishu;
  runAnnualTribute(state);
  assert.ok(state.qishu < qishuBefore);
  assert.ok((state.activeIndicatorModifiers || []).length > 0);
});

run("lumber output doubles when forest is nearby", () => {
  const noForest = lumberOutput(1, 1, false);
  const withForest = lumberOutput(1, 1, true);
  assert.ok(withForest > noForest);
  assert.equal(withForest, noForest * 2);
});


run("demolition refund is flat 25 percent of base cost (no level multiplier)", () => {
  const state = boot();
  const spot = plainSpot(state, "well");
  placeBuilding(state, "road", spot.x, spot.y + 1);
  placeBuilding(state, "well", spot.x, spot.y);
  advanceSeason(state);
  const well = state.buildings.find((b) => b.type === "well");
  // Manually push the well to level 3 to skip the upgrade timer for the test.
  well.level = 3;
  const coinBefore = state.resources.coin;
  const def = state.buildingDefs.find((d) => d.id === "well");
  const expectedRefund = Math.floor(def.cost * 0.25);
  demolishBuilding(state, well.id);
  assert.equal(state.resources.coin - coinBefore, expectedRefund);
});

// ---------- M5a: cost formula, max level, market tax, fertile share, batch upgrade ----------

import { upgradeCost as upgradeCostFormula, upgradeWoodCost as upgradeWoodCostFormula, upgradeSeasons as upgradeSeasonsFormula } from "../src/model/formulas.js";
import { marketCommercialTax, MARKET_LEVEL_MULTIPLIER, MARKET_TAX_PER_HOUSING_TIER } from "../src/sim/MarketSystem.js";
import { upgradeBuildingBatch } from "../src/sim/BuildingSystem.js";
import { HOUSING_TIER_ORDER, HOUSING_TIERS } from "../src/model/constants.js";

run("upgrade cost formula scales with (L-1)^1.7", () => {
  const def = { cost: 100, woodCost: 10, maxLevel: 5 };
  // L2: ceil(100 * 1) = 100
  assert.equal(upgradeCostFormula(def, { level: 1 }), 100);
  // L3: ceil(100 * 2^1.7) = ceil(100 * 3.249) = 325
  assert.equal(upgradeCostFormula(def, { level: 2 }), 325);
  // L5: ceil(100 * 4^1.7) = ceil(100 * 10.556) = 1056
  assert.equal(upgradeCostFormula(def, { level: 4 }), 1056);
  assert.equal(upgradeCostFormula(def, { level: 5 }), null);
  // Wood mirrors curve.
  assert.equal(upgradeWoodCostFormula(def, { level: 1 }), 10);
  assert.ok(upgradeWoodCostFormula(def, { level: 4 }) > upgradeWoodCostFormula(def, { level: 2 }));
  // Seasons grow with level.
  assert.equal(upgradeSeasonsFormula(def, { level: 1 }), 2);
  assert.equal(upgradeSeasonsFormula(def, { level: 4 }), 5);
});

run("non-housing buildings now cap at level 5", () => {
  const state = boot();
  for (const id of ["well", "farm", "workshop", "lumberCamp", "granary", "warehouse", "market", "tradeStation", "magistrateOffice", "school", "shrine"]) {
    const def = state.buildingDefs.find((d) => d.id === id);
    assert.equal(def.maxLevel, 5, `${id} should be maxLevel 5`);
  }
});

run("housing tier order extends to 7 with estate and noble", () => {
  assert.equal(HOUSING_TIER_ORDER.length, 7);
  assert.equal(HOUSING_TIER_ORDER[5], "estate");
  assert.equal(HOUSING_TIER_ORDER[6], "noble");
  // Tax taper: per-resident rate drops from compound onwards even though
  // resident capacity keeps growing.
  assert.ok(HOUSING_TIERS.compound.taxPerResident < HOUSING_TIERS.courtyard.taxPerResident);
  assert.ok(HOUSING_TIERS.noble.maxResidents > HOUSING_TIERS.manor.maxResidents);
});

run("market commercial tax scales with housing tier and market level", () => {
  // Per-tier base rates and per-level multipliers come from MarketSystem
  // constants — the tax = floor(base × multiplier) per housed building.
  assert.equal(MARKET_TAX_PER_HOUSING_TIER.tile, 1);
  assert.equal(MARKET_TAX_PER_HOUSING_TIER.noble, 12);
  assert.equal(MARKET_LEVEL_MULTIPLIER[0], 1.0);
  assert.equal(MARKET_LEVEL_MULTIPLIER[4], 1.8);

  // Synthesize: one compound (深宅, base 3) covered by one L1 market.
  const state = boot();
  state.buildings = [
    { id: 1, type: "market", name: "市场", category: "service", x: 10, y: 10, level: 1, connected: true, status: "complete" },
    { id: 2, type: "hut", name: "深宅", category: "housing", x: 11, y: 10, level: 4, connected: true, status: "complete", housingTier: "compound", residents: 24 }
  ];
  assert.equal(marketCommercialTax(state), 3);

  // Bumping market level boosts the take: 3 × 1.8 = 5.4 → floor 5.
  state.buildings[0].level = 5;
  assert.equal(marketCommercialTax(state), 5);

  // Without a market in range, no commercial tax even with top-tier homes.
  state.buildings = [
    { id: 1, type: "hut", name: "甲第", category: "housing", x: 5, y: 5, level: 7, connected: true, status: "complete", housingTier: "noble", residents: 70 }
  ];
  assert.equal(marketCommercialTax(state), 0);
});

run("market commercial tax appears in coin breakdown after production", () => {
  const state = boot();
  // Drop a market and a tile-house adjacent on plain hub.
  placeBuilding(state, "road", 38, 38);
  placeBuilding(state, "market", 39, 38);
  placeBuilding(state, "hut", 38, 39);
  for (let i = 0; i < 3; i += 1) advanceSeason(state);
  const hut = state.buildings.find((b) => b.type === "hut");
  hut.housingTier = "tile";
  hut.residents = 8;
  hut.level = 2;
  advanceSeason(state);
  const sources = state.resourceBreakdowns.coin.sources.map((s) => s.label);
  assert.ok(sources.some((label) => label.includes("市场商税")));
});

run("generated maps yield substantial fertile soil near rivers", () => {
  // After M5a generosity bump every archetype should produce well over 200
  // fertile tiles on the test seed (~3% of an 80×80 map at minimum).
  for (const archetype of [ARCHETYPES.WEI, ARCHETYPES.PASS, ARCHETYPES.DELTA]) {
    const map = generateMap(123, archetype);
    let fertile = 0;
    for (const tile of map.tiles) if (tile.terrain === TERRAIN.FERTILE) fertile += 1;
    assert.ok(fertile > 200, `${archetype} should expose >200 fertile tiles, got ${fertile}`);
  }
});

run("bulk upgrade silently skips ineligible buildings, no popup needed", () => {
  const state = boot();
  // Two wells: one connected, one floating without road access.
  placeBuilding(state, "road", 38, 38);
  placeBuilding(state, "well", 38, 39);
  placeBuilding(state, "well", 50, 50);
  for (let i = 0; i < 2; i += 1) advanceSeason(state);
  recomputeRoadAccess(state);
  const wells = state.buildings.filter((b) => b.type === "well");
  assert.equal(wells.length, 2);
  const result = upgradeBuildingBatch(state, wells.map((w) => w.id));
  // The connected well should be in upgrade pending; the disconnected one
  // simply skipped (no exception, no console.confirm needed).
  assert.equal(result.upgraded, 1);
  assert.equal(result.rejected.length, 1);
  const connected = wells.find((w) => w.connected);
  assert.ok(connected.upgradePending, "connected well should be upgrading");
});

// ---------- M6: festival, neighbor, hall-of-fame, autosave ----------

import {
  initializeNeighbors, neighborForResource, neighborBuyPriceMultiplier,
  neighborSellPriceMultiplier, envoyCost, sendNeighborEnvoy
} from "../src/sim/NeighborSystem.js";
import { festivalCost } from "../src/sim/FestivalSystem.js";
import {
  AUTOSAVE_KEY, HALL_OF_FAME_KEY, HALL_OF_FAME_LIMIT,
  appendHallOfFameEntry, clearAutosave, hasAutosave, loadAutosave,
  readHallOfFame, writeAutosave, writeHallOfFame
} from "../src/sim/SaveSystem.js";

// localStorage doesn't exist in Node; provide a tiny in-memory shim before
// touching any storage helper. Tests that don't touch storage don't need it.
function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); }
  };
}

run("festival cost is ratio-based and capped at 5000 / 3000 钱", () => {
  // 8% / 2% of treasury within the [min, cap] band.
  assert.equal(festivalCost(0, "lavish"), 30);          // floor cap
  assert.equal(festivalCost(0, "simple"), 10);          // floor cap
  assert.equal(festivalCost(1000, "lavish"), 80);       // 1000 × 0.08
  assert.equal(festivalCost(1000, "simple"), 20);       // 1000 × 0.02
  assert.equal(festivalCost(100000, "lavish"), 5000);   // hard cap
  assert.equal(festivalCost(200000, "simple"), 3000);   // hard cap
  assert.equal(festivalCost(60000, "lavish"), 4800);    // 60000 × 0.08, under cap
});

run("M6 neighbors initialize as 3 fixed counties bound to grain/wood/cloth", () => {
  const state = boot();
  initializeNeighbors(state);
  assert.equal(state.neighbors.length, 3);
  const grain = neighborForResource(state, "grain");
  const wood = neighborForResource(state, "wood");
  const cloth = neighborForResource(state, "cloth");
  assert.ok(grain && wood && cloth);
  assert.equal(grain.attitude, 40);
  assert.equal(wood.attitude, 40);
  assert.equal(cloth.attitude, 40);
});

run("neighbor buy/sell multipliers walk a clean curve from 0 to 100", () => {
  const state = boot();
  initializeNeighbors(state);
  const grain = neighborForResource(state, "grain");
  // attitude 0 → buy 1.5×, sell 0.8×
  grain.attitude = 0;
  assert.equal(Number(neighborBuyPriceMultiplier(state, "grain").toFixed(2)), 1.5);
  assert.equal(Number(neighborSellPriceMultiplier(state, "grain").toFixed(2)), 0.8);
  // attitude 100 → buy 0.8×, sell 1.5×
  grain.attitude = 100;
  assert.equal(Number(neighborBuyPriceMultiplier(state, "grain").toFixed(2)), 0.8);
  assert.equal(Number(neighborSellPriceMultiplier(state, "grain").toFixed(2)), 1.5);
  // attitude 50 → buy and sell both 1.15×
  grain.attitude = 50;
  assert.equal(Number(neighborBuyPriceMultiplier(state, "grain").toFixed(2)), 1.15);
  assert.equal(Number(neighborSellPriceMultiplier(state, "grain").toFixed(2)), 1.15);
});

run("envoy cost grows quadratically with attitude (1% → 80% of treasury)", () => {
  const state = boot();
  state.resources.coin = 10000;
  initializeNeighbors(state);
  const grain = neighborForResource(state, "grain");
  grain.attitude = 0;
  assert.equal(envoyCost(state, "grain"), 100);   // 1% of 10000
  grain.attitude = 50;
  assert.equal(envoyCost(state, "grain"), 2075);  // 0.01 + 0.25*0.79 = 0.2075
  grain.attitude = 100;
  assert.equal(envoyCost(state, "grain"), 8000);  // 80% of 10000
  grain.attitude = 80;
  // 0.01 + 0.64*0.79 = 0.5156 → 5156
  assert.equal(envoyCost(state, "grain"), 5156);
});

run("envoy bumps only the targeted neighbor's attitude", () => {
  const state = boot();
  state.resources.coin = 5000;
  initializeNeighbors(state);
  const before = state.neighbors.map((n) => n.attitude);
  assert.equal(sendNeighborEnvoy(state, "wood"), true);
  const after = state.neighbors.map((n) => n.attitude);
  const woodIdx = state.neighbors.findIndex((n) => n.resource === "wood");
  for (let i = 0; i < state.neighbors.length; i += 1) {
    if (i === woodIdx) assert.equal(after[i], before[i] + 5);
    else assert.equal(after[i], before[i]);
  }
});

run("envoy refuses to spend when attitude is already at 100", () => {
  const state = boot();
  state.resources.coin = 5000;
  initializeNeighbors(state);
  const wood = neighborForResource(state, "wood");
  wood.attitude = 100;
  const coinBefore = state.resources.coin;
  assert.equal(sendNeighborEnvoy(state, "wood"), false);
  assert.equal(state.resources.coin, coinBefore);
});

run("hall-of-fame keeps top 50 by months and is sorted descending", () => {
  installLocalStorageShim();
  writeHallOfFame([]);
  // Insert 60 entries with random months.
  for (let i = 0; i < 60; i += 1) {
    appendHallOfFameEntry({ months: Math.floor(Math.random() * 200), title: `t${i}` });
  }
  const hall = readHallOfFame();
  assert.equal(hall.length, HALL_OF_FAME_LIMIT);
  for (let i = 1; i < hall.length; i += 1) {
    assert.ok((hall[i - 1].months || 0) >= (hall[i].months || 0));
  }
});

run("autosave write/clear round-trips through localStorage", () => {
  installLocalStorageShim();
  clearAutosave();
  assert.equal(hasAutosave(), false);
  const state = boot();
  assert.equal(writeAutosave(state), true);
  assert.equal(hasAutosave(), true);
  const reloaded = loadAutosave(buildingDefs);
  assert.ok(reloaded);
  assert.equal(reloaded.seed, state.seed);
  assert.equal(reloaded.totalMonthsElapsed, state.totalMonthsElapsed);
  clearAutosave();
  assert.equal(hasAutosave(), false);
});
