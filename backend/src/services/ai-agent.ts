import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { aemToolDefinitions } from "../tools/aem-tools.js";
import {
  writeProjectFile,
  readProjectFile,
  listProjectDir,
  flatFileList,
  startFileTurn,
} from "./file-manager.js";
import { checkBundleStatus, checkHttpStatus, tailErrorLog, createAemPage } from "./aem-client.js";
import { buildEngine } from "./build-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSystemPrompt(): string {
  const promptPath = process.env.PROMPT_PATH || path.resolve(__dirname, "../../../prompts/aem-architect.md");
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, "utf-8");
  }
  return getDefaultSystemPrompt();
}

function getDefaultSystemPrompt(): string {
  const { groupId, artifactId, appsFolder, contentRoot } = config.aemProject;
  const packagePath = groupId.replaceAll(".", "/");

  return `You are "Deloitte AEM Trainer" — a Senior AEM Architect acting as a hands-on trainer for junior developers. You teach by building real, production-quality AEM code.

## Target Project Config
- Group ID: ${groupId}
- Artifact ID: ${artifactId}
- Apps Folder: /apps/${appsFolder}
- Content Root: /content/${contentRoot}
- Java Package: ${groupId}.core
- Java Source: core/src/main/java/${packagePath}/core/

## Your Responsibilities
1. When asked to create ANY AEM feature, you MUST generate ALL necessary files using the write_file tool — Java classes, HTL templates, dialog XMLs, content policies, OSGi configs, clientlibs, Sling Models, and test pages.

2. You MUST follow AEM best practices:
   - Use Sling Models (not WCMUsePojo)
   - Use HTL/Sightly (never JSP)
   - Proper OSGi DS annotations (@Component, @Reference, @Activate)
   - Resource resolver handling (try-with-resources, service users)
   - Proper JCR node types (cq:Component, cq:Page, nt:unstructured)
   - Content policies over design dialogs
   - Editable templates over static templates
   - Proper clientlib categories and dependencies

3. For EVERY feature, you MUST create a TEST PAGE under /content/${contentRoot}/trainer-tests/ using write_file:
   - The page uses an editable template
   - Components are pre-placed in the responsivegrid with sample content
   - The test page .content.xml is part of the generated files
   - File path: ui.content/src/main/content/jcr_root/content/${contentRoot}/trainer-tests/{feature-name}/.content.xml

4. You MUST explain each file in your response text:
   - What the file does and WHY it's needed
   - How it fits into the AEM architecture (Sling resolution, OSGi lifecycle, etc.)
   - What AEM APIs are being used and why
   - Common pitfalls and how to avoid them

5. Structure EVERY feature-creation response with these sections:
   ### DELOITTE TRAINER
   (greeting)
   
   ### AEM [Feature Type Name]
   
   ### What Was Created
   (plain-English description)
   
   ### How It Works
   (numbered architecture/flow explanation with code references)
   
   ### AEM Architecture
   \`\`\`
   (file tree of all created files)
   \`\`\`
   
   ### AEM Created Files
   (bullet list of every file with its purpose and detailed explanation)
   
   ### AEM Test Steps
   (numbered steps to build, deploy, verify, and study)
   
   ### AEM Test Page
   - Authoring URL: http://localhost:4502/editor.html/content/${contentRoot}/trainer-tests/{feature}.html
   - Preview URL: http://localhost:4502/content/${contentRoot}/trainer-tests/{feature}.html
   
   ### AEM Debrief
   (2-3 "Think about it" questions for the trainee)
   
   ### Files Summary
   X files created in your AEM project.

6. Your tone is encouraging, educational, and detailed.

## AEM Feature Types You Support
- Components (HTL + Sling Model + Dialog + Policy + Clientlib)
- Servlets (Sling Servlets — path-based and resource-type-based)
- Services (OSGi Services with interface + impl pattern)
- Filters (Servlet/Sling Filters)
- Schedulers (Sling Scheduler jobs)
- Workflow Steps (Custom workflow process steps)
- Event Handlers (Sling Event Handlers, JCR Observation)
- Experience Fragments & Content Fragments
- Editable Templates
- Context-Aware Configurations
- Frontend (ClientLibs structure)

IMPORTANT: Always call write_file for EVERY file you generate. Do not just show code — actually create the files in the project.
IMPORTANT: After writing any .java file, call compile_check once. If it fails, fix the errors and call compile_check one more time. Maximum 2 compile attempts — then proceed regardless and note any remaining issues.`;
}

type OnChunk = (text: string) => void;
type OnToolCall = (name: string, args: Record<string, unknown>, result: string) => void;
type OnFilesCreated = (files: string[]) => void;

export interface AgentCallbacks {
  onChunk: OnChunk;
  onToolCall?: OnToolCall;
  onFilesCreated?: OnFilesCreated;
  onComplete: (fullResponse: string, filesCreated: string[], turnId: string) => void;
  onError: (error: string) => void;
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  turnId: string,
  onProgress?: (text: string) => void
): Promise<string> {
  switch (name) {
    case "write_file": {
      const filePath = (args.path ?? args.file_path ?? args.filepath ?? args.filename) as string | undefined;
      const content = (args.content ?? args.file_content ?? args.text) as string | undefined;
      if (!filePath) return JSON.stringify({ error: "write_file called without a 'path' argument" });
      if (content === undefined) return JSON.stringify({ error: "write_file called without a 'content' argument" });
      writeProjectFile(filePath, content, turnId);
      return JSON.stringify({ success: true, path: filePath, message: `File written: ${filePath}` });
    }
    case "read_file": {
      const filePath = args.path as string;
      try {
        const content = readProjectFile(filePath);
        return content;
      } catch {
        return JSON.stringify({ error: `File not found: ${filePath}` });
      }
    }
    case "list_project_files": {
      const dir = (args.directory as string) || ".";
      const files = listProjectDir(dir);
      return JSON.stringify(files);
    }
    case "check_bundle_status": {
      const bundleName = args.bundle_name as string;
      const bundle = await checkBundleStatus(bundleName);
      return JSON.stringify(bundle ?? { error: "Bundle not found" });
    }
    case "check_http_status": {
      const url = args.url as string;
      const result = await checkHttpStatus(url);
      return JSON.stringify(result);
    }
    case "tail_aem_logs": {
      const lines = (args.lines as number) || 100;
      const logs = await tailErrorLog(lines);
      return logs;
    }
    case "compile_check": {
      onProgress?.("\n```\n");
      const result = await buildEngine.runCompileCheck((line) => {
        // Stream compiler output lines live so the user sees progress
        onProgress?.(line + "\n");
      });
      onProgress?.("```\n");
      const status = result.success
        ? "✅ Compilation successful — no errors."
        : "❌ Compilation FAILED — fix the errors below before proceeding.";
      return JSON.stringify({ success: result.success, status, output: result.output });
    }
    case "create_aem_page": {
      const result = await createAemPage({
        parentPath: args.parent_path as string,
        pageName: args.page_name as string,
        title: args.title as string,
        template: args.template as string,
        extraProperties: (args.extra_properties ?? {}) as Record<string, string>,
      });
      return JSON.stringify(result);
    }
    case "get_project_config": {
      return JSON.stringify({
        ...config.aemProject,
        authorUrl: config.aemInstance.authorUrl,
        javaPackage: `${config.aemProject.groupId}.core`,
        javaSourceRoot: `core/src/main/java/${config.aemProject.groupId.replaceAll(".", "/")}/core`,
      });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function runAgent(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  callbacks: AgentCallbacks,
  mode: "trainer" | "general" = "trainer"
): Promise<void> {
  const openai = new OpenAI({ apiKey: config.ai.apiKey });
  const filesCreated: string[] = [];
  const turnId = uuid();
  startFileTurn(turnId);

  const systemPrompt =
    mode === "trainer"
      ? loadSystemPrompt()
      : `You are an AEM architecture expert. Answer questions about Adobe Experience Manager concepts, best practices, architecture patterns, and development techniques. Be detailed and educational. Do NOT generate code files or call write_file — only explain concepts.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add project context for trainer mode
  if (mode === "trainer") {
    try {
      const fileList = flatFileList();
      if (fileList.length > 0) {
        messages.push({
          role: "system",
          content: `Current files in target AEM project:\n${fileList.slice(0, 200).join("\n")}`,
        });
      }
    } catch {
      // Project path may not exist yet
    }
  }

  for (const msg of history.slice(-20)) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }
  messages.push({ role: "user", content: userMessage });

  try {
    let fullResponse = "";
    let loopCount = 0;
    const maxLoops = 15; // prevent infinite tool-call loops

    while (loopCount < maxLoops) {
      loopCount++;

      const stream = await openai.chat.completions.create({
        model: config.ai.model,
        messages,
        tools: mode === "trainer" ? aemToolDefinitions : undefined,
        stream: true,
      });

      let assistantContent = "";
      const toolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }> = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          assistantContent += delta.content;
          fullResponse += delta.content;
          callbacks.onChunk(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = {
                  id: tc.id || "",
                  name: tc.function?.name || "",
                  arguments: "",
                };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
            }
          }
        }
      }

      // If there were no tool calls, we're done
      if (toolCalls.length === 0) {
        break;
      }

      // Add the assistant message with tool calls
      messages.push({
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      // Execute each tool call and add results
      for (const tc of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = {};
        }

        const result = await executeToolCall(tc.name, args, turnId, callbacks.onChunk);

        // Resolve the actual path used (AI sometimes uses file_path / filepath instead of path)
        const resolvedPath =
          (args.path ?? args.file_path ?? args.filepath ?? args.filename) as string | undefined;

        if (tc.name === "write_file" && resolvedPath) {
          filesCreated.push(resolvedPath);
        }

        // Pass resolved args so the frontend always has the correct path to display
        const displayArgs = { ...args, path: resolvedPath };
        callbacks.onToolCall?.(tc.name, displayArgs, result);

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    // If the AI wrote files but produced no text response, synthesize a brief summary
    // so the chat panel always shows something meaningful.
    if (!fullResponse.trim() && filesCreated.length > 0) {
      const summary =
        `**${filesCreated.length} file${filesCreated.length > 1 ? "s" : ""} updated:**\n\n` +
        filesCreated.map((f) => `- \`${f}\``).join("\n");
      callbacks.onChunk(summary);
      fullResponse = summary;
    }

    callbacks.onFilesCreated?.(filesCreated);
    callbacks.onComplete(fullResponse, filesCreated, turnId);
  } catch (err) {
    callbacks.onError((err as Error).message);
  }
}
