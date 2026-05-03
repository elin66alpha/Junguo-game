import { MAP_HEIGHT, MAP_WIDTH } from "../model/constants.js";
import { buildingFootprintTiles } from "./BuildingSystem.js";

function roadKey(x, y) {
  return `${x},${y}`;
}

function orthogonalNeighbors(x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ];
}

// M6.1: connectivity now flows out of the trunk road, not from anywhere.
// Built road / bridge buildings count as walkable tiles, but a building only
// becomes "connected" when its tile traces — through other road tiles —
// back to a tile in state.mainRoadTiles. Floating road fragments and the
// buildings around them stay disconnected.
//
// Backward compatibility: if state.mainRoadTiles is missing or empty (e.g.
// loading a pre-M6.1 save), we fall back to the legacy rule where any road
// counts as connected. That keeps old games playable without forcing the
// player to start a new term.
export function recomputeRoadAccess(state) {
  const roadTiles = new Set();
  for (const building of state.buildings) {
    if (building.status !== "complete") {
      building.connected = false;
      continue;
    }
    if (building.type === "road" || building.type === "bridge") {
      roadTiles.add(roadKey(building.x, building.y));
      building.connected = false;  // resolved in trunk pass below
    } else {
      building.connected = false;
    }
  }

  const mainRoad = (state.mainRoadTiles || []).filter((t) => t && Number.isFinite(t.x) && Number.isFinite(t.y));
  const useTrunkRule = mainRoad.length > 0;

  let trunkConnected;
  if (useTrunkRule) {
    trunkConnected = new Set();
    const queue = [];
    for (const tile of mainRoad) {
      const k = roadKey(tile.x, tile.y);
      if (!roadTiles.has(k)) continue;
      if (trunkConnected.has(k)) continue;
      trunkConnected.add(k);
      queue.push({ x: tile.x, y: tile.y });
    }
    while (queue.length > 0) {
      const tile = queue.shift();
      for (const neighbor of orthogonalNeighbors(tile.x, tile.y)) {
        if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= MAP_WIDTH || neighbor.y >= MAP_HEIGHT) continue;
        const k = roadKey(neighbor.x, neighbor.y);
        if (!roadTiles.has(k) || trunkConnected.has(k)) continue;
        trunkConnected.add(k);
        queue.push(neighbor);
      }
    }
  } else {
    // Legacy mode: every road counts.
    trunkConnected = roadTiles;
  }

  for (const building of state.buildings) {
    if (building.status !== "complete") continue;
    if (building.type === "road" || building.type === "bridge") {
      building.connected = trunkConnected.has(roadKey(building.x, building.y));
      continue;
    }
    const tiles = buildingFootprintTiles(state, building);
    building.connected = tiles.some((tile) =>
      orthogonalNeighbors(tile.x, tile.y).some((neighbor) =>
        neighbor.x >= 0 &&
        neighbor.y >= 0 &&
        neighbor.x < MAP_WIDTH &&
        neighbor.y < MAP_HEIGHT &&
        trunkConnected.has(roadKey(neighbor.x, neighbor.y))
      )
    );
  }

  state.disconnectedCount = state.buildings.filter((building) =>
    building.status === "complete" &&
    building.type !== "road" &&
    building.type !== "bridge" &&
    !building.connected
  ).length;
}
