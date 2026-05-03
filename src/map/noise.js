// Deterministic 2D value noise driven by a numeric seed.
// We avoid float gradients to keep results identical across browsers.

function hash2(seed, x, y) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 374761393) >>> 0;
  h = Math.imul(h ^ (y | 0), 668265263) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(seed, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(seed, xi, yi);
  const b = hash2(seed, xi + 1, yi);
  const c = hash2(seed, xi, yi + 1);
  const d = hash2(seed, xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(seed, x, y, octaves = 4, persistence = 0.5, lacunarity = 2) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let o = 0; o < octaves; o += 1) {
    total += valueNoise(seed + o * 1013, x * frequency, y * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / maxAmp;
}

// Cheap deterministic pseudo-random for per-tile dithering and decorations.
export function tileHash(seed, x, y, salt = 0) {
  return hash2((seed ^ (salt * 2654435761)) >>> 0, x, y);
}
