// Monthly random events. Each has 2-3 player choices; effects are resolved by EventSystem.
// Effect types: resources, indicator, qishu, modifier, discount, fillHousing.

export const EVENTS = [
  {
    id: "bumper",
    title: "丰年祥兆",
    weight: 6,
    months: [4, 5, 6, 7, 8, 9],
    description: "今春风调雨顺，老农言此乃丰年。",
    choices: [
      { id: "celebrate", label: "犒赏耕者（-20 钱，民心 +5 三个月，气数 +6）", effects: [
        { type: "resources", coin: -20 },
        { type: "modifier", key: "farmYield", multiplier: 1.4, months: 3, label: "丰年增产" },
        { type: "indicator", key: "morale", delta: 5, months: 3, label: "犒赏耕者" },
        { type: "qishu", delta: 6 }
      ] },
      { id: "store", label: "如常（气数 +2）", effects: [
        { type: "modifier", key: "farmYield", multiplier: 1.2, months: 2, label: "丰年小增" },
        { type: "qishu", delta: 2 }
      ] }
    ]
  },
  {
    id: "refugees",
    title: "流民来归",
    weight: 5,
    months: null,
    description: "邻郡饥荒，数十户流民请入郡境。",
    choices: [
      { id: "accept", label: "尽收（+30 人口入空房，气数 +4）", effects: [
        { type: "fillHousing", residents: 30 },
        { type: "morale", delta: 4 },
        { type: "qishu", delta: 4 }
      ] },
      { id: "refuse", label: "拒之（民心 -6 三个月，治安 +3 三个月，气数 -3）", effects: [
        { type: "indicator", key: "morale", delta: -6, months: 3, label: "拒纳流民" },
        { type: "indicator", key: "order", delta: 3, months: 3, label: "拒纳流民" },
        { type: "qishu", delta: -3 }
      ] }
    ]
  },
  {
    id: "merchant",
    title: "商旅至境",
    weight: 5,
    months: null,
    description: "塞外商队携奇货过境，求于市设贾。",
    choices: [
      { id: "trade", label: "卖布换钱（-20 布，+50 钱，气数 +1）", effects: [
        { type: "resources", cloth: -20, coin: 50 },
        { type: "qishu", delta: 1 }
      ] },
      { id: "tax", label: "征关税（+25 钱，治安 -3 两个月，气数 -1）", effects: [
        { type: "resources", coin: 25 },
        { type: "indicator", key: "order", delta: -3, months: 2, label: "重征关税" },
        { type: "qishu", delta: -1 }
      ] },
      { id: "ignore", label: "不予理会", effects: [] }
    ]
  },
  {
    id: "scholar",
    title: "学子来访",
    weight: 4,
    months: null,
    description: "游学士子至郡，欲讲经于学宫。",
    choices: [
      { id: "host", label: "厚待（-15 钱，声望 +6 六个月，气数 +8）", effects: [
        { type: "resources", coin: -15 },
        { type: "indicator", key: "prestige", delta: 6, months: 6, label: "士子讲经" },
        { type: "qishu", delta: 8 }
      ] },
      { id: "polite", label: "礼送（声望 +2 三个月，气数 +2）", effects: [
        { type: "indicator", key: "prestige", delta: 2, months: 3, label: "礼送士子" },
        { type: "qishu", delta: 2 }
      ] }
    ]
  },
  {
    id: "locusts",
    title: "蝗虫掠食",
    weight: 4,
    months: [5, 6, 7, 8],
    description: "飞蝗过境，田中青苗损毁。",
    choices: [
      { id: "burn", label: "焚田驱蝗（-20 钱，限损，气数 -1）", effects: [
        { type: "resources", coin: -20 },
        { type: "modifier", key: "farmYield", multiplier: 0.8, months: 1, label: "蝗灾余波" },
        { type: "qishu", delta: -1 }
      ] },
      { id: "endure", label: "忍受（民心 -5 三个月，气数 -5）", effects: [
        { type: "modifier", key: "farmYield", multiplier: 0.4, months: 2, label: "蝗灾减产" },
        { type: "indicator", key: "morale", delta: -5, months: 3, label: "蝗灾民怨" },
        { type: "qishu", delta: -5 }
      ] }
    ]
  },
  {
    id: "drought",
    title: "春旱无雨",
    weight: 4,
    months: [1, 2, 3, 4],
    description: "数月无雨，井浅田干。",
    choices: [
      { id: "well", label: "凿井济急（-25 钱，半年内升级井 5 折，气数 +3）", effects: [
        { type: "resources", coin: -25 },
        { type: "discount", key: "well", percent: 50, months: 4, label: "凿井政令" },
        { type: "qishu", delta: 3 }
      ] },
      { id: "pray", label: "祈雨（声望 -2 三个月，气数 -3）", effects: [
        { type: "modifier", key: "farmYield", multiplier: 0.7, months: 2, label: "春旱减产" },
        { type: "indicator", key: "prestige", delta: -2, months: 3, label: "祈雨无验" },
        { type: "qishu", delta: -3 }
      ] }
    ]
  },
  {
    id: "flood",
    title: "河涨坏田",
    weight: 3,
    months: [6, 7, 8, 9],
    blockedByWonder: "lingqu",
    seasonBlock: "summer",
    description: "连日暴雨，河水漫涨，低田与河港皆受惊扰。",
    choices: [
      { id: "repair", label: "修堤排涝（-35 钱，农田减产较轻）", effects: [
        { type: "resources", coin: -35 },
        { type: "modifier", key: "farmYield", multiplier: 0.9, months: 2, label: "水患余波" },
        { type: "neighborAttitude", amount: 1 }
      ] },
      { id: "delay", label: "暂且拖延（民心 -5 三个月，气数 -4）", effects: [
        { type: "modifier", key: "farmYield", multiplier: 0.65, months: 2, label: "水患减产" },
        { type: "indicator", key: "morale", delta: -5, months: 3, label: "水患民怨" },
        { type: "qishu", delta: -4 }
      ] }
    ]
  },
  {
    id: "envoy",
    title: "巡按使者来访",
    weight: 3,
    months: null,
    seasonBlock: "all",
    description: "邻郡巡按使者过境，愿与本郡互通驿牒。",
    choices: [
      { id: "host", label: "设宴款待（-30 钱，邻郡态度 +8，声望 +2 三个月）", effects: [
        { type: "resources", coin: -30 },
        { type: "neighborAttitude", amount: 8 },
        { type: "indicator", key: "prestige", delta: 2, months: 3, label: "款待使者" }
      ] },
      { id: "brief", label: "公事公办（邻郡态度 +2）", effects: [
        { type: "neighborAttitude", amount: 2 }
      ] },
      { id: "snub", label: "冷遇（邻郡态度 -6）", effects: [
        { type: "neighborAttitude", amount: -6 }
      ] }
    ]
  },
  {
    id: "neighborLoan",
    title: "邻郡借粮",
    weight: 3,
    months: [1, 2, 10, 11, 12],
    seasonBlock: "winter",
    description: "邻郡仓廪吃紧，遣吏来请借粮。",
    choices: [
      { id: "lend", label: "借出 50 粮（邻郡态度 +10，声望 +3 四个月）", effects: [
        { type: "resources", grain: -50 },
        { type: "neighborAttitude", amount: 10 },
        { type: "indicator", key: "prestige", delta: 3, months: 4, label: "邻郡借粮" }
      ] },
      { id: "refuse", label: "婉拒（邻郡态度 -5）", effects: [
        { type: "neighborAttitude", amount: -5 }
      ] }
    ]
  }
];

export const EVENT_SEASON_BLOCKS = {
  spring: EVENTS.filter((event) => event.seasonBlock === "spring" || event.months?.some((m) => m >= 1 && m <= 3)),
  summer: EVENTS.filter((event) => event.seasonBlock === "summer" || event.months?.some((m) => m >= 4 && m <= 6)),
  autumn: EVENTS.filter((event) => event.seasonBlock === "autumn" || event.months?.some((m) => m >= 7 && m <= 9)),
  winter: EVENTS.filter((event) => event.seasonBlock === "winter" || event.months?.some((m) => m >= 10 || m <= 2)),
  all: EVENTS.filter((event) => !event.months)
};

export function pickEvent(rng, monthIndex, state = null) {
  const candidates = EVENTS.filter((event) =>
    (!event.months || event.months.includes(monthIndex)) &&
    !(event.blockedByWonder && state?.buildings?.some((building) =>
      building.type === event.blockedByWonder && building.status === "complete" && building.connected
    ))
  );
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, event) => sum + event.weight, 0);
  if (totalWeight <= 0) return null;
  let roll = rng.next() * totalWeight;
  for (const event of candidates) {
    if (roll < event.weight) return event;
    roll -= event.weight;
  }
  return candidates[candidates.length - 1];
}
