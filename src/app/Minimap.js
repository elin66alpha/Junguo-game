import { MAP_HEIGHT, MAP_WIDTH, TERRAIN_COLORS } from "../model/constants.js";

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cachedSeed = null;
  }

  draw(state, renderer) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cellW = W / MAP_WIDTH;
    const cellH = H / MAP_HEIGHT;

    if (this.cachedSeed !== state.seed) {
      this.terrainBuffer = document.createElement("canvas");
      this.terrainBuffer.width = W;
      this.terrainBuffer.height = H;
      const tctx = this.terrainBuffer.getContext("2d");
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 0; x < MAP_WIDTH; x += 1) {
          const tile = state.tiles[y * MAP_WIDTH + x];
          tctx.fillStyle = TERRAIN_COLORS[tile.terrain];
          tctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
        }
      }
      this.cachedSeed = state.seed;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.terrainBuffer, 0, 0);

    for (const building of state.buildings) {
      if (building.status !== "complete") continue;
      // M6.1: main road stands out as a golden-tan line; regular roads are
      // a subtler brown so the trunk is easy to locate on the minimap.
      if (building.isMainRoad) {
        ctx.fillStyle = "#d4b064";
      } else if (building.type === "road" || building.type === "bridge") {
        ctx.fillStyle = "#9e8055";
      } else {
        ctx.fillStyle = building.category === "housing" ? "#cc4d3c"
          : building.category === "production" ? "#e8c552"
          : building.category === "service" ? "#6fb8d8"
          : building.category === "civic" ? "#c8a05e"
          : building.category === "wonder" ? "#d58cff"
          : "#a48058";
      }
      ctx.fillRect(building.x * cellW, building.y * cellH, Math.max(1, cellW), Math.max(1, cellH));
    }

    for (const spot of state.hotspots || []) {
      ctx.fillStyle = spot.type === "mulberry" ? "#7e2243" : "#3aa1d6";
      ctx.fillRect(spot.x * cellW - 1, spot.y * cellH - 1, 3, 3);
    }

    // View frustum: 4 ground-plane points reported by the 3D renderer.
    if (renderer && typeof renderer.getViewportPolygon === "function") {
      const poly = renderer.getViewportPolygon();
      if (poly && poly.length === 4) {
        ctx.strokeStyle = "rgba(255, 240, 200, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < poly.length; i += 1) {
          const px = Math.max(0, Math.min(W, poly[i].x * cellW));
          const py = Math.max(0, Math.min(H, poly[i].y * cellH));
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 240, 200, 0.08)";
        ctx.fill();
      }
    }

    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeRect(0, 0, W, H);
  }

  bindClick(canvas, onClickTile) {
    canvas.addEventListener("mousedown", (event) => this.handleClick(event, canvas, onClickTile));
    canvas.addEventListener("mousemove", (event) => {
      if (event.buttons & 1) this.handleClick(event, canvas, onClickTile);
    });
  }

  handleClick(event, canvas, onClickTile) {
    const rect = canvas.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    const tx = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(fx * MAP_WIDTH)));
    const ty = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(fy * MAP_HEIGHT)));
    onClickTile(tx, ty);
  }
}
