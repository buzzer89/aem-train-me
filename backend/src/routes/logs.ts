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
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let lastLength = 0;

  const interval = setInterval(async () => {
    const logs = await tailErrorLog(50);
    if (logs.length !== lastLength) {
      lastLength = logs.length;
      res.write(`data: ${JSON.stringify({ logs })}\n\n`);
    }
  }, 3000);

  req.on("close", () => clearInterval(interval));
});

export default router;
