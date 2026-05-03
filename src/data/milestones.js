// Prestige milestones. Each fires once per term as soon as prestige hits the threshold.
// Reward is auto-applied; UI shows a notification. Each also grants a one-shot 气数 jolt.

export const MILESTONES = [
  {
    id: "first",
    threshold: 30,
    title: "声望初立",
    qishuReward: 15,
    reward: { type: "freeBuilding", buildingType: "road", count: 6, label: "朝廷遣工修路六段，气数 +15" }
  },
  {
    id: "second",
    threshold: 60,
    title: "声望渐隆",
    qishuReward: 25,
    reward: { type: "discount", key: "all", percent: 25, months: 6, label: "州府嘉勉，半年内升级 75 折，气数 +25" }
  },
  {
    id: "third",
    threshold: 90,
    title: "声望卓著",
    qishuReward: 40,
    reward: { type: "freeBuilding", buildingType: "hut", count: 4, label: "民众自建小屋四所，气数 +40" }
  }
];
