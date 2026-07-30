const fs = require("node:fs"); const path = require("node:path");
const pipeline = fs.readFileSync(path.join(__dirname, "PipelineOrchestrator.ts"), "utf8");
if (pipeline.includes("UnifiedLocalRestorationProvider")) throw new Error("legacy unified provider is selectable");
if (!pipeline.includes("restorationReplayMode")) throw new Error("replay guard missing");
console.log("pipeline safety tests passed");
