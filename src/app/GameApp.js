import { Renderer } from "./Renderer.js";
import { Minimap } from "./Minimap.js";
import { TurnController } from "./TurnController.js";
import { addEvent, createGameState } from "../sim/GameState.js";
import { initializeSeasonState } from "../sim/SeasonSystem.js";
import {
  buildingAt, buildingFootprintTiles, demolishBuilding, getBulkUpgradeQuote,
  getBuildingDef, placeBuildingBatch, upgradeBuildingBatch
} from "../sim/BuildingSystem.js";
import { recomputeRoadAccess } from "../sim/RoadSystem.js";
import { MAP_HEIGHT, MAP_WIDTH } from "../model/constants.js";
import {
  renderBreakdown, renderBuildBar, renderBuildingPanel, renderDebugPanel,
  renderEdictPanel, renderEvaluation, renderEventLog, renderEventModal,
  renderMainMenuModal, renderMandatePanel, renderMapPickerModal,
  renderMilestoneToast, renderNeighborPanel, renderTopBar
} from "../ui/renderUi.js";
import { hasAutosave } from "../sim/SaveSystem.js";

const DEMOLISH_GHOST = "__demolish__";
const UPGRADE_GHOST = "__upgrade__";
// Low-power devices target 30 fps; everyone else gets full display rate (rAF
// is naturally vsync-locked, typically 60 fps). The previous build kept a
// 100 ms throttle inside the rAF loop, which left the camera/orbit feeling
// like 10 fps even on capable hardware — that's the "卡顿" the player saw.
const LOW_POWER_MIN_FRAME_MS = 1000 / 30;
const RIGHT_CLICK_DRAG_THRESHOLD_PX = 5;
const KEY_PAN_PIXELS = 28;

export class GameApp {
  constructor(buildingDefs, options = {}) {
    this.debugEnabled = !!options.debug;
    this.state = createGameState(buildingDefs);
    this.state.debugEnabled = this.debugEnabled;
    // M6: every session boots into the main menu; the underlying default state
    // is just a placeholder so the renderer has something to attach to.
    this.state.mainMenuOpen = true;
    this.state.mainMenuView = "main";
    this.canvas = document.querySelector("#map-canvas");
    this.renderer = new Renderer(
      this.state,
      this.canvas,
      document.querySelector("#tile-tooltip"),
      document.querySelector("#terrain-legend")
    );
    this.minimap = new Minimap(document.querySelector("#minimap"));
    this.minimap.bindClick(document.querySelector("#minimap"), (tx, ty) => {
      if (this.state.mainMenuOpen) return;
      this.renderer.centerOn(tx, ty);
      this.minimapDirty = true;
    });
    this.breakdown = { type: null, key: null };
    this.dragStart = null;
    this.dragging = false;
    this.demolishedDuringDrag = new Set();
    this.rightClick = { down: false, x: 0, y: 0, moved: false };
    this.controller = new TurnController(this.state, () => this.render());
    this.controller.onStateReplaced = () => this.resetAfterStateReplace();
    initializeSeasonState(this.state);
    this.bindEvents();
    this.startAnimationLoop();
  }

  startAnimationLoop() {
    // Run at full display rate (typically 60 fps via rAF/vsync). Low-power
    // devices fall back to 30 fps. Animations inside the renderer are now
    // delta-time driven so they look correct regardless of frame rate.
    const lowPower = !!this.renderer.quality?.lowPower;
    const minFrameMs = lowPower ? LOW_POWER_MIN_FRAME_MS : 0;
    let lastFrameTime = performance.now();
    let lastRenderTime = lastFrameTime;
    this.minimapDirty = true;  // start dirty to force first paint

    // FPS overlay — updated 4× / sec via a 0.5 s rolling window so it's stable
    // enough to read while still reflecting recent stutters.
    const fpsEl = document.querySelector("#fps-overlay");
    let fpsWindowStart = lastFrameTime;
    let fpsWindowFrames = 0;

    const loop = (now) => {
      requestAnimationFrame(loop);
      if (minFrameMs > 0 && now - lastRenderTime < minFrameMs) return;
      const dtSec = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      lastRenderTime = now;

      this.renderer.tick(dtSec);
      if (this.minimapDirty) {
        this.minimap.draw(this.state, this.renderer);
        this.minimapDirty = false;
      }

      fpsWindowFrames += 1;
      const windowMs = now - fpsWindowStart;
      if (fpsEl && windowMs >= 500) {
        const fps = (fpsWindowFrames * 1000) / windowMs;
        fpsEl.textContent = `FPS ${fps.toFixed(0)}`;
        fpsWindowStart = now;
        fpsWindowFrames = 0;
      }
    };
    requestAnimationFrame(loop);
  }

  bindEvents() {
    document.querySelector("#mandate-panel").addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest(".utility-panel-buttons button[data-panel]");
      if (!button || button.disabled || this.state.pendingEvent) return;
      this.state.utilityPanel = button.dataset.panel;
      this.render();
    });

    window.addEventListener("keydown", (event) => {
      if (this.state.pendingEvent || this.state.mainMenuOpen) return;
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        this.controller.nextSeason();
      }
      if (event.key === "Escape") this.cancelActiveTool();
      // Pan camera in world space; the renderer turns these px deltas into world units.
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") this.renderer.pan(-KEY_PAN_PIXELS, 0);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") this.renderer.pan(KEY_PAN_PIXELS, 0);
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") this.renderer.pan(0, -KEY_PAN_PIXELS);
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") this.renderer.pan(0, KEY_PAN_PIXELS);
    });

    this.canvas.addEventListener("mousemove", (event) => {
      if (this.state.mainMenuOpen) return;
      if (this.rightClick.down) {
        const dx = event.clientX - this.rightClick.x;
        const dy = event.clientY - this.rightClick.y;
        if (Math.hypot(dx, dy) > RIGHT_CLICK_DRAG_THRESHOLD_PX) this.rightClick.moved = true;
      }

      const previousHover = this.state.hoverTile;
      const tile = this.renderer.screenToTile(event.clientX, event.clientY);
      this.state.hoverTile = this.inBounds(tile) ? tile : null;

      let needsDraw = !this.sameTile(previousHover, this.state.hoverTile);
      if (this.state.demolishMode) {
        if (this.dragging && this.state.hoverTile) this.tryDemolishAt(this.state.hoverTile);
        this.state.dragPreviewTiles = this.state.hoverTile
          ? [{ type: DEMOLISH_GHOST, x: this.state.hoverTile.x, y: this.state.hoverTile.y }]
          : [];
        needsDraw = true;
      } else if (this.state.upgradeMode) {
        if (this.dragging && this.dragStart && this.state.hoverTile) {
          this.state.dragPreviewTiles = this.makeUpgradePreview(this.dragStart, this.state.hoverTile);
        } else {
          this.state.dragPreviewTiles = this.state.hoverTile
            ? this.makeUpgradePreview(this.state.hoverTile, this.state.hoverTile)
            : [];
        }
        needsDraw = true;
      } else if (this.dragging && this.dragStart && this.state.selectedBuildingType && this.state.hoverTile) {
        this.state.dragPreviewTiles = this.makePlacements(this.dragStart, this.state.hoverTile, this.state.selectedBuildingType);
        needsDraw = true;
      }

      if (needsDraw) this.renderer.draw();
      this.renderer.showTooltip(event.clientX, event.clientY);
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.state.hoverTile = null;
      this.state.dragPreviewTiles = [];
      this.dragStart = null;
      this.dragging = false;
      this.demolishedDuringDrag.clear();
      this.renderer.tooltip.classList.add("hidden");
      this.renderer.draw();
    });

    this.canvas.addEventListener("mousedown", (event) => {
      if (this.state.pendingEvent || this.state.mainMenuOpen) return;
      this.closeUtilityPanel();

      if (event.button === 2) {
        this.rightClick.down = true;
        this.rightClick.x = event.clientX;
        this.rightClick.y = event.clientY;
        this.rightClick.moved = false;
        return;  // OrbitControls will handle rotation if the user actually drags
      }

      if (event.button !== 0) return;
      const tile = this.renderer.screenToTile(event.clientX, event.clientY);
      if (!this.inBounds(tile)) return;

      if (this.state.demolishMode) {
        this.dragStart = tile;
        this.dragging = true;
        this.demolishedDuringDrag.clear();
        this.tryDemolishAt(tile);
        this.state.dragPreviewTiles = [{ type: DEMOLISH_GHOST, x: tile.x, y: tile.y }];
        this.renderer.draw();
        return;
      }

      if (this.state.upgradeMode) {
        this.dragStart = tile;
        this.dragging = true;
        this.state.dragPreviewTiles = this.makeUpgradePreview(tile, tile);
        this.renderer.draw();
        return;
      }

      if (this.state.selectedBuildingType) {
        this.dragStart = tile;
        this.dragging = true;
        this.state.dragPreviewTiles = this.makePlacements(tile, tile, this.state.selectedBuildingType);
        this.renderer.draw();
        return;
      }

      // Plain left-click on the map with no tool: select the building under the cursor.
      const building = buildingAt(this.state, tile.x, tile.y);
      this.state.selectedBuildingId = building?.id || null;
      this.render();
    });

    this.canvas.addEventListener("mouseup", (event) => {
      if (event.button === 2) {
        const wasClick = this.rightClick.down && !this.rightClick.moved;
        this.rightClick.down = false;
        if (wasClick) this.handleRightClickWithoutDrag(event);
        return;
      }

      if (event.button !== 0 || !this.dragging) return;

      if (this.state.demolishMode) {
        recomputeRoadAccess(this.state);
        this.dragStart = null;
        this.dragging = false;
        this.demolishedDuringDrag.clear();
        this.state.dragPreviewTiles = this.state.hoverTile
          ? [{ type: DEMOLISH_GHOST, x: this.state.hoverTile.x, y: this.state.hoverTile.y }]
          : [];
        this.render();
        return;
      }

      if (this.state.upgradeMode) {
        const tile = this.renderer.screenToTile(event.clientX, event.clientY);
        const end = this.inBounds(tile) ? tile : this.dragStart;
        this.confirmBulkUpgrade(this.dragStart, end);
        this.dragStart = null;
        this.dragging = false;
        this.state.dragPreviewTiles = this.state.hoverTile
          ? this.makeUpgradePreview(this.state.hoverTile, this.state.hoverTile)
          : [];
        this.render();
        return;
      }

      if (!this.dragStart || !this.state.selectedBuildingType) return;
      const tile = this.renderer.screenToTile(event.clientX, event.clientY);
      const end = this.inBounds(tile) ? tile : this.dragStart;
      const placements = this.makePlacements(this.dragStart, end, this.state.selectedBuildingType);
      placeBuildingBatch(this.state, placements);
      recomputeRoadAccess(this.state);
      this.state.dragPreviewTiles = [];
      this.dragStart = null;
      this.dragging = false;
      this.render();
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    // Block scrolling the page when the user pans/zooms with the wheel over the map.
    this.canvas.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
  }

  handleRightClickWithoutDrag(event) {
    if (this.state.selectedBuildingType || this.state.demolishMode || this.state.upgradeMode || this.dragging) {
      this.cancelActiveTool(true);
      return;
    }
    // No active tool: clear breakdown / building selection.
    if (this.state.selectedBuildingId) {
      this.state.selectedBuildingId = null;
      this.render();
      return;
    }
    if (this.breakdown.key) {
      this.breakdown = { type: null, key: null };
      this.render();
    }
  }

  cancelActiveTool(showEvent = false) {
    const hadTool = this.state.selectedBuildingType || this.state.demolishMode || this.state.upgradeMode || this.dragging;
    this.state.selectedBuildingType = null;
    this.state.demolishMode = false;
    this.state.upgradeMode = false;
    this.state.dragPreviewTiles = [];
    this.state.selectedBuildingId = null;
    this.dragStart = null;
    this.dragging = false;
    this.demolishedDuringDrag.clear();
    if (showEvent && hadTool) addEvent(this.state, "已取消当前工具。");
    this.render();
  }

  tryDemolishAt(tile) {
    const building = buildingAt(this.state, tile.x, tile.y);
    if (!building || this.demolishedDuringDrag.has(building.id)) return false;
    this.demolishedDuringDrag.add(building.id);
    const demolished = demolishBuilding(this.state, building.id);
    if (demolished) {
      recomputeRoadAccess(this.state);
      this.renderer.markBuildingsDirty();
    }
    return demolished;
  }

  inBounds(tile) {
    return tile && tile.x >= 0 && tile.y >= 0 && tile.x < MAP_WIDTH && tile.y < MAP_HEIGHT;
  }

  sameTile(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y;
  }

  makePlacements(start, end, type) {
    const def = getBuildingDef(this.state, type);
    if (!def) return [];
    if (type === "road" || type === "bridge") return this.makeLinePlacements(start, end, type);
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const placements = [];
    for (let y = minY; y <= maxY; y += def.footprint.h) {
      for (let x = minX; x <= maxX; x += def.footprint.w) {
        placements.push({ type, x, y });
      }
    }
    return placements.slice(0, 80);
  }

  makeLinePlacements(start, end, type) {
    const placements = [];
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    if (horizontal) {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      for (let x = minX; x <= maxX; x += 1) placements.push({ type, x, y: start.y });
    } else {
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      for (let y = minY; y <= maxY; y += 1) placements.push({ type, x: start.x, y });
    }
    return placements.slice(0, 120);
  }

  rectBounds(start, end) {
    return {
      minX: Math.min(start.x, end.x),
      maxX: Math.max(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxY: Math.max(start.y, end.y)
    };
  }

  buildingsInRect(start, end) {
    const rect = this.rectBounds(start, end);
    return this.state.buildings.filter((building) => {
      const def = getBuildingDef(this.state, building.type);
      if (!def) return false;
      const maxX = building.x + def.footprint.w - 1;
      const maxY = building.y + def.footprint.h - 1;
      return building.x <= rect.maxX && maxX >= rect.minX && building.y <= rect.maxY && maxY >= rect.minY;
    });
  }

  makeUpgradePreview(start, end) {
    const buildings = this.buildingsInRect(start, end);
    const quote = getBulkUpgradeQuote(this.state, buildings);
    const eligible = new Set(quote.eligible.map((item) => item.building.id));
    const previews = [];
    for (const building of buildings) {
      const tone = eligible.has(building.id) ? "good" : "bad";
      for (const tile of buildingFootprintTiles(this.state, building)) {
        previews.push({ type: UPGRADE_GHOST, tone, x: tile.x, y: tile.y });
      }
    }
    return previews;
  }

  confirmBulkUpgrade(start, end) {
    const buildings = this.buildingsInRect(start, end);
    const quote = getBulkUpgradeQuote(this.state, buildings);
    if (quote.eligible.length <= 0) {
      if (buildings.length > 0) {
        addEvent(this.state, `框选范围内 ${buildings.length} 处建筑均不可升级。`, "warn");
      }
      return;
    }
    // M5a: no browser confirm — eligible are upgraded silently, ineligible are
    // simply skipped. The summary line tells the player what actually happened.
    upgradeBuildingBatch(this.state, quote.eligible.map((item) => item.building.id));
    if (quote.rejected.length > 0) {
      addEvent(this.state, `框选升级跳过 ${quote.rejected.length} 处不可升级建筑。`);
    }
    recomputeRoadAccess(this.state);
  }

  render() {
    document.body.classList.toggle("event-open", !!this.state.pendingEvent);
    this.canvas.classList.toggle("demolish-cursor", this.state.demolishMode);
    this.canvas.classList.toggle("upgrade-cursor", this.state.upgradeMode);
    renderTopBar(this.state, this.controller, (type, key) => {
      this.state.selectedBuildingId = null;
      this.breakdown = { type, key };
      renderBreakdown(this.state, type, key, this.controller, () => {
        this.breakdown = { type: null, key: null };
      });
    }, () => {
      if (this.state.pendingEvent) return;
      this.state.mapPickerOpen = true;
      this.render();
    });
    renderBuildBar(
      this.state,
      (id) => {
        this.state.demolishMode = false;
        this.state.upgradeMode = false;
        this.state.selectedBuildingType = this.state.selectedBuildingType === id ? null : id;
        this.state.selectedBuildingId = null;
        this.state.dragPreviewTiles = [];
        this.breakdown = { type: null, key: null };
        this.render();
      },
      () => {
        this.state.selectedBuildingType = null;
        this.state.selectedBuildingId = null;
        this.state.upgradeMode = false;
        this.state.demolishMode = !this.state.demolishMode;
        this.state.dragPreviewTiles = [];
        this.breakdown = { type: null, key: null };
        this.render();
      },
      () => {
        this.state.selectedBuildingType = null;
        this.state.selectedBuildingId = null;
        this.state.demolishMode = false;
        this.state.upgradeMode = !this.state.upgradeMode;
        this.state.dragPreviewTiles = [];
        this.breakdown = { type: null, key: null };
        this.render();
      },
      (categoryId) => {
        // Toggle the open category. Closing the open one clears any pending
        // building selection so the player isn't building "blind" with the
        // drawer hidden.
        if (this.state.openBuildCategory === categoryId) {
          this.state.openBuildCategory = null;
          this.state.selectedBuildingType = null;
          this.state.dragPreviewTiles = [];
        } else {
          this.state.openBuildCategory = categoryId;
        }
        this.render();
      }
    );
    renderMandatePanel(this.state, this.controller);
    renderEdictPanel(this.state, (slot, optionId) => this.controller.setEdict(slot, optionId));
    renderEventLog(this.state);
    renderNeighborPanel(this.state, this.controller);
    renderDebugPanel(this.state, this.controller);
    if (this.state.selectedBuildingId) renderBuildingPanel(this.state, this.controller);
    else renderBreakdown(this.state, this.breakdown.type, this.breakdown.key, this.controller, () => {
      this.breakdown = { type: null, key: null };
    });
    renderEventModal(this.state, (choiceId) => this.controller.resolveEvent(choiceId));
    renderMapPickerModal(this.state, this.controller);
    renderMilestoneToast(this.state, () => this.controller.dismissMilestone());
    renderEvaluation(this.state, this.controller);
    renderMainMenuModal(this.state, this.controller, { hasAutosave: hasAutosave() });
    this.renderer.draw({ syncBuildings: true });
    this.minimapDirty = true;
  }

  closeUtilityPanel(shouldRender = true) {
    if (!this.state.utilityPanel) return;
    this.state.utilityPanel = null;
    if (shouldRender) this.render();
  }

  resetAfterStateReplace() {
    this.breakdown = { type: null, key: null };
    this.dragStart = null;
    this.dragging = false;
    this.demolishedDuringDrag.clear();
    this.rightClick = { down: false, x: 0, y: 0, moved: false };
    this.state.mapPickerOpen = false;
    this.renderer.resetForNewState();
    this.renderer.markBuildingsDirty();
  }
}
