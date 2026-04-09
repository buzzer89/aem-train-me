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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  filesCreated?: string[];
  toolCalls?: ToolCallEvent[];
  timestamp: number;
}

export interface ToolCallEvent {
  name: string;
  args: Record<string, unknown>;
  resultPreview: string;
}

export interface ConsoleLine {
  text: string;
  type: "info" | "error" | "success" | "validation";
  timestamp: number;
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  detail: string;
}

export interface AppConfig {
  projectReady: boolean;
  aemProject: {
    path: string;
    groupId: string;
    artifactId: string;
    appsFolder: string;
    contentRoot: string;
  };
  aemInstance: {
    authorUrl: string;
    publishUrl: string;
  };
  ai: {
    provider: string;
    model: string;
  };
  build: {
    mavenCmd: string;
    profile: string;
  };
}
