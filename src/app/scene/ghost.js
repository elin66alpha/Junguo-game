import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../../model/constants.js";
import { getBuildingDef, validatePlacement } from "../../sim/BuildingSystem.js";
import { terrainPlacementTone } from "../../sim/TerrainSystem.js";
import { tileElevation } from "./terrain.js";

const TONE_COLOR = {
  good: 0x6fdc8c,
  warning: 0xe8c552,
  neutral: 0x9bc9a3,
  bad: 0xd64040
};

// Pre-built shared materials — never disposed, never re-created.
const TONE_MATERIALS = {};
for (const [key, color] of Object.entries(TONE_COLOR)) {
  TONE_MATERIALS[key] = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
}

// Translucent quads showing tiles that will be touched by the current drag.
// Uses pre-allocated materials and a mesh pool to avoid per-frame allocation.
export class GhostLayer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "ghost-layer";
    this.scene.add(this.group);
    this.geo = new THREE.PlaneGeometry(0.96, 0.96);
    this.geo.rotateX(-Math.PI / 2);
    this.pool = [];      // recycled Mesh objects
    this.activeCount = 0; // how many pool entries are currently visible
    this.signature = "";
  }

  clear() {
    // Hide all active quads, return them to the pool — no disposal needed.
    for (let i = 0; i < this.activeCount; i += 1) {
      this.pool[i].visible = false;
    }
    this.activeCount = 0;
    this.signature = "";
  }

  acquireQuad(tone) {
    const mat = TONE_MATERIALS[tone] || TONE_MATERIALS.neutral;
    if (this.activeCount < this.pool.length) {
      const quad = this.pool[this.activeCount];
      quad.material = mat;
      quad.visible = true;
      this.activeCount += 1;
      return quad;
    }
    // Grow pool
    const quad = new THREE.Mesh(this.geo, mat);
    this.group.add(quad);
    this.pool.push(quad);
    this.activeCount += 1;
    return quad;
  }

  update(state) {
    const placements = state.dragPreviewTiles?.length
      ? state.dragPreviewTiles
      : state.selectedBuildingType && state.hoverTile
        ? [{ type: state.selectedBuildingType, x: state.hoverTile.x, y: state.hoverTile.y }]
        : [];
    const hoverKey = state.hoverTile ? `${state.hoverTile.x},${state.hoverTile.y}` : "-";
    const nextSignature = [
      state.demolishMode ? "D" : "-",
      state.selectedBuildingType || "-",
      Math.floor(state.resources?.wood ?? 0),
      hoverKey,
      placements.map((p) => `${p.type}:${p.tone || ""}:${p.x},${p.y}`).join("|")
    ].join(";");
    if (nextSignature === this.signature) return;
    this.clear();
    this.signature = nextSignature;

    if (state.demolishMode && state.hoverTile) {
      this.addTile(state.hoverTile.x, state.hoverTile.y, "bad", state);
      return;
    }
    for (const p of placements) {
      if (p.type === "__demolish__") {
        this.addTile(p.x, p.y, "bad", state);
        continue;
      }
      if (p.type === "__upgrade__") {
        this.addTile(p.x, p.y, p.tone || "neutral", state);
        continue;
      }
      const def = getBuildingDef(state, p.type);
      if (!def) continue;
      const validation = validatePlacement(state, p.type, p.x, p.y);
      const tile = state.tiles[p.y * MAP_WIDTH + p.x];
      const tone = validation.ok ? terrainPlacementTone(p.type, tile?.terrain) : "bad";
      for (let oy = 0; oy < def.footprint.h; oy += 1) {
        for (let ox = 0; ox < def.footprint.w; ox += 1) {
          this.addTile(p.x + ox, p.y + oy, tone, state);
        }
      }
    }
  }

  addTile(tx, ty, tone, state) {
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return;
    const tile = state.tiles[ty * MAP_WIDTH + tx];
    const elev = tileElevation(tile?.terrain || "plain") + 0.04;
    const quad = this.acquireQuad(tone);
    quad.position.set(tx + 0.5 - MAP_WIDTH / 2, elev, ty + 0.5 - MAP_HEIGHT / 2);
  }
}
