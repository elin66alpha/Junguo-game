import { ARCHETYPES, HOTSPOT, MAP_HEIGHT, MAP_WIDTH, TERRAIN } from "../model/constants.js";
import { SeededRng } from "../model/rng.js";
import { fbm, tileHash } from "./noise.js";

function index(x, y) {
  return y * MAP_WIDTH + x;
}

function makeTile(x, y, terrain) {
  return { x, y, terrain };
}

function blankTiles() {
  const tiles = new Array(MAP_WIDTH * MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      tiles[index(x, y)] = makeTile(x, y, TERRAIN.PLAIN);
    }
  }
  return tiles;
}

// ---------- shared helpers ----------

function paintRiver(tiles, seed, options) {
  const { axis = "vertical", center, amplitude, period, drift, width, phase } = options;
  if (axis === "vertical") {
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      const wave = Math.sin((y + phase) / period) * amplitude;
      const cx = Math.round(center + wave + drift * y);
      for (let dx = -width; dx <= width; dx += 1) {
        const x = cx + dx;
        if (x >= 0 && x < MAP_WIDTH) tiles[index(x, y)].terrain = TERRAIN.RIVER;
      }
    }
  } else {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const wave = Math.sin((x + phase) / period) * amplitude;
      const cy = Math.round(center + wave + drift * x);
      for (let dy = -width; dy <= width; dy += 1) {
        const y = cy + dy;
        if (y >= 0 && y < MAP_HEIGHT) tiles[index(x, y)].terrain = TERRAIN.RIVER;
      }
    }
  }
}

function applyRiverbank(tiles) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (tiles[index(x, y)].terrain !== TERRAIN.PLAIN) continue;
      let near = false;
      for (let oy = -1; oy <= 1 && !near; oy += 1) {
        for (let ox = -1; ox <= 1 && !near; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && tiles[index(nx, ny)].terrain === TERRAIN.RIVER) near = true;
        }
      }
      if (near) tiles[index(x, y)].terrain = TERRAIN.RIVERBANK;
    }
  }
}

function paintWetlandBlob(tiles, seed, salt, cx, cy, radius, density) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const noise = tileHash(seed, x, y, salt);
      const fall = 1 - dist / radius;
      if (fall <= 0) continue;
      if (noise < fall * density) {
        const tile = tiles[index(x, y)];
        if (tile.terrain === TERRAIN.PLAIN || tile.terrain === TERRAIN.RIVERBANK) {
          tile.terrain = TERRAIN.WETLAND;
        }
      }
    }
  }
}

function paintHillBand(tiles, seed, axis, startCoord, depth, jitter) {
  if (axis === "east") {
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      const offset = Math.round(Math.sin(y / 6 + (seed % 7)) * jitter);
      for (let x = startCoord + offset; x < MAP_WIDTH; x += 1) {
        const tile = tiles[index(x, y)];
        if (tile.terrain === TERRAIN.PLAIN) tile.terrain = TERRAIN.HILL;
      }
    }
  } else if (axis === "north") {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const offset = Math.round(Math.sin(x / 6 + (seed % 7)) * jitter);
      for (let y = 0; y < startCoord + offset; y += 1) {
        if (y < 0 || y >= MAP_HEIGHT) continue;
        const tile = tiles[index(x, y)];
        if (tile.terrain === TERRAIN.PLAIN) tile.terrain = TERRAIN.HILL;
      }
    }
  }
}

function paintHillNoise(tiles, seed, threshold) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const tile = tiles[index(x, y)];
      if (tile.terrain !== TERRAIN.PLAIN) continue;
      const elevation = fbm(seed, x / 22, y / 22, 4, 0.55, 2);
      if (elevation > threshold) tile.terrain = TERRAIN.HILL;
    }
  }
}

function isHillLike(terrain) {
  return terrain === TERRAIN.HILL || terrain === TERRAIN.MOUNTAIN;
}

function hillNeighborCount(tiles, x, y) {
  let count = 0;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
    if (isHillLike(tiles[index(nx, ny)].terrain)) count += 1;
  }
  return count;
}

function mountainStats(tiles) {
  let hills = 0;
  let mountains = 0;
  for (const tile of tiles) {
    if (tile.terrain === TERRAIN.HILL) hills += 1;
    else if (tile.terrain === TERRAIN.MOUNTAIN) mountains += 1;
  }
  return { hills, mountains, total: hills + mountains };
}

function paintMountainRidge(tiles, start, angle, length, halfWidth, seed) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  let changed = 0;
  const phase = tileHash(seed, start.x, start.y, 217) * Math.PI * 2;
  for (let i = -Math.floor(length / 2); i <= Math.floor(length / 2); i += 1) {
    const bend = Math.sin(i * 0.65 + phase) * 0.65;
    const cx = Math.round(start.x + dx * i + px * bend);
    const cy = Math.round(start.y + dy * i + py * bend);
    for (let w = -halfWidth; w <= halfWidth; w += 1) {
      const tx = Math.round(cx + px * w);
      const ty = Math.round(cy + py * w);
      if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) continue;
      const tile = tiles[index(tx, ty)];
      if (tile.terrain !== TERRAIN.HILL) continue;
      if (hillNeighborCount(tiles, tx, ty) < 2) continue;
      tile.terrain = TERRAIN.MOUNTAIN;
      changed += 1;
    }
  }
  return changed;
}

function paintMountainCluster(tiles, center, radius, seed) {
  let changed = 0;
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      const dist = Math.hypot(x - center.x, y - center.y);
      if (dist > radius) continue;
      const tile = tiles[index(x, y)];
      if (tile.terrain !== TERRAIN.HILL) continue;
      if (hillNeighborCount(tiles, x, y) < 2) continue;
      if (tileHash(seed, x, y, 239) > 0.82 - dist * 0.08) continue;
      tile.terrain = TERRAIN.MOUNTAIN;
      changed += 1;
    }
  }
  return changed;
}

function paintMountainRidges(tiles, seed, rng, mountainRatio, options = {}) {
  const initial = mountainStats(tiles);
  if (initial.total <= 0) return;
  const target = Math.max(options.minMountains || 0, Math.round(initial.total * mountainRatio));
  const candidates = tiles
    .filter((tile) => tile.terrain === TERRAIN.HILL && hillNeighborCount(tiles, tile.x, tile.y) >= 2)
    .sort((a, b) => tileHash(seed, a.x, a.y, 251) - tileHash(seed, b.x, b.y, 251));
  if (candidates.length === 0) return;

  const angles = options.angles || [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];
  const maxAttempts = options.maxAttempts || 36;
  for (let attempt = 0; attempt < maxAttempts && mountainStats(tiles).mountains < target; attempt += 1) {
    const start = candidates[(attempt * 17 + rng.integer(0, candidates.length - 1)) % candidates.length];
    if (start.terrain !== TERRAIN.HILL) continue;
    const angle = angles[(attempt + rng.integer(0, angles.length - 1)) % angles.length];
    const length = rng.integer(options.minLength || 5, options.maxLength || 12);
    const halfWidth = rng.integer(0, options.maxHalfWidth || 1);
    const changed = paintMountainRidge(tiles, start, angle, length, halfWidth, seed + attempt);
    if (changed <= 1) paintMountainCluster(tiles, start, rng.integer(2, options.maxClusterRadius || 3), seed + attempt);
  }
}

// M5a: river-adjacent plain converts to fertile soil more aggressively. The
// search window extends to a 3-tile band so braided/short rivers still seed
// meaningful farmland, and the per-tile threshold is raised so ~8% of the
// total map (≈ 500 tiles) is fertile after generation in normal cases.
function paintFertileNearRivers(tiles, seed, threshold = 0.85) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const tile = tiles[index(x, y)];
      if (tile.terrain !== TERRAIN.PLAIN) continue;
      let nearRiver = false;
      for (let oy = -3; oy <= 3 && !nearRiver; oy += 1) {
        for (let ox = -3; ox <= 3 && !nearRiver; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
          if (tiles[index(nx, ny)].terrain === TERRAIN.RIVER) nearRiver = true;
        }
      }
      if (nearRiver && tileHash(seed, x, y, 83) < threshold) tile.terrain = TERRAIN.FERTILE;
    }
  }
}

function paintForestNoise(tiles, seed, threshold, salt) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const tile = tiles[index(x, y)];
      if (tile.terrain !== TERRAIN.PLAIN && tile.terrain !== TERRAIN.HILL) continue;
      const value = fbm(seed + salt, x / 14, y / 14, 3, 0.5, 2);
      if (value > threshold) tile.terrain = TERRAIN.FOREST;
    }
  }
}

function paintWastelandPatches(tiles, seed, salt, count, rng) {
  for (let i = 0; i < count; i += 1) {
    const cx = rng.integer(6, MAP_WIDTH - 6);
    const cy = rng.integer(6, MAP_HEIGHT - 6);
    const radius = rng.integer(2, 4);
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (Math.sqrt(dx * dx + dy * dy) > radius) continue;
        const noise = tileHash(seed, x, y, salt + i);
        const tile = tiles[index(x, y)];
        if ((tile.terrain === TERRAIN.PLAIN || tile.terrain === TERRAIN.HILL) && noise < 0.7) {
          tile.terrain = TERRAIN.WASTELAND;
        }
      }
    }
  }
}

function paintCornerHillWasteland(tiles, seed, rng) {
  const corners = [
    { x0: 0, y0: 0, dx: 1, dy: 1 },
    { x0: MAP_WIDTH - 1, y0: 0, dx: -1, dy: 1 },
    { x0: 0, y0: MAP_HEIGHT - 1, dx: 1, dy: -1 },
    { x0: MAP_WIDTH - 1, y0: MAP_HEIGHT - 1, dx: -1, dy: -1 }
  ];
  for (let i = 0; i < corners.length; i += 1) {
    const corner = corners[i];
    const candidates = [];
    for (let oy = 0; oy < 12; oy += 1) {
      for (let ox = 0; ox < 12; ox += 1) {
        const x = corner.x0 + ox * corner.dx;
        const y = corner.y0 + oy * corner.dy;
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
        const tile = tiles[index(x, y)];
        if (tile.terrain === TERRAIN.HILL) candidates.push(tile);
      }
    }
    if (candidates.length < 4) continue;
    const center = candidates[rng.integer(0, candidates.length - 1)];
    const radius = rng.integer(2, 4);
    for (let y = center.y - radius; y <= center.y + radius; y += 1) {
      for (let x = center.x - radius; x <= center.x + radius; x += 1) {
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
        const dx = x - center.x;
        const dy = y - center.y;
        if (Math.sqrt(dx * dx + dy * dy) > radius) continue;
        const tile = tiles[index(x, y)];
        if (tile.terrain === TERRAIN.HILL && tileHash(seed, x, y, 171 + i) < 0.72) {
          tile.terrain = TERRAIN.WASTELAND;
        }
      }
    }
  }
}

function paintEstuaryOcean(tiles, seed, rng) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const coast = Math.round(58 + Math.sin((y + seed % 17) / 7) * 4 + fbm(seed + 1200, y / 18, 0.5, 3, 0.5, 2) * 4);
    for (let x = Math.max(48, coast); x < MAP_WIDTH; x += 1) {
      tiles[index(x, y)].terrain = TERRAIN.SEA;
    }
    for (let x = coast - 3; x < coast; x += 1) {
      if (x < 0 || x >= MAP_WIDTH) continue;
      const tile = tiles[index(x, y)];
      if (tile.terrain === TERRAIN.PLAIN && tileHash(seed, x, y, 191) < 0.45) tile.terrain = TERRAIN.FERTILE;
    }
  }
  // A few coastal inlets make the shoreline less like a straight wall.
  for (let i = 0; i < 5; i += 1) {
    const cy = rng.integer(8, MAP_HEIGHT - 8);
    const cx = rng.integer(55, 64);
    const radius = rng.integer(3, 6);
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= radius && tileHash(seed, x, y, 211 + i) < 0.75) tiles[index(x, y)].terrain = TERRAIN.SEA;
      }
    }
  }
}

function paintPassBlock(tiles, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      tiles[index(x, y)].terrain = TERRAIN.PASS;
    }
  }
}

function normalizeActiveTerrainSet(tiles) {
  for (const tile of tiles) {
    if (tile.terrain === TERRAIN.RIVERBANK || tile.terrain === TERRAIN.WETLAND) {
      tile.terrain = TERRAIN.PLAIN;
    } else if (tile.terrain === TERRAIN.PASS) {
      tile.terrain = TERRAIN.HILL;
    }
  }
}

function ensureMountainPresence(tiles) {
  if (tiles.some((tile) => tile.terrain === TERRAIN.MOUNTAIN)) return;
  for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
      const tile = tiles[index(x, y)];
      if (tile.terrain !== TERRAIN.HILL) continue;
      tile.terrain = TERRAIN.MOUNTAIN;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbor = tiles[index(x + ox, y + oy)];
        if (neighbor.terrain === TERRAIN.HILL) neighbor.terrain = TERRAIN.MOUNTAIN;
      }
      return;
    }
  }
}

function removeIsolatedMountains(tiles) {
  const isolated = [];
  for (const tile of tiles) {
    if (tile.terrain !== TERRAIN.MOUNTAIN) continue;
    let neighbor = false;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tile.x + ox;
      const y = tile.y + oy;
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      if (tiles[index(x, y)].terrain === TERRAIN.MOUNTAIN) {
        neighbor = true;
        break;
      }
    }
    if (!neighbor) isolated.push(tile);
  }
  for (const tile of isolated) tile.terrain = TERRAIN.HILL;
}

function enforceCornerTerrain(tiles, seed) {
  const corners = [
    { x0: 0, y0: 0, dx: 1, dy: 1 },
    { x0: MAP_WIDTH - 1, y0: 0, dx: -1, dy: 1 },
    { x0: 0, y0: MAP_HEIGHT - 1, dx: 1, dy: -1 },
    { x0: MAP_WIDTH - 1, y0: MAP_HEIGHT - 1, dx: -1, dy: -1 }
  ];
  for (let c = 0; c < corners.length; c += 1) {
    const corner = corners[c];
    for (let oy = 0; oy < 11; oy += 1) {
      for (let ox = 0; ox < 11; ox += 1) {
        if (ox + oy > 13) continue;
        const x = corner.x0 + ox * corner.dx;
        const y = corner.y0 + oy * corner.dy;
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
        const tile = tiles[index(x, y)];
        if (
          tile.terrain === TERRAIN.HILL ||
          tile.terrain === TERRAIN.MOUNTAIN ||
          tile.terrain === TERRAIN.WASTELAND ||
          tile.terrain === TERRAIN.RIVER ||
          tile.terrain === TERRAIN.SEA
        ) continue;
        tile.terrain = tileHash(seed, x, y, 307 + c) < 0.28 ? TERRAIN.WASTELAND : TERRAIN.HILL;
      }
    }
  }
}

// ---------- archetype generators ----------

function generateWei(seed) {
  const rng = new SeededRng(seed);
  const tiles = blankTiles();

  paintRiver(tiles, seed, {
    axis: "vertical",
    center: rng.integer(20, 30),
    amplitude: rng.integer(4, 7),
    period: rng.integer(5, 9),
    drift: (rng.integer(-3, 5)) / 100,
    width: 1,
    phase: rng.integer(0, 24)
  });

  paintHillBand(tiles, seed, "east", rng.integer(66, 72), 0, 3);
  paintHillNoise(tiles, seed + 200, 0.735);
  paintMountainRidges(tiles, seed + 260, rng, 0.105, {
    minLength: 6,
    maxLength: 14,
    maxHalfWidth: 1,
    maxAttempts: 30
  });
  paintForestNoise(tiles, seed + 400, 0.66, 11);
  paintWastelandPatches(tiles, seed, 19, 6, rng);
  paintCornerHillWasteland(tiles, seed + 33, rng);
  paintFertileNearRivers(tiles, seed + 510, 0.88);

  const hotspots = [];
  hotspots.push(...placeHotspots(tiles, rng, seed, 2, 1));

  return finalize(tiles, hotspots, ARCHETYPES.WEI, seed);
}

function generateDelta(seed) {
  const rng = new SeededRng(seed ^ 0x4242);
  const tiles = blankTiles();

  // Three braided rivers crossing the map.
  paintRiver(tiles, seed, {
    axis: "vertical",
    center: rng.integer(14, 22),
    amplitude: rng.integer(5, 9),
    period: rng.integer(7, 11),
    drift: 0.04,
    width: 1,
    phase: rng.integer(0, 24)
  });
  paintRiver(tiles, seed + 71, {
    axis: "vertical",
    center: rng.integer(40, 50),
    amplitude: rng.integer(6, 9),
    period: rng.integer(6, 11),
    drift: -0.03,
    width: 1,
    phase: rng.integer(0, 24)
  });
  paintRiver(tiles, seed + 113, {
    axis: "horizontal",
    center: rng.integer(58, 68),
    amplitude: rng.integer(4, 6),
    period: rng.integer(7, 11),
    drift: 0,
    width: 1,
    phase: rng.integer(0, 24)
  });

  paintForestNoise(tiles, seed + 555, 0.68, 37);
  paintHillNoise(tiles, seed + 220, 0.78);
  paintMountainRidges(tiles, seed + 280, rng, 0.08, {
    minLength: 4,
    maxLength: 9,
    maxHalfWidth: 1,
    maxAttempts: 18
  });
  paintWastelandPatches(tiles, seed, 47, 2, rng);
  paintFertileNearRivers(tiles, seed + 620, 0.85);

  const hotspots = [];
  hotspots.push(...placeHotspots(tiles, rng, seed, 3, 0));

  return finalize(tiles, hotspots, ARCHETYPES.DELTA, seed);
}

function generateEstuary(seed) {
  const rng = new SeededRng(seed ^ 0x51ea);
  const tiles = blankTiles();

  // Low coastal plain cut by several river mouths. Ocean is painted after
  // rivers so channels terminate naturally at the shoreline.
  paintRiver(tiles, seed + 17, {
    axis: "horizontal",
    center: rng.integer(22, 28),
    amplitude: rng.integer(3, 6),
    period: rng.integer(6, 10),
    drift: 0.03,
    width: 1,
    phase: rng.integer(0, 20)
  });
  paintRiver(tiles, seed + 43, {
    axis: "horizontal",
    center: rng.integer(39, 46),
    amplitude: rng.integer(4, 7),
    period: rng.integer(7, 11),
    drift: -0.02,
    width: 1,
    phase: rng.integer(0, 20)
  });
  paintRiver(tiles, seed + 89, {
    axis: "vertical",
    center: rng.integer(22, 30),
    amplitude: rng.integer(5, 8),
    period: rng.integer(9, 13),
    drift: 0.01,
    width: 2,
    phase: rng.integer(0, 24)
  });

  paintEstuaryOcean(tiles, seed + 300, rng);
  paintFertileNearRivers(tiles, seed + 330, 0.88);
  paintForestNoise(tiles, seed + 360, 0.7, 41);
  paintHillNoise(tiles, seed + 390, 0.755);
  paintMountainRidges(tiles, seed + 410, rng, 0.035, {
    minLength: 4,
    maxLength: 8,
    maxHalfWidth: 0,
    maxAttempts: 12
  });
  paintWastelandPatches(tiles, seed + 430, 59, 3, rng);

  const hotspots = [];
  hotspots.push(...placeHotspots(tiles, rng, seed, 2, 1));

  return finalize(tiles, hotspots, ARCHETYPES.ESTUARY, seed);
}

// ---------- hotspot placement ----------

function placeHotspots(tiles, rng, seed, mulberryCount, springCount) {
  const taken = new Set();
  const result = [];
  const occupy = (x, y) => taken.add(`${x},${y}`);
  const occupied = (x, y) => taken.has(`${x},${y}`);

  const tryPlace = (predicate, type) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const x = rng.integer(2, MAP_WIDTH - 3);
      const y = rng.integer(2, MAP_HEIGHT - 3);
      if (occupied(x, y)) continue;
      const tile = tiles[index(x, y)];
      if (!predicate(tile)) continue;
      occupy(x, y);
      result.push({ x, y, type });
      return true;
    }
    return false;
  };

  for (let i = 0; i < mulberryCount; i += 1) {
    tryPlace((tile) => tile.terrain === TERRAIN.PLAIN || tile.terrain === TERRAIN.FOREST, HOTSPOT.MULBERRY);
  }
  for (let i = 0; i < springCount; i += 1) {
    tryPlace((tile) => tile.terrain === TERRAIN.PLAIN || tile.terrain === TERRAIN.HILL, HOTSPOT.SPRING);
  }
  return result;
}

// ---------- final pass: ensure starter playability ----------

// M6.1: pick an east-west row that's mostly clear (avoid ocean / mountain),
// carve obstructive terrain to plain so a road can sit there, and return the
// list of (x, y) tiles that make up the trunk road. River tiles in that row
// are kept as-is — they'll be turned into bridges by the game-state init.
//
// The candidate band sits just above the central plain hub (row 36–44 is
// carved by finalize for the player's starter zone) so the trunk is close
// enough for easy connection but doesn't bisect the playable hub.
function carveAndRecordMainRoad(tiles) {
  const RANGE_MIN = 32;
  const RANGE_MAX = 38;
  let bestY = RANGE_MIN;
  let bestScore = -Infinity;
  for (let y = RANGE_MIN; y <= RANGE_MAX; y += 1) {
    let score = 0;
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const t = tiles[index(x, y)].terrain;
      if (t === TERRAIN.SEA) score -= 5;             // sea blocks the trunk entirely
      else if (t === TERRAIN.MOUNTAIN) score -= 1;
      else if (t === TERRAIN.RIVER) score += 1;       // bridges are fine
      else if (t === TERRAIN.PLAIN || t === TERRAIN.FERTILE) score += 3;
      else score += 2;                                 // forest / hill / wasteland — all carvable
    }
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }

  // Carve the chosen row: anything that isn't river or sea becomes plain so
  // the road can sit on it. Sea tiles end the trunk on that side.
  const mainTiles = [];
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    const tile = tiles[index(x, bestY)];
    if (tile.terrain === TERRAIN.SEA) continue;
    if (tile.terrain !== TERRAIN.RIVER) tile.terrain = TERRAIN.PLAIN;
    mainTiles.push({ x, y: bestY });
  }
  return { mainRoadTiles: mainTiles, mainRoadAxis: "horizontal", mainRoadY: bestY };
}

function finalize(tiles, hotspots, archetype, seed = 0) {
  normalizeActiveTerrainSet(tiles);
  // Carve a guaranteed plain hub in the center if generation buried it.
  const cx = Math.floor(MAP_WIDTH / 2);
  const cy = Math.floor(MAP_HEIGHT / 2);
  for (let y = cy - 4; y <= cy + 4; y += 1) {
    for (let x = cx - 4; x <= cx + 4; x += 1) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      const tile = tiles[index(x, y)];
      if (tile.terrain === TERRAIN.RIVER) continue;
      tile.terrain = TERRAIN.PLAIN;
    }
  }
  ensureMountainPresence(tiles);
  enforceCornerTerrain(tiles, seed);
  removeIsolatedMountains(tiles);
  ensureMountainPresence(tiles);

  const trunk = carveAndRecordMainRoad(tiles);

  const difficulty = computeDifficulty(tiles);
  return { tiles, hotspots, archetype, difficulty, ...trunk };
}

function computeDifficulty(tiles) {
  let plain = 0;
  let river = 0;
  let hostile = 0;
  for (const tile of tiles) {
    if (tile.terrain === TERRAIN.PLAIN || tile.terrain === TERRAIN.FERTILE) plain += 1;
    if (tile.terrain === TERRAIN.RIVER || tile.terrain === TERRAIN.SEA) river += 1;
    if (tile.terrain === TERRAIN.HILL || tile.terrain === TERRAIN.MOUNTAIN || tile.terrain === TERRAIN.WASTELAND) hostile += 1;
  }
  const total = tiles.length;
  return {
    plainRatio: plain / total,
    riverRatio: river / total,
    hostileRatio: hostile / total
  };
}

// ---------- public entry ----------

function hashSeedToUnit(seed) {
  let h = (seed ^ 0xa5a5a5a5) >>> 0;
  h = Math.imul(h, 374761393) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

export function pickArchetype(seed) {
  const r = hashSeedToUnit(seed);
  return r < 0.65 ? ARCHETYPES.WEI : ARCHETYPES.ESTUARY;
}

export function generateMap(seed, archetype = pickArchetype(seed)) {
  switch (archetype) {
    case ARCHETYPES.ESTUARY: return generateEstuary(seed);
    case ARCHETYPES.WEI:
        default: return generateWei(seed);
  }
}

// Deterministic Wei Valley helper used by tests.
export function createWeiRiverValley(seed = 100) {
  return generateWei(seed).tiles;
}
