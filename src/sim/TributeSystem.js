// 岁贡 (annual tribute) — every 正月, after time advances to a new year, the
// county owes the capital a coin tribute that scales with prestige and the
// number of milestones already earned. Failing to pay it bites qishu and
// spawns indicator debuffs.
import { annualTribute } from "../model/formulas.js";
import { addEvent } from "./GameState.js";
import { applyQishuDelta } from "./QishuSystem.js";

export function runAnnualTribute(state) {
  // Triggered on 正月 (monthIndex 0) once we've actually elapsed a year.
  if (state.monthIndex !== 0) return;
  if (state.totalMonthsElapsed === 0) return;
  if (state.lastTributeYear === state.year) return;
  state.lastTributeYear = state.year;

  const owed = annualTribute(state);
  const available = state.resources.coin;
  const paid = owed;

  state.resources.coin -= paid;
  state.lastDeltas.coin -= paid;
  state.resourceBreakdowns.coin.sinks.push({ label: "京畿岁贡", amount: paid });

  if (available >= owed) {
    addEvent(state, `已缴岁贡 ${owed} 钱。`);
    return;
  }

  const shortfall = owed - Math.max(0, available);
  const ratio = available > 0 ? available / owed : 0;
  // Severe miss (paid less than half) brings the harshest penalty.
  if (ratio < 0.5) {
    applyQishuDelta(state, -12, "岁贡严重欠缴");
    state.activeIndicatorModifiers = state.activeIndicatorModifiers || [];
    state.activeIndicatorModifiers.push({ key: "morale", delta: -8, monthsLeft: 6, label: "京畿震怒" });
    state.activeIndicatorModifiers.push({ key: "order", delta: -5, monthsLeft: 6, label: "京畿震怒" });
    addEvent(state, `京畿岁贡欠缴 ${shortfall} 钱，朝廷震怒。`, "warn");
  } else {
    applyQishuDelta(state, -6, "岁贡未足额");
    state.activeIndicatorModifiers = state.activeIndicatorModifiers || [];
    state.activeIndicatorModifiers.push({ key: "morale", delta: -4, monthsLeft: 4, label: "京畿不悦" });
    addEvent(state, `京畿岁贡未足额，欠 ${shortfall} 钱。`, "warn");
  }
}
