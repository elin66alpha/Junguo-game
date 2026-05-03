import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGameState } from "../src/sim/GameState.js";
import { placeBuilding } from "../src/sim/BuildingSystem.js";
import { advanceSeason, initializeSeasonState } from "../src/sim/SeasonSystem.js";

const buildingDefs = JSON.parse(await readFile(new URL("../src/data/buildings.json", import.meta.url), "utf8"));
const seeds = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];

function boot(seed) {
  const state = createGameState(buildingDefs, seed);
  initializeSeasonState(state);
  state.eventCooldown = 999;
  return state;
}

function buildStarterCounty(state) {
  const placements = [
    ["road", 38, 38],
    ["road", 35, 39],
    ["road", 39, 38],
    ["road", 40, 38],
    ["road", 41, 38],
    ["well", 38, 39],
    ["granary", 39, 39],
    ["workshop", 36, 37],
    ["market", 41, 39],
    ["shrine", 36, 39],
    ["hut", 38, 37]
  ];
  for (const [type, x, y] of placements) placeBuilding(state, type, x, y, { silent: true });
}

function runUntilEnd(state, maxMonths) {
  while (!state.evaluation && state.totalMonthsElapsed < maxMonths) advanceSeason(state);
  return {
    seed: state.seed,
    archetype: state.archetypeLabel,
    months: state.totalMonthsElapsed,
    qishu: state.qishu,
    ended: Boolean(state.evaluation)
  };
}

function summarize(label, rows) {
  const months = rows.map((row) => row.months);
  const avg = months.reduce((sum, value) => sum + value, 0) / months.length;
  const min = Math.min(...months);
  const max = Math.max(...months);
  return { label, min, max, avg: Number(avg.toFixed(1)), rows };
}

const idle = summarize("空城基准", seeds.map((seed) => runUntilEnd(boot(seed), 40)));
const starter = summarize("最低可玩基准", seeds.map((seed) => {
  const state = boot(seed);
  buildStarterCounty(state);
  return runUntilEnd(state, 90);
}));

for (const row of idle.rows) {
  assert.equal(row.ended, true, `空城应在 40 月内结束：${JSON.stringify(row)}`);
  assert.ok(row.months >= 7 && row.months <= 10, `空城结束时间应在 7-10 月：${JSON.stringify(row)}`);
}

for (const row of starter.rows) {
  assert.equal(row.ended, true, `最低可玩基准应在 90 月内结束：${JSON.stringify(row)}`);
  assert.ok(row.months >= 36 && row.months <= 66, `最低可玩基准结束时间应在 36-66 月：${JSON.stringify(row)}`);
}

console.log("气数曲线基准");
console.table([
  { 场景: idle.label, 最短月数: idle.min, 最长月数: idle.max, 平均月数: idle.avg },
  { 场景: starter.label, 最短月数: starter.min, 最长月数: starter.max, 平均月数: starter.avg }
]);
