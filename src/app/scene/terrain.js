import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, TERRAIN_COLORS } from "../../model/constants.js";
import { buildTerrainTexture } from "./textures.js";

const ELEVATION = {
  plain: 0,
  riverbank: 0.02,
  river: -0.26,
  sea: -0.34,
  wetland: -0.04,
  hill: 0.9,
  mountain: 1.8,
  fertile: 0.01,
  pass: 0.68,
  forest: 0.08,
  wasteland: -0.02
};

const TERRAIN_RGB = Object.fromEntries(
  Object.entries(TERRAIN_COLORS).map(([key, value]) => {
    const color = new THREE.Color(value);
    return [key, [color.r, color.g, color.b]];
  })
);

export function tileElevation(terrain) {
  return ELEVATION[terrain] ?? 0;
}

function shade(rgb, factor) {
  return rgb.map((value) => Math.max(0, Math.min(1, value * factor)));
}

// World <-> tile coordinate helpers. Tile (tx, ty) center is at world
// ((tx + 0.5) - MAP_WIDTH/2, _, (ty + 0.5) - MAP_HEIGHT/2). 1 tile = 1 unit.
export function tileToWorldCenter(tx, ty) {
  return new THREE.Vector3(tx + 0.5 - MAP_WIDTH / 2, 0, ty + 0.5 - MAP_HEIGHT / 2);
}

export function worldToTileCoords(x, z) {
  const tx = Math.floor(x + MAP_WIDTH / 2);
  const ty = Math.floor(z + MAP_HEIGHT / 2);
  return { x: tx, y: ty };
}

// Build a single Mesh whose top faces are colored per-tile flat polygons at
// the elevation appropriate for each terrain type. River tiles depress, hill
// tiles raise. Vertical sides are added between adjacent tiles whose elevation
// differs so cliffs and river banks read clearly from a 3/4 view.
export function buildTerrainMesh(state) {
  const W = MAP_WIDTH;
  const H = MAP_HEIGHT;
  const positions = [];
  const colors = [];
  const normals = [];
  const uvs = [];
  const edgePositions = [];

  function emitTri(p1, p2, p3, c, n) {
    positions.push(...p1, ...p2, ...p3);
    for (let i = 0; i < 3; i += 1) {
      colors.push(...c);
      normals.push(...n);
    }
    for (const p of [p1, p2, p3]) {
      uvs.push(
        Math.max(0, Math.min(1, (p[0] + W / 2) / W)),
        Math.max(0, Math.min(1, (p[2] + H / 2) / H))
      );
    }
  }

  function elevAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
    return ELEVATION[state.tiles[ty * W + tx].terrain] ?? 0;
  }

  for (let ty = 0; ty < H; ty += 1) {
    for (let tx = 0; tx < W; tx += 1) {
      const tile = state.tiles[ty * W + tx];
      const e = ELEVATION[tile.terrain] ?? 0;
      const c = TERRAIN_RGB[tile.terrain] ?? [0.5, 0.5, 0.5];
      const sideC = shade(c, tile.terrain === TERRAIN.HILL || tile.terrain === TERRAIN.MOUNTAIN || tile.terrain === TERRAIN.PASS ? 0.58 : 0.68);

      const x0 = tx - W / 2;
      const z0 = ty - H / 2;
      const x1 = x0 + 1;
      const z1 = z0 + 1;

      // Top face (two tris, wound upward so the terrain surface is visible
      // from the camera instead of showing the apron/background through it).
      emitTri([x0, e, z0], [x1, e, z1], [x1, e, z0], c, [0, 1, 0]);
      emitTri([x0, e, z0], [x0, e, z1], [x1, e, z1], c, [0, 1, 0]);

      // Vertical side faces against neighbors with lower elevation (so we see
      // the cliff into earth from this side).
      const skirtBottom = -1.2;

      // -x neighbor (left)
      const eL = elevAt(tx - 1, ty);
      if (eL < e) {
        const yLo = Math.max(eL, skirtBottom);
        emitTri([x0, e, z0], [x0, e, z1], [x0, yLo, z1], sideC, [-1, 0, 0]);
        emitTri([x0, e, z0], [x0, yLo, z1], [x0, yLo, z0], sideC, [-1, 0, 0]);
        if (e - eL > 0.12) edgePositions.push(x0, e + 0.015, z0, x0, e + 0.015, z1);
      }
      // +x (right)
      const eR = elevAt(tx + 1, ty);
      if (eR < e) {
        const yLo = Math.max(eR, skirtBottom);
        emitTri([x1, e, z1], [x1, e, z0], [x1, yLo, z0], sideC, [1, 0, 0]);
        emitTri([x1, e, z1], [x1, yLo, z0], [x1, yLo, z1], sideC, [1, 0, 0]);
        if (e - eR > 0.12) edgePositions.push(x1, e + 0.015, z1, x1, e + 0.015, z0);
      }
      // -z (back)
      const eB = elevAt(tx, ty - 1);
      if (eB < e) {
        const yLo = Math.max(eB, skirtBottom);
        emitTri([x1, e, z0], [x0, e, z0], [x0, yLo, z0], sideC, [0, 0, -1]);
        emitTri([x1, e, z0], [x0, yLo, z0], [x1, yLo, z0], sideC, [0, 0, -1]);
        if (e - eB > 0.12) edgePositions.push(x1, e + 0.015, z0, x0, e + 0.015, z0);
      }
      // +z (front)
      const eF = elevAt(tx, ty + 1);
      if (eF < e) {
        const yLo = Math.max(eF, skirtBottom);
        emitTri([x0, e, z1], [x1, e, z1], [x1, yLo, z1], sideC, [0, 0, 1]);
        emitTri([x0, e, z1], [x1, yLo, z1], [x0, yLo, z1], sideC, [0, 0, 1]);
        if (e - eF > 0.12) edgePositions.push(x0, e + 0.015, z1, x1, e + 0.015, z1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  const terrainTexture = buildTerrainTexture(state);
  // Triangle winding is correct for a top-down/3-quarter view (top faces have
  // normal +Y, side faces have outward-pointing normals), so DoubleSide isn't
  // needed. Dropping it cuts fragment shader work on the 80×80 terrain mesh
  // roughly in half — the single biggest GPU-side win for blank-map fps.
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: terrainTexture,
    color: 0xffffff
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "terrain";
  mesh.userData.disposeMaterial = true;
  mesh.userData.sharedMaterials = [mat];
  mesh.receiveShadow = true;
  if (edgePositions.length > 0) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x5a4a31,
      transparent: true,
      opacity: 0.58
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.name = "terrain-contours";
    edges.userData.disposeMaterial = true;
    mesh.add(edges);
  }
  return mesh;
}

// Optional decoration meshes for forest/hotspot tiles. Returned as a single
// Group that the renderer attaches to the scene; cleared on map regen.
// Uses InstancedMesh for forest trees to collapse hundreds of individual
// draw calls into just 2 (trunks + leaves).
export function buildDecorations(state) {
  const group = new THREE.Group();
  group.name = "decorations";

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4d301a });
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x2f5e2a }),
    new THREE.MeshLambertMaterial({ color: 0x3d7a35 }),
    new THREE.MeshLambertMaterial({ color: 0x255225 }),
    new THREE.MeshLambertMaterial({ color: 0x4c8a42 })
  ];

  // ---------- pass 1: count forest tiles to pre-size instanced arrays ----------
  let forestTileCount = 0;
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (state.tiles[y * MAP_WIDTH + x].terrain === TERRAIN.FOREST) forestTileCount += 1;
    }
  }

  const treesPerTile = 3;
  const totalTrees = forestTileCount * treesPerTile;

  if (totalTrees > 0) {
    // Use a single averaged geometry for all trunks and leaves
    const trunkGeo = new THREE.CylinderGeometry(0.045, 0.07, 0.38, 5);
    const leafGeo = new THREE.ConeGeometry(0.22, 0.55, 5);

    const trunkInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, totalTrees);
    trunkInstanced.name = "forest-trunks";
    trunkInstanced.castShadow = true;
    trunkInstanced.receiveShadow = true;

    // One instanced mesh per leaf color variant
    const leafInstancedByColor = leafMats.map((mat) => {
      const mesh = new THREE.InstancedMesh(leafGeo, mat, totalTrees);
      mesh.name = "forest-leaves";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0; // we'll fill these up
      return mesh;
    });

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    let trunkIndex = 0;

    for (let ty = 0; ty < MAP_HEIGHT; ty += 1) {
      for (let tx = 0; tx < MAP_WIDTH; tx += 1) {
        const tile = state.tiles[ty * MAP_WIDTH + tx];
        if (tile.terrain !== TERRAIN.FOREST) continue;

        for (let i = 0; i < treesPerTile; i += 1) {
          const ox = ((tx * 13 + ty * 7 + i * 5) % 7) / 7 - 0.5;
          const oz = ((tx * 11 + ty * 17 + i * 3) % 7) / 7 - 0.5;
          const h = 0.28 + (((tx * 5 + ty * 3 + i * 11) % 7) / 7) * 0.22;
          const r = 0.17 + (((tx * 17 + ty * 19 + i * 7) % 9) / 9) * 0.12;
          const elev = tileElevation(tile.terrain);
          const wx = tx + 0.5 - MAP_WIDTH / 2 + ox * 0.7;
          const wz = ty + 0.5 - MAP_HEIGHT / 2 + oz * 0.7;

          // Trunk
          pos.set(wx, h / 2 + elev, wz);
          scale.set(1, h / 0.38, 1);
          matrix.compose(pos, quat, scale);
          trunkInstanced.setMatrixAt(trunkIndex, matrix);

          // Leaves (pick color bucket based on deterministic hash)
          const colorIdx = (tx + ty + i) % leafMats.length;
          const leafMesh = leafInstancedByColor[colorIdx];
          pos.set(wx, h / 2 + elev + h * 0.72, wz);
          const leafScale = r / 0.22;
          scale.set(leafScale, (0.35 + r * 0.8) / 0.55, leafScale);
          quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((tx * 31 + ty * 17 + i * 13) % 8) * Math.PI / 12);
          matrix.compose(pos, quat, scale);
          leafMesh.setMatrixAt(leafMesh.count, matrix);
          leafMesh.count += 1;
          quat.identity();

          trunkIndex += 1;
        }
      }
    }

    trunkInstanced.instanceMatrix.needsUpdate = true;
    group.add(trunkInstanced);
    for (const leafMesh of leafInstancedByColor) {
      if (leafMesh.count > 0) {
        leafMesh.instanceMatrix.needsUpdate = true;
        group.add(leafMesh);
      }
    }
    group.userData.sharedGeometries = [trunkGeo, leafGeo];
  }

  // Hotspot markers (mulberry / spring)
  const mulberryLeafMat = new THREE.MeshLambertMaterial({ color: 0x2d5e2a });
  const berryMat = new THREE.MeshLambertMaterial({ color: 0x76223a });
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x6a8aaa });
  const springWaterMat = new THREE.MeshLambertMaterial({ color: 0x3aa1d6 });

  for (const spot of state.hotspots || []) {
    if (spot.type === "mulberry") {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 6), trunkMat);
      trunk.position.set(spot.x + 0.5 - MAP_WIDTH / 2, 0.1, spot.y + 0.5 - MAP_HEIGHT / 2);
      group.add(trunk);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 4), mulberryLeafMat);
      leaves.position.copy(trunk.position);
      leaves.position.y += 0.3;
      group.add(leaves);
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), berryMat);
      berry.position.copy(trunk.position);
      berry.position.y += 0.32;
      berry.position.x += 0.18;
      group.add(berry);
    } else if (spot.type === "spring") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 4, 10), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(spot.x + 0.5 - MAP_WIDTH / 2, 0.06, spot.y + 0.5 - MAP_HEIGHT / 2);
      group.add(ring);
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.28, 10), springWaterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.copy(ring.position);
      water.position.y += 0.01;
      group.add(water);
    }
  }

  group.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  group.userData.sharedMaterials = [trunkMat, ...leafMats, mulberryLeafMat, berryMat, ringMat, springWaterMat];
  return group;
}

// Invisible flat ground plane used exclusively for raycasting. Sized to the
// map; positioned at y = 0. Always picks regardless of terrain elevation.
export function buildPickingPlane() {
  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, 0);
  mesh.name = "picking";
  return mesh;
}

// Four muted apron strips around the playable map. They hide the hard square
// edge from normal camera angles without covering gameplay terrain.
export function buildSubfloor() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x8fbf78 });
  const group = new THREE.Group();
  group.name = "terrain-apron";
  group.userData.disposeMaterial = true;
  group.userData.sharedMaterials = [mat];

  const apron = 70;
  const y = -0.24;
  const strips = [
    { w: MAP_WIDTH + apron * 2, h: apron, x: 0, z: -MAP_HEIGHT / 2 - apron / 2 },
    { w: MAP_WIDTH + apron * 2, h: apron, x: 0, z: MAP_HEIGHT / 2 + apron / 2 },
    { w: apron, h: MAP_HEIGHT, x: -MAP_WIDTH / 2 - apron / 2, z: 0 },
    { w: apron, h: MAP_HEIGHT, x: MAP_WIDTH / 2 + apron / 2, z: 0 }
  ];

  for (const strip of strips) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(strip.w, strip.h), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(strip.x, y, strip.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
