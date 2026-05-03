import * as THREE from "three";

export function setupLighting(scene, options = {}) {
  const shadows = options.shadows !== false;
  const hemi = new THREE.HemisphereLight(0xe9f6ff, 0xb79a72, 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1cf, 1.45);
  sun.position.set(42, 92, 34);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(shadows ? 768 : 256, shadows ? 768 : 256);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.AmbientLight(0xffffff, 0.52);
  scene.add(fill);

  const softFill = new THREE.DirectionalLight(0xd8ecff, 0.35);
  softFill.position.set(-35, 45, -25);
  scene.add(softFill);

  return { hemi, sun, fill, softFill };
}
