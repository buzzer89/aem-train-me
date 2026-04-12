import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface CategorizedTree {
  components: FileNode[];
  slingModels: FileNode[];
  servlets: FileNode[];
  services: FileNode[];
  filters: FileNode[];
  frontend: FileNode[];
  clientlibs: FileNode[];
  unitTests: FileNode[];
  integrationTests: FileNode[];
  osgiConfigs: FileNode[];
  content: FileNode[];
  conf: FileNode[];
  other: FileNode[];
}

const projectPath = () => config.aemProject.path;

/**
 * Fix unescaped XML special characters inside attribute values of JCR DocView XML files.
 * The AI occasionally writes raw HTML (e.g. `<p>text</p>`) into attribute values which
 * causes FileVault to reject the file with a parse error.
 */
function sanitizeDocViewXml(content: string): string {
  // Match every double-quoted attribute value and normalize its escaping.
  // Strategy: fully unescape, then re-escape — handles both already-escaped and raw input.
  return content.replace(/="([^"]*)"/g, (_match, val: string) => {
    const unescaped = val
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
    const reescaped = unescaped
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return `="${reescaped}"`;
  });
}

function ensureWithinProject(filePath: string): string {
  const resolved = path.resolve(projectPath(), filePath);
  if (!resolved.startsWith(path.resolve(projectPath()))) {
    throw new Error("Path traversal attempt blocked");
  }
  return resolved;
}

// ── Turn snapshot store ────────────────────────────────────────────────────
// Keeps pre-write file snapshots per AI turn so changes can be undone.
// Stored in memory only — cleared when the backend restarts.
const turnSnapshots = new Map<string, { path: string; previousContent: string | null }[]>();

export function startFileTurn(turnId: string): void {
  turnSnapshots.set(turnId, []);
}

export function writeProjectFile(relativePath: string, content: string, turnId?: string): void {
  const abs = ensureWithinProject(relativePath);

  if (turnId) {
    const snapshots = turnSnapshots.get(turnId);
    if (snapshots && !snapshots.find((s) => s.path === relativePath)) {
      // Capture previous content before overwriting (null = file didn't exist)
      const previousContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
      snapshots.push({ path: relativePath, previousContent });
    }
  }

  const finalContent =
    (relativePath.endsWith(".content.xml") || relativePath.endsWith("_cq_dialog/.content.xml"))
      ? sanitizeDocViewXml(content)
      : content;

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, finalContent, "utf-8");
}

export function undoTurn(turnId: string): string[] {
  const snapshots = turnSnapshots.get(turnId);
  if (!snapshots || snapshots.length === 0) return [];

  const restored: string[] = [];
  for (const { path: relPath, previousContent } of snapshots) {
    try {
      const abs = ensureWithinProject(relPath);
      if (previousContent === null) {
        // File was newly created — delete it
        if (fs.existsSync(abs)) {
          fs.unlinkSync(abs);
          restored.push(relPath);
        }
      } else {
        // File existed before — restore old content
        fs.writeFileSync(abs, previousContent, "utf-8");
        restored.push(relPath);
      }
    } catch {
      // skip files that can't be restored
    }
  }

  turnSnapshots.delete(turnId);
  return restored;
}

export function readProjectFile(relativePath: string): string {
  const abs = ensureWithinProject(relativePath);
  return fs.readFileSync(abs, "utf-8");
}

export function listProjectDir(relativePath: string): string[] {
  const abs = ensureWithinProject(relativePath);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { recursive: false }) as string[];
}

export function projectFileExists(relativePath: string): boolean {
  const abs = ensureWithinProject(relativePath);
  return fs.existsSync(abs);
}

function buildTree(dir: string, depth = 0, maxDepth = 6): FileNode[] {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "target" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(projectPath(), fullPath);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "directory",
        children: buildTree(fullPath, depth + 1, maxDepth),
      });
    } else {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }
  return nodes;
}

export function getProjectTree(): FileNode[] {
  return buildTree(projectPath());
}

export function getCategorizedTree(): CategorizedTree {
  const appsFolder = config.aemProject.appsFolder;
  const groupPath = config.aemProject.groupId.replaceAll(".", "/");

  const categories: CategorizedTree = {
    components: [],
    slingModels: [],
    servlets: [],
    services: [],
    filters: [],
    frontend: [],
    clientlibs: [],
    unitTests: [],
    integrationTests: [],
    osgiConfigs: [],
    content: [],
    conf: [],
    other: [],
  };

  const componentsDir = path.join(
    projectPath(),
    `ui.apps/src/main/content/jcr_root/apps/${appsFolder}/components`
  );
  if (fs.existsSync(componentsDir)) {
    categories.components = buildTree(componentsDir, 0, 3);
  }

  const clientlibsDir = path.join(
    projectPath(),
    `ui.apps/src/main/content/jcr_root/apps/${appsFolder}/clientlibs`
  );
  if (fs.existsSync(clientlibsDir)) {
    categories.clientlibs = buildTree(clientlibsDir, 0, 4);
  }

  const javaBase = path.join(
    projectPath(),
    `core/src/main/java/${groupPath}/core`
  );

  for (const [folder, key] of [
    ["models", "slingModels"],
    ["servlets", "servlets"],
    ["services", "services"],
    ["filters", "filters"],
  ] as const) {
    const dir = path.join(javaBase, folder);
    if (fs.existsSync(dir)) {
      categories[key] = buildTree(dir, 0, 3);
    }
  }

  const unitTestDir = path.join(
    projectPath(),
    `core/src/test/java/${groupPath}/core`
  );
  if (fs.existsSync(unitTestDir)) {
    categories.unitTests = buildTree(unitTestDir, 0, 4);
  }

  const itTestsDir = path.join(projectPath(), "it.tests/src");
  if (fs.existsSync(itTestsDir)) {
    categories.integrationTests = buildTree(itTestsDir, 0, 5);
  }

  const osgiDir = path.join(
    projectPath(),
    `ui.config/src/main/content/jcr_root/apps/${appsFolder}/osgiconfig`
  );
  if (fs.existsSync(osgiDir)) {
    categories.osgiConfigs = buildTree(osgiDir, 0, 3);
  }

  const contentDir = path.join(
    projectPath(),
    "ui.content/src/main/content/jcr_root/content"
  );
  if (fs.existsSync(contentDir)) {
    categories.content = buildTree(contentDir, 0, 3);
  }

  const confDir = path.join(
    projectPath(),
    "ui.content/src/main/content/jcr_root/conf"
  );
  if (fs.existsSync(confDir)) {
    categories.conf = buildTree(confDir, 0, 4);
  }

  const feDir = path.join(projectPath(), "ui.frontend/src");
  if (fs.existsSync(feDir)) {
    categories.frontend = buildTree(feDir, 0, 3);
  }

  return categories;
}

export function flatFileList(): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "target" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(projectPath(), full));
    }
  }
  walk(projectPath());
  return files;
}
