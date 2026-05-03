export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 80;
export const TILE_SIZE = 40;
export const MONTHS = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];

export const RESOURCE_KEYS = ["grain", "wood", "cloth", "coin", "labor"];
export const INDICATOR_KEYS = ["morale", "order", "prestige"];

export const BASE_GRAIN_CAPACITY = 240;
export const BASE_WOOD_CAPACITY = 200;
export const BASE_CLOTH_CAPACITY = 500;

// 岁贡 (annual tribute) — paid every 正月 to the capital. Scales with prestige
// and earned milestones, so fame brings expectations.
export const TRIBUTE_BASE = 30;
export const TRIBUTE_PER_MILESTONE = 20;
export const TRIBUTE_PER_PRESTIGE_TIER = 10;
export const TRIBUTE_PRESTIGE_TIER_SIZE = 30;

export const TERRAIN = {
  PLAIN: "plain",
  RIVER: "river",
  SEA: "sea",
  RIVERBANK: "riverbank",
  WETLAND: "wetland",
  HILL: "hill",
  MOUNTAIN: "mountain",
  FERTILE: "fertile",
  PASS: "pass",
  FOREST: "forest",
  WASTELAND: "wasteland"
};

export const ACTIVE_TERRAIN_KEYS = ["plain", "fertile", "river", "sea", "hill", "mountain", "forest", "wasteland"];

export const TERRAIN_LABELS = {
  plain: "平原",
  river: "河流",
  sea: "海洋",
  riverbank: "河岸",
  wetland: "湿地",
  hill: "丘陵",
  mountain: "山脉",
  fertile: "沃土",
  pass: "关隘",
  forest: "林地",
  wasteland: "荒野"
};

export const TERRAIN_COLORS = {
  plain: "#82cb68",
  river: "#42a6d7",
  sea: "#1f6f9b",
  riverbank: "#d3d875",
  wetland: "#65b98c",
  hill: "#c4a45f",
  mountain: "#c4a45f",
  fertile: "#a7cf5a",
  pass: "#d8ae58",
  forest: "#3f8a4c",
  wasteland: "#b8946d"
};

export const HOTSPOT = {
  MULBERRY: "mulberry",
  SPRING: "spring"
};

export const HOTSPOT_LABELS = {
  mulberry: "桑林",
  spring: "古井泉眼"
};

export const ARCHETYPES = {
  WEI: "wei",
  DELTA: "delta",
  ESTUARY: "estuary"
};

export const ARCHETYPE_LABELS = {
  wei: "渭河盆地",
  delta: "江南水乡",
  estuary: "东海入海口"
};

export const HOUSING_TIER_ORDER = ["hut", "tile", "courtyard", "compound", "manor", "estate", "noble"];

// taxPerResident is intentionally tapered from 深宅 onwards (×0.8 cumulative
// against the unscaled +0.8/tier progression) so late-game treasury isn't
// trivially saturated by stacked top-tier homes. Commercial market tax
// compensates — see MarketSystem.marketCommercialTax.
export const HOUSING_TIERS = {
  hut: { label: "小屋", maxResidents: 4, taxPerResident: 0.5, clothUse: 0 },
  tile: { label: "瓦房", maxResidents: 8, taxPerResident: 1, clothUse: 1 },
  courtyard: { label: "院宅", maxResidents: 16, taxPerResident: 2, clothUse: 2 },
  compound: { label: "深宅", maxResidents: 24, taxPerResident: 2.08, clothUse: 3 },
  manor: { label: "府第", maxResidents: 36, taxPerResident: 2.18, clothUse: 4 },
  estate: { label: "华堂", maxResidents: 50, taxPerResident: 2.15, clothUse: 5 },
  noble: { label: "甲第", maxResidents: 70, taxPerResident: 2.05, clothUse: 6 },
  mansion1: { label: "豪宅", maxResidents: 36, taxPerResident: 2.2, clothUse: 5 },
  mansion2: { label: "雕梁豪宅", maxResidents: 56, taxPerResident: 2.4, clothUse: 7 },
  mansion3: { label: "重院豪宅", maxResidents: 80, taxPerResident: 2.55, clothUse: 9 }
};

export const EDICT_SLOTS = ["tax", "relief", "discipline"];

export const EDICT_LABELS = {
  tax: "赋税",
  relief: "仓廪",
  discipline: "治化"
};
