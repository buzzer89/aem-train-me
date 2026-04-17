import { Router, Request, Response } from "express";
import { buildEngine } from "../services/build-engine.js";
import { runPostDeployValidation } from "../services/aem-client.js";

const router = Router();

// POST /api/build — trigger a build (SSE stream)
router.post("/", (req: Request, res: Response) => {
  const { type = "build-deploy", modules } = req.body as {
    type?: "build-only" | "build-deploy";
    modules?: string[];
  };

  if (buildEngine.isRunning) {
    res.status(409).json({ error: "A build is already in progress" });
    return;
  }

  const deploy = type === "build-deploy";

  // SSE stream — write headers and flush immediately
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(": stream opened\n\n");

  let ended = false;
  const safeEnd = () => {
    if (!ended) {
      ended = true;
      res.end();
    }
  };

  // Detect client disconnect via RESPONSE close (not req — req "close" fires
  // as soon as the POST body is consumed by express.json(), which is immediate)
  res.on("close", () => {
    if (!ended) ended = true;
  });

  buildEngine
    .runBuild(deploy, modules, {
      onOutput(text) {
        if (!ended) {
          res.write(`data: ${JSON.stringify({ type: "output", text })}\n\n`);
        }
      },
      async onComplete(result) {
        if (ended) return;
        res.write(
          `data: ${JSON.stringify({ type: "build_complete", success: result.success, duration: result.duration })}\n\n`
        );

        // Auto-validate after deploy
        if (deploy && result.success) {
          res.write(`data: ${JSON.stringify({ type: "output", text: "\n--- Post-Deploy Validation ---\n" })}\n\n`);
          try {
            const validations = await runPostDeployValidation();
            for (const v of validations) {
              const icon = v.passed ? "✓" : "✗";
              res.write(
                `data: ${JSON.stringify({ type: "validation", check: v.check, passed: v.passed, detail: `${icon} ${v.check}: ${v.detail}` })}\n\n`
              );
            }
          } catch {
            // validation failed, not critical
          }
        }

        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        safeEnd();
      },
      onError(msg) {
        if (!ended) {
          res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
        }
        safeEnd();
      },
    })
    .catch((err) => {
      if (!ended) {
        res.write(`data: ${JSON.stringify({ type: "error", error: (err as Error).message })}\n\n`);
      }
      safeEnd();
    });
});

// POST /api/build/validate — manual validation
router.post("/validate", async (_req: Request, res: Response) => {
  const results = await runPostDeployValidation();
  res.json(results);
});

export default router;
