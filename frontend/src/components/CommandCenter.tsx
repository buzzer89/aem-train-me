"use client";

import { useRef, useState } from "react";
import {
  Hammer,
  Rocket,
  FileText,
  Settings,
  Wrench,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { streamBuild, fetchLogs } from "@/lib/api";
import ConsoleOutput from "./ConsoleOutput";

export default function CommandCenter() {
  const addConsoleLine = useStore((s) => s.addConsoleLine);
  const clearConsole = useStore((s) => s.clearConsole);
  const isBuildRunning = useStore((s) => s.isBuildRunning);
  const setIsBuildRunning = useStore((s) => s.setIsBuildRunning);
  const showConfig = useStore((s) => s.showConfig);
  const setShowConfig = useStore((s) => s.setShowConfig);
  const setPendingChatMessage = useStore((s) => s.setPendingChatMessage);

  const [buildFailed, setBuildFailed] = useState(false);
  const errorBufferRef = useRef<string>("");

  const runBuild = (type: "build-only" | "build-deploy") => {
    if (isBuildRunning) return;
    clearConsole();
    setIsBuildRunning(true);
    setBuildFailed(false);
    errorBufferRef.current = "";

    const label = type === "build-deploy" ? "Build & Deploy" : "Build Only";
    addConsoleLine({ text: `[INFO] Starting ${label}...\n`, type: "info", timestamp: Date.now() });

    streamBuild(type, {
      onOutput(text) {
        // Color-code Maven output
        let lineType: "info" | "error" | "success" = "info";
        if (text.includes("ERROR") || text.includes("FAILURE")) {
          lineType = "error";
          errorBufferRef.current += text;
        }
        if (text.includes("BUILD SUCCESS")) lineType = "success";
        addConsoleLine({ text, type: lineType, timestamp: Date.now() });
      },
      onComplete(success, duration) {
        const secs = (duration / 1000).toFixed(1);
        addConsoleLine({
          text: success
            ? `\n[INFO] BUILD SUCCESS — Total time: ${secs}s\n`
            : `\n[ERROR] BUILD FAILURE — Total time: ${secs}s\n`,
          type: success ? "success" : "error",
          timestamp: Date.now(),
        });
        setIsBuildRunning(false);
        if (!success) setBuildFailed(true);
      },
      onValidation(check, passed, detail) {
        addConsoleLine({
          text: detail,
          type: "validation",
          timestamp: Date.now(),
        });
      },
      onError(error) {
        addConsoleLine({
          text: `[ERROR] ${error}\n`,
          type: "error",
          timestamp: Date.now(),
        });
        setIsBuildRunning(false);
      },
    });
  };

  const checkLogs = async () => {
    clearConsole();
    addConsoleLine({ text: "[INFO] Fetching AEM logs...\n", type: "info", timestamp: Date.now() });
    try {
      const data = await fetchLogs();
      addConsoleLine({ text: data.logs, type: "info", timestamp: Date.now() });
    } catch {
      addConsoleLine({
        text: "[ERROR] Failed to connect to AEM instance\n",
        type: "error",
        timestamp: Date.now(),
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e] text-white">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
          Expedition Agent
        </div>
        <h2 className="text-sm font-bold">Command Center</h2>
      </div>

      {/* Action Buttons */}
      <div className="p-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => runBuild("build-only")}
          disabled={isBuildRunning}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                     bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          <Hammer size={14} />
          Build Project
        </button>
        <button
          onClick={() => runBuild("build-deploy")}
          disabled={isBuildRunning}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                     bg-deloitte-green text-black hover:bg-deloitte-green/80
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Rocket size={14} />
          Build & Deploy
        </button>
        <button
          onClick={checkLogs}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                     bg-white/10 hover:bg-white/20 transition-colors"
        >
          <FileText size={14} />
          Check Logs
        </button>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                     bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Settings size={14} />
          AEM Config
        </button>
      </div>

      {/* Build status */}
      {isBuildRunning && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-amber-600/20 border border-amber-600/30 rounded text-xs text-amber-400 animate-pulse">
          Build in progress...
        </div>
      )}

      {/* Fix with AI — shown after a build failure */}
      {buildFailed && !isBuildRunning && (
        <button
          onClick={() => {
            const errors = errorBufferRef.current.slice(-3000);
            setPendingChatMessage(
              `The Maven build failed. Please analyze the errors below, identify which files you generated that are causing the problem, and fix them.\n\n\`\`\`\n${errors}\n\`\`\``
            );
            setBuildFailed(false);
          }}
          className="mx-3 mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                     text-xs font-semibold bg-red-600/80 hover:bg-red-500 transition-colors"
        >
          <Wrench size={13} />
          Fix with AI
        </button>
      )}

      {/* Console Output */}
      <div className="flex-1 mx-3 mb-3 rounded-lg overflow-hidden border border-white/10">
        <div className="px-2 py-1 bg-white/5 border-b border-white/10 text-[10px] text-gray-500 uppercase tracking-wider">
          Console Output
        </div>
        <ConsoleOutput />
      </div>
    </div>
  );
}
