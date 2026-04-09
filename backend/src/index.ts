import express from "express";
import cors from "cors";
import { config } from "./config.js";
import chatRouter from "./routes/chat.js";
import buildRouter from "./routes/build.js";
import filesRouter from "./routes/files.js";
import logsRouter from "./routes/logs.js";
import aemRouter from "./routes/aem.js";
import configRouter from "./routes/configRoute.js";
import projectRouter from "./routes/project.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/chat", chatRouter);
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
