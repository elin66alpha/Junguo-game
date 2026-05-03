import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../../model/constants.js";
import { tileElevation } from "./terrain.js";

// Default lifespan in seconds. Old code used "ticks" at the legacy 10 fps
// loop (90 ticks ≈ 9 s); we now age in real seconds so behavior is
// independent of the now-uncapped frame rate.
const DURATION_SECONDS = 9;

// Floating "+8 粮" labels that drift up over a building. Implemented as
// absolutely-positioned DOM elements projected from world to screen on each
// animation frame. Cheaper than rebuilding sprites every frame.
export class FloatingLayer {
  constructor(container) {
    this.container = container;
    this.entries = [];  // [{ world, ttl, age, dom }] — ttl/age in seconds
  }

  reset() {
    this.entries.forEach((e) => e.dom.remove());
    this.entries.length = 0;
  }

  syncFromState(state) {
    if (!Array.isArray(state.floatingNumbers)) return;
    while (state.floatingNumbers.length > 0) {
      const note = state.floatingNumbers.shift();
      this.spawn(note);
    }
  }

  spawn(note) {
    const tile = note;
    const tx = tile.x;
    const ty = tile.y;
    const tileX = Math.max(0, Math.min(MAP_WIDTH - 1, tx));
    const tileY = Math.max(0, Math.min(MAP_HEIGHT - 1, ty));
    const elev = tileElevation("plain") + 0.6;
    const dom = document.createElement("div");
    dom.className = "floating-num";
    dom.textContent = note.text;
    dom.style.color = note.color || "#fbe3a4";
    this.container.appendChild(dom);
    // Backwards-compat: a numeric `note.ttl` from old saves was in 10 fps
    // ticks, so divide by 10 to convert to seconds.
    const ttlSeconds = note.ttl != null ? note.ttl / 10 : DURATION_SECONDS;
    this.entries.push({
      world: new THREE.Vector3(tileX + 0.5 - MAP_WIDTH / 2, elev, tileY + 0.5 - MAP_HEIGHT / 2),
      ttl: ttlSeconds,
      age: 0,
      dom
    });
  }

  update(camera, canvas, dtSec = 1 / 60) {
    if (this.entries.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const cv = new THREE.Vector3();
    const remaining = [];
    for (const entry of this.entries) {
      entry.age += dtSec;
      const ratio = entry.age / entry.ttl;
      if (ratio >= 1) {
        entry.dom.remove();
        continue;
      }
      cv.copy(entry.world);
      cv.y += ratio * 1.0;  // float upward in world space
      cv.project(camera);
      const x = (cv.x * 0.5 + 0.5) * rect.width;
      const y = (-cv.y * 0.5 + 0.5) * rect.height;
      entry.dom.style.transform = `translate(${x}px, ${y}px)`;
      entry.dom.style.opacity = String(1 - ratio);
      remaining.push(entry);
    }
    this.entries = remaining;
  }
}
