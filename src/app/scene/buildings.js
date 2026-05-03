import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../../model/constants.js";
import { farmSeasonInfo } from "../../model/formulas.js";
import { tileElevation } from "./terrain.js";
import { makePatternTexture } from "./textures.js";

// Shared materials. Cloning materials per-mesh is necessary for per-instance
// color tweaks (ghost preview, construction tint, etc.); we'll handle that at
// call sites when needed.
const M = {
  thatch: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("thatch", 1.5, 1.5) }),
  thatchDark: new THREE.MeshLambertMaterial({ color: 0xb08a5a, map: makePatternTexture("thatch", 1.5, 1.5) }),
  wattle: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("wood", 1.2, 1.2) }),
  plaster: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("plaster", 1.2, 1.2) }),
  tile: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("tileRoof", 2, 2) }),
  redLac: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("redRoof", 1.5, 1.5) }),
  woodDark: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("darkWood", 1.4, 1.4) }),
  woodMid: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("wood", 1.4, 1.4) }),
  stone: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("stone", 1.2, 1.2) }),
  earth: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("earth", 2, 2) }),
  dryEarth: new THREE.MeshLambertMaterial({ color: 0xb99b76, map: makePatternTexture("earth", 2, 2) }),
  cropSpring: new THREE.MeshLambertMaterial({ color: 0xb8dd70, map: makePatternTexture("crop", 1.6, 1.6) }),
  cropSummer: new THREE.MeshLambertMaterial({ color: 0x91bd45, map: makePatternTexture("crop", 1.6, 1.6) }),
  cropAutumn: new THREE.MeshLambertMaterial({ color: 0xf0c65c, map: makePatternTexture("crop", 1.6, 1.6) }),
  cropWinter: new THREE.MeshLambertMaterial({ color: 0xc2ad82, map: makePatternTexture("earth", 1.6, 1.6) }),
  road: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("road", 1, 1) }),
  bridgeDeck: new THREE.MeshLambertMaterial({ color: 0xffffff, map: makePatternTexture("wood", 1.2, 1.2) }),
  granaryBody: new THREE.MeshLambertMaterial({ color: 0xe0c078, map: makePatternTexture("wood", 1.2, 1.2) }),
  awningRed: new THREE.MeshLambertMaterial({ color: 0xb34a3c }),
  awningGold: new THREE.MeshLambertMaterial({ color: 0xe2a02c }),
  tradeCanopy: new THREE.MeshLambertMaterial({ color: 0x2f7f88 }),
  tradeCanopyLight: new THREE.MeshLambertMaterial({ color: 0x72b4ae }),
  doorBlack: new THREE.MeshLambertMaterial({ color: 0x231510 }),
  flagRed: new THREE.MeshLambertMaterial({ color: 0xb03e3e, side: THREE.DoubleSide }),
  flagGold: new THREE.MeshLambertMaterial({ color: 0xe0b057, side: THREE.DoubleSide }),
  water: new THREE.MeshLambertMaterial({ color: 0x3a637a })
};

// Pyramid (4-segment cone) used as a hip-roof. Rotated 45° so corners face
// the cardinal directions, matching the box wall below it.
function pyramidRoof(width, depth, height, mat) {
  const base = Math.max(width, depth);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(base * 0.72, height, 4), mat);
  cone.rotation.y = Math.PI / 4;
  cone.scale.set(width / base, 1, depth / base);
  return cone;
}

function makeWindow(x, y, z, w = 0.12, h = 0.1) {
  const win = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), M.doorBlack);
  win.position.set(x, y, z);
  return win;
}

function addSmoke(g, x, y, z, count = 4) {
  for (let i = 0; i < count; i += 1) {
    const mat = new THREE.MeshLambertMaterial({
      color: 0xd8d1bf,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.09 + i * 0.015, 8, 6), mat);
    puff.position.set(x, y + i * 0.16, z);
    puff.userData.smoke = {
      baseX: puff.position.x,
      baseY: puff.position.y,
      baseZ: puff.position.z,
      phase: i * 0.7
    };
    puff.userData.disposeMaterial = true;
    puff.userData.noShadow = true;
    g.add(puff);
  }
}

function makeFlag(width = 0.42, height = 0.22, mat = M.flagRed) {
  const g = new THREE.Group();
  const segments = 4;
  for (let i = 0; i < segments; i += 1) {
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(width / segments, height), mat);
    seg.position.x = (i + 0.5) * width / segments;
    seg.userData.flagWave = {
      baseY: seg.rotation.y,
      baseZ: seg.position.z,
      phase: i * 0.55,
      strength: 0.18 + i * 0.04
    };
    g.add(seg);
  }
  return g;
}

function applyShadowFlags(group) {
  group.traverse((node) => {
    if (!node.isMesh || node.userData?.noShadow) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return group;
}

// ---------- housing ----------

function makeHut() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 0.6), M.wattle);
  wall.position.y = 0.16;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 8), M.thatch);
  roof.position.y = 0.55;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), M.doorBlack);
  door.position.set(0, 0.12, 0.31);
  g.add(wall, roof, door);
  return g;
}

function makeTileHouse() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.36, 0.7), M.plaster);
  wall.position.y = 0.18;
  const roof = pyramidRoof(0.85, 0.85, 0.4, M.tile);
  roof.position.y = 0.55;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), M.doorBlack);
  door.position.set(0, 0.13, 0.36);
  g.add(wall, roof, door);
  return g;
}

function makeCourtyardHouse() {
  const g = new THREE.Group();
  const t = 0.06;
  const wallH = 0.28;
  const sz = 0.92;
  const f = new THREE.Mesh(new THREE.BoxGeometry(sz, wallH, t), M.plaster);
  f.position.set(0, wallH / 2, sz / 2);
  const b = new THREE.Mesh(new THREE.BoxGeometry(sz, wallH, t), M.plaster);
  b.position.set(0, wallH / 2, -sz / 2);
  const l = new THREE.Mesh(new THREE.BoxGeometry(t, wallH, sz), M.plaster);
  l.position.set(-sz / 2, wallH / 2, 0);
  const r = new THREE.Mesh(new THREE.BoxGeometry(t, wallH, sz), M.plaster);
  r.position.set(sz / 2, wallH / 2, 0);
  g.add(f, b, l, r);
  // Inner small house
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), M.plaster);
  inner.position.y = 0.18;
  const innerRoof = pyramidRoof(0.6, 0.6, 0.32, M.tile);
  innerRoof.position.y = 0.52;
  g.add(inner, innerRoof);
  // Gate
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.08), M.doorBlack);
  gate.position.set(0, 0.11, sz / 2 + 0.03);
  g.add(gate);
  return g;
}

function makeCompound() {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.95), M.stone);
  platform.position.y = 0.035;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.4, 0.85), M.plaster);
  wall.position.y = 0.27;
  const roofA = pyramidRoof(0.6, 1.0, 0.36, M.tile);
  roofA.position.set(-0.2, 0.65, 0);
  const roofB = pyramidRoof(0.6, 1.0, 0.36, M.tile);
  roofB.position.set(0.2, 0.65, 0);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.04), M.doorBlack);
  door.position.set(0, 0.17, 0.45);
  g.add(platform, wall, roofA, roofB, door);
  return g;
}

function makeManor() {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.98), M.stone);
  platform.position.y = 0.05;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 0.8), M.plaster);
  wall.position.y = 0.31;
  // Pillars (4 corners)
  for (const dx of [-0.36, 0.36]) {
    for (const dz of [-0.36, 0.36]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), M.redLac);
      p.position.set(dx, 0.31, dz);
      g.add(p);
    }
  }
  const lowerRoof = pyramidRoof(1.05, 1.05, 0.28, M.redLac);
  lowerRoof.position.y = 0.62;
  const middle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), M.plaster);
  middle.position.y = 0.85;
  const upperRoof = pyramidRoof(0.7, 0.7, 0.32, M.redLac);
  upperRoof.position.y = 1.1;
  // Spire
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), M.redLac);
  spire.position.y = 1.32;
  g.add(platform, wall, lowerRoof, middle, upperRoof, spire);
  return g;
}

function makeEstate() {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 1.02), M.stone);
  platform.position.y = 0.06;
  const courtyard = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.025, 0.82), M.earth);
  courtyard.position.y = 0.135;
  g.add(platform, courtyard);

  const lowerHall = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.46, 0.74), M.plaster);
  lowerHall.position.set(0, 0.36, -0.04);
  const lowerRoof = pyramidRoof(1.02, 0.92, 0.34, M.redLac);
  lowerRoof.position.set(0, 0.76, -0.04);
  const upperHall = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.48), M.plaster);
  upperHall.position.set(0, 1.02, -0.04);
  const upperRoof = pyramidRoof(0.68, 0.62, 0.3, M.redLac);
  upperRoof.position.set(0, 1.34, -0.04);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.045), M.flagGold);
  ridge.position.set(0, 1.51, -0.04);
  g.add(lowerHall, lowerRoof, upperHall, upperRoof, ridge);

  for (const x of [-0.34, -0.12, 0.12, 0.34]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.5, 8), M.redLac);
    pillar.position.set(x, 0.42, 0.38);
    g.add(pillar);
  }
  for (const x of [-0.42, 0.42]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.38), M.plaster);
    side.position.set(x, 0.3, 0.18);
    const sideRoof = pyramidRoof(0.34, 0.5, 0.2, M.tile);
    sideRoof.position.set(x, 0.56, 0.18);
    g.add(side, sideRoof);
  }
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.08), M.woodDark);
  gate.position.set(0, 0.28, 0.52);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.035), M.flagGold);
  plaque.position.set(0, 0.4, 0.565);
  g.add(gate, plaque);
  return g;
}

function makeNobleResidence() {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.16, 1.06), M.stone);
  platform.position.y = 0.08;
  const baseHall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.52, 0.78), M.plaster);
  baseHall.position.set(0, 0.44, -0.06);
  const lowerRoof = pyramidRoof(1.12, 0.98, 0.38, M.redLac);
  lowerRoof.position.set(0, 0.9, -0.06);
  const midHall = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.36, 0.56), M.plaster);
  midHall.position.set(0, 1.13, -0.06);
  const midRoof = pyramidRoof(0.82, 0.72, 0.34, M.redLac);
  midRoof.position.set(0, 1.47, -0.06);
  const topHall = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.34), M.plaster);
  topHall.position.set(0, 1.72, -0.06);
  const topRoof = pyramidRoof(0.5, 0.48, 0.26, M.flagGold);
  topRoof.position.set(0, 1.95, -0.06);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), M.flagGold);
  spire.position.set(0, 2.16, -0.06);
  g.add(platform, baseHall, lowerRoof, midHall, midRoof, topHall, topRoof, spire);

  for (const x of [-0.4, -0.14, 0.14, 0.4]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.58, 8), M.redLac);
    pillar.position.set(x, 0.48, 0.36);
    g.add(pillar);
  }
  for (const sx of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.24), M.plaster);
    tower.position.set(sx * 0.46, 0.42, 0.26);
    const roof = pyramidRoof(0.34, 0.34, 0.24, M.flagGold);
    roof.position.set(sx * 0.46, 0.75, 0.26);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 6), M.woodDark);
    pole.position.set(sx * 0.48, 1.04, 0.26);
    const flag = makeFlag(0.22, 0.12, M.flagGold);
    flag.position.set(sx * 0.48, 1.32, 0.26);
    flag.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(tower, roof, pole, flag);
  }
  const steps = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.28), M.stone);
  steps.position.set(0, 0.18, 0.52);
  g.add(steps);
  return g;
}

function makeMansion(building) {
  const level = Math.max(1, Math.min(3, building?.level || 1));
  const g = new THREE.Group();
  const roofMat = level >= 2 ? M.redLac : M.tile;

  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 1.95), M.stone);
  platform.position.y = 0.04;
  const courtyard = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.025, 1.0), M.earth);
  courtyard.position.set(0, 0.095, 0.08);
  g.add(platform, courtyard);

  const wallH = 0.32;
  const wallT = 0.07;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(1.9, wallH, wallT), M.plaster);
  backWall.position.set(0, 0.22, -0.94);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 1.9), M.plaster);
  leftWall.position.set(-0.94, 0.22, 0);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 1.9), M.plaster);
  rightWall.position.set(0.94, 0.22, 0);
  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(0.72, wallH, wallT), M.plaster);
  frontLeft.position.set(-0.58, 0.22, 0.94);
  const frontRight = new THREE.Mesh(new THREE.BoxGeometry(0.72, wallH, wallT), M.plaster);
  frontRight.position.set(0.58, 0.22, 0.94);
  g.add(backWall, leftWall, rightWall, frontLeft, frontRight);

  function addHall(x, z, w, d, h, mat = M.plaster, rMat = roofMat) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.set(x, 0.12 + h / 2, z);
    const roof = pyramidRoof(w + 0.18, d + 0.18, 0.28 + level * 0.03, rMat);
    roof.position.set(x, body.position.y + h / 2 + 0.17, z);
    g.add(body, roof);
    return body;
  }

  addHall(0, -0.58, 1.18, 0.48, 0.48);
  addHall(-0.62, 0.02, 0.44, 1.18, 0.38);
  addHall(0.62, 0.02, 0.44, 1.18, 0.38);
  addHall(0, 0.76, 0.58, 0.32, 0.36, M.plaster, M.tile);

  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.08), M.doorBlack);
  gate.position.set(0, 0.24, 0.98);
  g.add(gate);

  const path = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.018, 1.18), M.stone);
  path.position.set(0, 0.12, 0.26);
  g.add(path);

  for (const x of [-0.46, -0.18, 0.18, 0.46]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 6), level >= 2 ? M.redLac : M.woodDark);
    p.position.set(x, 0.36, -0.3);
    g.add(p);
  }

  if (level >= 2) {
    for (const x of [-0.62, 0.62]) {
      const pavilion = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), M.plaster);
      pavilion.position.set(x, 0.24, 0.58);
      const roof = pyramidRoof(0.42, 0.42, 0.22, M.redLac);
      roof.position.set(x, 0.52, 0.58);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), M.awningGold);
      lantern.position.set(x, 0.36, 0.34);
      g.add(pavilion, roof, lantern);
    }
    for (const z of [-0.2, 0.18, 0.56]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.018, 0.12), M.stone);
      step.position.set(0, 0.13, z);
      g.add(step);
    }
  }

  if (level >= 3) {
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.32, 0.36), M.plaster);
    upper.position.set(0, 1.0, -0.58);
    const upperRoof = pyramidRoof(0.9, 0.5, 0.3, M.redLac);
    upperRoof.position.set(0, 1.31, -0.58);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.04), M.awningGold);
    ridge.position.set(0, 1.48, -0.58);
    g.add(upper, upperRoof, ridge);

    for (const x of [-0.42, 0.42]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), M.woodDark);
      pole.position.set(x, 0.9, -0.88);
      const flag = makeFlag(0.3, 0.16, M.flagGold);
      flag.position.set(x + 0.03, 1.32, -0.88);
      flag.rotation.y = -Math.PI / 2;
      g.add(pole, flag);
    }
  }

  return g;
}

// ---------- service / production / civic / infrastructure ----------

function makeWell(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const dry = (building?.dryMonthsRemaining || 0) > 0;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.32 + level * 0.02, 0.32 + level * 0.02, 0.18, 12), M.stone);
  ring.position.y = 0.09;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), dry ? M.dryEarth : M.water);
  water.position.y = 0.13;
  const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6), M.woodDark);
  pole1.position.set(-0.22, 0.45, 0);
  const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6), M.woodDark);
  pole2.position.set(0.22, 0.45, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), M.woodDark);
  beam.position.set(0, 0.7, 0);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6), M.thatch);
  bucket.position.set(0, 0.5, 0);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 5), M.woodDark);
  rope.position.set(0, 0.58, 0);
  g.add(ring, water, pole1, pole2, beam, rope, bucket);
  if (level >= 3) {
    for (const x of [-0.32, 0.32]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6), M.redLac);
      pillar.position.set(x, 0.43, -0.28);
      g.add(pillar);
    }
    const roof = pyramidRoof(0.88, 0.66, 0.24, level >= 5 ? M.redLac : M.tile);
    roof.position.set(0, 0.78, -0.12);
    g.add(roof);
  }
  if (level >= 4) {
    const stoneApron = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.035, 0.92), M.stone);
    stoneApron.position.y = 0.018;
    g.add(stoneApron);
  }
  if (dry) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.035), M.awningRed);
    cross.position.set(0, 0.24, 0);
    cross.rotation.y = Math.PI / 4;
    g.add(cross);
  }
  return g;
}

function makeFarm(building, monthIndex = 4) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const soil = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 2.9), M.earth);
  soil.position.y = 0.03;
  g.add(soil);

  // Pick crop appearance by month: spring sowing, summer growth, autumn harvest, winter rest.
  const stage = farmSeasonInfo(monthIndex).key;
  let mat = M.cropSpring;
  let h = 0.06;
  if (stage === "spring") { mat = M.cropSpring; h = 0.08; }
  else if (stage === "summer") { mat = M.cropSummer; h = 0.18; }
  else if (stage === "autumn") { mat = M.cropAutumn; h = 0.24; }
  else { mat = M.cropWinter; h = 0.035; }

  for (let r = 0; r < 5; r += 1) {
    const z = -1.2 + r * 0.55;
    const row = new THREE.Mesh(new THREE.BoxGeometry(2.7, h, 0.1), mat);
    row.position.set(0, 0.06 + h / 2, z);
    g.add(row);
    // furrow line
    const furrow = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.01, 0.06), new THREE.MeshLambertMaterial({ color: 0x5d4426 }));
    furrow.position.set(0, 0.07, z + 0.18);
    g.add(furrow);
  }
  if (stage === "autumn") {
    for (const x of [-0.9, 0, 0.9]) {
      const stack = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 6), M.cropAutumn);
      stack.position.set(x, 0.25, 1.05);
      g.add(stack);
    }
  }
  if (stage === "winter") {
    const frost = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.012, 2.8),
      new THREE.MeshBasicMaterial({ color: 0xd8e5df, transparent: true, opacity: 0.22, depthWrite: false })
    );
    frost.userData.disposeMaterial = true;
    frost.userData.noShadow = true;
    frost.position.y = 0.071;
    g.add(frost);
  }
  if (level >= 2) {
    for (const x of [-1.05, 1.05]) {
      const channel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 2.75), M.water);
      channel.position.set(x, 0.09, 0);
      g.add(channel);
    }
  }
  if (level >= 3) {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), M.woodMid);
    shed.position.set(1.08, 0.22, 1.08);
    const roof = pyramidRoof(0.56, 0.56, 0.22, M.thatchDark);
    roof.position.set(1.08, 0.5, 1.08);
    g.add(shed, roof);
  }
  if (level >= 4) {
    const shrine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.22), M.stone);
    shrine.position.set(-1.05, 0.21, 1.05);
    const roof = pyramidRoof(0.38, 0.32, 0.18, M.redLac);
    roof.position.set(-1.05, 0.42, 1.05);
    g.add(shrine, roof);
  }
  if (level >= 5) {
    for (const z of [-1.38, 1.38]) {
      const boundary = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.035, 0.06), M.stone);
      boundary.position.set(0, 0.105, z);
      g.add(boundary);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), M.woodDark);
    pole.position.set(-1.22, 0.5, -1.18);
    const flag = makeFlag(0.28, 0.14, M.flagGold);
    flag.position.set(-1.2, 0.88, -1.18);
    flag.rotation.y = -Math.PI / 2;
    g.add(pole, flag);
  }
  return g;
}

function makeWorkshop(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5 + level * 0.06, 1.7), level >= 4 ? M.plaster : M.wattle);
  wall.position.y = (0.5 + level * 0.06) / 2;
  const roof = pyramidRoof(2.0, 2.0, 0.55 + level * 0.03, level >= 4 ? M.redLac : M.thatchDark);
  roof.position.y = wall.position.y + (0.5 + level * 0.06) / 2 + 0.28;
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), M.stone);
  chim.position.set(0.55, roof.position.y + 0.08, 0.55);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.05), M.doorBlack);
  door.position.set(0, 0.2, 0.86);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), M.woodDark);
  rack.position.set(0, 0.38, -0.86);
  g.add(wall, roof, chim, door, rack, makeWindow(-0.45, 0.34, 0.86), makeWindow(0.45, 0.34, 0.86));
  if (level >= 2) {
    for (const x of [-0.55, 0.55]) {
      const loom = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.08), M.woodDark);
      loom.position.set(x, 0.34, -0.55);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.025), x < 0 ? M.awningRed : M.tradeCanopyLight);
      cloth.position.set(x, 0.38, -0.5);
      g.add(loom, cloth);
    }
  }
  if (level >= 3) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 1.1), M.plaster);
    side.position.set(-0.92, 0.3, 0);
    const sideRoof = pyramidRoof(0.66, 1.28, 0.28, M.tile);
    sideRoof.position.set(-0.92, 0.66, 0);
    g.add(side, sideRoof);
  }
  if (level >= 4) {
    const chim2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), M.stone);
    chim2.position.set(-0.42, roof.position.y + 0.02, 0.58);
    g.add(chim2);
    addSmoke(g, -0.42, roof.position.y + 0.35, 0.58, 4);
  }
  if (level >= 5) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), M.woodDark);
    pole.position.set(0.82, 0.75, -0.82);
    const flag = makeFlag(0.32, 0.16, M.flagGold);
    flag.position.set(0.84, 1.26, -0.82);
    flag.rotation.y = -Math.PI / 2;
    g.add(pole, flag);
  }
  addSmoke(g, 0.55, roof.position.y + 0.45, 0.55, 5);
  return g;
}

function makeGranary(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.9), M.stone);
  platform.position.y = 0.04;
  const bodyHeight = 0.75 + level * 0.18;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.78 + level * 0.05, 0.84 + level * 0.05, bodyHeight, 16), M.granaryBody);
  body.position.y = 0.08 + bodyHeight / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 16), level >= 4 ? M.redLac : M.thatchDark);
  cone.position.y = body.position.y + bodyHeight / 2 + 0.28;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.06), M.doorBlack);
  door.position.set(0, 0.24, 0.84);
  for (let i = 0; i < level + 1; i += 1) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M.thatch);
    sack.scale.set(1.2, 0.6, 0.9);
    sack.position.set(-0.55 + i * 0.32, 0.14, -0.86);
    g.add(sack);
  }
  if (level >= 3) {
    for (const x of [-0.76, 0.76]) {
      const annex = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.62, 12), M.granaryBody);
      annex.position.set(x, 0.39, 0.42);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.28, 12), level >= 4 ? M.redLac : M.thatchDark);
      roof.position.set(x, 0.84, 0.42);
      g.add(annex, roof);
    }
  }
  if (level >= 5) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6), M.woodDark);
    pole.position.set(0.68, 1.15, -0.72);
    const flag = makeFlag(0.3, 0.16, M.flagGold);
    flag.position.set(0.72, 1.66, -0.72);
    flag.rotation.y = -Math.PI / 2;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.04), M.flagGold);
    ridge.position.set(0, cone.position.y + 0.29, 0);
    g.add(pole, flag, ridge);
  }
  g.add(platform, body, cone, door);
  return g;
}

function makeMarket(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  // 4 wood posts
  for (const dx of [-0.78, 0.78]) {
    for (const dz of [-0.78, 0.78]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.08), M.woodDark);
      post.position.set(dx, 0.42, dz);
      g.add(post);
    }
  }
  // Striped awning (alternating red/gold strips)
  const awningGroup = new THREE.Group();
  for (let i = 0; i < 6; i += 1) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.06, 0.27),
      i % 2 === 0 ? M.awningRed : M.awningGold
    );
    strip.position.set(0, 0, -0.7 + i * 0.28);
    awningGroup.add(strip);
  }
  awningGroup.position.y = 0.9;
  g.add(awningGroup);
  // Stalls under
  const stallA = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.5), M.thatch);
  stallA.position.set(-0.45, 0.16, -0.1);
  const stallB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.5), M.awningRed);
  stallB.position.set(0.45, 0.16, 0.2);
  g.add(stallA, stallB);
  if (level >= 2) {
    for (const x of [-0.75, 0.75]) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.04), M.flagGold);
      sign.position.set(x, 0.54, 0.82);
      g.add(sign);
    }
  }
  if (level >= 3) {
    const backShop = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.45, 0.45), M.plaster);
    backShop.position.set(0, 0.32, -0.72);
    const shopRoof = pyramidRoof(1.45, 0.62, 0.28, M.tile);
    shopRoof.position.set(0, 0.66, -0.72);
    g.add(backShop, shopRoof);
  }
  if (level >= 4) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), M.plaster);
    tower.position.set(0, 1.2, 0);
    const towerRoof = pyramidRoof(0.82, 0.82, 0.32, M.redLac);
    towerRoof.position.set(0, 1.62, 0);
    g.add(tower, towerRoof);
  }
  if (level >= 5) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.2, 6), M.woodDark);
    pole.position.set(-0.95, 0.95, -0.9);
    const flag = makeFlag(0.34, 0.18, M.flagGold);
    flag.position.set(-0.9, 1.46, -0.9);
    flag.rotation.y = -Math.PI / 2;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.04), M.flagGold);
    ridge.position.set(0, 1.82, 0);
    g.add(pole, flag, ridge);
  }
  return g;
}

function makeWarehouse(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 1.85), M.stone);
  platform.position.y = 0.04;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.58 + level * 0.12, 1.45), M.woodMid);
  body.position.y = 0.08 + (0.58 + level * 0.12) / 2;
  const roof = pyramidRoof(1.9, 1.75, 0.42 + level * 0.02, level >= 4 ? M.redLac : M.tile);
  roof.position.y = body.position.y + (0.58 + level * 0.12) / 2 + 0.22;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.06), M.doorBlack);
  door.position.set(0, 0.3, 0.75);
  g.add(platform, body, roof, door);
  for (let i = 0; i < 2 + level; i += 1) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.28), M.woodDark);
    crate.position.set(-0.55 + i * 0.28, 0.13, -0.82);
    g.add(crate);
  }
  if (level >= 3) {
    for (const x of [-0.9, 0.9]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 1.12), M.woodMid);
      side.position.set(x, 0.31, -0.08);
      const sideRoof = pyramidRoof(0.48, 1.28, 0.22, M.tile);
      sideRoof.position.set(x, 0.64, -0.08);
      g.add(side, sideRoof);
    }
  }
  if (level >= 5) {
    const watch = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.38, 0.52), M.plaster);
    watch.position.set(0, roof.position.y + 0.28, 0);
    const watchRoof = pyramidRoof(0.68, 0.68, 0.28, M.redLac);
    watchRoof.position.set(0, roof.position.y + 0.58, 0);
    g.add(watch, watchRoof);
  }
  return g;
}

function makeTradeStation(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.08, 2.85), M.stone);
  platform.position.y = 0.04;
  const yard = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.03, 2.35), M.earth);
  yard.position.y = 0.095;
  g.add(platform, yard);

  // Large teal transit awning, deliberately distinct from the red/gold market.
  for (const dx of [-1.08, -0.36, 0.36, 1.08]) {
    for (const dz of [-0.72, 0.72]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.88, 0.08), M.woodDark);
      post.position.set(dx, 0.5, dz);
      g.add(post);
    }
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.08, 1.65), M.tradeCanopy);
  canopy.position.set(0, 0.98, 0);
  canopy.rotation.x = -0.08;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.06, 0.08), M.tradeCanopyLight);
  ridge.position.set(0, 1.08, -0.06);
  g.add(canopy, ridge);

  // Small account house at the back, with a cool-toned roof to keep the trade
  // station visually separate from the market stalls.
  const office = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.46, 0.62), M.plaster);
  office.position.set(0, 0.34, -1.03);
  const officeRoof = pyramidRoof(1.35, 0.82, 0.28, M.tradeCanopy);
  officeRoof.position.set(0, 0.72, -1.03);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), M.doorBlack);
  door.position.set(0, 0.24, -0.7);
  g.add(office, officeRoof, door);

  for (let i = 0; i < 5; i += 1) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.3), i % 2 === 0 ? M.woodMid : M.woodDark);
    crate.position.set(-0.92 + i * 0.28, 0.22, 0.62);
    g.add(crate);
  }
  for (const x of [-0.72, 0.72]) {
    const bale = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M.thatch);
    bale.scale.set(1.45, 0.65, 0.95);
    bale.position.set(x, 0.26, 0.18);
    g.add(bale);
  }

  const cartBed = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.42), M.woodMid);
  cartBed.position.set(0.76, 0.18, -0.1);
  for (const z of [-0.26, 0.06]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), M.woodDark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(1.18, 0.13, z);
    g.add(wheel);
  }
  g.add(cartBed);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.28, 6), M.woodDark);
  pole.position.set(-1.16, 0.78, -1.12);
  const flag = makeFlag(0.42, 0.22, M.tradeCanopyLight);
  flag.position.set(-1.12, 1.34, -1.12);
  flag.rotation.y = -Math.PI / 2;
  g.add(pole, flag);
  if (level >= 3) {
    const customs = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.46, 0.58), M.plaster);
    customs.position.set(-0.96, 0.36, -0.95);
    const customsRoof = pyramidRoof(1.05, 0.72, 0.28, M.tradeCanopyLight);
    customsRoof.position.set(-0.96, 0.74, -0.95);
    g.add(customs, customsRoof);
  }
  if (level >= 4) {
    for (const x of [-1.05, 1.05]) {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), M.awningGold);
      lantern.position.set(x, 1.04, 0.86);
      g.add(lantern);
    }
  }
  if (level >= 5) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.62), M.plaster);
    tower.position.set(1.02, 1.18, -1.02);
    const towerRoof = pyramidRoof(0.82, 0.82, 0.32, M.tradeCanopy);
    towerRoof.position.set(1.02, 1.6, -1.02);
    const gold = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.04), M.flagGold);
    gold.position.set(1.02, 1.78, -1.02);
    g.add(tower, towerRoof, gold);
  }
  return g;
}

function makeRiverDock(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 1.2), M.bridgeDeck);
  deck.position.set(0, 0.1, 0.24);
  g.add(deck);
  for (const x of [-0.78, -0.26, 0.26, 0.78]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 1.35), M.woodDark);
    plank.position.set(x, 0.2, 0.24);
    g.add(plank);
  }
  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.34, 0.82]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 6), M.woodDark);
      post.position.set(x, 0.43, z);
      g.add(post);
    }
  }
  const shed = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.42, 0.58), M.woodMid);
  shed.position.set(-0.45, 0.43, -0.52);
  const roof = pyramidRoof(0.98, 0.7, 0.26, M.thatchDark);
  roof.position.set(-0.45, 0.78, -0.52);
  g.add(shed, roof);
  const boat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.34), M.woodDark);
  boat.position.set(0.38, 0.18, 0.98);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.26), M.thatch);
  cargo.position.set(0.34, 0.36, 0.98);
  g.add(boat, cargo);
  if (level >= 3) {
    const cranePost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 6), M.woodDark);
    cranePost.position.set(0.82, 0.68, -0.48);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.05), M.woodDark);
    craneArm.position.set(0.55, 1.12, -0.48);
    craneArm.rotation.z = -0.25;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.42, 5), M.woodDark);
    rope.position.set(0.25, 0.88, -0.48);
    g.add(cranePost, craneArm, rope);
  }
  if (level >= 4) {
    const office = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.42, 0.5), M.plaster);
    office.position.set(0.48, 0.42, -0.58);
    const officeRoof = pyramidRoof(0.9, 0.66, 0.24, M.redLac);
    officeRoof.position.set(0.48, 0.76, -0.58);
    g.add(office, officeRoof);
  }
  if (level >= 5) {
    const secondBoat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.32), M.woodDark);
    secondBoat.position.set(-0.48, 0.16, 1.18);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6), M.woodDark);
    pole.position.set(-0.88, 0.72, -0.78);
    const flag = makeFlag(0.3, 0.15, M.flagGold);
    flag.position.set(-0.84, 1.15, -0.78);
    flag.rotation.y = -Math.PI / 2;
    g.add(secondBoat, pole, flag);
  }
  return g;
}

function makeStage(building) {
  const level = building?.level || 1;
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14 + level * 0.015, 1.76), M.woodMid);
  platform.position.y = 0.07;
  const backdrop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.08), M.redLac);
  backdrop.position.set(0, 0.38, -0.74);
  const roof = pyramidRoof(1.0, 1.55, 0.28 + level * 0.02, level >= 4 ? M.redLac : M.tile);
  roof.position.set(0, 0.76, -0.18);
  g.add(platform, backdrop, roof);
  for (const x of [-0.32, 0.32]) {
    for (const z of [-0.58, 0.58]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6), M.woodDark);
      pole.position.set(x, 0.43, z);
      g.add(pole);
    }
  }
  for (const x of [-0.32, 0.32]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6), M.woodDark);
    pole.position.set(x, 0.43, 0.74);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), M.awningGold);
    lantern.position.set(x, 0.68, 0.74);
    g.add(pole, lantern);
  }
  if (level >= 3) {
    for (const x of [-0.36, 0.36]) {
      const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.035), M.awningRed);
      curtain.position.set(x, 0.39, -0.68);
      g.add(curtain);
    }
  }
  if (level >= 4) {
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.92), M.woodMid);
    sideL.position.set(-0.52, 0.3, -0.08);
    const sideR = sideL.clone();
    sideR.position.x = 0.52;
    g.add(sideL, sideR);
  }
  if (level >= 5) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.04), M.flagGold);
    ridge.position.set(0, 0.98, -0.18);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), M.woodDark);
    pole.position.set(0.42, 0.82, 0.72);
    const flag = makeFlag(0.24, 0.12, M.flagGold);
    flag.position.set(0.44, 1.14, 0.72);
    flag.rotation.y = -Math.PI / 2;
    g.add(ridge, pole, flag);
  }
  return g;
}

function makeSchool(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.8), M.stone);
  platform.position.y = 0.07;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55 + level * 0.04, 1.5), M.plaster);
  wall.position.y = 0.42;
  const lower = pyramidRoof(1.95, 1.95, 0.36 + level * 0.02, level >= 4 ? M.redLac : M.tile);
  lower.position.y = 0.92;
  const upperWall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.9), M.plaster);
  upperWall.position.y = 1.24;
  const upper = pyramidRoof(1.2, 1.2, 0.42, M.tile);
  upper.position.y = 1.6;
  // Pillars on porch
  for (const dx of [-0.65, 0.65]) {
    for (const dz of [-0.65, 0.65]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), M.redLac);
      p.position.set(dx, 0.42, dz);
      g.add(p);
    }
  }
  // Flag pole + segmented cloth
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), M.woodDark);
  pole.position.set(0.78, 1.3, 0);
  const flag = makeFlag(0.4, 0.22, M.flagRed);
  flag.position.set(1.0, 1.85, 0);
  flag.rotation.y = -Math.PI / 2;
  g.add(platform, wall, lower, upperWall, upper, pole, flag);
  if (level >= 3) {
    for (const x of [-0.68, 0.68]) {
      const sideHall = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.82), M.plaster);
      sideHall.position.set(x, 0.36, 0.18);
      const sideRoof = pyramidRoof(0.5, 0.98, 0.24, M.tile);
      sideRoof.position.set(x, 0.68, 0.18);
      g.add(sideHall, sideRoof);
    }
  }
  if (level >= 4) {
    const bookTower = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.46), M.plaster);
    bookTower.position.set(-0.62, 1.26, -0.62);
    const bookRoof = pyramidRoof(0.62, 0.62, 0.3, M.redLac);
    bookRoof.position.set(-0.62, 1.68, -0.62);
    g.add(bookTower, bookRoof);
  }
  if (level >= 5) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), M.flagGold);
    ridge.position.set(0, 1.84, 0);
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.06), M.woodDark);
    tablet.position.set(0, 0.44, 0.86);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.08), M.flagGold);
    cap.position.set(0, 0.76, 0.86);
    g.add(ridge, tablet, cap);
  }
  return g;
}

function makeLingqu() {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.035, 0.5), M.water);
  water.position.y = 0.08;
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(4.95, 0.22, 0.12), M.stone);
  leftWall.position.set(0, 0.18, -0.34);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(4.95, 0.22, 0.12), M.stone);
  rightWall.position.set(0, 0.18, 0.34);
  g.add(water, leftWall, rightWall);
  for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.82), M.woodDark);
    gate.position.set(x, 0.32, 0);
    g.add(gate);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.48, 0.46), M.plaster);
  tower.position.set(0, 0.54, 0);
  const roof = pyramidRoof(0.72, 0.64, 0.28, M.tile);
  roof.position.set(0, 0.92, 0);
  g.add(tower, roof);
  return g;
}

function makeMountainShrine() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1.8), M.stone);
  base.position.y = 0.09;
  const stair = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.56), M.stone);
  stair.position.set(0, 0.2, 0.62);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.62, 0.72), M.plaster);
  hall.position.set(0, 0.58, -0.18);
  const roof = pyramidRoof(1.2, 0.95, 0.42, M.redLac);
  roof.position.set(0, 1.1, -0.18);
  g.add(base, stair, hall, roof);
  for (const x of [-0.68, 0.68]) {
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.08), M.woodDark);
    tablet.position.set(x, 0.52, 0.42);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), M.awningGold);
    flame.position.set(x, 0.9, 0.42);
    g.add(tablet, flame);
  }
  return g;
}

function makeGrandMarketTower() {
  const g = new THREE.Group();
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.08, 3.75), M.stone);
  plaza.position.y = 0.04;
  g.add(plaza);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 2.2), M.woodMid);
  base.position.y = 0.29;
  const middle = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.46, 1.55), M.plaster);
  middle.position.y = 0.78;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, 1.0), M.plaster);
  top.position.y = 1.24;
  const roofA = pyramidRoof(2.55, 2.55, 0.38, M.redLac);
  roofA.position.y = 0.62;
  const roofB = pyramidRoof(1.85, 1.85, 0.36, M.redLac);
  roofB.position.y = 1.06;
  const roofC = pyramidRoof(1.25, 1.25, 0.36, M.redLac);
  roofC.position.y = 1.52;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 8), M.flagGold);
  spire.position.y = 1.84;
  g.add(base, roofA, middle, roofB, top, roofC, spire);
  for (const x of [-1.3, 1.3]) {
    for (const z of [-1.3, 1.3]) {
      const stall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.45), M.awningGold);
      stall.position.set(x, 0.18, z);
      g.add(stall);
    }
  }
  return g;
}

function makeMagistrateOffice(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.16, 2.85), M.stone);
  platform.position.y = 0.08;
  const courtyard = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.025, 1.55), M.earth);
  courtyard.position.set(0, 0.175, 0.35);
  g.add(platform, courtyard);

  // Palace-like main hall: high red roof, raised steps, symmetrical red pillars.
  const hallBase = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.16, 1.18), M.stone);
  hallBase.position.set(0, 0.24, -0.72);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.62, 0.92), M.plaster);
  hall.position.set(0, 0.63, -0.72);
  const hallRoof = pyramidRoof(2.28, 1.28, 0.56, M.redLac);
  hallRoof.position.set(0, 1.22, -0.72);
  const roofRidge = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.05, 0.06), M.flagGold);
  roofRidge.position.set(0, 1.52, -0.72);
  g.add(hallBase, hall, hallRoof, roofRidge);

  for (const dx of [-0.78, -0.26, 0.26, 0.78]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.68, 8), M.redLac);
    pillar.position.set(dx, 0.58, -0.17);
    g.add(pillar);
  }
  for (let i = 0; i < 3; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.5 - i * 0.22, 0.05, 0.18), M.stone);
    step.position.set(0, 0.21 + i * 0.04, -0.05 + i * 0.16);
    g.add(step);
  }

  // Front gate and short side corridors create the "small palace" outline.
  const gate = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.5, 0.22), M.woodDark);
  gate.position.set(0, 0.42, 1.18);
  const gateRoof = pyramidRoof(1.42, 0.48, 0.28, M.redLac);
  gateRoof.position.set(0, 0.82, 1.18);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.035), M.flagGold);
  plaque.position.set(0, 0.58, 1.305);
  g.add(gate, gateRoof, plaque);

  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 1.35), M.plaster);
    wing.position.set(sx * 1.02, 0.39, 0.24);
    const wingRoof = pyramidRoof(0.58, 1.55, 0.28, M.tile);
    wingRoof.position.set(sx * 1.02, 0.73, 0.24);
    g.add(wing, wingRoof);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6), M.woodDark);
    pole.position.set(sx * 1.18, 0.88, 1.02);
    const flag = makeFlag(0.36, 0.2, sx < 0 ? M.flagRed : M.flagGold);
    flag.position.set(sx * 1.18, 1.42, 1.02);
    flag.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(pole, flag);
  }
  if (level >= 3) {
    const rearHall = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.48, 0.72), M.plaster);
    rearHall.position.set(0, 0.56, -1.25);
    const rearRoof = pyramidRoof(1.56, 0.92, 0.34, M.tile);
    rearRoof.position.set(0, 0.98, -1.25);
    g.add(rearHall, rearRoof);
  }
  if (level >= 4) {
    for (const sx of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.56, 0.48), M.plaster);
      corner.position.set(sx * 1.05, 0.78, -1.12);
      const cornerRoof = pyramidRoof(0.68, 0.68, 0.32, M.redLac);
      cornerRoof.position.set(sx * 1.05, 1.24, -1.12);
      g.add(corner, cornerRoof);
    }
  }
  if (level >= 5) {
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.34, 0.54), M.plaster);
    upper.position.set(0, 1.55, -0.72);
    const upperRoof = pyramidRoof(1.08, 0.72, 0.34, M.flagGold);
    upperRoof.position.set(0, 1.86, -0.72);
    const topRidge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.045), M.flagGold);
    topRidge.position.set(0, 2.05, -0.72);
    g.add(upper, upperRoof, topRidge);
  }
  return g;
}

function makeShrine(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 1.75), M.stone);
  base.position.y = 0.05;
  const second = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 1.35), M.stone);
  second.position.y = 0.16;
  const altar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.72), M.stone);
  altar.position.y = 0.35;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.56), M.flagGold);
  top.position.y = 0.5;
  g.add(base, second, altar, top);

  for (const z of [0.48, 0.68]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.14), M.stone);
    step.position.set(0, 0.12, z);
    g.add(step);
  }

  // Open-air incense burners and offering stands, no temple roof.
  for (const x of [-0.38, 0, 0.38]) {
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 10), M.granaryBody);
    burner.position.set(x, 0.58, 0.12);
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8d1bf, transparent: true, opacity: 0.2, depthWrite: false })
    );
    smoke.position.set(x, 0.74, 0.12);
    smoke.userData.disposeMaterial = true;
    smoke.userData.noShadow = true;
    g.add(burner, smoke);
  }

  for (const sx of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), M.redLac);
    stand.position.set(sx * 0.62, 0.24, -0.38);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), M.awningGold);
    flame.position.set(sx * 0.62, 0.42, -0.38);
    g.add(stand, flame);
  }

  if (level >= 2) {
    for (const x of [-0.72, 0.72]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), M.redLac);
      pillar.position.set(x, 0.45, 0.52);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), M.awningGold);
      lantern.position.set(x, 0.78, 0.52);
      g.add(pillar, lantern);
    }
  }

  if (level >= 3) {
    const rearTablet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.08), M.woodDark);
    rearTablet.position.set(0, 0.58, -0.62);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), M.flagGold);
    cap.position.set(0, 0.96, -0.62);
    g.add(rearTablet, cap);
  }
  if (level >= 4) {
    const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.08), M.redLac);
    gateBeam.position.set(0, 0.92, 0.72);
    for (const x of [-0.58, 0.58]) {
      const gatePost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 8), M.redLac);
      gatePost.position.set(x, 0.52, 0.72);
      g.add(gatePost);
    }
    g.add(gateBeam);
  }
  if (level >= 5) {
    const aureole = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.025, 8, 24),
      M.flagGold
    );
    aureole.position.set(0, 0.78, -0.62);
    aureole.rotation.y = Math.PI / 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), M.woodDark);
    pole.position.set(0.78, 0.72, -0.66);
    const flag = makeFlag(0.28, 0.14, M.flagGold);
    flag.position.set(0.82, 1.16, -0.66);
    flag.rotation.y = -Math.PI / 2;
    g.add(aureole, pole, flag);
  }
  return g;
}

function makeLumberCamp(building) {
  const g = new THREE.Group();
  const level = building?.level || 1;
  // Earth platform
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 1.85), M.earth);
  platform.position.y = 0.025;
  // Open shed: 4 wood posts + slanted plank roof
  for (const dx of [-0.7, 0.7]) {
    for (const dz of [-0.7, 0.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), M.woodDark);
      post.position.set(dx, 0.35, dz);
      g.add(post);
    }
  }
  // Tilted roof slats
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 1.4), M.thatchDark);
  roof.position.set(0, 0.78, 0);
  roof.rotation.x = -0.18;
  g.add(roof);
  // Stack of logs
  for (let i = 0; i < 3; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 8), M.woodMid);
    log.rotation.z = Math.PI / 2;
    log.position.set(-0.4, 0.18 + i * 0.22, 0.45);
    g.add(log);
  }
  for (let i = 0; i < 2; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8), M.woodMid);
    log.rotation.z = Math.PI / 2;
    log.position.set(-0.4, 0.18 + i * 0.22, 0.05);
    g.add(log);
  }
  // Chopping block + axe
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 10), M.woodMid);
  block.position.set(0.55, 0.14, -0.2);
  g.add(block);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), M.woodDark);
  handle.position.set(0.55, 0.4, -0.2);
  handle.rotation.z = -0.5;
  g.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.04), M.stone);
  head.position.set(0.71, 0.55, -0.2);
  head.rotation.z = -0.5;
  g.add(head);
  // Sawpit / planking pile
  const planks = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.34), M.woodMid);
  planks.position.set(0.25, 0.07, -0.65);
  g.add(planks);
  if (level >= 3) {
    const mill = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.52), M.woodMid);
    mill.position.set(0.62, 0.31, 0.56);
    const millRoof = pyramidRoof(0.74, 0.66, 0.24, M.tile);
    millRoof.position.set(0.62, 0.66, 0.56);
    g.add(mill, millRoof);
  }
  if (level >= 4) {
    for (const z of [-0.3, 0.05, 0.4]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 8), M.woodMid);
      log.rotation.z = Math.PI / 2;
      log.position.set(0.12, 0.62, z);
      g.add(log);
    }
  }
  if (level >= 5) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 6), M.woodDark);
    pole.position.set(-0.82, 0.72, -0.82);
    const flag = makeFlag(0.3, 0.15, M.flagGold);
    flag.position.set(-0.78, 1.2, -0.82);
    flag.rotation.y = -Math.PI / 2;
    g.add(pole, flag);
  }
  g.add(platform);
  return g;
}

// M6.1: roads are now drawn 1.02 × 1.02 (slight overhang) so adjacent road
// tiles visually merge into a continuous strip. Ruts orient by neighbor:
// east-west ruts on horizontal segments, north-south on vertical, both at
// crossings, and a default east-west pair on solitary stubs. Main-road tiles
// get a paved median strip on top so the trunk reads as a different surface.
function makeRoadRut(horizontal, side) {
  const offset = 0.18 * side;
  const geom = horizontal
    ? new THREE.BoxGeometry(1.02, 0.005, 0.06)
    : new THREE.BoxGeometry(0.06, 0.005, 1.02);
  const mat = new THREE.MeshLambertMaterial({ color: 0x604226 });
  const mesh = new THREE.Mesh(geom, mat);
  if (horizontal) mesh.position.set(0, 0.052, offset);
  else mesh.position.set(offset, 0.052, 0);
  return mesh;
}

function makeRoad(building, monthIndex, ctx) {
  const g = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 1.02), M.road);
  surface.position.y = 0.025;
  g.add(surface);
  const neighbors = (ctx && ctx.roadNeighbors) || { N: false, S: false, E: false, W: false };
  const horizontal = neighbors.E || neighbors.W;
  const vertical = neighbors.N || neighbors.S;
  if (horizontal || (!horizontal && !vertical)) {
    g.add(makeRoadRut(true, -1));
    g.add(makeRoadRut(true, 1));
  }
  if (vertical) {
    g.add(makeRoadRut(false, -1));
    g.add(makeRoadRut(false, 1));
  }
  if (building?.isMainRoad) {
    // Stone median strip — orient along the main-road axis (default east-west).
    const axis = ctx?.mainRoadAxis === "vertical" ? "vertical" : "horizontal";
    const medianGeom = axis === "horizontal"
      ? new THREE.BoxGeometry(1.02, 0.006, 0.16)
      : new THREE.BoxGeometry(0.16, 0.006, 1.02);
    const median = new THREE.Mesh(medianGeom, new THREE.MeshLambertMaterial({ color: 0xc8b48a }));
    median.position.y = 0.054;
    g.add(median);
  }
  return g;
}

function makeBridge(building, monthIndex, ctx) {
  const g = new THREE.Group();
  // Deck fills the cell so bridge ↔ road butt up cleanly with no seam.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), M.bridgeDeck);
  deck.position.y = 0.05;
  // Plank stripes follow the dominant traffic axis (default east-west).
  const neighbors = (ctx && ctx.roadNeighbors) || { N: false, S: false, E: false, W: false };
  const verticalDominant = (neighbors.N || neighbors.S) && !(neighbors.E || neighbors.W);
  for (let i = -3; i <= 3; i += 1) {
    const plank = verticalDominant
      ? new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.005, 1.02), M.woodDark)
      : new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.005, 0.08), M.woodDark);
    if (verticalDominant) plank.position.set(i * 0.13, 0.092, 0);
    else plank.position.set(0, 0.092, i * 0.13);
    g.add(plank);
  }
  // Rails on the long sides of the bridge.
  if (verticalDominant) {
    const railA = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.02), M.woodDark);
    railA.position.set(-0.45, 0.18, 0);
    const railB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.02), M.woodDark);
    railB.position.set(0.45, 0.18, 0);
    g.add(railA, railB);
  } else {
    const railA = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.16, 0.06), M.woodDark);
    railA.position.set(0, 0.18, -0.45);
    const railB = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.16, 0.06), M.woodDark);
    railB.position.set(0, 0.18, 0.45);
    g.add(railA, railB);
  }
  // Rail posts — kept visible regardless of axis.
  for (const a of [-0.42, 0, 0.42]) {
    for (const b of [-0.45, 0.45]) {
      const p = verticalDominant
        ? new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), M.woodDark)
        : new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), M.woodDark);
      if (verticalDominant) p.position.set(b, 0.16, a);
      else p.position.set(a, 0.16, b);
      g.add(p);
    }
  }
  g.add(deck);
  if (building?.isMainRoad) {
    // Bridge-on-trunk gets the same paved median as trunk roads so the line
    // visually continues across rivers.
    const axis = ctx?.mainRoadAxis === "vertical" ? "vertical" : "horizontal";
    const medianGeom = axis === "horizontal"
      ? new THREE.BoxGeometry(1.02, 0.006, 0.16)
      : new THREE.BoxGeometry(0.16, 0.006, 1.02);
    const median = new THREE.Mesh(medianGeom, new THREE.MeshLambertMaterial({ color: 0xc8b48a }));
    median.position.y = 0.096;
    g.add(median);
  }
  return g;
}

const HOUSING_FACTORIES = {
  hut: makeHut,
  tile: makeTileHouse,
  courtyard: makeCourtyardHouse,
  compound: makeCompound,
  manor: makeManor,
  estate: makeEstate,
  noble: makeNobleResidence
};

const STATIC_FACTORIES = {
  road: makeRoad,
  bridge: makeBridge,
  well: makeWell,
  workshop: makeWorkshop,
  lumberCamp: makeLumberCamp,
  granary: makeGranary,
  warehouse: makeWarehouse,
  market: makeMarket,
  tradeStation: makeTradeStation,
  riverDock: makeRiverDock,
  stage: makeStage,
  magistrateOffice: makeMagistrateOffice,
  school: makeSchool,
  shrine: makeShrine,
  lingqu: makeLingqu,
  mountainShrine: makeMountainShrine,
  grandMarketTower: makeGrandMarketTower
};

// Upgrade-in-progress overlay: blue scaffolding around the existing building.
// Distinct from the construction scaffold (yellow/brown) so the two states
// read clearly at a glance.
export function makeUpgradeScaffold(footprintW, footprintH, fraction) {
  const g = new THREE.Group();
  const w = footprintW * 1.05;
  const d = footprintH * 1.05;
  const h = Math.max(0.6, footprintW * 0.9);

  const matPole = new THREE.MeshLambertMaterial({ color: 0x4d7faa, transparent: true, opacity: 0.85 });
  const matRail = new THREE.MeshLambertMaterial({ color: 0x6b9bc4, transparent: true, opacity: 0.85 });
  for (const dx of [-w / 2, w / 2]) {
    for (const dz of [-d / 2, d / 2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), matPole);
      pole.position.set(dx, h / 2, dz);
      pole.userData.disposeMaterial = true;
      pole.userData.noShadow = true;
      g.add(pole);
    }
  }
  // Ring of scaffolding rails — number scales with progress so it visibly
  // grows over the upgrade duration.
  const rungs = Math.max(1, Math.round(fraction * 3) + 1);
  for (let i = 0; i < rungs; i += 1) {
    const ratio = (i + 1) / 4;
    const yLevel = h * ratio;
    for (const sign of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.04, 0.04), matRail);
      a.position.set(0, yLevel, sign * d / 2);
      a.userData.disposeMaterial = true;
      a.userData.noShadow = true;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, d + 0.04), matRail);
      b.position.set(sign * w / 2, yLevel, 0);
      b.userData.disposeMaterial = true;
      b.userData.noShadow = true;
      g.add(a, b);
    }
  }
  return g;
}

// Construction stage placeholder: scaffolding poles + a wireframe outline.
export function makeScaffold(footprintW, footprintH, fraction) {
  const g = new THREE.Group();
  const w = footprintW * 0.95;
  const d = footprintH * 0.95;
  const h = Math.max(0.4, footprintW * 0.6);

  const matPole = new THREE.MeshLambertMaterial({ color: 0xa48058 });
  for (const dx of [-w / 2, w / 2]) {
    for (const dz of [-d / 2, d / 2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), matPole);
      pole.position.set(dx, h / 2, dz);
      g.add(pole);
    }
  }
  // Half-built mass scaling with fraction
  const mass = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.85, h * fraction, d * 0.85),
    new THREE.MeshLambertMaterial({ color: 0x60492f, transparent: true, opacity: 0.85 })
  );
  mass.position.y = (h * fraction) / 2;
  g.add(mass);
  return g;
}

// ---------- public API ----------

// Build the visual mesh group for a single building. Caller positions it.
// ctx (optional) carries renderer-side hints — currently `roadNeighbors`
// (NSEW road adjacency for road / bridge tiles) and `mainRoadAxis`.
export function buildBuildingMesh(state, building, def, monthIndex, ctx = null) {
  if (building.status === "constructing") {
    const fraction = building.initialBuildSeasons
      ? Math.max(0.05, 1 - building.seasonsRemaining / building.initialBuildSeasons)
      : 0.5;
    return applyShadowFlags(makeScaffold(def.footprint.w, def.footprint.h, fraction));
  }

  let mesh;
  if (building.category === "housing") {
    if (building.type === "mansion") {
      mesh = makeMansion(building);
    } else {
      const factory = HOUSING_FACTORIES[building.housingTier] || makeHut;
      mesh = factory();
    }
  } else if (building.type === "farm") {
    mesh = makeFarm(building, monthIndex);
  } else if (STATIC_FACTORIES[building.type]) {
    mesh = STATIC_FACTORIES[building.type](building, monthIndex, ctx);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    mesh.position.y = 0.2;
  }

  // Mark connection issues with an emissive red tint at the base
  if (building.status === "complete" && !building.connected && building.type !== "road" && building.type !== "bridge") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(def.footprint.w, def.footprint.h) * 0.55, Math.max(def.footprint.w, def.footprint.h) * 0.65, 24),
      new THREE.MeshBasicMaterial({ color: 0xd24040, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.userData.noShadow = true;
    mesh.add(ring);
  }

  // Upgrade-in-progress overlay: blue scaffolding around the existing model.
  if (building.upgradePending) {
    const pending = building.upgradePending;
    const fraction = pending.initialSeasons
      ? Math.max(0.05, 1 - pending.seasonsRemaining / pending.initialSeasons)
      : 0.5;
    const upgrade = makeUpgradeScaffold(def.footprint.w, def.footprint.h, fraction);
    mesh.add(upgrade);
  }

  return applyShadowFlags(mesh);
}

// Place a building's group at the world center of its footprint, accounting
// for terrain elevation under its center.
export function positionBuildingGroup(state, group, building, def) {
  const cx = building.x + def.footprint.w / 2 - MAP_WIDTH / 2;
  const cz = building.y + def.footprint.h / 2 - MAP_HEIGHT / 2;
  const ctx = Math.max(0, Math.min(MAP_WIDTH - 1, building.x + Math.floor(def.footprint.w / 2)));
  const cty = Math.max(0, Math.min(MAP_HEIGHT - 1, building.y + Math.floor(def.footprint.h / 2)));
  const tile = state.tiles[cty * MAP_WIDTH + ctx];
  const cy = tileElevation(tile?.terrain || "plain");
  group.position.set(cx, cy, cz);
}

// Free recursive disposal of a group's geometries (materials are shared).
export function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((node) => {
    if (node.isMesh || node.isLine || node.isLineSegments) {
      if (node.geometry && !geometries.has(node.geometry)) {
        geometries.add(node.geometry);
        node.geometry.dispose();
      }
      if (node.userData?.disposeMaterial && node.material && !materials.has(node.material)) {
        materials.add(node.material);
        node.material.map?.dispose?.();
        node.material.dispose();
      }
    }
  });
  for (const geometry of group.userData?.sharedGeometries || []) {
    if (!geometries.has(geometry)) geometry.dispose();
  }
  for (const material of group.userData?.sharedMaterials || []) {
    if (!materials.has(material)) {
      material.map?.dispose?.();
      material.dispose();
    }
  }
}
