import { HOTSPOT } from "../model/constants.js";

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function workshopHotspotBonus(state, workshop) {
  if (!state.hotspots) return 1;
  const isMulberry = state.hotspots.some((spot) => spot.type === HOTSPOT.MULBERRY && chebyshev({ x: workshop.x, y: workshop.y }, spot) <= 3);
  return isMulberry ? 1.3 : 1;
}

export function nearSpring(state, x, y) {
  if (!state.hotspots) return false;
  return state.hotspots.some((spot) => spot.type === HOTSPOT.SPRING && chebyshev({ x, y }, spot) <= 4);
}
