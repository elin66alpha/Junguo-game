import { EVENTS, pickEvent } from "../data/events.js";
import { HOUSING_TIERS } from "../model/constants.js";
import { addEvent } from "./GameState.js";
import { applyQishuDelta, qishuMax } from "./QishuSystem.js";

const EVENT_BASE_CHANCE = 0.32;
const EVENT_WARMUP_MONTHS = 3;

export function initializeEvents(state) {
  state.activeModifiers = state.activeModifiers || [];
  state.activeDiscounts = state.activeDiscounts || [];
  state.activeIndicatorModifiers = state.activeIndicatorModifiers || [];
  state.pendingEvent = state.pendingEvent || null;
  state.eventCooldown = state.eventCooldown ?? EVENT_WARMUP_MONTHS;
}

export function rollMonthlyEvent(state) {
  if (state.pendingEvent) return null;
  if (state.totalMonthsElapsed < EVENT_WARMUP_MONTHS) return null;
  if (state.eventCooldown > 0) {
    state.eventCooldown -= 1;
    return null;
  }
  const monthInYear = state.monthIndex + 1;
  const chance = EVENT_BASE_CHANCE + (state.neighborEventChanceBonus || 0);
  if (state.rng.next() > chance) return null;
  const event = pickEvent(state.rng, monthInYear, state);
  if (!event) return null;
  return openEvent(state, event);
}

export function forceMonthlyEvent(state) {
  if (state.pendingEvent) return state.pendingEvent;
  const monthInYear = state.monthIndex + 1;
  const event = pickEvent(state.rng, monthInYear, state) || EVENTS[0];
  if (!event) return null;
  return openEvent(state, event);
}

export function openEvent(state, event) {
  state.pendingEvent = {
    id: event.id,
    title: event.title,
    description: event.description,
    choices: event.choices,
    raisedAt: state.totalMonthsElapsed
  };
  state.eventCooldown = 2;
  addEvent(state, `事件：${event.title}`);
  return state.pendingEvent;
}

export function resolveEventChoice(state, choiceId) {
  if (!state.pendingEvent) return false;
  const eventDef = EVENTS.find((event) => event.id === state.pendingEvent.id) || state.pendingEvent;
  if (!eventDef) {
    state.pendingEvent = null;
    return false;
  }
  const choice = eventDef.choices.find((item) => item.id === choiceId);
  if (!choice) return false;
  for (const effect of choice.effects) applyEffect(state, effect);
  addEvent(state, `事件回应：${eventDef.title} - ${choice.label}`);
  state.pendingEvent = null;
  return true;
}

function applyEffect(state, effect) {
  switch (effect.type) {
    case "resources": {
      for (const key of ["grain", "cloth", "wood", "coin"]) {
        if (effect[key]) {
          const amount = key === "coin" && !effect.fixed ? scaledCoinDelta(state, effect[key]) : effect[key];
          state.resources[key] = key === "coin"
            ? state.resources[key] + amount
            : Math.max(0, (state.resources[key] ?? 0) + amount);
          state.lastDeltas[key] += amount;
          if (amount > 0) state.resourceBreakdowns[key].sources.push({ label: "事件", amount });
          else state.resourceBreakdowns[key].sinks.push({ label: "事件", amount: -amount });
        }
      }
      break;
    }
    case "indicator":
      state.activeIndicatorModifiers.push({
        key: effect.key,
        delta: effect.delta,
        monthsLeft: effect.months || 3,
        label: effect.label || "事件影响"
      });
      break;
    case "morale":
    case "order":
    case "prestige":
      state.activeIndicatorModifiers.push({
        key: effect.type,
        delta: effect.delta,
        monthsLeft: effect.months || 3,
        label: effect.label || "事件影响"
      });
      break;
    case "qishu": {
      const amount = scaledQishuDelta(state, effect.delta);
      if (amount !== 0) applyQishuDelta(state, amount, "事件回应");
      break;
    }
    case "modifier":
      state.activeModifiers.push({
        key: effect.key,
        multiplier: effect.multiplier,
        monthsLeft: effect.months,
        label: effect.label || ""
      });
      break;
    case "discount":
      state.activeDiscounts.push({
        key: effect.key,
        percent: effect.percent,
        monthsLeft: effect.months,
        label: effect.label || ""
      });
      break;
    case "fillHousing": {
      let remaining = effect.residents;
      for (const building of state.buildings) {
        if (remaining <= 0) break;
        if (building.status !== "complete" || building.category !== "housing") continue;
        const cap = HOUSING_TIERS[building.housingTier].maxResidents;
        const room = cap - (building.residents || 0);
        if (room <= 0) continue;
        const take = Math.min(remaining, room);
        building.residents = (building.residents || 0) + take;
        remaining -= take;
      }
      break;
    }
    case "neighborAttitude": {
      const amount = effect.amount || 0;
      // M6: attitude is now 0–100 (per-neighbor); clamp accordingly.
      for (const neighbor of state.neighbors || []) {
        neighbor.attitude = Math.max(0, Math.min(100, Math.round((neighbor.attitude || 0) + amount)));
      }
      break;
    }
    default: break;
  }
}

function scaledCoinDelta(state, amount) {
  const current = state.resources.coin || 0;
  if (amount < 0) {
    const base = Math.abs(amount);
    const proportional = current > 0 ? Math.ceil(current * 0.04) : base;
    return -Math.max(base, proportional);
  }
  if (amount > 0) {
    const proportional = current > 0 ? Math.ceil(current * 0.02) : 0;
    return Math.min(600, Math.max(amount, proportional));
  }
  return 0;
}

function scaledQishuDelta(state, amount) {
  const current = state.qishu || 0;
  if (amount < 0) {
    if (current <= 1) return 0;
    const cap = Math.max(1, Math.floor(current * 0.35));
    return -Math.min(Math.abs(amount), cap, current - 1);
  }
  if (amount > 0) {
    const room = qishuMax() - current;
    if (room <= 0) return 0;
    return Math.min(amount, room, Math.max(1, Math.ceil(room * 0.35)));
  }
  return 0;
}

export function tickModifiers(state) {
  state.activeModifiers = (state.activeModifiers || [])
    .map((modifier) => ({ ...modifier, monthsLeft: modifier.monthsLeft - 1 }))
    .filter((modifier) => modifier.monthsLeft > 0);
  state.activeDiscounts = (state.activeDiscounts || [])
    .map((discount) => ({ ...discount, monthsLeft: discount.monthsLeft - 1 }))
    .filter((discount) => discount.monthsLeft > 0);
  state.activeIndicatorModifiers = (state.activeIndicatorModifiers || [])
    .map((modifier) => ({ ...modifier, monthsLeft: modifier.monthsLeft - 1 }))
    .filter((modifier) => modifier.monthsLeft > 0);
}

export function modifierMultiplier(state, key) {
  let value = 1;
  for (const modifier of state.activeModifiers || []) {
    if (modifier.key === key) value *= modifier.multiplier;
  }
  return value;
}

export function discountPercent(state, buildingType) {
  let max = 0;
  for (const discount of state.activeDiscounts || []) {
    if (discount.key === "all" || discount.key === buildingType) {
      if (discount.percent > max) max = discount.percent;
    }
  }
  return max;
}

export function indicatorModifierDelta(state, key) {
  return (state.activeIndicatorModifiers || [])
    .filter((modifier) => modifier.key === key)
    .reduce((sum, modifier) => sum + modifier.delta, 0);
}

export function indicatorModifierBreakdown(state, key) {
  return (state.activeIndicatorModifiers || [])
    .filter((modifier) => modifier.key === key)
    .map((modifier) => ({ label: `事件：${modifier.label}`, amount: modifier.delta }));
}
