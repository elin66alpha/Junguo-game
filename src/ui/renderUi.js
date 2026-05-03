import {
  ARCHETYPE_LABELS, ARCHETYPES, EDICT_LABELS, EDICT_SLOTS, HOUSING_TIERS,
  INDICATOR_KEYS, MAP_HEIGHT, MAP_WIDTH, RESOURCE_KEYS, TERRAIN_COLORS
} from "../model/constants.js";
import { generateMap } from "../map/generateMap.js";
import { farmSeasonInfo, granaryCapacity, serviceRadius, warehouseClothCapacity, warehouseWoodCapacity } from "../model/formulas.js";
import { getBuildingDef, getUpgradeQuote } from "../sim/BuildingSystem.js";
import { stateHash } from "../sim/GameState.js";
import { EDICTS } from "../data/edicts.js";
import { freeGrantCount } from "../sim/MilestoneSystem.js";
import { drawIndicatorIcon, drawResourceIcon } from "../app/sprites/icons.js";
import { qishuMax } from "../sim/QishuSystem.js";
import { TRADE_ROUTE_LABELS, tradePrice, tradeSellPrice, tradeUnlocked } from "../sim/MarketSystem.js";
import { attitudeLabel, attitudeTone, envoyCost, riverExitCount, NEIGHBOR_RESOURCE_LABELS } from "../sim/NeighborSystem.js";
import { riverDockActive } from "../sim/RiverTransportSystem.js";
import { readHallOfFame } from "../sim/SaveSystem.js";

const resourceLabels = {
  grain: "粮食",
  wood: "木材",
  cloth: "布",
  coin: "钱",
  labor: "人口"
};

const indicatorLabels = {
  morale: "民心",
  order: "治安",
  prestige: "声望"
};

function signedAmount(amount) {
  return `${amount > 0 ? "+" : ""}${amount}`;
}

function makeIcon(drawFn, key, size = 18) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.className = "tiny-icon";
  drawFn(canvas.getContext("2d"), key, 0, 0, size);
  return canvas;
}

function qishuTone(value) {
  if (value >= 45) return "qishu-best";
  if (value >= 30) return "qishu-good";
  if (value >= 15) return "qishu-warn";
  return "qishu-bad";
}

const SELECTABLE_MAPS = [
  { id: ARCHETYPES.WEI, title: ARCHETYPE_LABELS[ARCHETYPES.WEI], description: "河谷平原、丘陵山脉和更多荒野角落，适合稳扎稳打的县治。" },
  { id: ARCHETYPES.ESTUARY, title: ARCHETYPE_LABELS[ARCHETYPES.ESTUARY], description: "河道入海，东侧有深色海洋和多条河口，水运与沿海布局更突出。" }
];

export function renderTopBar(state, controller, onBreakdown, onMapSelect) {
  const root = document.querySelector("#top-bar");
  root.innerHTML = `
    <button id="map-select-pill" class="date-pill" title="选择地图">
      <strong>${state.archetypeLabel}</strong>
      <span>第 ${state.year} 年 ${state.monthName} · 在任 ${state.totalMonthsElapsed} 月</span>
    </button>
    <div class="meter-group resources"></div>
    <div class="meter-group indicators"></div>
    <button id="qishu-pill" class="qishu-pill ${qishuTone(state.qishu)}" title="点击查看气数明细">
      <span class="qishu-label">气数</span>
      <strong>${state.qishu}</strong>
      <em class="${state.qishuDelta > 0 ? "up" : state.qishuDelta < 0 ? "down" : ""}">${signedAmount(state.qishuDelta)}/月</em>
    </button>
  `;

  const resources = root.querySelector(".resources");
  for (const key of RESOURCE_KEYS) {
    const delta = state.lastDeltas[key] || 0;
    const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
    const className = delta > 0 ? "up" : delta < 0 ? "down" : "";
    const button = document.createElement("button");
    button.className = "meter";
    const left = document.createElement("div");
    left.className = "meter-icon";
    left.append(makeIcon(drawResourceIcon, key, 22));
    const body = document.createElement("div");
    body.className = "meter-body";
    let valueText;
    if (key === "grain" && state.resourceCaps?.grain) {
      valueText = `${Math.floor(state.resources[key])}/${state.resourceCaps.grain}`;
    } else if (key === "wood" && state.resourceCaps?.wood) {
      valueText = `${Math.floor(state.resources[key] ?? 0)}/${state.resourceCaps.wood}`;
    } else if (key === "cloth" && state.resourceCaps?.cloth) {
      valueText = `${Math.floor(state.resources[key] ?? 0)}/${state.resourceCaps.cloth}`;
    } else if (key === "wood" || key === "cloth") {
      valueText = Math.floor(state.resources[key] ?? 0);
    } else {
      valueText = Math.floor(state.resources[key]);
    }
    body.innerHTML = `<span>${resourceLabels[key]}</span><strong>${valueText}</strong><em class="${className}">${arrow} ${Math.abs(delta)}</em>`;
    button.append(left, body);
    button.addEventListener("click", () => onBreakdown("resource", key));
    resources.append(button);
  }

  const indicators = root.querySelector(".indicators");
  for (const key of INDICATOR_KEYS) {
    const value = state.indicators[key];
    const button = document.createElement("button");
    button.className = `meter indicator ${value < 30 ? "bad" : value <= 60 ? "warn" : "good"}`;
    const left = document.createElement("div");
    left.className = "meter-icon";
    left.append(makeIcon(drawIndicatorIcon, key, 22));
    const body = document.createElement("div");
    body.className = "meter-body";
    body.innerHTML = `<span>${indicatorLabels[key]}</span><strong>${value}</strong>`;
    button.append(left, body);
    button.title = state.indicatorBreakdowns[key].map((item) => `${item.label}: ${signedAmount(item.amount)}`).join("\n");
    button.addEventListener("click", () => onBreakdown("indicator", key));
    indicators.append(button);
  }

  root.querySelector("#qishu-pill").addEventListener("click", () => onBreakdown("qishu", "qishu"));
  root.querySelector("#map-select-pill").addEventListener("click", () => onMapSelect?.());
}

// M5a: build palette is grouped into collapsible category folders. The fixed
// bottom shelf keeps 建造 / category folders / 升级 / 拆除 in one stable row,
// while the selected category drawer floats over the game view above it.
const BUILD_CATEGORIES = [
  { id: "infrastructure", label: "基建" },
  { id: "housing", label: "民居" },
  { id: "production", label: "生产" },
  { id: "service", label: "服务" },
  { id: "civic", label: "政教" },
  { id: "wonder", label: "奇观" }
];

function bindBuildHelp(button, help, title, body) {
  if (!help) return;
  button.addEventListener("mouseenter", () => {
    help.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    help.classList.remove("hidden");
  });
  button.addEventListener("mouseleave", () => help.classList.add("hidden"));
}

export function renderBuildBar(state, onSelect, onDemolishTool, onUpgradeTool, onCategoryToggle) {
  const root = document.querySelector("#build-bar");
  root.innerHTML = "";
  const help = document.querySelector("#build-help");
  if (help) help.classList.add("hidden");

  const placeable = state.buildingDefs.filter((def) => def.placeable);
  const byCategory = new Map();
  for (const def of placeable) {
    const list = byCategory.get(def.category) || [];
    list.push(def);
    byCategory.set(def.category, list);
  }

  // Auto-correct openBuildCategory if it points to a now-empty group.
  if (state.openBuildCategory && !byCategory.has(state.openBuildCategory)) {
    state.openBuildCategory = null;
  }
  const opened = state.openBuildCategory ? byCategory.get(state.openBuildCategory) : null;
  const hasOpenDrawer = !!(opened && opened.length > 0);
  root.classList.toggle("has-open-drawer", hasOpenDrawer);
  if (help) help.classList.toggle("drawer-open", hasOpenDrawer);

  const categoryRow = document.createElement("div");
  categoryRow.className = "build-category-row";
  const title = document.createElement("div");
  title.className = "build-title";
  title.textContent = "建造";
  categoryRow.append(title);

  for (const cat of BUILD_CATEGORIES) {
    const defs = byCategory.get(cat.id);
    if (!defs || defs.length === 0) continue;
    const open = state.openBuildCategory === cat.id;
    const button = document.createElement("button");
    button.className = `build-category-button ${open ? "open" : ""}`;
    button.disabled = !!state.pendingEvent;
    button.innerHTML = `<strong>${cat.label}</strong><span>${defs.length} 项 ${open ? "▾" : "▸"}</span>`;
    button.addEventListener("click", () => onCategoryToggle(cat.id));
    bindBuildHelp(button, help, cat.label, `点开后选择 ${cat.label} 类建筑。再次点击折叠。`);
    categoryRow.append(button);
  }

  const tools = document.createElement("div");
  tools.className = "build-tools";

  const upgrade = document.createElement("button");
  upgrade.className = `upgrade-tool ${state.upgradeMode ? "selected" : ""}`;
  upgrade.disabled = !!state.pendingEvent;
  upgrade.innerHTML = "<strong>升级</strong><span>框选升级</span>";
  upgrade.addEventListener("click", onUpgradeTool);
  bindBuildHelp(upgrade, help, "框选升级", "进入升级模式后，按住左键框选建筑。绿色建筑会自动升级，红色建筑条件不足或资源不足，会被静默跳过。右键取消。");
  tools.append(upgrade);

  const demolish = document.createElement("button");
  demolish.className = `demolish-tool ${state.demolishMode ? "selected" : ""}`;
  demolish.disabled = !!state.pendingEvent;
  demolish.innerHTML = "<strong>拆除</strong><span>拖拽拆除</span>";
  demolish.addEventListener("click", onDemolishTool);
  bindBuildHelp(demolish, help, "拆除", "进入拆除模式后，按住左键拖过建筑即可连续拆除，并返还一部分钱。右键取消。");
  tools.append(demolish);

  categoryRow.append(tools);

  if (opened && opened.length > 0) {
    const drawer = document.createElement("div");
    drawer.className = "build-drawer";
    for (const def of opened) {
      const button = document.createElement("button");
      button.className = `build-item ${state.selectedBuildingType === def.id ? "selected" : ""}`;
      const free = freeGrantCount(state, def.id);
      const wood = def.woodCost || 0;
      const woodShort = free === 0 && wood > 0 && (state.resources.wood ?? 0) < wood;
      button.disabled = state.pendingEvent || woodShort;
      let costLabel;
      if (free > 0) {
        costLabel = `朝廷敕赐 ×${free}`;
      } else if (wood > 0) {
        costLabel = `${def.cost} 钱 · ${wood} 木`;
      } else {
        costLabel = `${def.cost} 钱`;
      }
      button.innerHTML = `<strong>${def.name}</strong><span>${costLabel} · ${def.labor > 0 ? `占 ${def.labor} 人` : "不占人口"}</span>`;
      button.addEventListener("click", () => onSelect(def.id));
      bindBuildHelp(button, help, def.name, def.description);
      drawer.append(button);
    }
    root.append(drawer);
  }

  root.append(categoryRow);
}

export function renderMandatePanel(state, controller) {
  const root = document.querySelector("#mandate-panel");
  const max = qishuMax();
  const ratio = Math.max(0, Math.min(1, state.qishu / max));
  const tone = qishuTone(state.qishu);

  const breakdownItems = (state.qishuBreakdown || []).map((item) =>
    `<div class="qishu-breakdown-row ${item.amount > 0 ? "good" : item.amount < 0 ? "bad" : ""}">
      <span>${item.label}</span><strong>${signedAmount(item.amount)}</strong>
    </div>`
  ).join("");

  const oneTime = (state.qishuOneTime || []).slice(-5).reverse();
  const oneTimeHtml = oneTime.length
    ? `<h3 class="sub">最近一次性变动</h3>${oneTime.map((entry) =>
        `<div class="qishu-breakdown-row ${entry.amount > 0 ? "good" : "bad"}"><span>${entry.label}</span><strong>${signedAmount(entry.amount)}</strong></div>`
      ).join("")}`
    : "";

  const productionTags = (state.activeModifiers || []).map((m) =>
    `<div class="modifier-tag">${m.label || m.key} · ${m.monthsLeft}月</div>`
  ).join("");
  const indicatorTags = (state.activeIndicatorModifiers || []).map((m) =>
    `<div class="modifier-tag indicator-mod">${indicatorLabels[m.key] || m.key} ${signedAmount(m.delta)} · ${m.monthsLeft}月</div>`
  ).join("");
  const discountTags = (state.activeDiscounts || []).map((d) =>
    `<div class="modifier-tag discount">${d.label || d.key} · ${d.monthsLeft}月</div>`
  ).join("");

  const utilityButtons = [
    { id: "edict", label: "诏令" },
    { id: "neighbor", label: "邻郡" },
    { id: "log", label: "近事" }
  ];
  // M6: 调试面板只在 URL 带 ?debug=1 启动时出现。普通玩家根本看不到这个入口。
  if (state.debugEnabled) utilityButtons.push({ id: "debug", label: "调试" });

  root.innerHTML = `
    <h2>气数</h2>
    <div class="qishu-meter ${tone}">
      <div class="qishu-bar"><div class="qishu-fill" style="width: ${ratio * 100}%"></div></div>
      <div class="qishu-numbers">
        <strong>${state.qishu}</strong>
        <em>/ ${max}</em>
        <span class="qishu-delta ${state.qishuDelta > 0 ? "up" : state.qishuDelta < 0 ? "down" : ""}">${signedAmount(state.qishuDelta)} / 月</span>
      </div>
    </div>
    <p class="muted">气数归零，任期终结。<br>在任 ${state.totalMonthsElapsed} 月。</p>
    <h3 class="sub">本月变动</h3>
    ${breakdownItems || '<div class="muted">尚无数据</div>'}
    ${oneTimeHtml}
    ${productionTags || indicatorTags || discountTags ? `<h3 class="sub">当前修正</h3>${productionTags}${indicatorTags}${discountTags}` : ""}
    <div class="save-controls">
      <button id="save-download" ${state.pendingEvent ? "disabled" : ""}>存储</button>
      <button id="save-load-trigger" ${state.pendingEvent ? "disabled" : ""}>读取</button>
      <input id="save-file-input" class="hidden" type="file" accept=".junguosave">
    </div>
    <div class="utility-panel-buttons">
      ${utilityButtons.map((button) =>
        `<button data-panel="${button.id}" class="${state.utilityPanel === button.id ? "selected" : ""}" ${state.utilityPanel === button.id || state.pendingEvent ? "disabled" : ""}>${button.label}</button>`
      ).join("")}
      <button id="next-season" title="${state.pendingEvent ? "请先处理当前事件" : "也可以按空格进入下月"}" ${state.pendingEvent ? "disabled" : ""}>下月</button>
    </div>
  `;

  root.querySelector("#next-season").addEventListener("click", () => controller.nextSeason());
  root.querySelector("#save-download").addEventListener("click", () => controller.downloadSave());
  const saveInput = root.querySelector("#save-file-input");
  root.querySelector("#save-load-trigger").addEventListener("click", () => saveInput.click());
  saveInput.addEventListener("change", () => {
    const file = saveInput.files?.[0];
    if (file) controller.loadSaveFile(file);
    saveInput.value = "";
  });
}

export function renderEdictPanel(state, onEdict) {
  const root = document.querySelector("#edict-panel");
  if (!root) return;
  root.classList.toggle("hidden", state.utilityPanel !== "edict");
  root.innerHTML = "<h3>诏令</h3>";
  for (const slot of EDICT_SLOTS) {
    const def = EDICTS[slot];
    const wrapper = document.createElement("div");
    wrapper.className = "edict-row";
    const label = document.createElement("div");
    label.className = "edict-label";
    label.textContent = EDICT_LABELS[slot] || def.label;
    wrapper.append(label);
    const group = document.createElement("div");
    group.className = "edict-options";
    for (const option of def.options) {
      const button = document.createElement("button");
      const active = state.edicts?.[slot] === option.id;
      button.className = `edict-option ${active ? "selected" : ""}`;
      button.disabled = !!state.pendingEvent;
      button.innerHTML = `<strong>${option.label}</strong><span>${option.description}</span>`;
      button.addEventListener("click", () => onEdict(slot, option.id));
      group.append(button);
    }
    wrapper.append(group);
    root.append(wrapper);
  }
}

export function renderEventModal(state, onResolve) {
  const root = document.querySelector("#event-modal");
  if (!root) return;
  root.classList.toggle("hidden", !state.pendingEvent);
  if (!state.pendingEvent) return;
  const event = state.pendingEvent;
  root.innerHTML = `
    <div class="event-card">
      <h2>${event.title}</h2>
      <p>${event.description}</p>
      <p class="event-lock">请先处理此事，之后才能继续推进月份、建造或调诏令。钱与气数的实际得失会按当前府库和气数折算。</p>
      <div class="event-choices"></div>
    </div>
  `;
  const choicesRoot = root.querySelector(".event-choices");
  for (const choice of event.choices) {
    const button = document.createElement("button");
    button.innerHTML = `<strong>${choice.label}</strong>`;
    button.addEventListener("click", () => onResolve(choice.id));
    choicesRoot.append(button);
  }
}

export function renderMilestoneToast(state, onDismiss) {
  const root = document.querySelector("#milestone-toast");
  if (!root) return;
  root.classList.toggle("hidden", !state.pendingMilestone);
  if (!state.pendingMilestone) return;
  const m = state.pendingMilestone;
  root.innerHTML = `
    <div class="milestone-card">
      <h3>${m.title}</h3>
      <p>${m.label}</p>
      <button id="dismiss-milestone">领旨</button>
    </div>
  `;
  root.querySelector("#dismiss-milestone").addEventListener("click", onDismiss);
}

export function renderDebugPanel(state, controller) {
  const root = document.querySelector("#debug-panel");
  if (!state.debugEnabled) {
    root.classList.add("hidden");
    root.innerHTML = "";
    return;
  }
  root.classList.toggle("hidden", state.utilityPanel !== "debug");
  root.innerHTML = `
    <h3>调试</h3>
    <div class="debug-grid">
      <button id="debug-season">推进一月</button>
      <button id="debug-coin">加 100 钱</button>
      <button id="debug-grain">加 100 粮</button>
      <button id="debug-wood">加 50 木</button>
      <button id="debug-print">打印状态</button>
      <button id="debug-eval">强制结局</button>
      <button id="debug-event">触发事件</button>
    </div>
    <p>${state.archetypeLabel} · 种子 ${state.seed}</p>
    <p>状态 ${stateHash(state)}</p>
    <p>生产占用人口 ${state.laborDemand || 0} · 产出倍率 ${(state.laborScale || 1).toFixed(2)}</p>
  `;
  root.querySelector("#debug-season").addEventListener("click", () => controller.nextSeason());
  root.querySelector("#debug-coin").addEventListener("click", () => controller.addCoin());
  root.querySelector("#debug-grain").addEventListener("click", () => controller.addGrain());
  root.querySelector("#debug-wood").addEventListener("click", () => controller.addWood());
  root.querySelector("#debug-print").addEventListener("click", () => controller.printState());
  root.querySelector("#debug-eval").addEventListener("click", () => controller.forceEvaluation());
  root.querySelector("#debug-event").addEventListener("click", () => controller.forceEvent());
}

export function renderEventLog(state) {
  const root = document.querySelector("#event-log");
  if (!root) return;
  root.classList.toggle("hidden", state.utilityPanel !== "log");
  const recent = (state.eventLog || []).slice(0, 10);
  root.innerHTML = `<h3>近事</h3>` + recent.map((entry) =>
    `<div class="log-entry log-${entry.level || "info"}">第${entry.year}年 ${entry.month}：${entry.message}</div>`
  ).join("");
}

export function renderNeighborPanel(state, controller) {
  const root = document.querySelector("#neighbor-panel");
  if (!root) return;
  root.classList.toggle("hidden", state.utilityPanel !== "neighbor");
  const neighbors = state.neighbors || [];
  const route = state.riverTransport?.currentRoute ? (TRADE_ROUTE_LABELS[state.riverTransport.currentRoute] || state.riverTransport.currentRoute) : "未开通";
  const dockText = riverDockActive(state) ? `漕运：${route}` : "漕运：未开通";
  // M6: each neighbor binds to one trade resource (粮食 / 木材 / 布). Per-row
  // shows attitude, current buy/sell unit price, and a single 「遣使」 button
  // whose cost is a quadratic ratio of the current treasury — see
  // NeighborSystem.envoyCost.
  root.innerHTML = `
    <h3>邻郡</h3>
    <div class="neighbor-summary">
      <span>${dockText}</span>
      <span>河口 ${riverExitCount(state)} 处</span>
    </div>
    <div class="neighbor-list">
      ${neighbors.map((neighbor) => {
        const tone = attitudeTone(neighbor.attitude);
        const label = attitudeLabel(neighbor.attitude);
        const resourceLabel = NEIGHBOR_RESOURCE_LABELS[neighbor.resource] || neighbor.resource;
        const buy = tradePrice(state, neighbor.resource);
        const sell = tradeSellPrice(state, neighbor.resource);
        const cost = envoyCost(state, neighbor.resource);
        const maxed = (neighbor.attitude || 0) >= 100;
        const disabled = state.pendingEvent || maxed || (state.resources?.coin || 0) < cost;
        const buttonLabel = maxed ? "亲善已满" : `遣使修好（-${cost} 钱 · 态度 +5）`;
        return `
          <div class="neighbor-row ${tone}">
            <div class="neighbor-row-head">
              <span class="neighbor-name">${neighbor.name}</span>
              <span class="neighbor-tag">${resourceLabel}</span>
              <strong class="neighbor-attitude">${label} · ${neighbor.attitude}/100</strong>
            </div>
            <div class="neighbor-prices">
              <span>买入 ${buy}</span>
              <span>卖出 ${sell}</span>
            </div>
            <button class="neighbor-envoy" data-resource="${neighbor.resource}" ${disabled ? "disabled" : ""}>${buttonLabel}</button>
          </div>
        `;
      }).join("")}
    </div>
    <p class="muted neighbor-note">态度越亲善，对应资源买价越低、卖价越高；遣使费用按当前府库比例上涨。</p>
  `;
  for (const button of root.querySelectorAll(".neighbor-envoy")) {
    button.addEventListener("click", () => controller.sendNeighborEnvoy(button.dataset.resource));
  }
}

export function renderBreakdown(state, type, key, controller = null, onClose = null) {
  const root = document.querySelector("#breakdown-panel");
  if (!key || state.selectedBuildingId) {
    root.classList.add("hidden");
    return;
  }

  root.classList.remove("hidden");
  if (type === "resource") {
    const data = state.resourceBreakdowns[key];
    let capLine = "";
    if (key === "grain" && state.resourceCaps?.grain) capLine = `<div>仓容上限：${state.resourceCaps.grain}</div>`;
    else if (key === "wood" && state.resourceCaps?.wood) capLine = `<div>木仓上限：${state.resourceCaps.wood}</div>`;
    else if (key === "cloth" && state.resourceCaps?.cloth) capLine = `<div>布仓上限：${state.resourceCaps.cloth}</div>`;
    const canTrade = key === "grain" || key === "wood" || key === "cloth";
    const unlocked = tradeUnlocked(state);
    const buyUnit = canTrade ? tradePrice(state, key) : 0;
    const sellUnit = canTrade ? tradeSellPrice(state, key) : 0;
    const stock = Math.max(0, Math.floor(state.resources[key] ?? 0));
    const cap = state.resourceCaps?.[key] ?? Infinity;
    const room = key === "coin" ? Infinity : Math.max(0, cap - stock);
    const tradeHtml = canTrade
      ? `<h4>贸易路线</h4>
        <div class="trade-box" data-resource="${key}" data-buy-unit="${buyUnit}" data-sell-unit="${sellUnit}" data-stock="${stock}" data-room="${Number.isFinite(room) ? room : 999999}">
          <div class="trade-price-line">${TRADE_ROUTE_LABELS[key]}：买 ${buyUnit} 钱 / 卖 ${sellUnit} 钱</div>
          <label>数量 <input class="trade-amount" type="number" min="1" step="1" value="10" ${unlocked ? "" : "disabled"}></label>
          <div class="trade-estimate"></div>
          <div class="trade-actions">
            <button data-trade-action="buy" ${unlocked ? "" : "disabled"}>买入</button>
            <button data-trade-action="sell" ${unlocked ? "" : "disabled"}>卖出</button>
          </div>
        </div>`
      : "";
    const tradeLock = canTrade && !unlocked ? `<div class="muted">建成并接通贸易站后可用。</div>` : "";
    root.innerHTML = `
      <button class="close">×</button>
      <h3>${resourceLabels[key]}明细</h3>
      ${capLine}
      <h4>来源 / 当前值</h4>
      ${data.sources.map((item) => `<div>${item.label}: +${item.amount}</div>`).join("") || "<div>无</div>"}
      <h4>支出</h4>
      ${data.sinks.map((item) => `<div>${item.label}: -${item.amount}</div>`).join("") || "<div>无</div>"}
      ${tradeHtml}
      ${tradeLock}
    `;
  } else if (type === "qishu") {
    root.innerHTML = `
      <button class="close">×</button>
      <h3>气数明细</h3>
      <h4>本月变动 ${signedAmount(state.qishuDelta)}</h4>
      ${state.qishuBreakdown.map((item) => `<div>${item.label}: ${signedAmount(item.amount)}</div>`).join("") || "<div>无</div>"}
    `;
  } else {
    root.innerHTML = `
      <button class="close">×</button>
      <h3>${indicatorLabels[key]}明细</h3>
      ${state.indicatorBreakdowns[key].map((item) => `<div>${item.label}: ${signedAmount(item.amount)}</div>`).join("")}
    `;
  }

  root.querySelector(".close").addEventListener("click", () => {
    root.classList.add("hidden");
    if (onClose) onClose();
  });
  bindTradeBox(root, controller);
}

function bindTradeBox(root, controller) {
  const box = root.querySelector(".trade-box");
  if (!box) return;
  const input = box.querySelector(".trade-amount");
  const estimate = box.querySelector(".trade-estimate");
  const resourceKey = box.dataset.resource;
  const buyUnit = Number(box.dataset.buyUnit || 0);
  const sellUnit = Number(box.dataset.sellUnit || 0);
  const stock = Number(box.dataset.stock || 0);
  const room = Number(box.dataset.room || 0);

  const readAmount = () => Math.max(1, Math.floor(Number(input.value || 0)));
  const update = () => {
    const requested = readAmount();
    const buyAmount = Math.min(requested, room);
    const sellAmount = Math.min(requested, stock);
    estimate.innerHTML = `
      <div>买入：${buyAmount}，需 ${buyAmount * buyUnit} 钱${buyAmount < requested ? "（仓容不足）" : ""}</div>
      <div>卖出：${sellAmount}，得 ${sellAmount * sellUnit} 钱${sellAmount < requested ? "（库存不足）" : ""}</div>
    `;
  };
  input?.addEventListener("input", update);
  update();
  for (const button of box.querySelectorAll("[data-trade-action]")) {
    button.addEventListener("click", () => {
      const amount = readAmount();
      if (button.dataset.tradeAction === "buy") controller?.buyResource(resourceKey, amount);
      else controller?.sellResource(resourceKey, amount);
    });
  }
}

export function renderBuildingPanel(state, controller) {
  const root = document.querySelector("#breakdown-panel");
  const building = state.buildings.find((item) => item.id === state.selectedBuildingId);
  if (!building) return;

  const def = getBuildingDef(state, building.type);
  const quote = getUpgradeQuote(state, building);
  // Demolition refund is now flat 25% of base cost (no level multiplier).
  const refund = Math.floor(def.cost * 0.25);
  const isRoad = building.type === "road" || building.type === "bridge";
  const upgrading = !!building.upgradePending;
  const statusText = upgrading
    ? `升级至 ${building.upgradePending.targetLabel || `${building.upgradePending.targetLevel} 级`}，还需 ${building.upgradePending.seasonsRemaining} 月`
    : building.status === "complete"
      ? (building.connected || isRoad ? "已接道路，正在生效" : "未接道路，暂时无效")
      : `施工中，还需 ${building.seasonsRemaining} 月`;
  const radiusText = def.radius ? `<div>服务半径：${serviceRadius(def, building)}</div>` : "";
  const wellText = building.type === "well" && (building.dryMonthsRemaining || 0) > 0
    ? `<div class="bad-text">枯井：还需 ${building.dryMonthsRemaining} 月恢复</div>`
    : "";
  const granaryText = building.type === "granary"
    ? `<div>新增仓容：${granaryCapacity(building.level || 1)}</div>`
    : "";
  const warehouseText = building.type === "warehouse"
    ? `<div>木材上限：+${warehouseWoodCapacity(building.level || 1)}</div><div>布上限：+${warehouseClothCapacity(building.level || 1)}</div>`
    : "";
  const tradeText = building.type === "tradeStation"
    ? `<div>解锁贸易路线：粮食、木材、布买卖。</div>`
    : "";
  const farmText = building.type === "farm"
    ? `<div>农时：${farmSeasonInfo(state.monthIndex).label}</div>`
    : "";
  const housingInfo = HOUSING_TIERS[building.housingTier];
  const housingText = building.category === "housing" && housingInfo
    ? `<div>住房等级：${housingInfo.label}</div><div>人口：${building.residents}/${housingInfo.maxResidents}</div>`
    : "";

  // Compose the upgrade / cancel button.
  let actionButton;
  if (upgrading) {
    actionButton = `<button id="cancel-upgrade">中止升级（全额退款）</button>`;
  } else if (!quote.ok) {
    actionButton = `<button disabled>不能升级：${quote.reason}</button>`;
  } else {
    const woodLabel = quote.woodCost > 0 ? ` · ${quote.woodCost} 木` : "";
    const clothLabel = quote.clothCost > 0 ? ` · ${quote.clothCost} 布` : "";
    actionButton = `<button id="upgrade-building">升级（${quote.coinCost} 钱${woodLabel}${clothLabel} · ${quote.seasons} 月工期）</button>`;
  }

  root.classList.remove("hidden");
  root.innerHTML = `
    <button class="close">×</button>
    <h3>${def.name} Lv.${building.level || 1}</h3>
    <p>${def.description}</p>
    <div>状态：${statusText}</div>
    <div>占用人口：${def.labor * (building.level || 1)}${upgrading && building.upgradePending.targetLevel ? `（升级期间按 ${building.upgradePending.targetLevel} 级占人）` : ""}</div>
    ${radiusText}
    ${wellText}
    ${granaryText}
    ${warehouseText}
    ${tradeText}
    ${farmText}
    ${housingText}
    <div class="panel-actions">
      ${actionButton}
      <button id="demolish-building">拆除（返还 ${refund} 钱）</button>
    </div>
  `;

  root.querySelector(".close").addEventListener("click", () => {
    state.selectedBuildingId = null;
    root.classList.add("hidden");
  });
  const upgradeBtn = root.querySelector("#upgrade-building");
  if (upgradeBtn) upgradeBtn.addEventListener("click", () => controller.upgradeSelectedBuilding());
  const cancelBtn = root.querySelector("#cancel-upgrade");
  if (cancelBtn) cancelBtn.addEventListener("click", () => controller.cancelSelectedUpgrade());
  root.querySelector("#demolish-building").addEventListener("click", () => controller.demolishSelectedBuilding());
}

export function renderEvaluation(state, controller) {
  const root = document.querySelector("#evaluation-modal");
  // M6: 主菜单覆盖在评定之上时，先把评定层隐藏，避免主菜单背后还闪着旧的卡片。
  const visible = !!state.evaluation && !state.mainMenuOpen;
  root.classList.toggle("hidden", !visible);
  if (!visible) return;
  const e = state.evaluation;

  root.innerHTML = `
    <div class="modal-card">
      <h1>气数已尽</h1>
      <p class="end-title"><strong>${e.title}</strong> · 在任 <strong>${e.months}</strong> 月（约 ${(e.months / 12).toFixed(1)} 年）</p>
      <p class="end-blurb">${e.blurb}</p>
      <div class="end-stats">
        <div><span>地图</span><strong>${e.archetypeLabel}</strong></div>
        <div><span>人口</span><strong>${e.population}</strong></div>
        <div><span>民心</span><strong>${e.indicators.morale}</strong></div>
        <div><span>治安</span><strong>${e.indicators.order}</strong></div>
        <div><span>声望</span><strong>${e.indicators.prestige}</strong></div>
      </div>
      <p class="end-blurb muted">本任期已写入名望册。</p>
      <button id="back-to-main-menu">返回主菜单</button>
    </div>
  `;
  root.querySelector("#back-to-main-menu").addEventListener("click", () => controller.returnToMainMenu());
}

function drawMapPreview(canvas, map) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cellW = w / MAP_WIDTH;
  const cellH = h / MAP_HEIGHT;
  ctx.clearRect(0, 0, w, h);
  for (const tile of map.tiles) {
    ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#777";
    ctx.fillRect(tile.x * cellW, tile.y * cellH, cellW + 1, cellH + 1);
  }
  ctx.strokeStyle = "rgba(255, 232, 180, 0.75)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

export function renderMapPickerModal(state, controller) {
  const root = document.querySelector("#map-picker-modal");
  if (!root) return;
  root.classList.toggle("hidden", !state.mapPickerOpen);
  if (!state.mapPickerOpen) return;
  const fromMenu = !!state.mainMenuOpen;
  const previewSeed = (state.seed || 100) + 1;
  // M6: when invoked from the main menu the close button returns to the menu;
  // when invoked in-game (via the date pill) it just dismisses the picker.
  // Map selection always routes through startNewTermFromMenu so the autosave
  // is dropped and the next 「继续」 won't bring back the abandoned term.
  const headlineCopy = fromMenu
    ? "选一张地图开启新任期。"
    : "选择后会开启新任期，当前地图上的建筑与资源会重置。";
  root.innerHTML = `
    <div class="modal-card map-picker-card">
      <div class="map-picker-head">
        <div>
          <h1>选择地图</h1>
          <p>${headlineCopy}</p>
        </div>
        <button id="close-map-picker">${fromMenu ? "返回主菜单" : "关闭"}</button>
      </div>
      <div class="map-choice-grid">
        ${SELECTABLE_MAPS.map((item) => `
          <button class="map-choice ${state.archetype === item.id ? "selected" : ""}" data-map="${item.id}">
            <canvas width="180" height="180" data-preview="${item.id}"></canvas>
            <strong>${item.title}</strong>
            <span>${item.description}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  for (const item of SELECTABLE_MAPS) {
    const canvas = root.querySelector(`canvas[data-preview="${item.id}"]`);
    if (canvas) drawMapPreview(canvas, generateMap(previewSeed, item.id));
  }
  root.querySelector("#close-map-picker").addEventListener("click", () => {
    state.mapPickerOpen = false;
    if (fromMenu) controller.openMainMenu("main");
    else renderMapPickerModal(state, controller);
  });
  root.querySelectorAll(".map-choice").forEach((button) => {
    button.addEventListener("click", () => {
      controller.startNewTermFromMenu(button.dataset.map);
    });
  });
}

// ---------- M6 main menu ----------
//
// 主菜单是进入游戏的第一屏。占满整张画面，盖住下面的（占位）地图与所有面板。
// 三个子视图：home / hall / about，由 state.mainMenuView 切换。
const ABOUT_BLURB = "郡国  一款完全由 AI 开发，挑战在任时长的回合制治理游戏";

export function renderMainMenuModal(state, controller, options = {}) {
  const root = document.querySelector("#main-menu-modal");
  if (!root) return;
  // Hide the menu while the map picker is layered on top so they don't fight
  // for the same screen real estate. The picker's close button calls back
  // into openMainMenu("main"), which restores the menu.
  if (!state.mainMenuOpen || state.mapPickerOpen) {
    root.classList.add("hidden");
    root.innerHTML = "";
    return;
  }
  root.classList.remove("hidden");
  const view = state.mainMenuView || "main";
  if (view === "hall") return renderMainMenuHall(root, controller);
  if (view === "about") return renderMainMenuAbout(root, controller);
  return renderMainMenuHome(root, state, controller, options);
}

function renderMainMenuHome(root, state, controller, options) {
  const canContinue = !!options.hasAutosave;
  root.innerHTML = `
    <div class="modal-card main-menu-card">
      <div class="main-menu-brand">
        <span class="main-menu-seal">郡</span>
        <h1 class="main-menu-title">郡国</h1>
      </div>
      <p class="main-menu-sub">${ABOUT_BLURB}</p>
      <div class="main-menu-buttons">
        <button data-action="new" class="primary">开始新任期</button>
        <button data-action="continue" ${canContinue ? "" : "disabled"}>${canContinue ? "继续上次任期" : "继续（无存档）"}</button>
        <button data-action="hall">名望册</button>
        <button data-action="about">关于</button>
      </div>
      <p class="main-menu-foot">挑战目标：在气数耗尽前，担任郡守尽可能多的月数。</p>
    </div>
  `;
  root.querySelector('[data-action="new"]').addEventListener("click", () => {
    state.mapPickerOpen = true;
    controller.render?.();
  });
  if (canContinue) {
    root.querySelector('[data-action="continue"]').addEventListener("click", () => controller.continueAutosave());
  }
  root.querySelector('[data-action="hall"]').addEventListener("click", () => controller.setMainMenuView("hall"));
  root.querySelector('[data-action="about"]').addEventListener("click", () => controller.setMainMenuView("about"));
}

function renderMainMenuAbout(root, controller) {
  root.innerHTML = `
    <div class="modal-card main-menu-card">
      <h1 class="main-menu-title">关于</h1>
      <p class="main-menu-sub">${ABOUT_BLURB}</p>
      <p class="muted">所有美术、3D 模型、地图与代码均由 AI 程序化生成；不依赖外部美术资产。</p>
      <div class="main-menu-buttons">
        <button data-action="back" class="primary">返回</button>
      </div>
    </div>
  `;
  root.querySelector('[data-action="back"]').addEventListener("click", () => controller.setMainMenuView("main"));
}

function renderMainMenuHall(root, controller) {
  const entries = readHallOfFame();
  // Stored entries are already sorted by months desc when written.
  const rowsHtml = entries.length === 0
    ? `<p class="muted hall-empty">尚无任期记录。在任期结束（气数归零）后会自动入册。</p>`
    : `<div class="hall-list">${entries.map((entry, idx) => renderHallEntry(entry, idx)).join("")}</div>`;
  root.innerHTML = `
    <div class="modal-card main-menu-card hall-card">
      <div class="main-menu-head">
        <h1 class="main-menu-title">名望册</h1>
        <button data-action="back">返回</button>
      </div>
      <p class="muted">最长在任的 ${entries.length} 任记录。最多保留 50 条，本机本地保存。</p>
      ${rowsHtml}
    </div>
  `;
  root.querySelector('[data-action="back"]').addEventListener("click", () => controller.setMainMenuView("main"));
}

function renderHallEntry(entry, idx) {
  const months = entry.months ?? 0;
  const yearsText = `${(months / 12).toFixed(1)} 年`;
  const indicators = entry.indicators || {};
  const events = (entry.topEvents || []).slice(0, 3);
  const dateText = entry.endedAt ? new Date(entry.endedAt).toLocaleDateString() : "";
  return `
    <div class="hall-row">
      <div class="hall-row-head">
        <span class="hall-rank">#${idx + 1}</span>
        <strong class="hall-title">${entry.title || "—"}</strong>
        <span class="hall-archetype">${entry.archetypeLabel || ""}</span>
        <span class="hall-months">${months} 月 · ${yearsText}</span>
        <span class="hall-date muted">${dateText}</span>
      </div>
      <div class="hall-stats">
        <span>人口 ${entry.population ?? 0}</span>
        <span>民心 ${indicators.morale ?? "—"}</span>
        <span>治安 ${indicators.order ?? "—"}</span>
        <span>声望 ${indicators.prestige ?? "—"}</span>
        <span>残余气数 ${entry.qishuFinal ?? 0}</span>
      </div>
      ${events.length ? `<div class="hall-events">
        ${events.map((e) => `<div>第${e.year}年 ${e.month}：${e.message}</div>`).join("")}
      </div>` : ""}
    </div>
  `;
}
