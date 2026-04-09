"use client";

import { useState, useRef, useEffect } from "react";
import { Rocket, Terminal, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { streamProjectGenerate } from "@/lib/api";
import { useStore } from "@/store/useStore";

interface FormFields {
  appTitle: string;
  appId: string;
  groupId: string;
  archetypeVersion: string;
}

type Phase = "form" | "generating" | "done" | "error";

export default function SetupWizard() {
  const setProjectReady = useStore((s) => s.setProjectReady);

  const [form, setForm] = useState<FormFields>({
    appTitle: "Base Training",
    appId: "basetraining",
    groupId: "com.basetraining",
    archetypeVersion: "56",
  });

  const [phase, setPhase] = useState<Phase>("form");
  const [logs, setLogs] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleChange = (field: keyof FormFields, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));

    // Auto-derive appId and groupId when appTitle changes
    if (field === "appTitle") {
      const id = value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
      setForm((prev) => ({
        ...prev,
        [field]: value,
        appId: id,
        groupId: `com.${id}`,
      }));
    }
  };

  const handleGenerate = () => {
    if (!form.appTitle.trim() || !form.appId.trim() || !form.groupId.trim()) return;

    setPhase("generating");
    setLogs("");
    setErrorMsg("");

    streamProjectGenerate(form, {
      onOutput(text) {
        setLogs((prev) => prev + text);
      },
      onComplete(success, _path) {
        if (success) {
          setPhase("done");
          // Short delay so user sees the success state before the main UI loads
          setTimeout(() => {
            setProjectReady(true);
          }, 1500);
        } else {
          setPhase("error");
          setErrorMsg("Archetype generation failed. Check the output above.");
        }
      },
      onError(error) {
        setPhase("error");
        setErrorMsg(error);
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-2xl font-bold text-white tracking-wide">Deloitte</span>
            <span className="text-sm bg-deloitte-green/20 text-deloitte-green px-3 py-1 rounded font-semibold uppercase">
              AEM Labs
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Welcome to AEM Train Me</h1>
          <p className="text-sm text-gray-400">
            No AEM project detected. Let&apos;s create one using the AEM Project Archetype.
          </p>
        </div>

        {/* Form / generating / done */}
        <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
          {/* Form Phase */}
          {phase === "form" && (
            <div className="p-6">
              <h2 className="text-sm font-semibold text-deloitte-green uppercase tracking-wider mb-4">
                Project Configuration
              </h2>
              <div className="space-y-4">
                <FieldRow
                  label="App Title"
                  value={form.appTitle}
                  onChange={(v) => handleChange("appTitle", v)}
                  placeholder="My Site"
                  hint="Display name for your AEM project"
                />
                <FieldRow
                  label="App ID"
                  value={form.appId}
                  onChange={(v) => handleChange("appId", v)}
                  placeholder="mysite"
                  hint="Used for folder names, component paths (/apps/{appId})"
                />
                <FieldRow
                  label="Group ID"
                  value={form.groupId}
                  onChange={(v) => handleChange("groupId", v)}
                  placeholder="com.mysite"
                  hint="Java package name (e.g., com.mysite)"
                />
                <FieldRow
                  label="Archetype Version"
                  value={form.archetypeVersion}
                  onChange={(v) => handleChange("archetypeVersion", v)}
                  placeholder="56"
                  hint="AEM Project Archetype version"
                />
              </div>

              <div className="mt-6 p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
                  Maven Command Preview
                </div>
                <code className="text-[11px] text-amber-300 block whitespace-pre-wrap break-all leading-relaxed">
                  {`mvn -B org.apache.maven.plugins:maven-archetype-plugin:3.3.1:generate \\\n  -DarchetypeGroupId=com.adobe.aem \\\n  -DarchetypeArtifactId=aem-project-archetype \\\n  -DarchetypeVersion=${form.archetypeVersion} \\\n  -DappTitle="${form.appTitle}" \\\n  -DappId="${form.appId}" \\\n  -DgroupId="${form.groupId}"`}
                </code>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!form.appTitle.trim() || !form.appId.trim()}
                className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                           bg-deloitte-green text-black font-semibold text-sm
                           hover:bg-deloitte-green/80 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-colors"
              >
                <Rocket size={18} />
                Generate AEM Project
              </button>
            </div>
          )}

          {/* Generating Phase */}
          {(phase === "generating" || phase === "error") && (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                {phase === "generating" ? (
                  <>
                    <Loader2 size={16} className="text-deloitte-green animate-spin" />
                    <span className="text-sm font-semibold text-white">
                      Generating AEM project...
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="text-red-400" />
                    <span className="text-sm font-semibold text-red-400">
                      Generation failed
                    </span>
                  </>
                )}
              </div>

              {/* Console */}
              <div className="bg-[#0d0d0d] rounded-lg border border-white/10 h-72 overflow-y-auto font-mono text-[11px] p-3">
                <div className="flex items-center gap-1.5 mb-2 text-gray-500">
                  <Terminal size={12} />
                  <span>Maven Output</span>
                </div>
                <pre className="text-gray-300 whitespace-pre-wrap break-all">{logs}</pre>
                <div ref={logsEndRef} />
              </div>

              {errorMsg && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  {errorMsg}
                </div>
              )}

              {phase === "error" && (
                <button
                  onClick={() => { setPhase("form"); setLogs(""); setErrorMsg(""); }}
                  className="mt-4 w-full px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-medium
                             hover:bg-white/20 transition-colors"
                >
                  Back to Configuration
                </button>
              )}
            </div>
          )}

          {/* Done Phase */}
          {phase === "done" && (
            <div className="p-8 text-center">
              <CheckCircle size={48} className="text-deloitte-green mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Project Created Successfully!</h3>
              <p className="text-sm text-gray-400 mb-1">
                <span className="text-deloitte-green font-mono">{form.appId}</span> is ready.
              </p>
              <p className="text-xs text-gray-500">
                Loading the trainer interface...
              </p>
              <div className="mt-4">
                <Loader2 size={20} className="text-deloitte-green animate-spin mx-auto" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: Readonly<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint: string;
}>) {
  const id = label.toLowerCase().replaceAll(/\s+/g, "-");
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-gray-300" id={`${id}-label`}>
          {label}
        </span>
        <span className="text-[10px] text-gray-600">{hint}</span>
      </div>
      <input
        type="text"
        aria-labelledby={`${id}-label`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                   placeholder-gray-600 outline-none focus:border-deloitte-green/50 transition-colors"
      />
    </div>
  );
}
