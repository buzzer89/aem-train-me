"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage } from "@/lib/types";
import { FileCode, User, Bot, Undo2, CheckCircle } from "lucide-react";
import { undoFileChanges } from "@/lib/api";

export default function ChatMessageComponent({ message }: Readonly<{ message: ChatMessage }>) {
  const isUser = message.role === "user";
  const [undoState, setUndoState] = useState<"idle" | "loading" | "done">("idle");

  const handleUndo = async () => {
    if (!message.undoTurnId || undoState !== "idle") return;
    setUndoState("loading");
    try {
      const { restored } = await undoFileChanges(message.undoTurnId);
      console.info(`Undid ${restored.length} file(s):`, restored);
      setUndoState("done");
    } catch {
      setUndoState("idle");
    }
  };

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? "bg-transparent" : "bg-white/[0.02]"}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1
          ${isUser ? "bg-deloitte-green/20" : "bg-amber-500/20"}`}
      >
        {isUser ? (
          <User size={16} className="text-deloitte-green" />
        ) : (
          <Bot size={16} className="text-amber-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold mb-1 text-gray-400 uppercase tracking-wide">
          {isUser ? "You" : "Deloitte Trainer"}
        </div>
        <div className="prose prose-invert prose-sm max-w-none
                        prose-headings:text-deloitte-green prose-headings:font-bold
                        prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                        prose-code:text-amber-300 prose-code:bg-white/5 prose-code:px-1 prose-code:rounded
                        prose-pre:bg-[#1e1e2e] prose-pre:border prose-pre:border-white/10
                        prose-strong:text-white prose-li:text-gray-300
                        prose-a:text-deloitte-green prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const inline = !match;
                if (inline) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Files created badge */}
        {message.filesCreated && message.filesCreated.length > 0 && (
          <div className="mt-3 p-2 bg-deloitte-green/10 border border-deloitte-green/20 rounded-lg">
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-deloitte-green">
                <FileCode size={14} />
                {message.filesCreated.length} file(s) created
              </div>
              {message.undoTurnId && (
                <button
                  onClick={handleUndo}
                  disabled={undoState !== "idle"}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded
                             bg-white/5 hover:bg-red-500/20 hover:text-red-400
                             text-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Restore all files to their state before this AI response"
                >
                  {undoState === "done" ? (
                    <><CheckCircle size={11} className="text-deloitte-green" /> Undone</>
                  ) : (
                    <><Undo2 size={11} />{undoState === "loading" ? "Undoing..." : "Undo changes"}</>
                  )}
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {message.filesCreated.map((f) => (
                <div key={f} className="text-[11px] text-gray-400 font-mono truncate">
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
