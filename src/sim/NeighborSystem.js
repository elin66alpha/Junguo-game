import { MAP_HEIGHT, MAP_WIDTH, TERRAIN } from "../model/constants.js";
import { addEvent } from "./GameState.js";
import { hasWonder } from "./WonderSystem.js";

// M6 邻郡机制
//
// 三个固定邻郡，分别绑定一种贸易资源（粮食 / 木材 / 布）。
// 态度独立，0–100；初始 40（中立偏冷）。
// 价格、遣使费用都按资源对应那一个邻郡的态度单独算。

export const NEIGHBOR_RESOURCE_LABELS = {
  grain: "粮郡",
  wood: "木郡",
  cloth: "布郡"
};

const NEIGHBOR_NAME_POOL = {
  grain: ["安陵", "颍川", "陈留", "南阳", "汝南"],
  wood: ["上党", "太原", "代郡", "雁门", "河东"],
  cloth: ["会稽", "吴郡", "丹阳", "豫章", "广陵"]
};

const ATTITUDE_MIN = 0;
const ATTITUDE_MAX = 100;
const ATTITUDE_INITIAL = 40;
const ATTITUDE_PER_ENVOY = 5;

function isM6Shape(neighbors) {
  return Array.isArray(neighbors)
    && neighbors.length === 3
    && neighbors.every((n) => n && typeof n.resource === "string");
}

export function initializeNeighbors(state) {
  if (isM6Shape(state.neighbors)) {
    // Make sure attitude stays in M6 range even if loaded from a fresh save
    // that already had the right shape but somehow drifted out of bounds.
    for (const n of state.neighbors) n.attitude = clampAttitude(n.attitude);
    state.neighborNetwork = state.neighborNetwork || { riverExits: riverExitCount(state), lastTickMonth: -1 };
    return;
  }
  const seed = state.seed || 100;
  const pick = (key, salt) => {
    const pool = NEIGHBOR_NAME_POOL[key];
    return pool[(Math.abs(seed * salt) | 0) % pool.length];
  };
  state.neighbors = [
    { id: "n-grain", resource: "grain", name: pick("grain", 7),  attitude: ATTITUDE_INITIAL, tradeVolume: 0 },
    { id: "n-wood",  resource: "wood",  name: pick("wood", 13),  attitude: ATTITUDE_INITIAL, tradeVolume: 0 },
    { id: "n-cloth", resource: "cloth", name: pick("cloth", 19), attitude: ATTITUDE_INITIAL, tradeVolume: 0 }
  ];
  state.neighborNetwork = {
    riverExits: riverExitCount(state),
    lastTickMonth: -1
  };
}

export function riverExitCount(state) {
  const exits = new Set();
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    if (state.tiles?.[x]?.terrain === TERRAIN.RIVER) exits.add("north");
    if (state.tiles?.[(MAP_HEIGHT - 1) * MAP_WIDTH + x]?.terrain === TERRAIN.RIVER) exits.add("south");
  }
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    if (state.tiles?.[y * MAP_WIDTH]?.terrain === TERRAIN.RIVER) exits.add("west");
    if (state.tiles?.[y * MAP_WIDTH + MAP_WIDTH - 1]?.terrain === TERRAIN.RIVER) exits.add("east");
  }
  return exits.size;
}

// ---------- accessors ----------

export function neighborForResource(state, resourceKey) {
  initializeNeighbors(state);
  return state.neighbors.find((n) => n.resource === resourceKey) || null;
}

export function attitudeLabel(value) {
  if (value >= 75) return "亲善";
  if (value >= 50) return "中立";
  if (value >= 25) return "警惕";
  return "敌对";
}

export function attitudeTone(value) {
  if (value >= 75) return "good";
  if (value >= 50) return "neutral";
  if (value >= 25) return "warn";
  return "bad";
}

export function averageAttitude(state) {
  initializeNeighbors(state);
  if (!state.neighbors.length) return ATTITUDE_INITIAL;
  return Math.round(state.neighbors.reduce((s, n) => s + (n.attitude || 0), 0) / state.neighbors.length);
}

// ---------- price & envoy formulas ----------

// Buy multiplier: att 0 → 1.5×, att 50 → 1.15×, att 100 → 0.8×.
export function neighborBuyPriceMultiplier(state, resourceKey) {
  const n = neighborForResource(state, resourceKey);
  if (!n) return 1;
  return 1.5 - (n.attitude / ATTITUDE_MAX) * 0.7;
}

// Sell multiplier: att 0 → 0.8×, att 50 → 1.15×, att 100 → 1.5×.
export function neighborSellPriceMultiplier(state, resourceKey) {
  const n = neighborForResource(state, resourceKey);
  if (!n) return 1;
  return 0.8 + (n.attitude / ATTITUDE_MAX) * 0.7;
}

// 遣使费用：当前钱 × (0.01 + (att/100)^2 × 0.79)，最少 10 钱。
// att 0 → 1% 钱；att 50 → 21% 钱；att 80 → 52% 钱；att 100 → 80% 钱。
export function envoyCost(state, resourceKey) {
  const n = neighborForResource(state, resourceKey);
  if (!n) return 0;
  const att = clampAttitude(n.attitude || 0);
  const ratio = 0.01 + Math.pow(att / ATTITUDE_MAX, 2) * 0.79;
  return Math.max(10, Math.floor((state.resources?.coin || 0) * ratio));
}

// ---------- mutations ----------

export function sendNeighborEnvoy(state, resourceKey) {
  initializeNeighbors(state);
  const n = neighborForResource(state, resourceKey);
  if (!n) return false;
  if (n.attitude >= ATTITUDE_MAX) {
    addEvent(state, `${n.name}态度已达亲善上限。`, "warn");
    return false;
  }
  const cost = envoyCost(state, resourceKey);
  state.resources.coin -= cost;
  state.lastDeltas.coin -= cost;
  state.resourceBreakdowns.coin.sinks.push({ label: `遣使${n.name}`, amount: cost });
  n.attitude = clampAttitude((n.attitude || 0) + ATTITUDE_PER_ENVOY);
  addEvent(state, `遣使 ${n.name}（-${cost} 钱），态度 +${ATTITUDE_PER_ENVOY}。`);
  return true;
}

// 贸易行为只加对应邻郡的态度，不再三个一起涨。
export function recordNeighborTrade(state, resourceKey, amount, direction = "trade", options = {}) {
  initializeNeighbors(state);
  const n = neighborForResource(state, resourceKey);
  if (!n) return;
  const delta = Math.min(3, Math.max(1, Math.floor(amount / 20)));
  n.tradeVolume = (n.tradeVolume || 0) + amount;
  n.attitude = clampAttitude((n.attitude || 0) + delta);
  if (options.silent) return;
  const label = direction === "sell" ? "售货往来" : "采买往来";
  addEvent(state, `${label}使${n.name}态度 +${delta}。`);
}

// 全局调整（事件 / 节庆中的 neighborAttitude 效果走这条路）
export function adjustNeighborAttitude(state, amount, label = "政务往来") {
  initializeNeighbors(state);
  for (const neighbor of state.neighbors) {
    neighbor.attitude = clampAttitude((neighbor.attitude || 0) + amount);
  }
  if (label) addEvent(state, `${label}：邻郡态度 ${amount > 0 ? "+" : ""}${amount}。`);
}

// ---------- monthly tick ----------

export function neighborEventChanceBonus(state) {
  const avg = averageAttitude(state);
  if (avg < 25) return 0.14;
  if (avg < 50) return 0.06;
  return 0;
}

export function riverRiskFromNeighbors(state) {
  const avg = averageAttitude(state);
  if (avg >= 75) return -0.03;
  if (avg < 25) return 0.08;
  if (avg < 50) return 0.04;
  return 0;
}

export function tickNeighbors(state) {
  initializeNeighbors(state);
  if (state.neighborNetwork.lastTickMonth === state.totalMonthsElapsed) return;
  state.neighborNetwork.lastTickMonth = state.totalMonthsElapsed;

  if (hasWonder(state, "grandMarketTower")) {
    for (const neighbor of state.neighbors) {
      neighbor.attitude = clampAttitude((neighbor.attitude || 0) + 1);
    }
  }

  const avg = averageAttitude(state);
  if (avg >= 75 && state.rng.next() < 0.12) {
    const grain = Math.min(40, Math.max(0, (state.resourceCaps?.grain || 0) - state.resources.grain));
    if (grain > 0) {
      state.resources.grain += grain;
      state.lastDeltas.grain += grain;
      state.resourceBreakdowns.grain.sources.push({ label: "邻郡互援", amount: grain });
      addEvent(state, `邻郡互援：送来 ${grain} 粮食。`);
    }
  } else if (avg < 25 && state.rng.next() < 0.1) {
    const loss = Math.min(25, Math.max(0, state.resources.grain));
    if (loss > 0) {
      state.resources.grain -= loss;
      state.lastDeltas.grain -= loss;
      state.resourceBreakdowns.grain.sinks.push({ label: "边境盗匪", amount: loss });
      addEvent(state, `边境盗匪滋扰，损失 ${loss} 粮食。`, "warn");
    }
  }
}

function clampAttitude(value) {
  return Math.max(ATTITUDE_MIN, Math.min(ATTITUDE_MAX, Math.round(value || 0)));
}
