import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../../model/constants.js";
import { getBuildingDef } from "../../sim/BuildingSystem.js";
import { serviceRadius } from "../../model/formulas.js";
import { tileElevation } from "./terrain.js";

// Maximum tiles a coverage overlay can contain. For radius 12 buildings:
// (2*12+1)^2 = 625. Pre-allocating generously avoids re-creation.
const MAX_COVERAGE_TILES = 700;

// Translucent quads marking every tile inside the selected service building's
// Chebyshev-radius coverage. Uses InstancedMesh to avoid per-tile draw calls.
export class CoverageLayer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "coverage-layer";
    this.scene.add(this.group);
    this.geo = new THREE.PlaneGeometry(0.94, 0.94);
    this.geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffd789,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    });
    this.borderMat = new THREE.MeshBasicMaterial({
      color: 0xffd789,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    // Pre-allocate two InstancedMesh objects: one for interior, one for border.
    this.interiorMesh = new THREE.InstancedMesh(this.geo, this.mat, MAX_COVERAGE_TILES);
    this.interiorMesh.count = 0;
    this.interiorMesh.frustumCulled = false;
    this.borderMesh = new THREE.InstancedMesh(this.geo, this.borderMat, MAX_COVERAGE_TILES);
    this.borderMesh.count = 0;
    this.borderMesh.frustumCulled = false;
    this.group.add(this.interiorMesh, this.borderMesh);
    this.signature = "";
    this.tmpMatrix = new THREE.Matrix4();
  }

  clear() {
    this.interiorMesh.count = 0;
    this.borderMesh.count = 0;
    this.interiorMesh.visible = false;
    this.borderMesh.visible = false;
    this.signature = "";
  }

  update(state) {
    const id = state.selectedBuildingId;
    if (!id) {
      if (this.signature) this.clear();
      return;
    }
    const building = state.buildings.find((b) => b.id === id);
    if (!building) {
      if (this.signature) this.clear();
      return;
    }
    const def = getBuildingDef(state, building.type);
    if (!def?.radius) {
      if (this.signature) this.clear();
      return;
    }
    const nextSignature = `${id}:${building.level || 1}:${building.connected ? "C" : "D"}`;
    if (nextSignature === this.signature) return;
    this.clear();
    this.signature = nextSignature;
    const cx = building.x + Math.floor(def.footprint.w / 2);
    const cy = building.y + Math.floor(def.footprint.h / 2);
    const r = serviceRadius(def, building);

    let interiorCount = 0;
    let borderCount = 0;

    for (let oy = -r; oy <= r; oy += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) > r) continue;
        const tx = cx + ox;
        const ty = cy + oy;
        if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) continue;
        const tile = state.tiles[ty * MAP_WIDTH + tx];
        const elev = tileElevation(tile?.terrain || "plain") + 0.02;
        const onEdge = Math.max(Math.abs(ox), Math.abs(oy)) === r;
        this.tmpMatrix.makeTranslation(tx + 0.5 - MAP_WIDTH / 2, elev, ty + 0.5 - MAP_HEIGHT / 2);
        if (onEdge) {
          this.borderMesh.setMatrixAt(borderCount, this.tmpMatrix);
          borderCount += 1;
        } else {
          this.interiorMesh.setMatrixAt(interiorCount, this.tmpMatrix);
          interiorCount += 1;
        }
      }
    }

    this.interiorMesh.count = interiorCount;
    this.interiorMesh.instanceMatrix.needsUpdate = true;
    this.interiorMesh.visible = interiorCount > 0;
    this.borderMesh.count = borderCount;
    this.borderMesh.instanceMatrix.needsUpdate = true;
    this.borderMesh.visible = borderCount > 0;
  }
}
