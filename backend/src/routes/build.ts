import { Router, Request, Response } from "express";
import { buildEngine } from "../services/build-engine.js";
import { runPostDeployValidation } from "../services/aem-client.js";

const router = Router();

// POST /api/build — trigger a build
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

  // SSE stream
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const onOutput = (text: string) => {
    res.write(`data: ${JSON.stringify({ type: "output", text })}\n\n`);
  };

  const onComplete = async (result: { success: boolean; duration: number }) => {
    res.write(
      `data: ${JSON.stringify({ type: "build_complete", success: result.success, duration: result.duration })}\n\n`
    );

    // Auto-validate after deploy
    if (deploy && result.success) {
      res.write(`data: ${JSON.stringify({ type: "output", text: "\n--- Post-Deploy Validation ---\n" })}\n\n`);
      const validations = await runPostDeployValidation();
      for (const v of validations) {
        const icon = v.passed ? "✓" : "✗";
        res.write(
          `data: ${JSON.stringify({ type: "validation", check: v.check, passed: v.passed, detail: `${icon} ${v.check}: ${v.detail}` })}\n\n`
        );
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    cleanup();
    res.end();
  };

  const onError = (msg: string) => {
    res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
  };

  buildEngine.on("output", onOutput);
  buildEngine.on("complete", onComplete);
  buildEngine.on("error", onError);

  const cleanup = () => {
    buildEngine.off("output", onOutput);
    buildEngine.off("complete", onComplete);
    buildEngine.off("error", onError);
  };

  buildEngine.runBuild(deploy, modules).catch((err) => {
    res.write(`data: ${JSON.stringify({ type: "error", error: (err as Error).message })}\n\n`);
    cleanup();
    res.end();
  });
});

// POST /api/build/validate — manual validation
router.post("/validate", async (_req: Request, res: Response) => {
  const results = await runPostDeployValidation();
  res.json(results);
});

export default router;
