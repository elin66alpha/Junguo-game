import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../../model/constants.js";
import { tileElevation } from "./terrain.js";

const DURATION_TICKS = 90;

// Floating "+8 粮" labels that drift up over a building. Implemented as
// absolutely-positioned DOM elements projected from world to screen on each
// animation frame. Cheaper than rebuilding sprites every frame.
export class FloatingLayer {
  constructor(container) {
    this.container = container;
    this.entries = [];  // [{ world, text, color, ttl, age, dom }]
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
    this.entries.push({
      world: new THREE.Vector3(tileX + 0.5 - MAP_WIDTH / 2, elev, tileY + 0.5 - MAP_HEIGHT / 2),
      ttl: note.ttl ?? DURATION_TICKS,
      age: 0,
      dom
    });
  }

  update(camera, canvas) {
    if (this.entries.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const cv = new THREE.Vector3();
    const remaining = [];
    for (const entry of this.entries) {
      entry.age += 1;
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
