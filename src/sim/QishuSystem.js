// Qishu — the regime's life-force.
// Drains every month from a base attrition. Good governance slows the drain
// and can even add to it; bad governance accelerates the collapse. When qishu
// reaches 0, the term ends.

import { isPrestigeHousingTier } from "../model/housingRules.js";

const QISHU_MAX = 50;
const QISHU_INITIAL = 20;
const BASE_ATTRITION = 2;

export function initializeQishu(state) {
  if (state.qishu == null) state.qishu = QISHU_INITIAL;
  state.qishuDelta = state.qishuDelta ?? 0;
  state.qishuBreakdown = state.qishuBreakdown ?? [];
}

export function updateQishu(state) {
  const breakdown = [];
  let delta = -BASE_ATTRITION;
  breakdown.push({ label: "天命流逝", amount: -BASE_ATTRITION });

  const populated = state.population > 0;
  if (!populated && state.totalMonthsElapsed > 6) {
    delta -= 3;
    breakdown.push({ label: "辖境无民", amount: -3 });
  }

  if (!populated) {
    state.qishu = clamp(state.qishu + delta);
    state.qishuDelta = delta;
    state.qishuBreakdown = breakdown;
    return;
  }

  const morale = state.indicators.morale;
  if (morale >= 70) { delta += 2; breakdown.push({ label: "民心高涨", amount: 2 }); }
  else if (morale < 15) { delta -= 3; breakdown.push({ label: "民心崩坏", amount: -3 }); }
  else if (morale < 30) { delta -= 2; breakdown.push({ label: "民心低迷", amount: -2 }); }

  const order = state.indicators.order;
  if (order >= 70) { delta += 2; breakdown.push({ label: "治安肃然", amount: 2 }); }
  else if (order < 30) { delta -= 2; breakdown.push({ label: "盗贼横行", amount: -2 }); }

  const prestige = state.indicators.prestige;
  if (prestige >= 80) { delta += 3; breakdown.push({ label: "声望卓著", amount: 3 }); }
  else if (prestige >= 50) { delta += 2; breakdown.push({ label: "声望渐隆", amount: 2 }); }

  const foodRatio = state.foodRatio ?? 1;
  if (foodRatio < 0.99) { delta -= 4; breakdown.push({ label: "饥馑", amount: -4 }); }
  else if (state.resources.grain > 100) { delta += 1; breakdown.push({ label: "粮仓充盈", amount: 1 }); }

  const debt = Math.max(0, -(state.resources.coin || 0));
  if (debt >= 100) {
    const penalty = Math.min(4, Math.ceil(debt / 300));
    delta -= penalty;
    breakdown.push({ label: "府库赤字", amount: -penalty });
  }

  // M5a/M5b: 高级住房和豪宅都贡献地方气象，封顶以免后期只靠堆住房。
  const topTierHomes = state.buildings.filter((b) => {
    if (b.status !== "complete" || b.category !== "housing") return false;
    return isPrestigeHousingTier(b.housingTier);
  }).length;
  if (topTierHomes > 0) {
    const bonus = Math.min(5, topTierHomes);
    delta += bonus;
    breakdown.push({ label: `深宅豪宅（${topTierHomes}）`, amount: bonus });
  }

  const completeNonRoad = state.buildings.filter((b) =>
    b.status === "complete" && b.type !== "road" && b.type !== "bridge"
  );
  const disconnected = completeNonRoad.filter((b) => !b.connected).length;
  if (completeNonRoad.length > 0 && disconnected / completeNonRoad.length > 0.3) {
    delta -= 2;
    breakdown.push({ label: "道路荒废", amount: -2 });
  }

  const milestoneCount = (state.milestonesAwarded || []).length;
  if (milestoneCount > 0) {
    const passive = milestoneCount;
    delta += passive;
    breakdown.push({ label: `里程碑加成（${milestoneCount}）`, amount: passive });
  }

  state.qishu = clamp(state.qishu + delta);
  state.qishuDelta = delta;
  state.qishuBreakdown = breakdown;
}

export function applyQishuDelta(state, amount, label) {
  state.qishu = clamp(state.qishu + amount);
  if (state.qishuOneTime == null) state.qishuOneTime = [];
  state.qishuOneTime.push({ label, amount });
}

export function isMandateLost(state) {
  return state.qishu <= 0;
}

export function qishuMax() {
  return QISHU_MAX;
}

function clamp(value) {
  return Math.max(0, Math.min(QISHU_MAX, Math.round(value)));
}
