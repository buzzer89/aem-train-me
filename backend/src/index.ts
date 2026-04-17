import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "./config.js";
import chatRouter from "./routes/chat.js";
import buildRouter from "./routes/build.js";
import filesRouter from "./routes/files.js";
import logsRouter from "./routes/logs.js";
import aemRouter from "./routes/aem.js";
import configRouter from "./routes/configRoute.js";
import projectRouter from "./routes/project.js";

// ── Simple in-memory rate limiter for AI endpoints ───────────────────────
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_REQUESTS = 30;  // max requests per window
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests — please slow down" });
    return;
  }
  next();
}

// Periodically clean up expired rate limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, RATE_WINDOW_MS);

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// Routes — rate limit AI-calling endpoints
app.use("/api/chat", rateLimiter, chatRouter);
app.use("/api/build", buildRouter);
app.use("/api/files", filesRouter);
app.use("/api/logs", logsRouter);
app.use("/api/aem", aemRouter);
app.use("/api/config", configRouter);
app.use("/api/project", projectRouter);

// Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

app.listen(config.port, () => {
  console.log(`\n  ┌──────────────────────────────────────┐`);
  console.log(`  │      AEM Train Me — Backend          │`);
  console.log(`  │      http://localhost:${config.port}           │`);
  console.log(`  │      AEM Project: ${config.aemProject.path.slice(0, 18)}...  │`);
  console.log(`  └──────────────────────────────────────┘\n`);
});
