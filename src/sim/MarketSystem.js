import { addEvent } from "./GameState.js";
import { updateResourceCaps } from "./ResourceSystem.js";
import { activeBuildings, getBuildingDef } from "./BuildingSystem.js";
import { serviceRadius } from "../model/formulas.js";
import { neighborBuyPriceMultiplier, neighborSellPriceMultiplier, recordNeighborTrade } from "./NeighborSystem.js";
import { marketWonderMultiplier, tradeVolatilityMultiplier } from "./WonderSystem.js";

export const TRADE_BASE_PRICES = {
  grain: 3,
  wood: 8,
  cloth: 12
};

export const TRADE_ROUTE_LABELS = {
  grain: "郡仓粮路",
  wood: "山林木道",
  cloth: "织市商路"
};

const TRADE_INFLATION_PER_UNIT = 0.015;
const TRADE_INFLATION_CAP = 1.25;
const TRADE_INFLATION_RECOVERY = 0.85;
const TRADE_SELL_FACTOR = 0.65;

export function initializeMarket(state) {
  state.marketInflation = {
    grain: state.marketInflation?.grain ?? 0,
    wood: state.marketInflation?.wood ?? 0,
    cloth: state.marketInflation?.cloth ?? 0
  };
}

export function tradeUnlocked(state) {
  return activeBuildings(state, "tradeStation").length > 0;
}

// M6: buy/sell prices are now controlled per-resource by the neighbor that
// owns that trade route (粮郡 / 木郡 / 布郡). Inflation still pushes the buy
// side; sell is decoupled and only depends on neighbor attitude × base.
export function tradePrice(state, resourceKey) {
  initializeMarket(state);
  const base = TRADE_BASE_PRICES[resourceKey];
  if (base == null) return null;
  const volatility = tradeVolatilityMultiplier(state);
  const neighbor = neighborBuyPriceMultiplier(state, resourceKey);
  return Math.max(1, Math.ceil(base * neighbor * (1 + (state.marketInflation[resourceKey] || 0) * volatility)));
}

export function tradeSellPrice(state, resourceKey) {
  const base = TRADE_BASE_PRICES[resourceKey];
  if (base == null) return null;
  const neighbor = neighborSellPriceMultiplier(state, resourceKey);
  return Math.max(1, Math.floor(base * TRADE_SELL_FACTOR * neighbor));
}

function tradeResourceRoom(state, resourceKey) {
  updateResourceCaps(state);
  if (resourceKey === "grain") return Math.max(0, (state.resourceCaps?.grain || 0) - (state.resources.grain ?? 0));
  if (resourceKey === "wood") return Math.max(0, (state.resourceCaps?.wood || 0) - (state.resources.wood ?? 0));
  if (resourceKey === "cloth") return Math.max(0, (state.resourceCaps?.cloth || 0) - (state.resources.cloth ?? 0));
  return Infinity;
}

export function buyTradeResource(state, resourceKey, amount) {
  initializeMarket(state);
  if (!TRADE_BASE_PRICES[resourceKey]) return false;
  if (!tradeUnlocked(state)) {
    addEvent(state, "需要建成并接通道路的贸易站，才能使用贸易路线。", "warn");
    return false;
  }
  const requested = Math.max(1, Math.floor(amount));
  const purchased = Math.min(requested, tradeResourceRoom(state, resourceKey));
  if (purchased <= 0) {
    addEvent(state, `${resourceLabel(resourceKey)}仓储已满，无法购入。`, "warn");
    return false;
  }

  const price = tradePrice(state, resourceKey);
  const total = price * purchased;
  state.resources.coin -= total;
  state.resources[resourceKey] = (state.resources[resourceKey] ?? 0) + purchased;
  state.marketInflation[resourceKey] = Math.min(
    TRADE_INFLATION_CAP,
    (state.marketInflation[resourceKey] || 0) + purchased * TRADE_INFLATION_PER_UNIT * tradeVolatilityMultiplier(state)
  );

  state.lastDeltas.coin -= total;
  state.lastDeltas[resourceKey] = (state.lastDeltas[resourceKey] || 0) + purchased;
  state.resourceBreakdowns.coin.sinks.push({ label: `${TRADE_ROUTE_LABELS[resourceKey]}买入`, amount: total });
  state.resourceBreakdowns[resourceKey].sources.push({ label: `${TRADE_ROUTE_LABELS[resourceKey]}买入`, amount: purchased });
  recordNeighborTrade(state, resourceKey, purchased, "buy", { silent: true });
  return true;
}

export function sellTradeResource(state, resourceKey, amount) {
  initializeMarket(state);
  if (!TRADE_BASE_PRICES[resourceKey]) return false;
  if (!tradeUnlocked(state)) {
    addEvent(state, "需要建成并接通道路的贸易站，才能使用贸易路线。", "warn");
    return false;
  }
  const requested = Math.max(1, Math.floor(amount));
  const sold = Math.min(requested, Math.max(0, Math.floor(state.resources[resourceKey] ?? 0)));
  if (sold <= 0) {
    addEvent(state, `${resourceLabel(resourceKey)}不足，无法售出。`, "warn");
    return false;
  }

  const price = tradeSellPrice(state, resourceKey);
  const total = price * sold;
  state.resources[resourceKey] -= sold;
  state.resources.coin += total;
  state.marketInflation[resourceKey] = Math.max(0, (state.marketInflation[resourceKey] || 0) - sold * TRADE_INFLATION_PER_UNIT * 0.5);

  state.lastDeltas.coin += total;
  state.lastDeltas[resourceKey] = (state.lastDeltas[resourceKey] || 0) - sold;
  state.resourceBreakdowns.coin.sources.push({ label: `${TRADE_ROUTE_LABELS[resourceKey]}卖出`, amount: total });
  state.resourceBreakdowns[resourceKey].sinks.push({ label: `${TRADE_ROUTE_LABELS[resourceKey]}卖出`, amount: sold });
  recordNeighborTrade(state, resourceKey, sold, "sell", { silent: true });
  return true;
}

// ---------- commercial market tax (M5a) ----------
//
// Each market scans its service radius for housing buildings and collects a
// per-house levy that scales with the housing tier and the market level.
// Higher-tier homes contribute substantially more, replacing the late-game
// money saturation that raw housing tax used to produce.

export const MARKET_LEVEL_MULTIPLIER = [1.0, 1.2, 1.4, 1.6, 1.8];

export const MARKET_TAX_PER_HOUSING_TIER = {
  hut: 0,
  tile: 1,
  courtyard: 2,
  compound: 3,
  manor: 5,
  estate: 8,
  noble: 12,
  mansion1: 6,
  mansion2: 10,
  mansion3: 15
};

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function bestCoveringMarketLevel(state, building) {
  const markets = activeBuildings(state, "market");
  if (markets.length === 0) return 0;
  const bx = building.x;
  const by = building.y;
  let best = 0;
  for (const market of markets) {
    const def = getBuildingDef(state, "market");
    const cx = market.x + Math.floor(def.footprint.w / 2);
    const cy = market.y + Math.floor(def.footprint.h / 2);
    if (chebyshev({ x: bx, y: by }, { x: cx, y: cy }) <= serviceRadius(def, market)) {
      const level = market.level || 1;
      if (level > best) best = level;
    }
  }
  return best;
}

export function marketCommercialTax(state) {
  const housing = activeBuildings(state).filter((b) => b.category === "housing");
  let total = 0;
  for (const home of housing) {
    const tier = home.housingTier;
    const base = MARKET_TAX_PER_HOUSING_TIER[tier] || 0;
    if (base <= 0) continue;
    const marketLevel = bestCoveringMarketLevel(state, home);
    if (marketLevel <= 0) continue;
    const mult = MARKET_LEVEL_MULTIPLIER[Math.min(MARKET_LEVEL_MULTIPLIER.length, marketLevel) - 1];
    total += Math.floor(base * mult);
  }
  return Math.floor(total * marketWonderMultiplier(state));
}

export function recoverTradeInflation(state) {
  initializeMarket(state);
  for (const key of Object.keys(state.marketInflation)) {
    const next = (state.marketInflation[key] || 0) * TRADE_INFLATION_RECOVERY;
    state.marketInflation[key] = next < 0.01 ? 0 : next;
  }
}

function resourceLabel(resourceKey) {
  if (resourceKey === "grain") return "粮食";
  if (resourceKey === "wood") return "木材";
  if (resourceKey === "cloth") return "布";
  return resourceKey;
}
