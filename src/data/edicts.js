// Edicts: 3 slots, 3 options each. Default to the middle option.
// Each option exposes static modifiers consumed by ResourceSystem and IndicatorSystem.

export const EDICTS = {
  tax: {
    label: "赋税",
    options: [
      {
        id: "light",
        label: "轻徭",
        description: "宽减税赋。每月税收 ×0.7，民心 +6。",
        modifiers: { taxMultiplier: 0.7, moraleDelta: 6, orderDelta: 0, grainDelta: 0 }
      },
      {
        id: "standard",
        label: "如常",
        description: "依例征收。无额外效果。",
        modifiers: { taxMultiplier: 1.0, moraleDelta: 0, orderDelta: 0, grainDelta: 0 }
      },
      {
        id: "heavy",
        label: "重赋",
        description: "加征以充府库。每月税收 ×1.4，民心 -10，治安 -4。",
        modifiers: { taxMultiplier: 1.4, moraleDelta: -10, orderDelta: -4, grainDelta: 0 }
      }
    ],
    defaultId: "standard"
  },
  relief: {
    label: "仓廪",
    options: [
      {
        id: "store",
        label: "蓄积",
        description: "禁开常平。每月节省口粮约 10%，民心 -4。",
        modifiers: { taxMultiplier: 1, moraleDelta: -4, orderDelta: 0, grainConsumeMultiplier: 0.9 }
      },
      {
        id: "balanced",
        label: "常平",
        description: "依例放粮。无额外效果。",
        modifiers: { taxMultiplier: 1, moraleDelta: 0, orderDelta: 0, grainConsumeMultiplier: 1 }
      },
      {
        id: "porridge",
        label: "施粥",
        description: "城下设粥棚。每月多耗 20% 粮食，民心 +8，治安 +3。",
        modifiers: { taxMultiplier: 1, moraleDelta: 8, orderDelta: 3, grainConsumeMultiplier: 1.2 }
      }
    ],
    defaultId: "balanced"
  },
  discipline: {
    label: "治化",
    options: [
      {
        id: "lenient",
        label: "宽政",
        description: "省刑薄罚。民心 +5，治安 -8。",
        modifiers: { taxMultiplier: 1, moraleDelta: 5, orderDelta: -8 }
      },
      {
        id: "balanced",
        label: "持平",
        description: "依律治政。无额外效果。",
        modifiers: { taxMultiplier: 1, moraleDelta: 0, orderDelta: 0 }
      },
      {
        id: "strict",
        label: "严政",
        description: "严刑峻法。治安 +10，民心 -7。",
        modifiers: { taxMultiplier: 1, moraleDelta: -7, orderDelta: 10 }
      }
    ],
    defaultId: "balanced"
  }
};

export function defaultEdicts() {
  const out = {};
  for (const [slot, def] of Object.entries(EDICTS)) out[slot] = def.defaultId;
  return out;
}

export function getEdictOption(slot, optionId) {
  const def = EDICTS[slot];
  if (!def) return null;
  return def.options.find((option) => option.id === optionId) || null;
}

export function aggregateEdictModifiers(active) {
  const sum = {
    taxMultiplier: 1,
    grainConsumeMultiplier: 1,
    moraleDelta: 0,
    orderDelta: 0
  };
  for (const [slot, optionId] of Object.entries(active || {})) {
    const option = getEdictOption(slot, optionId);
    if (!option) continue;
    if (option.modifiers.taxMultiplier != null) sum.taxMultiplier *= option.modifiers.taxMultiplier;
    if (option.modifiers.grainConsumeMultiplier != null) sum.grainConsumeMultiplier *= option.modifiers.grainConsumeMultiplier;
    if (option.modifiers.moraleDelta != null) sum.moraleDelta += option.modifiers.moraleDelta;
    if (option.modifiers.orderDelta != null) sum.orderDelta += option.modifiers.orderDelta;
  }
  return sum;
}
