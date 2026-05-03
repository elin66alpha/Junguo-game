import { generateMap } from "../map/generateMap.js";
import { ARCHETYPES, ARCHETYPE_LABELS, BASE_CLOTH_CAPACITY, BASE_GRAIN_CAPACITY, BASE_WOOD_CAPACITY, INDICATOR_KEYS, MAP_WIDTH, MONTHS, RESOURCE_KEYS, TERRAIN } from "../model/constants.js";
import { SeededRng } from "../model/rng.js";
import { STARTING_STATE } from "../data/starting_state.js";
import { defaultEdicts } from "../data/edicts.js";

export function createGameState(buildingDefs, seed = STARTING_STATE.seed, archetypeOverride = ARCHETYPES.ESTUARY) {
  const archetype = archetypeOverride || ARCHETYPES.ESTUARY;
  const map = generateMap(seed, archetype);
  const state = {
    seed,
    archetype,
    archetypeLabel: ARCHETYPE_LABELS[archetype] || "未知",
    rng: new SeededRng(seed ^ 0xa1b2),
    monthIndex: 0,
    year: 1,
    totalMonthsElapsed: 0,
    monthName: MONTHS[0],
    resources: structuredClone(STARTING_STATE.resources),
    resourceCaps: { grain: BASE_GRAIN_CAPACITY, wood: BASE_WOOD_CAPACITY, cloth: BASE_CLOTH_CAPACITY },
    marketInflation: { wood: 0, cloth: 0 },
    lastTributeYear: 0,
    lastDeltas: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0])),
    resourceBreakdowns: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, { sources: [], sinks: [] }])),
    indicators: structuredClone(STARTING_STATE.indicators),
    indicatorBreakdowns: Object.fromEntries(INDICATOR_KEYS.map((key) => [key, []])),
    population: 0,
    tiles: map.tiles,
    hotspots: map.hotspots,
    mapDifficulty: map.difficulty,
    buildings: [],
    nextBuildingId: 1,
    buildingDefs,
    selectedBuildingType: null,
    selectedBuildingId: null,
    openBuildCategory: null,
    demolishMode: false,
    upgradeMode: false,
    hoverTile: null,
    dragPreviewTiles: [],
    disconnectedCount: 0,
    serviceCache: new Map(),
    qishu: 20,
    qishuDelta: 0,
    qishuBreakdown: [],
    qishuOneTime: [],
    evaluation: null,
    eventLog: [],
    edicts: defaultEdicts(),
    edictModifiers: { taxMultiplier: 1, grainConsumeMultiplier: 1, moraleDelta: 0, orderDelta: 0 },
    activeModifiers: [],
    activeDiscounts: [],
    activeIndicatorModifiers: [],
    pendingEvent: null,
    eventCooldown: 0,
    milestonesAwarded: [],
    pendingMilestone: null,
    pendingFreeGrants: [],
    floatingNumbers: [],
    neighbors: [],
    neighborNetwork: null,
    neighborEventChanceBonus: 0,
    riverTransport: null,
    lastFestivalMonth: -1,
    persistentPrestigeBonus: 0,
    showServiceOverlay: true,
    utilityPanel: null,
    mapPickerOpen: false,
    mainRoadTiles: (map.mainRoadTiles || []).map((t) => ({ x: t.x, y: t.y })),
    mainRoadAxis: map.mainRoadAxis || "horizontal"
  };
  // M6.1: pre-place the main road as a row of road / bridge buildings. They
  // start fully complete and connected; they're flagged isMainRoad so the
  // demolish system refuses to remove them, and so the road mesh can render
  // them with a slightly different look (paved median).
  for (const tile of state.mainRoadTiles) {
    const terrain = state.tiles[tile.y * MAP_WIDTH + tile.x]?.terrain;
    const type = terrain === TERRAIN.RIVER ? "bridge" : "road";
    state.buildings.push({
      id: state.nextBuildingId,
      type,
      name: type === "bridge" ? "桥" : "路",
      category: "infrastructure",
      x: tile.x,
      y: tile.y,
      level: 1,
      connected: true,
      status: "complete",
      seasonsRemaining: 0,
      initialBuildSeasons: 0,
      housingTier: null,
      residents: 0,
      upgradeStreak: 0,
      downgradeStreak: 0,
      lastServices: null,
      dryMonthsRemaining: 0,
      upgradePending: null,
      onWasteland: false,
      isMainRoad: true
    });
    state.nextBuildingId += 1;
  }
  return state;
}

export function addEvent(state, message, level = "info") {
  state.eventLog.unshift({
    turn: state.totalMonthsElapsed,
    year: state.year,
    month: state.monthName,
    level,
    message
  });
  if (state.eventLog.length > 50) state.eventLog.length = 50;
}

export function stateHash(state) {
  const buildings = state.buildings.map((b) =>
    `${b.type}:${b.x},${b.y}:${b.status}:${b.housingTier || ""}:${b.residents || 0}:L${b.level || 1}:D${b.dryMonthsRemaining || 0}:U${b.upgradePending ? `${b.upgradePending.targetLevel || ""}-${b.upgradePending.targetTier || ""}-${b.upgradePending.seasonsRemaining}-${b.upgradePending.clothCost || 0}` : ""}`
  ).join("|");
  const resources = Object.entries(state.resources).map(([key, value]) => `${key}:${value}`).join("|");
  const caps = Object.entries(state.resourceCaps || {}).map(([key, value]) => `${key}:${value}`).join("|");
  const indicators = Object.entries(state.indicators).map(([key, value]) => `${key}:${value}`).join("|");
  const edicts = Object.entries(state.edicts || {}).map(([key, value]) => `${key}:${value}`).join("|");
  const modifiers = [
    ...(state.activeModifiers || []).map((m) => `m:${m.key}:${m.multiplier}:${m.monthsLeft}`),
    ...(state.activeDiscounts || []).map((d) => `d:${d.key}:${d.percent}:${d.monthsLeft}`),
    ...(state.activeIndicatorModifiers || []).map((m) => `i:${m.key}:${m.delta}:${m.monthsLeft}`),
    ...(state.pendingFreeGrants || []).map((g) => `g:${g.type}:${g.count}`)
  ].join("|");
  const milestones = (state.milestonesAwarded || []).join("|");
  const pendingEvent = state.pendingEvent ? state.pendingEvent.id : "";
  let hash = 2166136261;
  const market = Object.entries(state.marketInflation || {}).map(([key, value]) => `${key}:${value.toFixed ? value.toFixed(3) : value}`).join("|");
  const text = `${state.seed}|${state.archetype}|${state.totalMonthsElapsed}|${state.monthIndex}|${state.qishu}|${resources}|${caps}|${market}|${indicators}|${state.population}|${buildings}|${edicts}|${modifiers}|${milestones}|${state.eventCooldown}|${pendingEvent}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
