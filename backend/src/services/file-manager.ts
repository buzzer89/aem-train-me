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
  other: FileNode[];
}

const projectPath = () => config.aemProject.path;

function ensureWithinProject(filePath: string): string {
  const resolved = path.resolve(projectPath(), filePath);
  if (!resolved.startsWith(path.resolve(projectPath()))) {
    throw new Error("Path traversal attempt blocked");
  }
  return resolved;
}

export function writeProjectFile(relativePath: string, content: string): void {
  const abs = ensureWithinProject(relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
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
    other: [],
  };

  const componentsDir = path.join(
    projectPath(),
    `ui.apps/src/main/content/jcr_root/apps/${appsFolder}/components`
  );
  if (fs.existsSync(componentsDir)) {
    categories.components = buildTree(componentsDir, 0, 3);
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
