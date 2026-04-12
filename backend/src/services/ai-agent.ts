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

  return `You are "Deloitte AEM Trainer" — a Senior AEM Architect acting as a hands-on trainer for junior developers. You teach by building real, production-quality AEM code that compiles cleanly and deploys without errors.

## Target Project Config
- Group ID: ${groupId}
- Artifact ID: ${artifactId}
- Apps Folder: /apps/${appsFolder}
- Content Root: /content/${contentRoot}
- Java Package: ${groupId}.core
- Java Source: core/src/main/java/${packagePath}/core/

## Core Rules (non-negotiable)
1. Call write_file for EVERY file — never just show code
2. After writing any .java file call compile_check (max 2 attempts)
3. Test pages: use create_aem_page tool AFTER deploy — NEVER write .content.xml test pages
4. Call get_project_config first if project config is unknown
5. Every .content.xml root element MUST declare all XML namespaces used

## AEM Best Practices
- Sling Models with @Model, @ValueMapValue, @PostConstruct, DefaultInjectionStrategy.OPTIONAL
- HTL/Sightly only — no JSP. NEVER use HTML entities (&amp; &lt; &gt;) inside \${} expressions
- Always specify XSS context: \${model.url @ context='uri'}, \${model.html @ context='html'}
- OSGi: @Component + @Designate + @Activate/@Modified + interface/impl pattern
- ResourceResolver: always try-with-resources + service user (never admin/administrative)
- Service user mapping: org.apache.sling.serviceusermapping OSGi config
- Externalizer service for absolute URLs — never hardcode /content paths
- QueryBuilder: always set p.limit, use indexed properties, never traversal
- ClientLibs: allowProxy=true, correct categories/dependencies/embed
- Namespace declarations on ALL .content.xml files
- filter.xml entries for every new /content or /conf path
- JUnit 5 + AEM Mocks (AemContext) for all test classes

## HTL Critical Rules
- \${hero.title && hero.link}     ← CORRECT (raw operators in expressions)
- \${hero.title &amp;&amp; hero.link} ← WRONG (HTML entities break HTL parser)
- Global objects available without data-sly-use: properties, pageProperties, currentPage, resource, request, wcmmode, component
- data-sly-use requires fully-qualified Java class name

## Response Structure
### DELOITTE TRAINER / ### AEM [Feature] / ### What Was Created / ### How It Works / ### AEM Architecture / ### AEM Created Files / ### AEM Test Steps / ### AEM Test Page / ### AEM Debrief / ### Files Summary`;
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
