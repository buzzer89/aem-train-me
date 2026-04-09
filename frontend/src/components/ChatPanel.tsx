"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, BookOpen } from "lucide-react";
import { useStore } from "@/store/useStore";
import { streamChat, fetchFileTree } from "@/lib/api";
import ChatMessageComponent from "./ChatMessage";

const SUGGESTIONS = [
  "Create a servlet to generate a sitemap XML for the site",
  "Build a hero banner component with title, description, and CTA",
  "Create an OSGi service that reads content fragment data",
  "Build a page listing component using QueryBuilder API",
  "Create a scheduled job that purges old content",
  "Build a custom workflow process step for page approval",
];

export default function ChatPanel() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useStore((s) => s.messages);
  const sessionId = useStore((s) => s.sessionId);
  const chatMode = useStore((s) => s.chatMode);
  const isStreaming = useStore((s) => s.isStreaming);
  const addMessage = useStore((s) => s.addMessage);
  const appendToLastMessage = useStore((s) => s.appendToLastMessage);
  const setSessionId = useStore((s) => s.setSessionId);
  const setChatMode = useStore((s) => s.setChatMode);
  const setIsStreaming = useStore((s) => s.setIsStreaming);
  const setFileTree = useStore((s) => s.setFileTree);
  const clearMessages = useStore((s) => s.clearMessages);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: text.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput("");

    // Add placeholder assistant message
    const assistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: "",
      timestamp: Date.now(),
      filesCreated: [] as string[],
    };
    addMessage(assistantMsg);
    setIsStreaming(true);

    streamChat(text.trim(), sessionId, chatMode, {
      onChunk(chunk) {
        appendToLastMessage(chunk);
      },
      onToolCall(name, args) {
        if (name === "write_file") {
          appendToLastMessage(`\n> 📁 Writing: \`${args.path}\`\n`);
        }
      },
      onFilesCreated(files) {
        // Update last message's filesCreated
        useStore.setState((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant") {
            msgs[msgs.length - 1] = { ...last, filesCreated: files };
          }
          return { messages: msgs };
        });
        // Refresh file tree
        fetchFileTree()
          .then((tree) => setFileTree(tree))
          .catch(() => {});
      },
      onSessionId(id) {
        setSessionId(id);
      },
      onDone() {
        setIsStreaming(false);
      },
      onError(error) {
        appendToLastMessage(`\n\n**Error:** ${error}`);
        setIsStreaming(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0f0f1a]">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#1a1a2e]">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
            Deloitte Interactive Labs
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">Agent</span>
            <span className="text-gray-600 mx-1">·</span>
            <span className="text-gray-500">Train</span>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex px-4 gap-1">
          <button
            onClick={() => { setChatMode("trainer"); clearMessages(); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors
              ${chatMode === "trainer"
                ? "bg-[#0f0f1a] text-deloitte-green border-t border-x border-deloitte-green/30"
                : "text-gray-500 hover:text-gray-300"}`}
          >
            <Sparkles size={12} className="inline mr-1" />
            Deloitte Trainer
          </button>
          <button
            onClick={() => { setChatMode("general"); clearMessages(); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors
              ${chatMode === "general"
                ? "bg-[#0f0f1a] text-deloitte-green border-t border-x border-deloitte-green/30"
                : "text-gray-500 hover:text-gray-300"}`}
          >
            <BookOpen size={12} className="inline mr-1" />
            General AEM
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-6">
            {/* Welcome */}
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white mb-1">Deloitte Trainer</h2>
              <p className="text-sm text-gray-400">
                Welcome to Deloitte AEM Labs! Choose a topic, ask for a feature, or ask to
                become an AEM Architect — ready to experience expert answers.
              </p>
            </div>

            {/* Suggestion cards */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-2">
                Try one of these
              </div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left p-3 rounded-lg border border-white/10
                             bg-white/[0.03] hover:bg-white/[0.06] hover:border-deloitte-green/30
                             transition-all group"
                >
                  <div className="text-sm text-gray-300 group-hover:text-white">
                    {s}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg) => (
              <ChatMessageComponent key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3 bg-[#1a1a2e]">
        <div className="flex items-end gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2
                        focus-within:border-deloitte-green/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              chatMode === "trainer"
                ? "Ask for a feature, ask a question, or describe what you want to build..."
                : "Ask any AEM architecture question..."
            }
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500
                       outline-none resize-none max-h-32"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className="p-1.5 rounded-lg bg-deloitte-green text-black
                       disabled:opacity-30 disabled:cursor-not-allowed
                       hover:bg-deloitte-green/80 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        {isStreaming && (
          <div className="mt-2 text-xs text-deloitte-green animate-pulse">
            Trainer is writing code...
          </div>
        )}
      </div>
    </div>
  );
}
