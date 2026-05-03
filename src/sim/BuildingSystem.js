import { HOUSING_TIERS, MAP_HEIGHT, MAP_WIDTH, TERRAIN } from "../model/constants.js";
import { upgradeClothCost, upgradeCost, upgradeSeasons, upgradeWoodCost } from "../model/formulas.js";
import { housingRequirementsForTier, housingUpgradeCost, isMansionTier, nextHousingTier, tierIndex } from "../model/housingRules.js";
import { addEvent } from "./GameState.js";
import {
  getTile, isLingquBankTerrain, isTerrainBuildableFor, terrainBuildExtraSeasons,
  terrainBuildHeight, terrainBuildRebate, terrainCostMultiplier
} from "./TerrainSystem.js";
import { consumeFreeGrant, freeGrantCount } from "./MilestoneSystem.js";
import { discountPercent } from "./EventSystem.js";

export function getBuildingDef(state, type) {
  return state.buildingDefs.find((def) => def.id === type);
}

export function buildingAt(state, x, y) {
  return state.buildings.find((building) => {
    const def = getBuildingDef(state, building.type);
    return x >= building.x && y >= building.y && x < building.x + def.footprint.w && y < building.y + def.footprint.h;
  });
}

export function buildingFootprintTiles(state, building) {
  const def = getBuildingDef(state, building.type);
  const tiles = [];
  for (let oy = 0; oy < def.footprint.h; oy += 1) {
    for (let ox = 0; ox < def.footprint.w; ox += 1) {
      tiles.push({ x: building.x + ox, y: building.y + oy });
    }
  }
  return tiles;
}

export function effectiveBuildCost(state, type, x, y) {
  const def = getBuildingDef(state, type);
  if (!def) return 0;
  const tile = getTile(state, x, y);
  let multiplier = 1;
  if (tile) multiplier *= terrainCostMultiplier(tile.terrain);
  let cost = Math.ceil(def.cost * multiplier);
  if (freeGrantCount(state, type) > 0) return 0;
  const discount = discountPercent(state, type);
  if (discount > 0) cost = Math.ceil(cost * (1 - discount / 100));
  return cost;
}

export function effectiveWoodCost(state, type) {
  const def = getBuildingDef(state, type);
  if (!def) return 0;
  if (freeGrantCount(state, type) > 0) return 0;
  return def.woodCost || 0;
}

export function validatePlacement(state, type, x, y) {
  const def = getBuildingDef(state, type);
  if (!def) return { ok: false, reason: "未知建筑。" };
  if (def.category === "wonder" && state.buildings.some((building) => building.type === type)) {
    return { ok: false, reason: "同一奇观只能建造一座。" };
  }
  const cost = effectiveBuildCost(state, type, x, y);
  const woodCost = effectiveWoodCost(state, type);
  if (woodCost > 0 && (state.resources.wood ?? 0) < woodCost) {
    return { ok: false, reason: `需要 ${woodCost} 木材。` };
  }
  if (x < 0 || y < 0 || x + def.footprint.w > MAP_WIDTH || y + def.footprint.h > MAP_HEIGHT) {
    return { ok: false, reason: "超出地图范围。" };
  }
  for (let oy = 0; oy < def.footprint.h; oy += 1) {
    for (let ox = 0; ox < def.footprint.w; ox += 1) {
      const tile = getTile(state, x + ox, y + oy);
      if (!tile || !isTerrainBuildableFor(type, tile.terrain)) {
        return { ok: false, reason: "这里的地形不能建造。" };
      }
      if (buildingAt(state, x + ox, y + oy)) {
        return { ok: false, reason: "这块地已经被占用。" };
      }
    }
  }
  if (hasMixedFootprintHeight(state, def, x, y)) {
    return { ok: false, reason: "多格建筑必须建在同一高度的地面上。" };
  }
  const special = validateSpecialPlacement(state, def, x, y);
  if (!special.ok) return special;
  return { ok: true, reason: "可以建造。", cost, woodCost };
}

function hasMixedFootprintHeight(state, def, x, y) {
  if ((def.footprint.w || 1) * (def.footprint.h || 1) <= 1) return false;
  // 灵渠本身就是跨河工程，两端陆地、中间河道，允许跨高度。
  if (def.requires === "riverSegment5") return false;
  let base = null;
  for (let oy = 0; oy < def.footprint.h; oy += 1) {
    for (let ox = 0; ox < def.footprint.w; ox += 1) {
      const tile = getTile(state, x + ox, y + oy);
      const height = terrainBuildHeight(tile?.terrain);
      if (base == null) base = height;
      else if (height !== base) return true;
    }
  }
  return false;
}

function validateSpecialPlacement(state, def, x, y) {
  if (!def.requires) return { ok: true };
  if (def.requires === "riverAdjacent") {
    return footprintTouchesTerrain(state, def, x, y, TERRAIN.RIVER)
      ? { ok: true }
      : { ok: false, reason: "河港必须贴着河流建造。" };
  }
  if (def.requires === "riverSegment5") {
    return lingquCanalInFootprint(state, def, x, y)
      ? { ok: true }
      : { ok: false, reason: "灵渠必须是一行 5 格：两端为非丘陵陆地，中间 3 格为河流。" };
  }
  if (def.requires === "hillCluster3") {
    return hillClusterSize(state, x, y) >= 3
      ? { ok: true }
      : { ok: false, reason: "名山祠必须建在连续 3 格以上的丘陵簇上。" };
  }
  if (def.requires === "plain4NearFertile") {
    const nearFertile = footprintTouchesTerrain(state, def, x, y, TERRAIN.FERTILE);
    return nearFertile
      ? { ok: true }
      : { ok: false, reason: "大市楼必须建在 4×4 平原且贴着沃土。" };
  }
  return { ok: true };
}

function footprintTouchesTerrain(state, def, x, y, terrain) {
  for (let ty = y - 1; ty <= y + def.footprint.h; ty += 1) {
    for (let tx = x - 1; tx <= x + def.footprint.w; tx += 1) {
      const inside = tx >= x && ty >= y && tx < x + def.footprint.w && ty < y + def.footprint.h;
      if (inside) continue;
      const tile = getTile(state, tx, ty);
      if (tile?.terrain === terrain) return true;
    }
  }
  return false;
}

function lingquCanalInFootprint(state, def, x, y) {
  if (def.footprint.w < 5 && def.footprint.h < 5) return false;
  const matches = (tiles) => {
    if (tiles.length < 5) return false;
    for (let i = 0; i <= tiles.length - 5; i += 1) {
      if (
        isLingquBankTerrain(tiles[i]?.terrain) &&
        tiles[i + 1]?.terrain === TERRAIN.RIVER &&
        tiles[i + 2]?.terrain === TERRAIN.RIVER &&
        tiles[i + 3]?.terrain === TERRAIN.RIVER &&
        isLingquBankTerrain(tiles[i + 4]?.terrain)
      ) return true;
    }
    return false;
  };
  for (let oy = 0; oy < def.footprint.h; oy += 1) {
    const row = [];
    for (let ox = 0; ox < def.footprint.w; ox += 1) {
      row.push(getTile(state, x + ox, y + oy));
    }
    if (matches(row)) return true;
  }
  for (let ox = 0; ox < def.footprint.w; ox += 1) {
    const column = [];
    for (let oy = 0; oy < def.footprint.h; oy += 1) {
      column.push(getTile(state, x + ox, y + oy));
    }
    if (matches(column)) return true;
  }
  return false;
}

function hillClusterSize(state, x, y) {
  const start = getTile(state, x, y);
  if (start?.terrain !== TERRAIN.HILL && start?.terrain !== TERRAIN.MOUNTAIN) return 0;
  const stack = [{ x, y }];
  const seen = new Set();
  let count = 0;
  while (stack.length) {
    const p = stack.pop();
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tile = getTile(state, p.x, p.y);
    if (tile?.terrain !== TERRAIN.HILL && tile?.terrain !== TERRAIN.MOUNTAIN) continue;
    count += 1;
    if (count >= 3) return count;
    stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
  }
  return count;
}

export function placeBuilding(state, type, x, y, options = {}) {
  const validation = validatePlacement(state, type, x, y);
  if (!validation.ok) {
    if (!options.silent) addEvent(state, validation.reason, "warn");
    return false;
  }
  const def = getBuildingDef(state, type);
  const tile = getTile(state, x, y);
  const cost = validation.cost;
  const woodCost = validation.woodCost;
  const used = consumeFreeGrant(state, type);

  if (!used && cost > 0) {
    state.resources.coin -= cost;
    state.lastDeltas.coin -= cost;
    state.resourceBreakdowns.coin.sinks.push({ label: `建造 ${def.name}`, amount: cost });
  } else if (used) {
    addEvent(state, `朝廷敕赐：${def.name} 一所，免费建造。`);
  }
  if (!used && woodCost > 0) {
    state.resources.wood = Math.max(0, (state.resources.wood ?? 0) - woodCost);
    state.lastDeltas.wood = (state.lastDeltas.wood || 0) - woodCost;
    state.resourceBreakdowns.wood.sinks.push({ label: `建造 ${def.name}`, amount: woodCost });
  }

  // Forest auto-clear: extra season + small rebate
  const buildSeasons = def.buildSeasons + (tile ? terrainBuildExtraSeasons(tile.terrain) : 0);
  const rebate = tile ? terrainBuildRebate(tile.terrain) : 0;
  if (rebate > 0) {
    state.resources.coin += rebate;
    state.lastDeltas.coin += rebate;
    state.resourceBreakdowns.coin.sources.push({ label: "伐林返还", amount: rebate });
    // Clearing the tile to plain so subsequent renderer no longer shows trees
    tile.terrain = TERRAIN.PLAIN;
  }

  state.buildings.push({
    id: state.nextBuildingId,
    type,
    name: def.name,
    category: def.category,
    x,
    y,
    level: 1,
    connected: type === "road" || type === "bridge",
    status: "constructing",
    seasonsRemaining: buildSeasons,
    initialBuildSeasons: buildSeasons,
    housingTier: def.initialHousingTier || (type === "hut" ? "hut" : null),
    residents: 0,
    upgradeStreak: 0,
    downgradeStreak: 0,
    lastServices: null,
    dryMonthsRemaining: 0,
    upgradePending: null,
    onWasteland: tile?.terrain === TERRAIN.WASTELAND
  });
  state.nextBuildingId += 1;
  if (!options.silent) addEvent(state, `已规划 ${def.name}。`);
  return true;
}

export function placeBuildingBatch(state, placements) {
  let placed = 0;
  for (const placement of placements) {
    if (placeBuilding(state, placement.type, placement.x, placement.y, { silent: true })) placed += 1;
  }
  if (placed > 0) addEvent(state, `批量建造完成：${placed} 处。`);
  else addEvent(state, "没有可建造的地块。", "warn");
  return placed;
}

function cachedServicesAt(state, x, y) {
  return state.serviceCache?.get(`${x},${y}`) || {
    water: false,
    grain: false,
    cloth: false,
    market: false,
    shrine: false,
    schoolCountywide: false
  };
}

export function getUpgradeQuote(state, building, woodBudget = state.resources.wood ?? 0, clothBudget = state.resources.cloth ?? 0) {
  if (!building) return { ok: false, reason: "没有选中建筑。" };
  const def = getBuildingDef(state, building.type);
  if (!def) return { ok: false, reason: "未知建筑。" };
  if (building.status !== "complete") return { ok: false, reason: "建筑尚未完工。" };
  if (building.upgradePending) return { ok: false, reason: "建筑正在升级。" };

  if (building.category === "housing") {
    if (building.type === "hut") return { ok: false, reason: "小屋会自动升级。" };
    const targetTier = nextHousingTier(building.housingTier);
    if (targetTier === building.housingTier) return { ok: false, reason: "住房已达最高等级。" };
    if (!building.connected) return { ok: false, reason: "住房未接道路。" };
    if (building.onWasteland) return { ok: false, reason: "荒野住房不能升级。" };
    const service = cachedServicesAt(state, building.x, building.y);
    if (!housingRequirementsForTier(state, targetTier, service)) return { ok: false, reason: "服务或指标条件不足。" };
    if (building.type === "mansion" || isMansionTier(building.housingTier)) {
      let coinCost = upgradeCost(def, building);
      if (coinCost == null) return { ok: false, reason: "住房已达最高等级。" };
      const discount = discountPercent(state, building.type);
      if (discount > 0) coinCost = Math.ceil(coinCost * (1 - discount / 100));
      const woodCostBase = upgradeWoodCost(def, building) || 0;
      const clothCostBase = upgradeClothCost(def, building) || 0;
      const woodCost = discount > 0 ? Math.ceil(woodCostBase * (1 - discount / 100)) : woodCostBase;
      const clothCost = discount > 0 ? Math.ceil(clothCostBase * (1 - discount / 100)) : clothCostBase;
      if (woodCost > woodBudget) return { ok: false, reason: "木材不足。" };
      if (clothCost > clothBudget) return { ok: false, reason: "布不足。" };
      return {
        ok: true,
        coinCost,
        woodCost,
        clothCost,
        seasons: upgradeSeasons(def, building) || 2,
        targetLevel: (building.level || 1) + 1,
        targetTier,
        targetLabel: HOUSING_TIERS[targetTier].label
      };
    }
    const cost = housingUpgradeCost(targetTier);
    if (!cost) return { ok: false, reason: "缺少住房升级配置。" };
    if ((cost.wood || 0) > woodBudget) return { ok: false, reason: "木材不足。" };
    if ((cost.cloth || 0) > clothBudget) return { ok: false, reason: "布不足。" };
    return {
      ok: true,
      coinCost: cost.coin,
      woodCost: cost.wood || 0,
      clothCost: cost.cloth || 0,
      seasons: cost.months || 2,
      targetTier,
      targetLabel: HOUSING_TIERS[targetTier].label
    };
  }

  let coinCost = upgradeCost(def, building);
  if (coinCost == null) return { ok: false, reason: "建筑已达最高等级。" };
  const woodCostBase = upgradeWoodCost(def, building) || 0;
  const clothCostBase = upgradeClothCost(def, building) || 0;
  const seasons = upgradeSeasons(def, building) || 2;
  const discount = discountPercent(state, building.type);
  if (discount > 0) coinCost = Math.ceil(coinCost * (1 - discount / 100));
  const woodCost = discount > 0 ? Math.ceil(woodCostBase * (1 - discount / 100)) : woodCostBase;
  const clothCost = discount > 0 ? Math.ceil(clothCostBase * (1 - discount / 100)) : clothCostBase;
  if (woodCost > woodBudget) return { ok: false, reason: "木材不足。" };
  if (clothCost > clothBudget) return { ok: false, reason: "布不足。" };
  return {
    ok: true,
    coinCost,
    woodCost,
    clothCost,
    seasons,
    targetLevel: (building.level || 1) + 1,
    targetLabel: `${(building.level || 1) + 1} 级`
  };
}

export function getBulkUpgradeQuote(state, buildings) {
  const selected = [...buildings].sort((a, b) => a.id - b.id);
  let woodBudget = state.resources.wood ?? 0;
  let clothBudget = state.resources.cloth ?? 0;
  const eligible = [];
  const rejected = [];
  let coinCost = 0;
  let woodCost = 0;
  let clothCost = 0;

  for (const building of selected) {
    const quote = getUpgradeQuote(state, building, woodBudget, clothBudget);
    if (quote.ok) {
      eligible.push({ building, quote });
      coinCost += quote.coinCost;
      woodCost += quote.woodCost;
      clothCost += quote.clothCost || 0;
      woodBudget -= quote.woodCost;
      clothBudget -= quote.clothCost || 0;
    } else {
      rejected.push({ building, reason: quote.reason });
    }
  }

  return { eligible, rejected, coinCost, woodCost, clothCost };
}

export function demolishBuilding(state, buildingId) {
  const index = state.buildings.findIndex((building) => building.id === buildingId);
  if (index < 0) return false;
  const building = state.buildings[index];
  const def = getBuildingDef(state, building.type);
  // M6.1: the trunk road is part of the map, not the player's portfolio.
  if (building.isMainRoad) {
    addEvent(state, "主路是朝廷敕修官道，不可拆除。", "warn");
    return false;
  }

  // If an upgrade is in progress, refund its costs first.
  if (building.upgradePending) {
    state.resources.coin += building.upgradePending.coinCost;
    state.lastDeltas.coin += building.upgradePending.coinCost;
    state.resourceBreakdowns.coin.sources.push({ label: `中止 ${def.name} 升级`, amount: building.upgradePending.coinCost });
    if (building.upgradePending.woodCost > 0) {
      state.resources.wood = (state.resources.wood ?? 0) + building.upgradePending.woodCost;
      state.lastDeltas.wood = (state.lastDeltas.wood || 0) + building.upgradePending.woodCost;
      state.resourceBreakdowns.wood.sources.push({ label: `中止 ${def.name} 升级`, amount: building.upgradePending.woodCost });
    }
    if (building.upgradePending.clothCost > 0) {
      state.resources.cloth = (state.resources.cloth ?? 0) + building.upgradePending.clothCost;
      state.lastDeltas.cloth = (state.lastDeltas.cloth || 0) + building.upgradePending.clothCost;
      state.resourceBreakdowns.cloth.sources.push({ label: `中止 ${def.name} 升级`, amount: building.upgradePending.clothCost });
    }
  }

  // Demolition refund: 25% of base build cost only (no level multiplier — see
  // M3 audit item #1: avoiding upgrade-then-demolish exploits).
  const refund = Math.floor(def.cost * 0.25);
  state.resources.coin += refund;
  state.lastDeltas.coin += refund;
  state.resourceBreakdowns.coin.sources.push({ label: `拆除返还 ${def.name}`, amount: refund });

  state.buildings.splice(index, 1);
  if (state.selectedBuildingId === buildingId) state.selectedBuildingId = null;
  addEvent(state, `已拆除 ${def.name}，返还 ${refund} 钱。`);
  return true;
}

// ---------- upgrades with build time ----------

export function upgradeBuilding(state, buildingId) {
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return false;
  const def = getBuildingDef(state, building.type);
  const quote = getUpgradeQuote(state, building);
  if (!quote.ok) {
    addEvent(state, `升级 ${def?.name || building.name} 失败：${quote.reason}`, "warn");
    return false;
  }

  state.resources.coin -= quote.coinCost;
  state.lastDeltas.coin -= quote.coinCost;
  state.resourceBreakdowns.coin.sinks.push({ label: `升级 ${def.name}`, amount: quote.coinCost });
  if (quote.woodCost > 0) {
    state.resources.wood = Math.max(0, (state.resources.wood ?? 0) - quote.woodCost);
    state.lastDeltas.wood = (state.lastDeltas.wood || 0) - quote.woodCost;
    state.resourceBreakdowns.wood.sinks.push({ label: `升级 ${def.name}`, amount: quote.woodCost });
  }
  if (quote.clothCost > 0) {
    state.resources.cloth = Math.max(0, (state.resources.cloth ?? 0) - quote.clothCost);
    state.lastDeltas.cloth = (state.lastDeltas.cloth || 0) - quote.clothCost;
    state.resourceBreakdowns.cloth.sinks.push({ label: `升级 ${def.name}`, amount: quote.clothCost });
  }
  building.upgradePending = {
    targetLevel: quote.targetLevel,
    targetTier: quote.targetTier,
    targetLabel: quote.targetLabel,
    seasonsRemaining: quote.seasons,
    initialSeasons: quote.seasons,
    coinCost: quote.coinCost,
    woodCost: quote.woodCost,
    clothCost: quote.clothCost || 0
  };
  addEvent(state, `${def.name} 开始升级至 ${quote.targetLabel}，预计 ${quote.seasons} 月。`);
  return true;
}

export function upgradeBuildingBatch(state, buildingIds) {
  const buildings = buildingIds
    .map((id) => state.buildings.find((building) => building.id === id))
    .filter(Boolean);
  const quote = getBulkUpgradeQuote(state, buildings);
  let upgraded = 0;
  for (const item of quote.eligible) {
    if (upgradeBuilding(state, item.building.id)) upgraded += 1;
  }
  if (upgraded > 0) {
    const clothText = quote.clothCost > 0 ? `、${quote.clothCost} 布` : "";
    addEvent(state, `框选升级：${upgraded} 处，耗费 ${quote.coinCost} 钱、${quote.woodCost} 木${clothText}。`);
  }
  else addEvent(state, "框选范围内没有可升级建筑。", "warn");
  return { upgraded, ...quote };
}

export function cancelUpgrade(state, buildingId) {
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building?.upgradePending) return false;
  const def = getBuildingDef(state, building.type);
  const pending = building.upgradePending;
  state.resources.coin += pending.coinCost;
  state.lastDeltas.coin += pending.coinCost;
  state.resourceBreakdowns.coin.sources.push({ label: `中止 ${def.name} 升级`, amount: pending.coinCost });
  if (pending.woodCost > 0) {
    state.resources.wood = (state.resources.wood ?? 0) + pending.woodCost;
    state.lastDeltas.wood = (state.lastDeltas.wood || 0) + pending.woodCost;
    state.resourceBreakdowns.wood.sources.push({ label: `中止 ${def.name} 升级`, amount: pending.woodCost });
  }
  if (pending.clothCost > 0) {
    state.resources.cloth = (state.resources.cloth ?? 0) + pending.clothCost;
    state.lastDeltas.cloth = (state.lastDeltas.cloth || 0) + pending.clothCost;
    state.resourceBreakdowns.cloth.sources.push({ label: `中止 ${def.name} 升级`, amount: pending.clothCost });
  }
  building.upgradePending = null;
  addEvent(state, `已中止 ${def.name} 升级，全额退款。`);
  return true;
}

// Tick all in-progress upgrades by one month. Called from SeasonSystem before
// production so completed upgrades take effect this same month.
export function tickUpgrades(state) {
  for (const building of state.buildings) {
    const pending = building.upgradePending;
    if (!pending) continue;
    pending.seasonsRemaining -= 1;
    if (pending.seasonsRemaining <= 0) {
      if (pending.targetTier) {
        building.housingTier = pending.targetTier;
        building.level = pending.targetLevel || tierIndex(pending.targetTier) + 1;
        building.residents = Math.min(building.residents || 0, HOUSING_TIERS[pending.targetTier].maxResidents);
      } else {
        building.level = pending.targetLevel;
      }
      building.upgradePending = null;
      addEvent(state, `${building.name} 升至 ${pending.targetLabel || `${building.level} 级`}。`);
    }
  }
}

export function completeConstruction(state) {
  for (const building of state.buildings) {
    if (building.status !== "constructing") continue;
    building.seasonsRemaining -= 1;
    if (building.seasonsRemaining <= 0) {
      building.status = "complete";
      addEvent(state, `${building.name} 已完工。`);
    }
  }
}

export function completeBuildings(state, type = null) {
  return state.buildings.filter((building) => building.status === "complete" && (!type || building.type === type));
}

export function activeBuildings(state, type = null) {
  return state.buildings.filter((building) => {
    if (building.status !== "complete") return false;
    if (type && building.type !== type) return false;
    return building.type === "road" || building.type === "bridge" || building.connected;
  });
}

// Effective level for labor / production purposes. While an upgrade is in
// progress, the building still operates at its OLD level but pre-pays the
// labor cost of the next level so construction draws workers.
export function effectiveLaborLevel(building) {
  if (building.upgradePending) return building.upgradePending.targetLevel || building.level || 1;
  return building.level || 1;
}
