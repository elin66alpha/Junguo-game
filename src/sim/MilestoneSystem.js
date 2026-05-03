import { MILESTONES } from "../data/milestones.js";
import { addEvent } from "./GameState.js";
import { applyQishuDelta } from "./QishuSystem.js";

export function initializeMilestones(state) {
  state.milestonesAwarded = state.milestonesAwarded || [];
  state.pendingMilestone = state.pendingMilestone || null;
}

export function checkMilestones(state) {
  if (state.pendingMilestone) return;
  for (const milestone of MILESTONES) {
    if (state.milestonesAwarded.includes(milestone.id)) continue;
    if (state.indicators.prestige >= milestone.threshold) {
      grantMilestone(state, milestone);
      return;
    }
  }
}

function grantMilestone(state, milestone) {
  state.milestonesAwarded.push(milestone.id);
  state.pendingMilestone = { id: milestone.id, title: milestone.title, label: milestone.reward.label };
  addEvent(state, `里程碑：${milestone.title} - ${milestone.reward.label}`);
  applyReward(state, milestone.reward);
  if (milestone.qishuReward) applyQishuDelta(state, milestone.qishuReward, milestone.title);
}

function applyReward(state, reward) {
  switch (reward.type) {
    case "freeBuilding":
      state.pendingFreeGrants = state.pendingFreeGrants || [];
      state.pendingFreeGrants.push({ type: reward.buildingType, count: reward.count });
      break;
    case "discount":
      state.activeDiscounts = state.activeDiscounts || [];
      state.activeDiscounts.push({
        key: reward.key,
        percent: reward.percent,
        monthsLeft: reward.months,
        label: reward.label
      });
      break;
    default: break;
  }
}

export function consumeFreeGrant(state, type) {
  if (!state.pendingFreeGrants) return false;
  const grant = state.pendingFreeGrants.find((item) => item.type === type && item.count > 0);
  if (!grant) return false;
  grant.count -= 1;
  if (grant.count <= 0) state.pendingFreeGrants = state.pendingFreeGrants.filter((item) => item.count > 0);
  return true;
}

export function freeGrantCount(state, type) {
  const grant = (state.pendingFreeGrants || []).find((item) => item.type === type);
  return grant ? grant.count : 0;
}

export function dismissMilestone(state) {
  state.pendingMilestone = null;
}
