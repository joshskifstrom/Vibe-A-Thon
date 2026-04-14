import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getHappyPathScript }     from "./scenarios/happyPath.mjs";
import { getWarmHandoffScript }   from "./scenarios/warmHandoff.mjs";
import { getIntelligentFlowScript } from "./scenarios/intelligentFlow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = 3000;

app.use(express.json());

// ── In-memory stats — defined BEFORE static so routes take priority ──────────
const stats = { deflected: 0, handoffs: 0 };

app.get("/stats", (_req, res) => res.json(stats));

// ── SSE helper ────────────────────────────────────────────────────────────────
function sseStream(res, script) {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const send = (data) => !res.writableEnded && res.write(`data: ${JSON.stringify(data)}\n\n`);

  const timers = script.map(([delay, data]) => setTimeout(() => send(data), delay));

  const lastDelay = script[script.length - 1][0];
  const closeTimer = setTimeout(() => { if (!res.writableEnded) res.end(); }, lastDelay + 1000);

  res.on("close", () => {
    timers.forEach(clearTimeout);
    clearTimeout(closeTimer);
  });
}

// ── Demo stream endpoint ──────────────────────────────────────────────────────
app.get("/demo/stream", (req, res) => {
  const scenario = req.query.scenario || "happy";

  if (scenario === "handoff") {
    sseStream(res, getWarmHandoffScript());
  } else if (scenario === "intelligence") {
    sseStream(res, getIntelligentFlowScript());
  } else {
    sseStream(res, getHappyPathScript());
  }
});

// ── Stat increment (called by frontend on completion) ────────────────────────
app.post("/stats/deflected", (_req, res) => { stats.deflected++; res.json(stats); });
app.post("/stats/handoff",   (_req, res) => { stats.handoffs++;  res.json(stats); });

// Static files last so API routes take priority
app.use(express.static(join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`\n  Intuit IVR Demo  →  http://localhost:${PORT}\n`);
});
