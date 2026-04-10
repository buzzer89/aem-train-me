import { Router, Request, Response } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config, isProjectReady, setProjectConfig, persistEnv } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

/**
 * After archetype generation, the parent pom.xml may reference modules
 * that weren't actually created (e.g. ui.frontend, dispatcher).
 * Remove those <module> entries so `mvn clean install` doesn't fail.
 */
function cleanupParentPom(projectDir: string): string[] {
  const pomPath = path.join(projectDir, "pom.xml");
  if (!fs.existsSync(pomPath)) return [];

  let pom = fs.readFileSync(pomPath, "utf-8");
  const removed: string[] = [];

  // Match each <module>...</module> entry
  const moduleRegex = /<module>([^<]+)<\/module>/g;
  let match;
  while ((match = moduleRegex.exec(pom)) !== null) {
    const moduleName = match[1].trim();
    const moduleDir = path.join(projectDir, moduleName);
    if (!fs.existsSync(moduleDir)) {
      removed.push(moduleName);
    }
  }

  if (removed.length > 0) {
    for (const mod of removed) {
      // Remove the <module> line and any surrounding blank line it leaves
      pom = pom.replace(new RegExp(`\\s*<module>${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</module>`, "g"), "");
    }
    fs.writeFileSync(pomPath, pom, "utf-8");
  }

  return removed;
}

/** GET /api/project/status — check if an AEM project exists */
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    ready: isProjectReady(),
    path: config.aemProject.path || null,
    artifactId: config.aemProject.artifactId,
  });
});

/** POST /api/project/generate — run Maven archetype to scaffold the AEM project (SSE) */
router.post("/generate", (req: Request, res: Response) => {
  const {
    appTitle = "My Site",
    appId = "mysite",
    groupId = "com.mysite",
    archetypeVersion = "56",
    outputDir,
  } = req.body as {
    appTitle?: string;
    appId?: string;
    groupId?: string;
    archetypeVersion?: string;
    outputDir?: string;
  };

  // Validate inputs — only alphanumeric, dots, hyphens, spaces allowed
  const safePattern = /^[\w.\- ]+$/;
  if (!safePattern.test(appTitle) || !safePattern.test(appId) || !safePattern.test(groupId)) {
    res.status(400).json({ error: "Invalid characters in input fields" });
    return;
  }

  // Determine where to generate the project.
  // AEM_PROJECTS_DIR env var points to the persistent volume in Docker (/workspace/aem-projects).
  // Falls back to the repo-relative path for local dev outside Docker.
  const baseDir = outputDir
    ? path.resolve(outputDir)
    : process.env.AEM_PROJECTS_DIR || path.resolve(__dirname, "../../../aem-projects");

  // Ensure base directory exists
  fs.mkdirSync(baseDir, { recursive: true });

  const projectDir = path.join(baseDir, appId);

  // Don't overwrite an existing project
  if (fs.existsSync(path.join(projectDir, "pom.xml"))) {
    // Project already exists — just configure it
    setProjectConfig({
      path: projectDir,
      groupId,
      artifactId: appId,
      appsFolder: appId,
      contentRoot: appId,
    });
    persistEnv();
    res.json({ success: true, path: projectDir, message: "Project already exists, configured." });
    return;
  }

  // SSE for real-time output
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Maven 3.9+ requires a POM even for archetype:generate with fully-qualified goals.
  // Create a minimal stub pom.xml so Maven has a project context.
  const stubPom = path.join(baseDir, "pom.xml");
  if (!fs.existsSync(stubPom)) {
    fs.writeFileSync(
      stubPom,
      `<project><modelVersion>4.0.0</modelVersion><groupId>stub</groupId><artifactId>stub</artifactId><version>1</version><packaging>pom</packaging></project>`,
      "utf-8"
    );
  }

  const args = [
    "-B",
    "-N",
    "org.apache.maven.plugins:maven-archetype-plugin:3.3.1:generate",
    `-DarchetypeGroupId=com.adobe.aem`,
    `-DarchetypeArtifactId=aem-project-archetype`,
    `-DarchetypeVersion=${archetypeVersion}`,
    `-DappTitle='${appTitle}'`,
    `-DappId=${appId}`,
    `-DgroupId=${groupId}`,
    `-DfrontendModule=general`,
  ];

  res.write(`data: ${JSON.stringify({ type: "output", text: `$ mvn ${args.join(" ")}\n` })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "output", text: `Working directory: ${baseDir}\n\n` })}\n\n`);

  const spawnEnv = { ...process.env };

  const mvn = spawn(config.build.mavenCmd, args, {
    cwd: baseDir,
    shell: true,
    env: spawnEnv,
  });

  let output = "";

  mvn.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    output += text;
    res.write(`data: ${JSON.stringify({ type: "output", text })}\n\n`);
  });

  mvn.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    output += text;
    res.write(`data: ${JSON.stringify({ type: "output", text })}\n\n`);
  });

  mvn.on("close", (code) => {
    const success = code === 0;

    if (success) {
      // Clean up parent pom.xml — remove modules that weren't generated
      const removedModules = cleanupParentPom(projectDir);
      if (removedModules.length > 0) {
        res.write(
          `data: ${JSON.stringify({
            type: "output",
            text: `\n[INFO] Cleaned parent pom.xml — removed missing modules: ${removedModules.join(", ")}\n`,
          })}\n\n`
        );
      }

      // Update config to point at the new project
      setProjectConfig({
        path: projectDir,
        groupId,
        artifactId: appId,
        appsFolder: appId,
        contentRoot: appId,
      });
      persistEnv();

      res.write(
        `data: ${JSON.stringify({
          type: "complete",
          success: true,
          path: projectDir,
          message: `AEM project generated at ${projectDir}`,
        })}\n\n`
      );
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "complete",
          success: false,
          message: "Archetype generation failed. Check the output above.",
        })}\n\n`
      );
    }

    res.end();
  });

  mvn.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  });
});

export default router;
