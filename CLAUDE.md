# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AEM Train-Me is an AI-powered interactive training platform for Adobe Experience Manager (AEM). It combines a Next.js frontend, Express/TypeScript backend, and a live AEM 6.5 Author instance — all packaged in a single Docker container. Trainees describe AEM features in natural language; the AI generates complete deployable code, writes it to a Maven project, and helps build/deploy to AEM.

## Commands

### Development (local, outside Docker)
```bash
npm run dev              # Start backend + frontend concurrently
npm run dev:backend      # Backend only (tsx watch, port 3001)
npm run dev:frontend     # Frontend only (next dev, port 3000)
npm run build            # Build both (tsc + next build)
npm run install:all      # Install deps for root + backend + frontend
```

### Backend only
```bash
cd backend
npm run dev              # tsx watch src/index.ts
npm run build            # tsc
npm start                # node dist/index.js
```

### Frontend only
```bash
cd frontend
npm run dev              # next dev --port 3000
npm run build            # next build
npm start                # next start
```

### Docker (production)
```bash
docker build -t aem-train-me .
AI_API_KEY=<key> docker-compose up -d
docker-compose down          # stop, keep data
docker-compose down -v       # stop + wipe all volumes
```

## Architecture

**Three services in one Docker container:**
- **Frontend** (Next.js 14, port 3000) — Three-panel UI: project explorer, AI chat, command centre. Uses Zustand for state. Proxies `/api/*` to backend via Next.js rewrites.
- **Backend** (Express + TypeScript, port 3001) — REST API + SSE streaming. Orchestrates AI tool execution, Maven builds, file management, and AEM interaction.
- **AEM 6.5 Author** (port 4502) — Runs as a background process inside the container. Receives deployments via Package Manager HTTP API.

**Data stores:** SQLite (better-sqlite3) for chat sessions (`sessions`/`messages` tables) and training memory (`training_events` table with embeddings). DB file at `DB_PATH` (default `/workspace/data.db`).

### Backend structure (`backend/src/`)
- `config.ts` — Centralized config from env vars. `isProjectReady()` checks for pom.xml. `persistEnv()` writes config back to .env file.
- `routes/` — Express routers mounted at `/api/{chat,build,files,logs,aem,config,project}`.
- `services/ai-agent.ts` — Core AI agent loop. Uses OpenAI SDK (works with both OpenAI and Anthropic via `AI_PROVIDER`). Streams responses via SSE. Executes tool calls (`write_file`, `read_file`, `compile_check`, `create_aem_page`, etc.) in a loop (max 15 iterations).
- `services/training-memory.ts` — RAG over past trainee sessions. Embeds user prompts via OpenAI embeddings API, stores in SQLite, retrieves top-k by cosine similarity. Optional — enabled when `EMBEDDING_API_KEY` is set.
- `services/chat-store.ts` — SQLite-backed chat history (sessions + messages).
- `services/build-engine.ts` — Runs Maven builds, streams output.
- `services/aem-client.ts` — HTTP calls to AEM (bundle status, page creation, log tailing).
- `services/file-manager.ts` — Reads/writes files in the AEM Maven project directory. Tracks file changes per "turn" for undo.
- `tools/aem-tools.ts` — OpenAI function-calling tool definitions for the AI agent.

### Frontend structure (`frontend/src/`)
- `app/` — Next.js App Router (single page at `/`).
- `components/` — ChatPanel, ChatMessage, CommandCenter, ConsoleOutput, ProjectExplorer, FileViewer, SetupWizard, ResizablePanel.
- `lib/api.ts` — All backend API calls. Uses SSE streaming for chat, build, and project generation.
- `lib/types.ts` — Shared TypeScript types.
- `store/useStore.ts` — Zustand store for all UI state (chat, file tree, console, build status).

### Key data flow
1. User sends message → `POST /api/chat` (SSE) → `ai-agent.ts` calls LLM with tool definitions
2. LLM returns tool calls → agent executes them (write files, compile check, create pages) → results fed back to LLM
3. Streamed text chunks + tool call events sent to frontend via SSE
4. Build triggered → `POST /api/build` (SSE) → `build-engine.ts` runs Maven → streams output
5. File tree refreshed → `GET /api/files/tree` → categorized by AEM type

### AI system prompt
Located at `prompts/aem-architect.md`. Uses `{{groupId}}`, `{{artifactId}}`, `{{appsFolder}}`, `{{contentRoot}}`, `{{packagePath}}` placeholders filled from config. Defines comprehensive AEM coding rules, HTL patterns, Sling Model conventions, OSGi best practices, dialog XML patterns, and JUnit 5 test patterns.

## Environment Variables

Configured via `.env` file (see `.env.example`). Key vars:
- `AI_API_KEY` — OpenAI or Anthropic key (required)
- `AI_PROVIDER` — `openai` or `anthropic`
- `AI_MODEL` — Model ID (e.g., `gpt-4`, `claude-opus-4-6`)
- `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_BASE_URL` — For training memory RAG (optional)
- `AEM_AUTHOR_URL`, `AEM_USERNAME`, `AEM_PASSWORD` — AEM instance connection
- `AEM_PROJECT_PATH` — Path to the generated AEM Maven project
- `DB_PATH`, `PROMPT_PATH`, `AEM_PROJECTS_DIR` — Internal paths (pre-configured for Docker)

## Tech Stack

- **Backend:** Node.js 20, Express, TypeScript, OpenAI SDK, better-sqlite3, tsx (dev)
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Zustand, react-markdown, react-syntax-highlighter, lucide-react
- **Infrastructure:** Docker (Ubuntu 22.04), JDK 21, Maven 3.9.9, AEM 6.5
- **Backend is ESM** (`"type": "module"` in package.json) — imports use `.js` extensions
