import { Router, Request, Response } from "express";
import { getCategorizedTree, readProjectFile } from "../services/file-manager.js";

const router = Router();

// GET /api/files/tree
router.get("/tree", (_req: Request, res: Response) => {
  try {
    const tree = getCategorizedTree();
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/files/content?path=...
router.get("/content", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "path query parameter is required" });
    return;
  }
  try {
    const content = readProjectFile(filePath);
    // Determine language from extension
    const ext = filePath.split(".").pop() || "";
    const langMap: Record<string, string> = {
      java: "java",
      html: "html",
      xml: "xml",
      js: "javascript",
      ts: "typescript",
      css: "css",
      scss: "scss",
      json: "json",
      md: "markdown",
      htl: "html",
    };
    res.json({ path: filePath, content, language: langMap[ext] || "text" });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;
