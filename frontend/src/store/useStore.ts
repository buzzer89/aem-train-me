import { create } from "zustand";
import type { ChatMessage, CategorizedTree, ConsoleLine } from "../lib/types";

interface AppState {
  // Project readiness
  projectReady: boolean | null; // null = loading
  setProjectReady: (v: boolean) => void;

  // Chat
  messages: ChatMessage[];
  sessionId: string | null;
  chatMode: "trainer" | "general";
  isStreaming: boolean;
  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (text: string) => void;
  setSessionId: (id: string) => void;
  setChatMode: (mode: "trainer" | "general") => void;
  setIsStreaming: (v: boolean) => void;
  clearMessages: () => void;

  // File tree
  fileTree: CategorizedTree | null;
  setFileTree: (tree: CategorizedTree) => void;
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;

  // Console
  consoleLines: ConsoleLine[];
  addConsoleLine: (line: ConsoleLine) => void;
  clearConsole: () => void;
  isBuildRunning: boolean;
  setIsBuildRunning: (v: boolean) => void;

  // Config panel
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;

  // Auto-send a message from outside the chat panel (e.g. "Fix with AI" from build failure)
  pendingChatMessage: string | null;
  setPendingChatMessage: (msg: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  // Project readiness
  projectReady: null,
  setProjectReady: (v) => set({ projectReady: v }),

  // Chat
  messages: [],
  sessionId: null,
  chatMode: "trainer",
  isStreaming: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLastMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      }
      return { messages: msgs };
    }),
  setSessionId: (id) => set({ sessionId: id }),
  setChatMode: (mode) => set({ chatMode: mode }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [], sessionId: null }),

  // File tree
  fileTree: null,
  setFileTree: (tree) => set({ fileTree: tree }),
  selectedFile: null,
  setSelectedFile: (path) => set({ selectedFile: path }),

  // Console
  consoleLines: [],
  addConsoleLine: (line) =>
    set((s) => ({ consoleLines: [...s.consoleLines.slice(-500), line] })),
  clearConsole: () => set({ consoleLines: [] }),
  isBuildRunning: false,
  setIsBuildRunning: (v) => set({ isBuildRunning: v }),

  // Config
  showConfig: false,
  setShowConfig: (v) => set({ showConfig: v }),

  // Pending chat message
  pendingChatMessage: null,
  setPendingChatMessage: (msg) => set({ pendingChatMessage: msg }),
}));
