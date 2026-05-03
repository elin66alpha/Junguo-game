import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, TERRAIN_LABELS } from "../model/constants.js";

export function tileIndex(x, y) {
  return y * MAP_WIDTH + x;
}

export function getTile(state, x, y) {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
  return state.tiles[tileIndex(x, y)];
}

export function terrainTooltip(tile) {
  const details = {
    plain: "可以建造。",
    river: "普通建筑不能建在河里；这里可以建桥。",
    sea: "海洋不可建造，是入海口地图的边界水域。",
    riverbank: "适合农田，粮食产量 +25%。",
    wetland: "可以建造，但农田产量 -50%。",
    hill: "不能建农田，其他建筑可以建。",
    mountain: "山脉高出平原两层。1×1 建筑可建，多格建筑必须完全落在同一高度。",
    fertile: "适合农田，粮食产量 +25%。",
    pass: "关隘地形，当前原型不可建造。",
    forest: "林地。建造前会自动伐林（多 1 月工期，返还 5 钱）。附近民心 +1。",
    wasteland: "荒野。建造成本 +25%，住房在此不能升级。"
  };
  return `${TERRAIN_LABELS[tile.terrain]} - ${details[tile.terrain]}`;
}

export function isTerrainBuildableFor(buildingType, terrain) {
  if (buildingType === "bridge") return terrain === TERRAIN.RIVER;
  if (buildingType === "lingqu") return terrain === TERRAIN.RIVER || isLingquBankTerrain(terrain);
  if (buildingType === "mountainShrine") return terrain === TERRAIN.HILL || terrain === TERRAIN.MOUNTAIN;
  if (buildingType === "grandMarketTower") return terrain === TERRAIN.PLAIN;
  if (terrain === TERRAIN.RIVER || terrain === TERRAIN.SEA || terrain === TERRAIN.PASS) return false;
  if (buildingType === "farm" && (terrain === TERRAIN.HILL || terrain === TERRAIN.MOUNTAIN || terrain === TERRAIN.FOREST)) return false;
  return true;
}

export function isLingquBankTerrain(terrain) {
  return terrain !== TERRAIN.RIVER && terrain !== TERRAIN.SEA && terrain !== TERRAIN.HILL && terrain !== TERRAIN.MOUNTAIN && terrain !== TERRAIN.PASS;
}

export function terrainBuildHeight(terrain) {
  if (terrain === TERRAIN.MOUNTAIN) return 2;
  if (terrain === TERRAIN.HILL || terrain === TERRAIN.PASS) return 1;
  if (terrain === TERRAIN.RIVER || terrain === TERRAIN.SEA) return -1;
  return 0;
}

export function terrainCostMultiplier(terrain) {
  if (terrain === TERRAIN.WASTELAND) return 1.25;
  return 1;
}

export function terrainBuildExtraSeasons(terrain) {
  if (terrain === TERRAIN.FOREST) return 1;
  return 0;
}

export function terrainBuildRebate(terrain) {
  if (terrain === TERRAIN.FOREST) return 5;
  return 0;
}

export function terrainPlacementTone(buildingType, terrain) {
  if (!isTerrainBuildableFor(buildingType, terrain)) return "bad";
  if (buildingType === "farm" && terrain === TERRAIN.FERTILE) return "good";
  if (buildingType === "farm" && terrain === TERRAIN.RIVERBANK) return "good";
  if (buildingType === "farm" && terrain === TERRAIN.WETLAND) return "warning";
  if (terrain === TERRAIN.WASTELAND) return "warning";
  if (terrain === TERRAIN.FOREST) return "warning";
  if (buildingType === "bridge" || buildingType === "lingqu") return "good";
  if (buildingType === "mountainShrine" && (terrain === TERRAIN.HILL || terrain === TERRAIN.MOUNTAIN)) return "good";
  if (buildingType === "grandMarketTower" && terrain === TERRAIN.PLAIN) return "good";
  return "neutral";
}
