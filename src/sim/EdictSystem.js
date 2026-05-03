import { aggregateEdictModifiers, defaultEdicts, EDICTS } from "../data/edicts.js";
import { addEvent } from "./GameState.js";

const MID_TERM_SWITCH_COST = 20;

export function initializeEdicts(state) {
  state.edicts = state.edicts || defaultEdicts();
  state.edictModifiers = aggregateEdictModifiers(state.edicts);
}

export function setEdict(state, slot, optionId, options = {}) {
  if (!EDICTS[slot]) return false;
  const option = EDICTS[slot].options.find((item) => item.id === optionId);
  if (!option) return false;
  if (state.edicts[slot] === optionId) return false;

  if (!options.free && state.totalMonthsElapsed > 0 && state.monthIndex !== 0) {
    if (state.resources.coin < MID_TERM_SWITCH_COST) {
      addEvent(state, `任内调政需 ${MID_TERM_SWITCH_COST} 钱，府库不足。`, "warn");
      return false;
    }
    state.resources.coin -= MID_TERM_SWITCH_COST;
    state.lastDeltas.coin -= MID_TERM_SWITCH_COST;
    state.resourceBreakdowns.coin.sinks.push({ label: "任内调政", amount: MID_TERM_SWITCH_COST });
  }

  state.edicts[slot] = optionId;
  state.edictModifiers = aggregateEdictModifiers(state.edicts);
  addEvent(state, `${EDICTS[slot].label}改为「${option.label}」。`);
  return true;
}

export function edictTaxMultiplier(state) {
  return state.edictModifiers?.taxMultiplier ?? 1;
}

export function edictGrainConsumeMultiplier(state) {
  return state.edictModifiers?.grainConsumeMultiplier ?? 1;
}

export function edictMoraleDelta(state) {
  return state.edictModifiers?.moraleDelta ?? 0;
}

export function edictOrderDelta(state) {
  return state.edictModifiers?.orderDelta ?? 0;
}
