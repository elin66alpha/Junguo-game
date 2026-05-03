import { ARCHETYPE_LABELS, INDICATOR_KEYS, RESOURCE_KEYS, TERRAIN } from "../model/constants.js";
import { SeededRng } from "../model/rng.js";
import { createGameState } from "./GameState.js";
import { initializeEdicts } from "./EdictSystem.js";
import { initializeEvents } from "./EventSystem.js";
import { initializeMarket } from "./MarketSystem.js";
import { initializeMilestones } from "./MilestoneSystem.js";
import { initializeQishu, qishuMax } from "./QishuSystem.js";
import { initializeNeighbors } from "./NeighborSystem.js";
import { initializeRiverTransport } from "./RiverTransportSystem.js";
import { initializeFestivals } from "./FestivalSystem.js";
import { recomputeRoadAccess } from "./RoadSystem.js";
import { recomputeServiceCache } from "./ServiceSystem.js";
import { updateResourceCaps } from "./ResourceSystem.js";

export const SAVE_EXTENSION = "junguosave";

const SAVE_FORMAT = "郡国原型存档";
const SAVE_VERSION = 1;
const SAVE_MIME = "application/vnd.junguo.save+json";

// localStorage keys used by the M6 main menu / hall of fame layer. All values
// stay on the device — no cloud, no export buttons.
export const AUTOSAVE_KEY = "junguo:autosave";
export const HALL_OF_FAME_KEY = "junguo:hall";
export const HALL_OF_FAME_LIMIT = 50;

const PERSISTED_STATE_KEYS = [
  "seed",
  "archetype",
  "archetypeLabel",
  "monthIndex",
  "year",
  "totalMonthsElapsed",
  "monthName",
  "resources",
  "resourceCaps",
  "marketInflation",
  "lastTributeYear",
  "lastDeltas",
  "resourceBreakdowns",
  "indicators",
  "indicatorBreakdowns",
  "population",
  "tiles",
  "hotspots",
  "mapDifficulty",
  "buildings",
  "nextBuildingId",
  "disconnectedCount",
  "qishu",
  "qishuDelta",
  "qishuBreakdown",
  "qishuOneTime",
  "evaluation",
  "eventLog",
  "edicts",
  "edictModifiers",
  "activeModifiers",
  "activeDiscounts",
  "activeIndicatorModifiers",
  "pendingEvent",
  "eventCooldown",
  "milestonesAwarded",
  "pendingMilestone",
  "pendingFreeGrants",
  "neighbors",
  "neighborNetwork",
  "neighborEventChanceBonus",
  "riverTransport",
  "lastFestivalMonth",
  "persistentPrestigeBonus",
  "showServiceOverlay",
  "mainRoadTiles",
  "mainRoadAxis"
];

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeLoadedTerrain(tiles) {
  for (const tile of tiles || []) {
    if (tile.terrain === TERRAIN.RIVERBANK || tile.terrain === TERRAIN.WETLAND) {
      tile.terrain = TERRAIN.PLAIN;
    } else if (tile.terrain === TERRAIN.PASS) {
      tile.terrain = TERRAIN.HILL;
    }
  }
}

function makeSavePayload(state) {
  const snapshot = {};
  for (const key of PERSISTED_STATE_KEYS) snapshot[key] = cloneJson(state[key]);
  snapshot.rngState = state.rng?.state ?? 0;
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: snapshot
  };
}

export function saveFileName(state) {
  const seed = Number.isFinite(state.seed) ? state.seed : 0;
  const month = Number.isFinite(state.totalMonthsElapsed) ? state.totalMonthsElapsed : 0;
  return `junguo-seed${seed}-m${month}.${SAVE_EXTENSION}`;
}

export function downloadSaveFile(state) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("当前环境不能下载存档文件。");
  }
  const blob = new Blob([JSON.stringify(makeSavePayload(state), null, 2)], { type: SAVE_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = saveFileName(state);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function loadStateFromSaveFile(file, buildingDefs) {
  if (!file) throw new Error("没有选择存档文件。");
  if (!file.name.toLowerCase().endsWith(`.${SAVE_EXTENSION}`)) {
    throw new Error(`只能读取 .${SAVE_EXTENSION} 存档文件。`);
  }

  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("存档文件无法解析。");
  }
  return hydrateStateFromPayload(payload, buildingDefs);
}

export function replaceState(targetState, nextState) {
  Object.keys(targetState).forEach((key) => delete targetState[key]);
  Object.assign(targetState, nextState);
}

// ---------- localStorage autosave (M6) ----------

function safeStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function writeAutosave(state) {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(makeSavePayload(state)));
    return true;
  } catch {
    return false;
  }
}

export function clearAutosave() {
  const storage = safeStorage();
  if (!storage) return;
  try { storage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
}

export function hasAutosave() {
  const storage = safeStorage();
  if (!storage) return false;
  try { return !!storage.getItem(AUTOSAVE_KEY); } catch { return false; }
}

export function loadAutosave(buildingDefs) {
  const storage = safeStorage();
  if (!storage) return null;
  let raw;
  try { raw = storage.getItem(AUTOSAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    return hydrateStateFromPayload(payload, buildingDefs);
  } catch {
    // Corrupt or incompatible autosave — drop it so we don't keep failing
    // and so the menu's 「继续」 button correctly grays out next render.
    clearAutosave();
    return null;
  }
}

// ---------- hall of fame (M6) ----------

export function readHallOfFame() {
  const storage = safeStorage();
  if (!storage) return [];
  let raw;
  try { raw = storage.getItem(HALL_OF_FAME_KEY); } catch { return []; }
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeHallOfFame(entries) {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.setItem(HALL_OF_FAME_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function appendHallOfFameEntry(entry) {
  const list = readHallOfFame();
  list.push(entry);
  // Keep the longest tenures: sort desc by months, drop overflow.
  list.sort((a, b) => (b.months || 0) - (a.months || 0));
  const trimmed = list.slice(0, HALL_OF_FAME_LIMIT);
  writeHallOfFame(trimmed);
  return trimmed;
}

function hydrateStateFromPayload(payload, buildingDefs) {
  if (!payload || payload.format !== SAVE_FORMAT || payload.version !== SAVE_VERSION || !payload.state) {
    throw new Error("这不是当前版本支持的郡国存档。");
  }

  const snapshot = payload.state;
  if (!Array.isArray(snapshot.tiles) || snapshot.tiles.length === 0) {
    throw new Error("存档缺少地图数据。");
  }
  if (!Array.isArray(snapshot.buildings)) {
    throw new Error("存档缺少建筑数据。");
  }

  const seed = Number.isFinite(snapshot.seed) ? snapshot.seed : 100;
  const state = createGameState(buildingDefs, seed);
  // M6.1: pre-M6.1 saves don't have mainRoadTiles. The fresh state created
  // above does (carved for the seed), but the saved tiles + buildings won't
  // match it. To avoid the trunk flood-fill marking everything disconnected
  // on legacy saves, clear mainRoadTiles when the snapshot doesn't provide
  // its own — RoadSystem.recomputeRoadAccess falls back to the legacy "any
  // road counts" rule in that case.
  if (!Object.prototype.hasOwnProperty.call(snapshot, "mainRoadTiles")) {
    state.mainRoadTiles = [];
    state.mainRoadAxis = "horizontal";
  }
  for (const key of PERSISTED_STATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) state[key] = cloneJson(snapshot[key]);
  }
  normalizeLoadedTerrain(state.tiles);

  state.buildingDefs = buildingDefs;
  state.rng = new SeededRng((state.seed ?? seed) ^ 0xa1b2);
  if (Number.isFinite(snapshot.rngState)) state.rng.state = snapshot.rngState >>> 0;
  state.serviceCache = new Map();
  state.selectedBuildingType = null;
  state.selectedBuildingId = null;
  state.openBuildCategory = null;
  state.demolishMode = false;
  state.upgradeMode = false;
  state.hoverTile = null;
  state.dragPreviewTiles = [];
  state.floatingNumbers = [];
  state.utilityPanel = null;

  state.resources = { ...createGameState(buildingDefs, seed).resources, ...(state.resources || {}) };
  state.lastDeltas = { ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0])), ...(state.lastDeltas || {}) };
  state.resourceBreakdowns = {
    ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, { sources: [], sinks: [] }])),
    ...(state.resourceBreakdowns || {})
  };
  state.indicators = { morale: 50, order: 50, prestige: 0, ...(state.indicators || {}) };
  state.indicatorBreakdowns = {
    ...Object.fromEntries(INDICATOR_KEYS.map((key) => [key, []])),
    ...(state.indicatorBreakdowns || {})
  };
  state.archetypeLabel = state.archetypeLabel || ARCHETYPE_LABELS[state.archetype] || "未知";
  state.qishu = Math.max(0, Math.min(qishuMax(), Math.round(state.qishu ?? 20)));

  initializeEdicts(state);
  initializeEvents(state);
  initializeMilestones(state);
  initializeQishu(state);
  initializeMarket(state);
  initializeNeighbors(state);
  initializeRiverTransport(state);
  initializeFestivals(state);
  recomputeRoadAccess(state);
  updateResourceCaps(state);
  recomputeServiceCache(state);

  return state;
}
