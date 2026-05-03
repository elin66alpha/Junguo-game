import { MAP_HEIGHT, MAP_WIDTH, TERRAIN } from "../model/constants.js";
import { serviceRadius } from "../model/formulas.js";
import { activeBuildings, getBuildingDef } from "./BuildingSystem.js";
import { getTile } from "./TerrainSystem.js";
import { nearSpring } from "./HotspotSystem.js";
import { isWellDry } from "./WellSystem.js";

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function centerOf(building, def) {
  return {
    x: building.x + Math.floor(def.footprint.w / 2),
    y: building.y + Math.floor(def.footprint.h / 2)
  };
}

function nearRiver(state, x, y, radius) {
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) > radius) continue;
      const tile = getTile(state, x + ox, y + oy);
      if (tile?.terrain === TERRAIN.RIVER) return true;
    }
  }
  return false;
}

function providerCovers(state, providers, x, y) {
  const point = { x, y };
  return providers.some((provider) => {
    const def = getBuildingDef(state, provider.type);
    return chebyshev(point, centerOf(provider, def)) <= serviceRadius(def, provider);
  });
}

export function recomputeServiceCache(state) {
  const wells = activeBuildings(state, "well").filter((well) => !isWellDry(well));
  const markets = activeBuildings(state, "market");
  const granaries = activeBuildings(state, "granary");
  const shrines = activeBuildings(state, "shrine");
  const schools = activeBuildings(state, "school");
  const mountainShrines = activeBuildings(state, "mountainShrine");

  state.serviceCache = new Map();
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const water = nearRiver(state, x, y, 4) || providerCovers(state, wells, x, y) || nearSpring(state, x, y);
      const market = providerCovers(state, markets, x, y);
      const grain = state.resources.grain > 0 && (market || providerCovers(state, granaries, x, y));
      const cloth = state.resources.cloth > 0 && market;
      const shrine = providerCovers(state, shrines, x, y);
      state.serviceCache.set(`${x},${y}`, {
        water,
        grain,
        cloth,
        market,
        shrine,
        schoolCountywide: schools.length > 0 || mountainShrines.length > 0
      });
    }
  }
}

export function servicesAt(state, x, y) {
  return state.serviceCache.get(`${x},${y}`) || {
    water: false,
    grain: false,
    cloth: false,
    market: false,
    shrine: false,
    schoolCountywide: false
  };
}
