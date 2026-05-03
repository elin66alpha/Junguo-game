import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN } from "../../model/constants.js";
import { tileElevation } from "./terrain.js";
import { buildWaterTexture } from "./textures.js";

function makeWaterMaterial({ color, emissive, opacity }) {
  return new THREE.MeshStandardMaterial({
    color,
    map: buildWaterTexture(),
    emissive,
    emissiveIntensity: 0.18,
    roughness: 0.38,
    metalness: 0,
    transparent: true,
    opacity
  });
}

export function buildWaterLayer(state) {
  const group = new THREE.Group();
  group.name = "water-layer";

  const riverMat = makeWaterMaterial({ color: 0x2e9fd2, emissive: 0x0b4f73, opacity: 0.72 });
  const seaMat = makeWaterMaterial({ color: 0x1f6f9b, emissive: 0x08354f, opacity: 0.82 });
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0xb8e6ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const waterGeo = new THREE.PlaneGeometry(0.98, 0.98);
  waterGeo.rotateX(-Math.PI / 2);
  const waveGeo = new THREE.PlaneGeometry(0.42, 0.035);
  waveGeo.rotateX(-Math.PI / 2);

  const riverTiles = [];
  const seaTiles = [];
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const tile = state.tiles[y * MAP_WIDTH + x];
      if (tile.terrain === TERRAIN.RIVER) riverTiles.push({ x, y, terrain: tile.terrain });
      else if (tile.terrain === TERRAIN.SEA) seaTiles.push({ x, y, terrain: tile.terrain });
    }
  }

  const riverMesh = new THREE.InstancedMesh(waterGeo, riverMat, riverTiles.length);
  riverMesh.name = "river-water";
  riverMesh.receiveShadow = true;
  const seaMesh = new THREE.InstancedMesh(waterGeo, seaMat, seaTiles.length);
  seaMesh.name = "sea-water";
  seaMesh.receiveShadow = true;
  const waterTiles = [...riverTiles, ...seaTiles];
  const waveMesh = new THREE.InstancedMesh(waveGeo, waveMat, waterTiles.length * 2);
  waveMesh.name = "river-wave-lines";
  waveMesh.userData.noShadow = true;

  const matrix = new THREE.Matrix4();
  const writeWater = (mesh, tiles) => {
    tiles.forEach((tile, index) => {
      const wx = tile.x + 0.5 - MAP_WIDTH / 2;
      const wz = tile.y + 0.5 - MAP_HEIGHT / 2;
      matrix.makeTranslation(wx, tileElevation(tile.terrain) + 0.055, wz);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  writeWater(riverMesh, riverTiles);
  writeWater(seaMesh, seaTiles);

  let waveIndex = 0;
  waterTiles.forEach((tile) => {
    const wx = tile.x + 0.5 - MAP_WIDTH / 2;
    const wz = tile.y + 0.5 - MAP_HEIGHT / 2;
    const waterY = tileElevation(tile.terrain) + 0.055;
    for (let i = 0; i < 2; i += 1) {
      const waveX = wx + (i === 0 ? -0.18 : 0.2);
      const waveZ = wz + (i === 0 ? -0.18 : 0.18);
      const angle = ((tile.x * 13 + tile.y * 7 + i * 31) % 5 - 2) * 0.25;
      matrix.makeRotationY(angle);
      matrix.setPosition(waveX, waterY + 0.012, waveZ);
      waveMesh.setMatrixAt(waveIndex, matrix);
      waveIndex += 1;
    }
  });
  waveMesh.instanceMatrix.needsUpdate = true;
  group.add(riverMesh, seaMesh, waveMesh);
  group.userData.waterTextures = [riverMat.map, seaMat.map];
  group.userData.waveMaterial = waveMat;
  group.userData.sharedGeometries = [waterGeo, waveGeo];
  group.userData.sharedMaterials = [riverMat, seaMat, waveMat];
  return group;
}

export function animateWaterLayer(group, time) {
  if (!group) return;
  if (group.userData.waterTextures) {
    for (const texture of group.userData.waterTextures) {
      texture.offset.x = (time * 0.018) % 1;
      texture.offset.y = (time * 0.011) % 1;
    }
  }
  if (group.userData.waveMaterial) {
    group.userData.waveMaterial.opacity = 0.22 + Math.sin(time * 1.6) * 0.05;
  }
}
