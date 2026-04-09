"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  Pin,
  RefreshCw,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { fetchFileTree } from "@/lib/api";
import type { FileNode, CategorizedTree } from "@/lib/types";

const categoryLabels: Record<keyof CategorizedTree, string> = {
  components: "COMPONENTS",
  slingModels: "SLING MODELS",
  servlets: "SERVLETS",
  services: "SERVICES",
  filters: "FILTERS",
  frontend: "FRONTEND",
  other: "OTHER",
};

const categoryOrder: (keyof CategorizedTree)[] = [
  "components",
  "slingModels",
  "servlets",
  "services",
  "filters",
  "frontend",
];

function TreeNode({ node, depth = 0 }: Readonly<{ node: FileNode; depth?: number }>) {
  const [expanded, setExpanded] = useState(depth < 2);
  const setSelectedFile = useStore((s) => s.setSelectedFile);

  if (node.type === "file") {
    return (
      <button
        onClick={() => setSelectedFile(node.path)}
        className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 text-sm
                   text-gray-300 hover:bg-white/10 hover:text-white rounded transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileCode size={14} className="text-deloitte-green shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 text-sm
                   text-gray-300 hover:bg-white/10 hover:text-white rounded transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="text-yellow-500 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && node.children?.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function CategorySection({
  label,
  nodes,
}: Readonly<{
  label: string;
  nodes: FileNode[];
}>) {
  const [expanded, setExpanded] = useState(true);
  const count = countFiles(nodes);

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-bold
                   text-gray-400 hover:text-white hover:bg-white/5 transition-colors uppercase tracking-wider"
      >
        <span className="flex items-center gap-1.5">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
        </span>
        {count > 0 && (
          <span className="bg-deloitte-green/20 text-deloitte-green text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {count}
          </span>
        )}
      </button>
      {expanded && nodes.map((node) => (
        <TreeNode key={node.path} node={node} depth={1} />
      ))}
    </div>
  );
}

function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") count++;
    if (node.children) count += countFiles(node.children);
  }
  return count;
}

export default function ProjectExplorer() {
  const fileTree = useStore((s) => s.fileTree);
  const setFileTree = useStore((s) => s.setFileTree);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const tree = await fetchFileTree();
      setFileTree(tree);
    } catch {
      // AEM project might not exist yet
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Project Explorer
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="p-1 hover:bg-white/10 rounded" title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <Pin size={14} className="text-gray-500" />
        </div>
      </div>

      {/* Title */}
      <div className="px-3 py-2 border-b border-white/10">
        <h2 className="text-sm font-bold">AEM Codebase</h2>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree ? (
          categoryOrder.map((key) => {
            const nodes = fileTree[key];
            if (!nodes || nodes.length === 0) return null;
            return (
              <CategorySection
                key={key}
                label={categoryLabels[key]}
                nodes={nodes}
              />
            );
          })
        ) : (
          <div className="px-3 py-8 text-center text-gray-500 text-xs">
            {loading ? "Loading project files..." : "No AEM project files found. Configure your project path and start building!"}
          </div>
        )}
      </div>
    </div>
  );
}
