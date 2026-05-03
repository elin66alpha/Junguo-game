import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../../model/constants.js";
import { worldToTileCoords } from "./terrain.js";

const tmpVec = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// Convert a DOM client point to a tile coordinate via raycast against the
// invisible picking plane. Returns null when the ray misses.
export function pickTile(canvas, camera, pickingPlane, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  tmpVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  tmpVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(tmpVec, camera);
  const hits = raycaster.intersectObject(pickingPlane, false);
  if (hits.length === 0) return null;
  const point = hits[0].point;
  const tile = worldToTileCoords(point.x, point.z);
  if (tile.x < 0 || tile.y < 0 || tile.x >= MAP_WIDTH || tile.y >= MAP_HEIGHT) return null;
  return tile;
}
