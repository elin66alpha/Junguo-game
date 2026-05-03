import { GameApp } from "./app/GameApp.js";

function readUrlFlags() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return { debug: params.get("debug") === "1" };
  } catch {
    return { debug: false };
  }
}

async function main() {
  const response = await fetch("./src/data/buildings.json");
  const buildingDefs = await response.json();
  const flags = readUrlFlags();
  const app = new GameApp(buildingDefs, { debug: flags.debug });
  app.render();
}

main();
