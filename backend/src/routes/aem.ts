import { Router, Request, Response } from "express";
import { getAllBundles, healthCheck } from "../services/aem-client.js";

const router = Router();

// GET /api/aem/bundles
router.get("/bundles", async (_req: Request, res: Response) => {
  const bundles = await getAllBundles();
  res.json(bundles);
});

// GET /api/aem/health
router.get("/health", async (_req: Request, res: Response) => {
  const health = await healthCheck();
  res.json(health);
});

export default router;
