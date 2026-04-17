import { Router, Request, Response } from "express";
import { config, isProjectReady } from "../config.js";

const router = Router();

// GET /api/config — return non-sensitive config
router.get("/", (_req: Request, res: Response) => {
  res.json({
    projectReady: isProjectReady(),
    aemProject: config.aemProject,
    aemInstance: {
      authorUrl: config.aemInstance.authorUrl,
    },
    ai: {
      provider: config.ai.provider,
      model: config.ai.model,
    },
    build: config.build,
  });
});

export default router;
