import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, "../../.env") });

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const config = {
  port: Number.parseInt(env("PORT", "3001"), 10),

  aemProject: {
    path: env("AEM_PROJECT_PATH", "/workspace/aem-projects/basetraining"),
    groupId: env("AEM_GROUP_ID", "com.mysite"),
    artifactId: env("AEM_ARTIFACT_ID", "mysite"),
    appsFolder: env("AEM_APPS_FOLDER", "mysite"),
    contentRoot: env("AEM_CONTENT_ROOT", "mysite"),
  },

  aemInstance: {
    authorUrl: env("AEM_AUTHOR_URL", "http://localhost:4502"),
    publishUrl: env("AEM_PUBLISH_URL", "http://localhost:4503"),
    username: env("AEM_USERNAME", "admin"),
    password: env("AEM_PASSWORD", "admin"),
  },

  ai: {
    provider: env("AI_PROVIDER", "openai") as "openai" | "anthropic",
    model: env("AI_MODEL", "gpt-4"),
    apiKey: env("AI_API_KEY", ""),
  },

  build: {
    mavenCmd: env("MAVEN_CMD", "mvn"),
    profile: env("MAVEN_PROFILE", "autoInstallPackage"),
  },
};

/** Check whether the configured AEM project directory actually exists and has a pom.xml */
export function isProjectReady(): boolean {
  if (!config.aemProject.path) return false;
  return fs.existsSync(path.join(config.aemProject.path, "pom.xml"));
}

/** Update the in-memory project config after archetype generation */
export function setProjectConfig(opts: {
  path: string;
  groupId: string;
  artifactId: string;
  appsFolder: string;
  contentRoot: string;
}): void {
  config.aemProject.path = opts.path;
  config.aemProject.groupId = opts.groupId;
  config.aemProject.artifactId = opts.artifactId;
  config.aemProject.appsFolder = opts.appsFolder;
  config.aemProject.contentRoot = opts.contentRoot;
}

/** Persist the current project settings back to the .env file */
export function persistEnv(): void {
  const envPath = process.env.ENV_FILE || path.resolve(__dirname, "../../.env");
  const lines: string[] = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf-8").split("\n")
    : [];

  const updates: Record<string, string> = {
    AEM_PROJECT_PATH: config.aemProject.path,
    AEM_GROUP_ID: config.aemProject.groupId,
    AEM_ARTIFACT_ID: config.aemProject.artifactId,
    AEM_APPS_FOLDER: config.aemProject.appsFolder,
    AEM_CONTENT_ROOT: config.aemProject.contentRoot,
  };

  const written = new Set<string>();
  const result = lines.map((line) => {
    const match = line.match(/^([A-Z_]+)=/);
    if (match && match[1] in updates) {
      written.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (!written.has(key)) {
      result.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(envPath, result.join("\n"), "utf-8");
}

export type AppConfig = typeof config;
