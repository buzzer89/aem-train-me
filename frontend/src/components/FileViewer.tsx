"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useStore } from "@/store/useStore";
import { fetchFileContent } from "@/lib/api";

export default function FileViewer() {
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("text");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    fetchFileContent(selectedFile)
      .then((data) => {
        setContent(data.content);
        setLanguage(data.language || "text");
      })
      .catch(() => setContent("// Failed to load file"))
      .finally(() => setLoading(false));
  }, [selectedFile]);

  if (!selectedFile) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
      <div className="bg-[#1a1a2e] rounded-xl border border-white/10 w-full max-w-4xl max-h-[80vh]
                      flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="font-mono text-sm text-gray-300 truncate">{selectedFile}</div>
          <button
            onClick={() => setSelectedFile(null)}
            className="p-1 hover:bg-white/10 rounded"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : (
            <SyntaxHighlighter
              style={oneDark}
              language={language}
              showLineNumbers
              customStyle={{
                margin: 0,
                borderRadius: 0,
                background: "#0f0f1a",
                fontSize: "12px",
                minHeight: "100%",
              }}
            >
              {content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </div>
  );
}
