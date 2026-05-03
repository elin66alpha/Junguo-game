import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ACTIVE_TERRAIN_KEYS, MAP_HEIGHT, MAP_WIDTH, TERRAIN_COLORS, TERRAIN_LABELS } from "../model/constants.js";
import { buildingAt, getBuildingDef } from "../sim/BuildingSystem.js";
import { terrainTooltip } from "../sim/TerrainSystem.js";
import { HOUSING_TIERS } from "../model/constants.js";
import { farmSeasonInfo, granaryCapacity } from "../model/formulas.js";
import { setupLighting } from "./scene/lighting.js";
import {
  buildDecorations, buildPickingPlane, buildSubfloor, buildTerrainMesh,
  tileElevation, tileToWorldCenter, worldToTileCoords
} from "./scene/terrain.js";
import {
  buildBuildingMesh, disposeGroup, positionBuildingGroup
} from "./scene/buildings.js";
import { animateWaterLayer, buildWaterLayer } from "./scene/water.js";
import { GhostLayer } from "./scene/ghost.js";
import { CoverageLayer } from "./scene/coverage.js";
import { FloatingLayer } from "./scene/floating.js";
import { pickTile } from "./scene/picking.js";

const CAMERA_EDGE_MARGIN = 8;

function detectRenderQuality() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("quality");
  const lowHardware = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const lowPower = requested === "low" || (requested !== "high" && lowHardware);
  return {
    lowPower,
    antialias: !lowPower,
    maxPixelRatio: lowPower ? 1 : 1.5,
    shadows: !lowPower
  };
}

export class Renderer {
  constructor(state, canvas, tooltip, legend) {
    this.state = state;
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.legend = legend;
    this.animTick = 0;
    this.animTime = 0;          // wall-clock seconds for time-based animations
    this.shadowsDirty = true;   // re-bake shadow map next frame
    this._lastTooltipKey = "";  // gate redundant innerHTML writes
    this.quality = detectRenderQuality();

    // ---- core three setup ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfd9e8);
    this.scene.fog = new THREE.Fog(0xc9ddd2, 70, 120);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality.antialias,
      powerPreference: this.quality.lowPower ? "low-power" : "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xbfd9e8, 1);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    // Scene is mostly static — we only need a fresh shadow pass when buildings
    // change. Animated meshes (flags, smoke, water) are flagged noShadow so
    // skipping the per-frame shadow re-render is visually safe.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
    this.camera.position.set(0, 32, 34);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 14;
    this.controls.maxDistance = 62;
    this.controls.minPolarAngle = 0.42;
    this.controls.maxPolarAngle = 1.04;
    // Left = handled by app for placement; we only let middle pan, right rotate, wheel zoom
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE
    };
    // We'll trigger our own right-click logic and then suppress orbit's rotate via this guard
    this.controls.rotateSpeed = 0.8;
    this.controls.panSpeed = 0.58;
    this.controls.screenSpacePanning = false;
    this.controls.update();
    this.clampCameraToMap();

    setupLighting(this.scene, { shadows: this.quality.shadows });
    this.scene.add(buildSubfloor());

    this.terrainMesh = null;
    this.waterGroup = null;
    this.decorationsGroup = null;
    this.pickingPlane = buildPickingPlane();
    this.scene.add(this.pickingPlane);

    this.buildingsGroup = new THREE.Group();
    this.buildingsGroup.name = "buildings";
    this.scene.add(this.buildingsGroup);
    this.buildingNodes = new Map();   // building.id -> { group, signature }
    this.buildingsDirty = true;
    this.animationNodes = [];

    this.ghostLayer = new GhostLayer(this.scene);
    this.coverageLayer = new CoverageLayer(this.scene);

    const floatingHost = document.querySelector("#floating-layer");
    this.floatingLayer = new FloatingLayer(floatingHost);

    this.rebuildMap();
    this.renderLegend();

    window.addEventListener("resize", () => this.handleResize());
    this.handleResize();
  }

  // ---------- public API used by GameApp ----------

  centerOnStart() {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 32, 34);
    this.controls.update();
    this.clampCameraToMap();
  }

  centerOn(tx, ty) {
    const v = tileToWorldCenter(tx, ty);
    this.controls.target.set(v.x, 0, v.z);
    // Pull camera in toward that target while keeping current distance and angle
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(v).add(offset);
    this.controls.update();
    this.clampCameraToMap();
  }

  // Backwards-compat: treat (dx, dy) in pixels by converting to world units.
  pan(dx, dy) {
    const factor = 0.04;
    const move = new THREE.Vector3(dx * factor, 0, dy * factor);
    this.controls.target.add(move);
    this.camera.position.add(move);
    this.controls.update();
    this.clampCameraToMap();
  }

  screenToTile(clientX, clientY) {
    const tile = pickTile(this.canvas, this.camera, this.pickingPlane, clientX, clientY);
    return tile || { x: -1, y: -1 };
  }

  showTooltip(clientX, clientY) {
    if (!this.state.hoverTile || this.state.hoverTile.x < 0) {
      this.tooltip.classList.add("hidden");
      this._lastTooltipKey = "";
      return;
    }
    const tile = this.state.tiles[this.state.hoverTile.y * MAP_WIDTH + this.state.hoverTile.x];
    if (!tile) {
      this.tooltip.classList.add("hidden");
      this._lastTooltipKey = "";
      return;
    }
    // Cheap key gate: skip the innerHTML rebuild + classList work on every
    // pixel of mouse movement when the hovered tile / mode hasn't changed.
    // Position is still updated so the tooltip tracks the cursor.
    const tooltipKey = `${this.state.hoverTile.x},${this.state.hoverTile.y}|${this.state.demolishMode ? "D" : "-"}|${this.state.upgradeMode ? "U" : "-"}|${this.state.selectedBuildingType || "-"}`;
    if (tooltipKey === this._lastTooltipKey) {
      this.tooltip.style.left = `${clientX + 12}px`;
      this.tooltip.style.top = `${clientY + 12}px`;
      return;
    }
    this._lastTooltipKey = tooltipKey;
    const building = buildingAt(this.state, this.state.hoverTile.x, this.state.hoverTile.y);
    const hotspot = (this.state.hotspots || []).find((spot) => spot.x === this.state.hoverTile.x && spot.y === this.state.hoverTile.y);
    if (building) {
      const def = getBuildingDef(this.state, building.type);
      const isRoad = building.type === "road" || building.type === "bridge";
      const status = building.status === "complete"
        ? (isRoad ? "道路可通行" : building.connected ? "已接道路，正在生效" : "未接道路，暂时无效")
        : `施工中，还需 ${building.seasonsRemaining} 月`;
      const housingInfo = HOUSING_TIERS[building.housingTier];
      const populationText = building.category === "housing" && housingInfo
        ? `人口 ${building.residents}/${housingInfo.maxResidents}（${housingInfo.label}）`
        : `占用人口 ${def.labor * (building.level || 1)}`;
      const extra = [];
      if (building.type === "well" && (building.dryMonthsRemaining || 0) > 0) {
        extra.push(`枯井，还需 ${building.dryMonthsRemaining} 月恢复`);
      }
      if (building.type === "granary") extra.push(`新增仓容 ${granaryCapacity(building.level || 1)}`);
      if (building.type === "farm") extra.push(`农时：${farmSeasonInfo(this.state.monthIndex).label}`);
      const hint = this.state.demolishMode ? "<br>左键拖过即可拆除，右键取消。" : "";
      this.tooltip.innerHTML = `<strong>${def.name} Lv.${building.level || 1}</strong><br>${status}<br>${populationText}${extra.length ? `<br>${extra.join("<br>")}` : ""}${hint}`;
    } else if (hotspot) {
      const label = hotspot.type === "mulberry" ? "桑林（作坊在 3 格内布产 +30%）" : "古井泉眼（4 格内自带水覆盖）";
      this.tooltip.innerHTML = `<strong>${label}</strong>`;
    } else if (this.state.demolishMode) {
      this.tooltip.textContent = "拆除模式：把红色方块拖过建筑，右键取消。";
    } else {
      this.tooltip.textContent = `${this.state.hoverTile.x},${this.state.hoverTile.y} ${terrainTooltip(tile)}`;
    }
    this.tooltip.style.left = `${clientX + 12}px`;
    this.tooltip.style.top = `${clientY + 12}px`;
    this.tooltip.classList.remove("hidden");
  }

  // Frustum-on-ground polygon for the minimap. Returns 4 {x, y} tile-space
  // points (clipped softly to map bounds).
  getViewportPolygon() {
    const corners = [
      new THREE.Vector3(-1, -1, 0.5),
      new THREE.Vector3( 1, -1, 0.5),
      new THREE.Vector3( 1,  1, 0.5),
      new THREE.Vector3(-1,  1, 0.5)
    ];
    const out = [];
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Ray();
    for (const ndc of corners) {
      ndc.unproject(this.camera);
      ray.origin.copy(this.camera.position);
      ray.direction.copy(ndc.sub(this.camera.position).normalize());
      const hit = new THREE.Vector3();
      if (ray.intersectPlane(ground, hit)) {
        out.push({ x: hit.x + MAP_WIDTH / 2, y: hit.z + MAP_HEIGHT / 2 });
      } else {
        out.push({ x: 0, y: 0 });
      }
    }
    return out;
  }

  // Animation tick from the app loop. dtSec is real elapsed seconds since the
  // previous tick — animations are time-based so they look identical at 30 fps
  // and 144 fps.
  tick(dtSec = 1 / 60) {
    this.animTick += 1;
    this.animTime += dtSec;
    this.controls.update();
    this.clampCameraToMap();
    this.animateSceneDetails();
    animateWaterLayer(this.waterGroup, this.animTime);
    this.floatingLayer.update(this.camera, this.canvas, dtSec);
    if (this.quality.shadows && this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Master draw — also reconciles state changes (placed/removed/upgraded).
  // Does NOT call renderer.render — the next tick() from rAF handles that,
  // avoiding a redundant full render pass on every mouse-move during drag.
  draw(options = {}) {
    if (options.syncBuildings || this.buildingsDirty) {
      this.syncBuildings();
      this.refreshAnimationNodes();
      this.buildingsDirty = false;
      this.shadowsDirty = true;  // building geometry changed; rebake shadows
    }
    this.ghostLayer.update(this.state);
    this.coverageLayer.update(this.state);
    this.floatingLayer.syncFromState(this.state);
  }

  markBuildingsDirty() {
    this.buildingsDirty = true;
  }

  // ---------- internals ----------

  rebuildMap() {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      disposeGroup(this.terrainMesh);
    }
    if (this.waterGroup) {
      this.scene.remove(this.waterGroup);
      disposeGroup(this.waterGroup);
    }
    if (this.decorationsGroup) {
      this.scene.remove(this.decorationsGroup);
      disposeGroup(this.decorationsGroup);
    }
    // Buildings group cleared too — when newTerm is invoked the state has new buildings
    for (const node of this.buildingNodes.values()) {
      this.buildingsGroup.remove(node.group);
      disposeGroup(node.group);
    }
    this.buildingNodes.clear();
    this.floatingLayer.reset();

    this.terrainMesh = buildTerrainMesh(this.state);
    this.scene.add(this.terrainMesh);
    this.waterGroup = buildWaterLayer(this.state);
    this.scene.add(this.waterGroup);
    this.decorationsGroup = buildDecorations(this.state);
    this.scene.add(this.decorationsGroup);
    this.buildingsDirty = true;
    this.shadowsDirty = true;
    this.animationNodes = [];
  }

  // Reconcile this.buildingNodes against state.buildings. Each building has a
  // simple "signature" string capturing visual identity; if it changes we
  // rebuild that one mesh (e.g. tier upgrade or construction → complete).
  syncBuildings() {
    // M6.1: precompute the set of road / bridge tiles so each road mesh can
    // know which sides have neighbors and adjacent roads visually merge.
    const roadTileSet = new Set();
    for (const b of this.state.buildings) {
      if (b.status === "complete" && (b.type === "road" || b.type === "bridge")) {
        roadTileSet.add(`${b.x},${b.y}`);
      }
    }
    const mainRoadAxis = this.state.mainRoadAxis || "horizontal";
    const ctxFor = (building) => {
      if (building.type !== "road" && building.type !== "bridge") return null;
      return {
        roadNeighbors: {
          N: roadTileSet.has(`${building.x},${building.y - 1}`),
          S: roadTileSet.has(`${building.x},${building.y + 1}`),
          E: roadTileSet.has(`${building.x + 1},${building.y}`),
          W: roadTileSet.has(`${building.x - 1},${building.y}`)
        },
        mainRoadAxis
      };
    };

    const seen = new Set();
    for (const building of this.state.buildings) {
      seen.add(building.id);
      const def = getBuildingDef(this.state, building.type);
      const ctx = ctxFor(building);
      const sig = signature(building, this.state.monthIndex, ctx);
      const existing = this.buildingNodes.get(building.id);
      if (!existing) {
        const mesh = buildBuildingMesh(this.state, building, def, this.state.monthIndex, ctx);
        const group = new THREE.Group();
        group.add(mesh);
        positionBuildingGroup(this.state, group, building, def);
        group.userData.id = building.id;
        this.buildingsGroup.add(group);
        this.buildingNodes.set(building.id, { group, signature: sig });
      } else if (existing.signature !== sig) {
        for (const child of [...existing.group.children]) {
          existing.group.remove(child);
          disposeGroup(child);
        }
        const mesh = buildBuildingMesh(this.state, building, def, this.state.monthIndex, ctx);
        existing.group.add(mesh);
        positionBuildingGroup(this.state, existing.group, building, def);
        existing.signature = sig;
      } else {
        positionBuildingGroup(this.state, existing.group, building, def);
      }
    }
    for (const id of [...this.buildingNodes.keys()]) {
      if (seen.has(id)) continue;
      const { group } = this.buildingNodes.get(id);
      this.buildingsGroup.remove(group);
      disposeGroup(group);
      this.buildingNodes.delete(id);
    }
  }

  refreshAnimationNodes() {
    this.animationNodes = [];
    this.buildingsGroup.traverse((node) => {
      if (node.userData?.flagWave || node.userData?.smoke) this.animationNodes.push(node);
    });
  }

  animateSceneDetails() {
    // Old code used `animTick * 0.08`, which advanced 0.8 / sec at the legacy
    // 10 fps tick. Multiply animTime (seconds) by 0.8 to preserve the same
    // perceived motion speed regardless of the now-uncapped frame rate.
    const t = this.animTime * 0.8;
    for (const node of this.animationNodes) {
      if (node.userData?.flagWave) {
        const data = node.userData.flagWave;
        node.rotation.y = data.baseY + Math.sin(t + data.phase) * data.strength;
        node.position.z = data.baseZ + Math.sin(t * 1.4 + data.phase) * 0.025;
      }
      if (node.userData?.smoke) {
        const data = node.userData.smoke;
        const cycle = (Math.sin(t * 0.9 + data.phase) + 1) / 2;
        node.position.set(
          data.baseX + Math.sin(t * 0.7 + data.phase) * 0.08,
          data.baseY + cycle * 0.38,
          data.baseZ + Math.cos(t * 0.5 + data.phase) * 0.04
        );
        const s = 0.75 + cycle * 1.1;
        node.scale.setScalar(s);
        if (node.material) node.material.opacity = 0.08 + (1 - cycle) * 0.24;
      }
    }
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clampCameraToMap() {
    const minX = -MAP_WIDTH / 2 + CAMERA_EDGE_MARGIN;
    const maxX = MAP_WIDTH / 2 - CAMERA_EDGE_MARGIN;
    const minZ = -MAP_HEIGHT / 2 + CAMERA_EDGE_MARGIN;
    const maxZ = MAP_HEIGHT / 2 - CAMERA_EDGE_MARGIN;
    const tx = THREE.MathUtils.clamp(this.controls.target.x, minX, maxX);
    const tz = THREE.MathUtils.clamp(this.controls.target.z, minZ, maxZ);
    const dx = tx - this.controls.target.x;
    const dz = tz - this.controls.target.z;
    if (dx !== 0 || dz !== 0) {
      this.controls.target.x = tx;
      this.controls.target.z = tz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
      this.controls.update();
    }
  }

  renderLegend() {
    if (!this.legend) return;
    this.legend.classList.remove("hidden");
    this.legend.innerHTML = ACTIVE_TERRAIN_KEYS
      .map((key) => `<div><span style="background:${TERRAIN_COLORS[key]}"></span>${TERRAIN_LABELS[key]}</div>`)
      .join("");
  }

  // Called by GameApp when a new term resets state in place
  resetForNewState() {
    this.rebuildMap();
  }
}

function signature(building, monthIndex = 0, ctx = null) {
  const upgradeKey = building.upgradePending
    ? `U${building.upgradePending.targetLevel || ""}-${building.upgradePending.targetTier || ""}-${building.upgradePending.seasonsRemaining}`
    : "-";
  // M6.1: encode the road-neighbor pattern + isMainRoad flag in the signature
  // so adjacent road changes trigger a re-mesh on the existing tile (otherwise
  // an old "stub" road keeps its solo ruts after a neighbor is added).
  let roadKey = "-";
  if ((building.type === "road" || building.type === "bridge") && ctx?.roadNeighbors) {
    const n = ctx.roadNeighbors;
    roadKey = `R${n.N ? 1 : 0}${n.S ? 1 : 0}${n.E ? 1 : 0}${n.W ? 1 : 0}${building.isMainRoad ? "m" : ""}`;
  }
  return [
    building.type,
    building.status,
    building.category === "housing" ? building.housingTier : "-",
    building.connected ? "C" : "D",
    building.status === "constructing" ? building.seasonsRemaining : 0,
    building.level || 1,
    building.type === "farm" ? farmSeasonInfo(monthIndex).key : "-",
    building.type === "well" ? (building.dryMonthsRemaining || 0) : "-",
    upgradeKey,
    roadKey
  ].join(":");
}
