import { Router, Request, Response } from "express";
import { tailErrorLog } from "../services/aem-client.js";

const router = Router();

// GET /api/logs — one-shot log fetch
router.get("/", async (req: Request, res: Response) => {
  const lines = Number.parseInt(req.query.lines as string) || 200;
  const logs = await tailErrorLog(lines);
  res.json({ logs });
});

// GET /api/logs/stream — SSE stream that polls error.log
router.get("/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Kick the stream so proxies flush headers immediately.
  res.write(": connected\n\n");
  // Some Node versions buffer until flushHeaders is called.
  if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as Response & { flushHeaders: () => void }).flushHeaders();
  }

  let lastLength = -1;
  let closed = false;

  const push = async () => {
    if (closed) return;
    const logs = await tailErrorLog(100);
    if (closed) return;
    if (logs.length !== lastLength) {
      lastLength = logs.length;
      res.write(`data: ${JSON.stringify({ logs })}\n\n`);
    }
  };

  // Fire immediately so the UI doesn't wait 3s for the first event.
  void push();
  const interval = setInterval(push, 3000);
  // Heartbeat keeps the connection alive through intermediaries.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

export default router;
