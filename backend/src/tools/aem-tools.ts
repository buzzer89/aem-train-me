import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const aemToolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write a file to the target AEM project. Creates parent directories as needed. Use relative paths from the AEM project root (e.g., core/src/main/java/...).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path within the AEM project (e.g., core/src/main/java/com/mysite/core/servlets/MyServlet.java)",
          },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the target AEM project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within the AEM project" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_project_files",
      description: "List files and directories at a given path in the AEM project.",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Relative directory path (e.g., 'core/src/main/java'). Use '.' for root.",
          },
        },
        required: ["directory"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_bundle_status",
      description: "Check the OSGi bundle status on the AEM instance. Returns bundle name and state (Active, Installed, Resolved, etc.).",
      parameters: {
        type: "object",
        properties: {
          bundle_name: { type: "string", description: "Part of the bundle symbolic name to search for" },
        },
        required: ["bundle_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_http_status",
      description: "Make an HTTP GET to a URL on the AEM instance and return the status code.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL path (e.g., /content/mysite/en.html) or full URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compile_check",
      description:
        "Run 'mvn compile' on the core Java module to verify there are no compilation errors. Call this after writing any Java file (.java). Returns success status and compiler output. If compilation fails, fix all errors and compile again before proceeding.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_aem_page",
      description:
        "Create a test page directly in the running AEM instance via HTTP (Sling POST). Use this instead of writing .content.xml files for test pages. The page is created live in AEM and is NOT part of the code package.",
      parameters: {
        type: "object",
        properties: {
          parent_path: {
            type: "string",
            description: "JCR parent path where the page will be created, e.g. /content/mysite/trainer-tests",
          },
          page_name: {
            type: "string",
            description: "Node name for the new page (URL-safe, no spaces), e.g. sitemap-feature",
          },
          title: {
            type: "string",
            description: "Human-readable page title shown in AEM UI",
          },
          template: {
            type: "string",
            description: "Full JCR path to the editable template, e.g. /conf/mysite/settings/wcm/templates/page-content",
          },
          extra_properties: {
            type: "object",
            description: "Optional extra jcr:content properties as key/value string pairs",
            additionalProperties: { type: "string" },
          },
        },
        required: ["parent_path", "page_name", "title", "template"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tail_aem_logs",
      description: "Read the last N lines from the AEM error.log.",
      parameters: {
        type: "object",
        properties: {
          lines: { type: "number", description: "Number of lines to tail (default 100)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_config",
      description: "Get the current AEM project configuration including groupId, artifactId, apps folder, content root, and AEM instance URL.",
      parameters: { type: "object", properties: {} },
    },
  },
];
