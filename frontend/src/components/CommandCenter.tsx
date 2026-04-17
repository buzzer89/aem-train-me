"use client";

import { useEffect, useRef, useState } from "react";
import {
  Hammer,
  Rocket,
  FileText,
  Settings,
  Wrench,
  Trash2,
  Square,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { streamBuild } from "@/lib/api";
import ConsoleOutput from "./ConsoleOutput";

function classifyLogLine(line: string): "info" | "error" | "warning" {
  // AEM error.log format: "DD.MM.YYYY HH:mm:ss.SSS *LEVEL* ..."
  // Match both bracketed levels and Maven-style prefixes.
  if (/\*ERROR\*|\[ERROR\]|\bSEVERE\b|\bException\b|\bFAILURE\b/i.test(line)) return "error";
  if (/\*WARN\*|\[WARNING\]|\bWARN(ING)?\b/i.test(line)) return "warning";
  return "info";
}

export default function CommandCenter() {
  const addConsoleLine = useStore((s) => s.addConsoleLine);
  const clearConsole = useStore((s) => s.clearConsole);
  const isBuildRunning = useStore((s) => s.isBuildRunning);
  const setIsBuildRunning = useStore((s) => s.setIsBuildRunning);
  const showConfig = useStore((s) => s.showConfig);
  const setShowConfig = useStore((s) => s.setShowConfig);
  const setPendingChatMessage = useStore((s) => s.setPendingChatMessage);
  const setChatMode = useStore((s) => s.setChatMode);

  const [buildFailed, setBuildFailed] = useState(false);
  const [isTailing, setIsTailing] = useState(false);
  const errorBufferRef = useRef<string>("");
  const tailSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      tailSourceRef.current?.close();
      tailSourceRef.current = null;
    };
  }, []);

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
        let lineType: "info" | "error" | "success" | "warning" = "info";
        if (text.includes("ERROR") || text.includes("FAILURE")) {
          lineType = "error";
          errorBufferRef.current += text;
        } else if (/\[WARNING\]|\bWARN\b/.test(text)) {
          lineType = "warning";
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

  const stopTail = () => {
    tailSourceRef.current?.close();
    tailSourceRef.current = null;
    setIsTailing(false);
    addConsoleLine({
      text: "\n[INFO] Stopped tailing error.log\n",
      type: "info",
      timestamp: Date.now(),
    });
  };

  const startTail = () => {
    if (isTailing) {
      stopTail();
      return;
    }
    clearConsole();
    addConsoleLine({
      text: "[INFO] Tailing error.log (live)...\n",
      type: "info",
      timestamp: Date.now(),
    });

    const streamBase = `${window.location.protocol}//${window.location.hostname}:3001/api`;
    const src = new EventSource(`${streamBase}/logs/stream`);
    tailSourceRef.current = src;
    setIsTailing(true);

    src.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (typeof data.logs !== "string") return;
        // Stream sends the latest tail snapshot; replace console content.
        // Build the full batch of lines first, then apply in a single state update.
        const now = Date.now();
        const rawLines = data.logs.split("\n");
        const batch: Array<{ text: string; type: "info" | "error" | "warning"; timestamp: number }> = [
          { text: "[INFO] Tailing error.log (live)...\n", type: "info", timestamp: now },
        ];
        let buffer = "";
        let bufferType: "info" | "error" | "warning" = "info";
        const flush = () => {
          if (!buffer) return;
          batch.push({ text: buffer, type: bufferType, timestamp: now });
          buffer = "";
        };
        for (const raw of rawLines) {
          const type = classifyLogLine(raw);
          if (type !== bufferType) {
            flush();
            bufferType = type;
          }
          buffer += raw + "\n";
        }
        flush();
        // Single state update instead of N individual addConsoleLine calls
        useStore.setState({ consoleLines: batch });
      } catch {
        // skip malformed
      }
    };

    src.onerror = () => {
      addConsoleLine({
        text: "[ERROR] Lost connection to log stream\n",
        type: "error",
        timestamp: Date.now(),
      });
      src.close();
      tailSourceRef.current = null;
      setIsTailing(false);
    };
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
          onClick={startTail}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                     transition-colors ${
                       isTailing
                         ? "bg-red-600/80 hover:bg-red-500"
                         : "bg-white/10 hover:bg-white/20"
                     }`}
        >
          {isTailing ? <Square size={14} /> : <FileText size={14} />}
          {isTailing ? "Stop Tailing" : "Tail error.log"}
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
            // Force trainer mode so write_file tool is available
            setChatMode("trainer");
            setPendingChatMessage(
              `The Maven build failed. Analyze the errors below, identify the exact files causing the problem, and fix them.\n\nIMPORTANT: You MUST call write_file for every file you fix — do NOT just show corrected code in your response. The files will not be updated unless you call write_file.\n\n\`\`\`\n${errors}\n\`\`\``
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
      <div className="flex-1 mx-3 mb-3 rounded-lg overflow-hidden border border-white/10 flex flex-col">
        <div className="px-2 py-1 bg-white/5 border-b border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">
            Console Output
          </span>
          <button
            onClick={() => {
              if (isTailing) stopTail();
              clearConsole();
            }}
            title="Clear output"
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ConsoleOutput />
        </div>
      </div>
    </div>
  );
}
