import { TRADE_BASE_PRICES, TRADE_ROUTE_LABELS } from "./MarketSystem.js";
import { activeBuildings } from "./BuildingSystem.js";
import { addEvent } from "./GameState.js";
import { updateResourceCaps } from "./ResourceSystem.js";
import { openEvent } from "./EventSystem.js";
import { riverExitCount, riverRiskFromNeighbors } from "./NeighborSystem.js";
import { canalGrainDiscountMultiplier } from "./WonderSystem.js";

const ROUTES = [
  { key: "grain", label: "漕粮", amount: 36 },
  { key: "wood", label: "漕木", amount: 12 },
  { key: "cloth", label: "漕布", amount: 10 }
];

export function initializeRiverTransport(state) {
  state.riverTransport = state.riverTransport || {
    lastMonth: -1,
    currentRoute: "grain",
    lastRisk: "无"
  };
}

export function riverDockActive(state) {
  return activeBuildings(state, "riverDock").length > 0 && riverExitCount(state) > 0;
}

export function runRiverTransport(state) {
  initializeRiverTransport(state);
  if (!riverDockActive(state)) return;
  if (state.riverTransport.lastMonth === state.totalMonthsElapsed) return;
  state.riverTransport.lastMonth = state.totalMonthsElapsed;

  const route = ROUTES[state.monthIndex % ROUTES.length];
  state.riverTransport.currentRoute = route.key;
  const exits = Math.max(1, riverExitCount(state));
  const dockLevel = Math.max(1, activeBuildings(state, "riverDock").reduce((best, dock) => Math.max(best, dock.level || 1), 1));
  const amount = Math.floor(route.amount * (1 + (exits - 1) * 0.15) * (1 + (dockLevel - 1) * 0.15));
  const risk = Math.max(0.02, 0.07 + riverRiskFromNeighbors(state) - (dockLevel - 1) * 0.01);

  if (!state.pendingEvent && state.rng.next() < risk) {
    state.riverTransport.lastRisk = route.key === "grain" ? "沉船" : "盗船";
    openEvent(state, canalRiskEvent(route, amount));
    return;
  }

  updateResourceCaps(state);
  const cap = state.resourceCaps?.[route.key] ?? Infinity;
  const current = state.resources[route.key] ?? 0;
  const stored = Math.min(amount, Math.max(0, cap - current));
  if (stored <= 0) {
    addEvent(state, `${route.label}抵港，但仓储已满。`);
    return;
  }

  const basePrice = TRADE_BASE_PRICES[route.key] || 1;
  const discount = route.key === "grain" ? canalGrainDiscountMultiplier(state) : 1;
  const total = Math.max(1, Math.floor(basePrice * 0.65 * discount * stored));
  state.resources.coin -= total;
  state.resources[route.key] = current + stored;
  state.lastDeltas.coin -= total;
  state.lastDeltas[route.key] = (state.lastDeltas[route.key] || 0) + stored;
  state.resourceBreakdowns.coin.sinks.push({ label: route.label, amount: total });
  state.resourceBreakdowns[route.key].sources.push({ label: route.label, amount: stored });
  state.riverTransport.lastRisk = "平安";
  addEvent(state, `${route.label}抵港：运入 ${stored} ${resourceLabel(route.key)}，耗费 ${total} 钱。`);
}

function canalRiskEvent(route, amount) {
  const half = Math.max(1, Math.floor(amount / 2));
  const label = route.label;
  const resource = route.key;
  const lossText = route.key === "grain" ? "船队触礁，粮船进水。" : "水路遇盗，商船失散。";
  return {
    id: `canal-risk-${resource}`,
    title: `${label}遇险`,
    description: `${lossText}本月 ${label} 无法按期入仓。`,
    choices: [
      {
        id: "salvage",
        label: `急遣人手抢运（-35 钱，追回 ${half} ${resourceLabel(resource)}）`,
        effects: [
          { type: "resources", coin: -35, [resource]: half, fixed: true },
          { type: "neighborAttitude", amount: 1 }
        ]
      },
      {
        id: "writeoff",
        label: "登记损失（气数 -2，邻郡态度 -2）",
        effects: [
          { type: "qishu", delta: -2 },
          { type: "neighborAttitude", amount: -2 }
        ]
      }
    ]
  };
}

function resourceLabel(key) {
  if (key === "grain") return "粮食";
  if (key === "wood") return "木材";
  if (key === "cloth") return "布";
  return TRADE_ROUTE_LABELS[key] || key;
}
