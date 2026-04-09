"use client";

import { useEffect, useState } from "react";
import { Settings, X, Loader2 } from "lucide-react";
import ProjectExplorer from "@/components/ProjectExplorer";
import ChatPanel from "@/components/ChatPanel";
import CommandCenter from "@/components/CommandCenter";
import FileViewer from "@/components/FileViewer";
import SetupWizard from "@/components/SetupWizard";
import ResizablePanel from "@/components/ResizablePanel";
import { useStore } from "@/store/useStore";
import { fetchConfig, fetchProjectStatus } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

export default function Home() {
  // All hooks must be called unconditionally and at the top
  const selectedFile = useStore((s) => s.selectedFile);
  const showConfig = useStore((s) => s.showConfig);
  const setShowConfig = useStore((s) => s.setShowConfig);
  const projectReady = useStore((s) => s.projectReady);
  const setProjectReady = useStore((s) => s.setProjectReady);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [explorerWidth, setExplorerWidth] = useState(260);
  const [commandWidth, setCommandWidth] = useState(320);

  // Check project status on mount
  useEffect(() => {
    fetchProjectStatus()
      .then((status) => setProjectReady(status.ready))
      .catch(() => setProjectReady(false));
  }, [setProjectReady]);

  // Load config once project is ready
  useEffect(() => {
    if (projectReady) {
      fetchConfig().then(setAppConfig).catch(() => {});
    }
  }, [projectReady]);

  // Loading state
  if (projectReady === null) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="text-deloitte-green animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Checking project status...</p>
        </div>
      </div>
    );
  }

  // Setup wizard when no project exists
  if (!projectReady) {
    return <SetupWizard />;
  }

  // Main application
  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header className="h-10 bg-[#1a1a2e] border-b border-white/10 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tracking-wide">Deloitte</span>
          <span className="text-[10px] bg-deloitte-green/20 text-deloitte-green px-2 py-0.5 rounded font-semibold uppercase">
            AEM Labs
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {appConfig && (
            <>
              <span>Endpoint: {appConfig.aemInstance.authorUrl}</span>
              <span>·</span>
              <span>Model: {appConfig.ai.model}</span>
              <span>·</span>
              <span>Project: {appConfig.aemProject.artifactId}</span>
            </>
          )}
        </div>
      </header>

      {/* Three-panel layout with resizable panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel 1: Project Explorer */}
        <ResizablePanel
          width={explorerWidth}
          setWidth={setExplorerWidth}
          minWidth={180}
          maxWidth={500}
          className="shrink-0 border-r border-white/10 overflow-hidden bg-[#18182a]"
          side="left"
        >
          <ProjectExplorer />
        </ResizablePanel>

        {/* Panel 2: Chat */}
        <main className="flex-1 min-w-0 overflow-hidden">
          <ChatPanel />
        </main>

        {/* Panel 3: Command Center */}
        <ResizablePanel
          width={commandWidth}
          setWidth={setCommandWidth}
          minWidth={220}
          maxWidth={600}
          className="shrink-0 border-l border-white/10 overflow-hidden bg-[#18182a]"
          side="right"
        >
          <CommandCenter />
        </ResizablePanel>
      </div>

      {/* Config Panel (bottom overlay) */}
      {showConfig && appConfig && (
        <div className="absolute bottom-0 left-0 right-0 bg-[#1a1a2e] border-t border-white/10 p-4 z-40 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings size={16} className="text-deloitte-green" />
              Configuration
            </div>
            <button onClick={() => setShowConfig(false)} className="p-1 hover:bg-white/10 rounded">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-500 block mb-1">AEM Author URL</span>
              <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-gray-300">
                {appConfig.aemInstance.authorUrl}
              </div>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Project Path</span>
              <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-gray-300 truncate">
                {appConfig.aemProject.path}
              </div>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">AI Model</span>
              <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-gray-300">
                {appConfig.ai.model}
              </div>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Build Profile</span>
              <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-gray-300">
                {appConfig.build.profile}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {selectedFile && <FileViewer />}
    </div>
  );
}
