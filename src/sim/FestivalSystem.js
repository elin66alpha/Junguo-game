import { activeBuildings } from "./BuildingSystem.js";
import { openEvent } from "./EventSystem.js";
import { festivalWonderMultiplier } from "./WonderSystem.js";

// M6: 节庆改为半年一节——只保留春耕（正月）和秋报（七月）两个，去掉夏祭、腊祭。
// 花费按当前府库比例计算：大办取 8%，从简取 2%；大办上限 5000 钱，从简上限 3000 钱。
// 效果按花费量缩放：每 50 钱 = 1 民心、每 100 钱 = 1 声望，再乘场地与奇观加成。
const FESTIVALS = {
  0: { title: "春耕", baseLabel: "春耕劝农" },
  6: { title: "秋报", baseLabel: "秋报酬神" }
};

const LAVISH_RATIO = 0.08;
const LAVISH_MIN = 30;
const LAVISH_MAX = 5000;
const SIMPLE_RATIO = 0.02;
const SIMPLE_MIN = 10;
const SIMPLE_MAX = 3000;

export function initializeFestivals(state) {
  state.lastFestivalMonth = state.lastFestivalMonth ?? -1;
}

export function maybeOpenFestival(state) {
  initializeFestivals(state);
  if (state.pendingEvent) return;
  const festival = FESTIVALS[state.monthIndex];
  if (!festival) return;
  if (state.lastFestivalMonth === state.totalMonthsElapsed) return;
  state.lastFestivalMonth = state.totalMonthsElapsed;
  openEvent(state, makeFestivalEvent(state, festival));
}

export function festivalCost(coin, mode) {
  if (mode === "lavish") {
    return Math.min(LAVISH_MAX, Math.max(LAVISH_MIN, Math.floor((coin || 0) * LAVISH_RATIO)));
  }
  return Math.min(SIMPLE_MAX, Math.max(SIMPLE_MIN, Math.floor((coin || 0) * SIMPLE_RATIO)));
}

function festivalMultiplier(state) {
  const stage = activeBuildings(state, "stage").length > 0 ? 0.35 : 0;
  const altar = activeBuildings(state, "shrine").length > 0 ? 0.25 : 0;
  return (1 + stage + altar) * festivalWonderMultiplier(state);
}

function makeFestivalEvent(state, festival) {
  const coin = Math.max(0, state.resources?.coin || 0);
  const lavishCost = festivalCost(coin, "lavish");
  const simpleCost = festivalCost(coin, "simple");
  const totalMult = festivalMultiplier(state);
  const lavishMorale = Math.max(2, Math.round((lavishCost / 50) * totalMult));
  const lavishPrestige = Math.max(1, Math.round((lavishCost / 100) * totalMult));
  const simpleMorale = Math.max(1, Math.round((simpleCost / 60) * totalMult));
  const simplePrestige = Math.max(1, Math.round((simpleCost / 120) * totalMult));
  return {
    id: `festival-${state.year}-${state.monthIndex}`,
    title: `${festival.title}之节`,
    description: `半年一度的${festival.title}。可按当前府库的比例大办或从简，戏台、祭坛和名山祠会放大效果。`,
    choices: [
      {
        id: "hold",
        label: `大办（-${lavishCost} 钱，民心 +${lavishMorale}，声望 +${lavishPrestige}，4 月）`,
        effects: [
          { type: "resources", coin: -lavishCost, fixed: true },
          { type: "indicator", key: "morale", delta: lavishMorale, months: 4, label: festival.baseLabel },
          { type: "indicator", key: "prestige", delta: lavishPrestige, months: 4, label: festival.baseLabel },
          { type: "neighborAttitude", amount: 1 }
        ]
      },
      {
        id: "simple",
        label: `从简（-${simpleCost} 钱，民心 +${simpleMorale}，声望 +${simplePrestige}，2 月）`,
        effects: [
          { type: "resources", coin: -simpleCost, fixed: true },
          { type: "indicator", key: "morale", delta: simpleMorale, months: 2, label: `${festival.baseLabel}从简` },
          { type: "indicator", key: "prestige", delta: simplePrestige, months: 2, label: `${festival.baseLabel}从简` }
        ]
      },
      {
        id: "skip",
        label: "不办（民心 -2 两个月）",
        effects: [
          { type: "indicator", key: "morale", delta: -2, months: 2, label: "节庆从缺" }
        ]
      }
    ]
  };
}
