"use client";

import { useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import type { ConsoleLine } from "@/lib/types";

function lineColor(line: ConsoleLine) {
  switch (line.type) {
    case "success": return "text-green-400";
    case "error": return "text-red-400";
    case "validation": return line.text.includes("✓") ? "text-green-400" : "text-red-400";
    default: return "text-gray-300";
  }
}

export default function ConsoleOutput() {
  const consoleLines = useStore((s) => s.consoleLines);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  return (
    <div className="h-full overflow-y-auto bg-[#0d0d0d] font-mono text-[11px] p-2">
      {consoleLines.length === 0 ? (
        <div className="text-gray-600 text-center py-8">
          Console output will appear here...
        </div>
      ) : (
        consoleLines.map((line, i) => (
          <div key={`${line.timestamp}-${line.text.slice(0, 20)}`} className={`whitespace-pre-wrap break-all leading-relaxed ${lineColor(line)}`}>
            {line.text}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
