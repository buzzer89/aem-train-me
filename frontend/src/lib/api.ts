const API_BASE = "/api";

export async function fetchProjectStatus(): Promise<{
  ready: boolean;
  path: string | null;
  artifactId: string;
}> {
  const res = await fetch(`${API_BASE}/project/status`);
  return res.json();
}

export function streamProjectGenerate(
  opts: {
    appTitle: string;
    appId: string;
    groupId: string;
    archetypeVersion: string;
  },
  callbacks: {
    onOutput: (text: string) => void;
    onComplete: (success: boolean, path?: string) => void;
    onError: (error: string) => void;
  }
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/project/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal: controller.signal,
  })
    .then(async (res) => {
      // Handle non-SSE JSON response (project already exists)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.success) {
          callbacks.onOutput(data.message + "\n");
          callbacks.onComplete(true, data.path);
        } else {
          callbacks.onError(data.error || "Generation failed");
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case "output":
                callbacks.onOutput(data.text);
                break;
              case "complete":
                callbacks.onComplete(data.success, data.path);
                break;
              case "error":
                callbacks.onError(data.error);
                break;
            }
          } catch {
            // skip
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

export async function fetchFileTree() {
  const res = await fetch(`${API_BASE}/files/tree`);
  return res.json();
}

export async function fetchFileContent(path: string) {
  const res = await fetch(`${API_BASE}/files/content?path=${encodeURIComponent(path)}`);
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  return res.json();
}

export async function fetchChatHistory(sessionId: string) {
  const res = await fetch(`${API_BASE}/chat/history?sessionId=${sessionId}`);
  return res.json();
}

export async function fetchLogs() {
  const res = await fetch(`${API_BASE}/logs`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/aem/health`);
  return res.json();
}

export function streamChat(
  message: string,
  sessionId: string | null,
  mode: "trainer" | "general",
  callbacks: {
    onChunk: (text: string) => void;
    onToolCall: (name: string, args: Record<string, unknown>) => void;
    onFilesCreated: (files: string[]) => void;
    onSessionId: (id: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  }
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, mode }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case "session":
                callbacks.onSessionId(data.sessionId);
                break;
              case "chunk":
                callbacks.onChunk(data.text);
                break;
              case "tool_call":
                callbacks.onToolCall(data.name, data.args);
                break;
              case "files_created":
                callbacks.onFilesCreated(data.files);
                break;
              case "done":
                callbacks.onDone();
                break;
              case "error":
                callbacks.onError(data.error);
                break;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

export function streamBuild(
  type: "build-only" | "build-deploy",
  callbacks: {
    onOutput: (text: string) => void;
    onComplete: (success: boolean, duration: number) => void;
    onValidation: (check: string, passed: boolean, detail: string) => void;
    onError: (error: string) => void;
  }
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case "output":
                callbacks.onOutput(data.text);
                break;
              case "build_complete":
                callbacks.onComplete(data.success, data.duration);
                break;
              case "validation":
                callbacks.onValidation(data.check, data.passed, data.detail);
                break;
              case "error":
                callbacks.onError(data.error);
                break;
            }
          } catch {
            // skip
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}
