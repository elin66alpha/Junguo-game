import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN } from "../../model/constants.js";

const TILE_PIXELS = 18;

function canvas(size = 64) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function hash01(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

function makeTexture(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function fill(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function flecks(ctx, color, count, min = 1, max = 2) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(hash01(i, w, h) * w);
    const y = Math.floor(hash01(i, h, w) * h);
    const s = min + Math.floor(hash01(x, y, i) * (max - min + 1));
    ctx.globalAlpha = 0.18 + hash01(x, y, i + 8) * 0.28;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

function lineNoise(ctx, color, count, vertical = false) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    if (vertical) {
      const x = Math.floor(hash01(i, 3, 11) * w);
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (hash01(i, 4, 9) - 0.5) * 5, h);
    } else {
      const y = Math.floor(hash01(i, 7, 13) * h);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (hash01(i, 9, 2) - 0.5) * 5);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function tonedColor(color, factor) {
  const c = new THREE.Color(color);
  if (factor >= 1) {
    c.lerp(new THREE.Color(0xffffff), Math.min(0.35, (factor - 1) * 0.7));
  } else {
    c.lerp(new THREE.Color(0x000000), Math.min(0.35, (1 - factor) * 0.7));
  }
  return `#${c.getHexString()}`;
}

function tonedRgba(color, factor, alpha) {
  const c = new THREE.Color(tonedColor(color, factor));
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

export function makePatternTexture(kind, repeatX = 1, repeatY = 1) {
  const c = canvas(64);
  const ctx = c.getContext("2d");
  if (kind === "tileRoof") {
    fill(ctx, "#4a2d26");
    for (let y = 0; y < 64; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? "#5c372c" : "#3a221d";
      ctx.fillRect(0, y, 64, 5);
      ctx.strokeStyle = "rgba(18, 10, 8, 0.45)";
      ctx.beginPath();
      ctx.moveTo(0, y + 5);
      ctx.lineTo(64, y + 5);
      ctx.stroke();
      for (let x = (y % 16 === 0 ? 0 : 6); x < 64; x += 12) {
        ctx.strokeStyle = "rgba(20, 12, 10, 0.35)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 5, y + 5);
        ctx.stroke();
      }
    }
  } else if (kind === "redRoof") {
    fill(ctx, "#8f342f");
    for (let y = 0; y < 64; y += 8) {
      ctx.fillStyle = "#aa4339";
      ctx.fillRect(0, y, 64, 3);
      ctx.strokeStyle = "rgba(58, 18, 16, 0.45)";
      ctx.beginPath();
      ctx.moveTo(0, y + 5);
      ctx.lineTo(64, y + 5);
      ctx.stroke();
    }
  } else if (kind === "wood") {
    fill(ctx, "#8b5b32");
    lineNoise(ctx, "#3c2515", 12, false);
    lineNoise(ctx, "#bd8750", 8, false);
    flecks(ctx, "#2f1d10", 60, 1, 1);
  } else if (kind === "darkWood") {
    fill(ctx, "#5a371d");
    lineNoise(ctx, "#241309", 14, false);
    lineNoise(ctx, "#8a5b34", 5, false);
  } else if (kind === "thatch") {
    fill(ctx, "#b17a32");
    lineNoise(ctx, "#e0b15d", 26, true);
    lineNoise(ctx, "#6b431d", 16, true);
  } else if (kind === "plaster") {
    fill(ctx, "#dfd0a7");
    flecks(ctx, "#8e7d61", 80, 1, 1);
    flecks(ctx, "#fff0cb", 38, 1, 1);
  } else if (kind === "stone") {
    fill(ctx, "#80776a");
    for (let y = 0; y < 64; y += 14) {
      ctx.strokeStyle = "rgba(45, 41, 36, 0.35)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y + (hash01(y, 2, 5) - 0.5) * 6);
      ctx.stroke();
    }
    flecks(ctx, "#c3b8a5", 45, 1, 1);
  } else if (kind === "road") {
    fill(ctx, "#7c5a39");
    lineNoise(ctx, "#593b22", 18, false);
    for (const y of [21, 43]) {
      ctx.fillStyle = "rgba(61, 38, 22, 0.42)";
      ctx.fillRect(0, y, 64, 5);
    }
    flecks(ctx, "#a98255", 55, 1, 2);
  } else if (kind === "earth") {
    fill(ctx, "#856137");
    lineNoise(ctx, "#4d351d", 18, false);
    flecks(ctx, "#b48750", 80, 1, 2);
  } else if (kind === "crop") {
    fill(ctx, "#8fb53f");
    lineNoise(ctx, "#516b24", 20, true);
    lineNoise(ctx, "#bfd36b", 10, true);
  }
  return makeTexture(c, repeatX, repeatY);
}

function drawTileDetail(ctx, tile, px, py, size) {
  const t = tile.terrain;
  const tileTone = 0.97 + hash01(tile.x, tile.y, 91) * 0.06;
  const base = "#ffffff";
  ctx.fillStyle = tonedColor(base, tileTone);
  ctx.fillRect(px, py, size, size);

  const dot = (factor, count, alpha = 0.16) => {
    ctx.fillStyle = tonedColor(base, factor);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i += 1) {
      const x = px + Math.floor(hash01(tile.x, tile.y, i) * size);
      const y = py + Math.floor(hash01(tile.y, i, tile.x) * size);
      ctx.fillRect(x, y, 1 + Math.floor(hash01(i, tile.x, tile.y) * 2), 1);
    }
    ctx.globalAlpha = 1;
  };

  if (t === TERRAIN.PLAIN || t === TERRAIN.FERTILE) {
    dot(1.03, 4, 0.08);
    dot(0.92, 3, 0.07);
  } else if (t === TERRAIN.RIVERBANK) {
    dot(1.04, 6, 0.08);
    dot(0.9, 4, 0.07);
  } else if (t === TERRAIN.WETLAND) {
    dot(0.9, 6, 0.08);
    ctx.strokeStyle = tonedRgba(base, 0.84, 0.1);
    for (let i = 0; i < 4; i += 1) {
      const x = px + hash01(tile.x, i, tile.y) * size;
      ctx.beginPath();
      ctx.moveTo(x, py + 2);
      ctx.lineTo(x + (hash01(i, tile.x, 7) - 0.5) * 5, py + size - 2);
      ctx.stroke();
    }
  } else if (t === TERRAIN.HILL || t === TERRAIN.MOUNTAIN || t === TERRAIN.PASS) {
    dot(1.03, 4, 0.08);
    dot(0.88, 5, 0.1);
    ctx.strokeStyle = tonedRgba(base, 0.78, 0.14);
    ctx.beginPath();
    ctx.moveTo(px + 1, py + 4 + hash01(tile.x, tile.y, 3) * 4);
    ctx.bezierCurveTo(px + 5, py + 2, px + 11, py + 10, px + size - 1, py + 6);
    ctx.stroke();
  } else if (t === TERRAIN.FOREST) {
    dot(1.02, 5, 0.08);
    dot(0.82, 9, 0.12);
  } else if (t === TERRAIN.WASTELAND) {
    dot(0.9, 7, 0.09);
    ctx.strokeStyle = tonedRgba(base, 0.76, 0.16);
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(px + hash01(tile.x, i, 1) * size, py + hash01(i, tile.y, 2) * size);
      ctx.lineTo(px + hash01(tile.x, i, 3) * size, py + hash01(i, tile.y, 4) * size);
      ctx.stroke();
    }
  } else if (t === TERRAIN.RIVER || t === TERRAIN.SEA) {
    dot(1.04, 4, 0.08);
    ctx.strokeStyle = tonedRgba(base, 0.82, 0.12);
    ctx.beginPath();
    ctx.moveTo(px, py + size * 0.45);
    ctx.bezierCurveTo(px + size * 0.35, py + size * 0.3, px + size * 0.55, py + size * 0.65, px + size, py + size * 0.48);
    ctx.stroke();
  }
}

export function buildTerrainTexture(state) {
  const c = document.createElement("canvas");
  c.width = MAP_WIDTH * TILE_PIXELS;
  c.height = MAP_HEIGHT * TILE_PIXELS;
  const ctx = c.getContext("2d");
  for (const tile of state.tiles) {
    drawTileDetail(ctx, tile, tile.x * TILE_PIXELS, tile.y * TILE_PIXELS, TILE_PIXELS);
  }
  const tex = makeTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function buildWaterTexture() {
  const c = canvas(96);
  const ctx = c.getContext("2d");
  const base = "#2e9fd2";
  fill(ctx, base);
  ctx.strokeStyle = tonedRgba(base, 1.16, 0.22);
  ctx.lineWidth = 2;
  for (let y = 8; y < 96; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(26, y - 9, 48, y + 9, 96, y - 3);
    ctx.stroke();
  }
  flecks(ctx, tonedColor(base, 1.12), 36, 1, 2);
  return makeTexture(c, 2, 2);
}
