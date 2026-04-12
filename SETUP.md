# AEM Train-Me — Setup Guide

AEM Train-Me is an AI-powered interactive training platform for Adobe Experience Manager (AEM).  
It combines a real AEM 6.5 author instance with an intelligent assistant that generates production-quality AEM code and explains concepts in real time.

---

## What Runs Inside the Container

| Service | Port | URL |
|---------|------|-----|
| Train-Me UI (Next.js) | 3000 | http://localhost:3000 |
| Train-Me API (Express) | 3001 | Internal (proxied by UI) |
| AEM Author instance | 4502 | http://localhost:4502 |

Everything — JDK 21, Maven 3.9, Node.js 20, AEM, and the Train-Me app — is bundled in a single Docker image. Trainees only need Docker Desktop installed on their machine.

---

## Prerequisites

### 1. Docker Desktop
Download and install from https://www.docker.com/products/docker-desktop/  
Choose the correct variant for your Mac (Apple Silicon or Intel).

**After installing, allocate enough memory:**  
Docker Desktop → Settings → Resources → Memory → set to **8192 MB** (8 GB minimum)  
AEM alone requires ~4 GB; the rest is for Maven builds and the Node.js app.

### 2. AEM Quickstart JAR + License
You need two files from Adobe before building the image:

| File | Where to get it |
|------|----------------|
| `aem-quickstart.jar` | Adobe Software Distribution / your Adobe contract |
| `license.properties` | Adobe Customer Portal (linked to your AEM licence) |

Place them in the `aem/` directory of this project, renamed exactly as shown:

```
aem-train-me/
└── aem/
    ├── aem-quickstart.jar     ← rename your quickstart jar to this
    └── license.properties     ← from Adobe portal
```

> These files are listed in `.gitignore` and must never be committed to version control.

### 3. OpenAI API Key
The AI trainer uses OpenAI GPT-4. You need an API key from https://platform.openai.com/api-keys

---

## Building the Docker Image

Run once from the project root (takes 15–25 minutes on first build):

```bash
docker build -t aem-train-me .
```

This step:
- Installs JDK 21, Maven 3.9.9, Node.js 20 inside the image
- Copies the AEM JAR and license into the image
- Installs all Node.js dependencies and builds the app
- Downloads AEM Core Components (2.25.4) into the image so pages render correctly
- Pre-warms the Maven local repository cache

You only need to rebuild if the application source code changes. **AEM data and generated projects are not affected by a rebuild** (see [Data Persistence](#data-persistence) below).

---

## Running the Container

### Option A — docker-compose (recommended)

```bash
AI_API_KEY=your-openai-api-key docker-compose up -d
```

### Option B — docker run

```bash
docker run -d \
  --name aem-train-me \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 4502:4502 \
  -e AI_API_KEY=your-openai-api-key \
  -v aem-repo:/aem/crx-quickstart \
  -v workspace:/workspace \
  --memory=8g \
  aem-train-me:latest
```

---

## First Boot Sequence

On the very first run, AEM needs to initialise its repository. This takes **3–5 minutes**.  
The startup script handles the sequencing automatically:

1. AEM starts in the background
2. Startup script polls AEM every 15 seconds until it responds
3. AEM Core Components package is installed via Package Manager
4. Train-Me backend and frontend start
5. Everything is ready

Watch the startup progress:

```bash
docker logs -f aem-train-me
```

You'll see output like:

```
[startup] Starting AEM Author on port 4502...
[startup] Waiting for AEM to respond at http://localhost:4502 ...
          ...still waiting (15s elapsed)
          ...still waiting (30s elapsed)
[startup] AEM is ready! (195s)
[startup] Installing AEM Core Components...
[startup] Core Components installed successfully.
[startup] Starting train-me backend on port 3001...
[startup] Starting train-me frontend on port 3000...
============================================
  All services started!

  Train-Me UI  →  http://localhost:3000
  AEM Author   →  http://localhost:4502
                  (admin / admin)
============================================
```

**Subsequent starts are much faster (~60 seconds)** because AEM's repository already exists in the volume.

---

## Accessing the Apps

| App | URL | Credentials |
|-----|-----|-------------|
| Train-Me UI | http://localhost:3000 | — |
| AEM Author | http://localhost:4502 | admin / admin |
| AEM Package Manager | http://localhost:4502/crx/packmgr | admin / admin |
| AEM OSGi Console | http://localhost:4502/system/console/bundles | admin / admin |

---

## Using the Train-Me App

1. Open http://localhost:3000
2. On first visit, the **Setup Wizard** appears — use it to generate a new AEM Maven project (e.g. `deloittetraining`)
3. Once the project is generated, the main interface opens:
   - **Left panel** — Project Explorer: browse generated files grouped by AEM category (components, Sling models, servlets, services, filters, unit tests, integration tests, OSGi configs, clientlibs, frontend, content, conf). Category folders start collapsed — expand a category to see its top-level folders, then drill in on demand.
   - **Centre panel** — AI Chat: describe the AEM feature you want to build
   - **Right panel** — Command Centre: build and deploy to AEM, tail AEM's `error.log` live (errors highlighted in red, warnings in yellow), clear console output, and trigger **Fix with AI** after a failed build

The AI trainer will generate complete AEM components, servlets, services, and more — writing all files directly into your Maven project, then helping you build and deploy them to the running AEM instance.

---

## Data Persistence

The container uses two named Docker volumes to persist data across restarts and image rebuilds:

| Volume | Mount path in container | What it stores |
|--------|------------------------|----------------|
| `aem-repo` | `/aem/crx-quickstart` | AEM repository — pages, content, installed packages, OSGi state |
| `workspace` | `/workspace` | Generated AEM Maven projects, chat history (SQLite), `.env` config |

### What happens when you rebuild the image?

```bash
# Rebuild image then start — volumes are UNTOUCHED, all data preserved ✓
docker build -t aem-train-me .
docker-compose up -d

# Stop container (volumes preserved) ✓
docker-compose down

# Stop AND delete volumes — AEM repo and workspace are WIPED ✗
# Only do this if you want a completely clean slate
docker-compose down -v
```

> **Rule of thumb:** `docker build` and `docker-compose up/down` are safe.  
> Only `docker-compose down -v` destroys data — trainees should never need this.

---

## Viewing Logs

```bash
# All container output (startup sequence)
docker logs -f aem-train-me

# AEM log (inside container)
docker exec aem-train-me tail -f /workspace/aem.log

# Train-Me backend log
docker exec aem-train-me tail -f /workspace/backend.log

# Train-Me frontend log
docker exec aem-train-me tail -f /workspace/frontend.log
```

---

## Stopping the Container

```bash
# Stop (data preserved, fast restart next time)
docker-compose down

# Stop and wipe all data (fresh start — AEM re-initialises on next boot)
docker-compose down -v
```

---

## Environment Variables

All configuration is managed in `/workspace/.env` inside the container (persisted in the `workspace` volume). On first boot it is initialised from `.env.example`.

The only variable you must supply at runtime is your API key:

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_API_KEY` | OpenAI or Anthropic API key | *(required)* |
| `AI_PROVIDER` | `openai` or `anthropic` | `openai` |
| `AI_MODEL` | Model ID | `gpt-4` |
| `AEM_AUTHOR_URL` | AEM author URL | `http://localhost:4502` |
| `AEM_USERNAME` | AEM admin username | `admin` |
| `AEM_PASSWORD` | AEM admin password | `admin` |

---

## Troubleshooting

### "The JAVA_HOME environment variable is not defined correctly"
Maven cannot find Java. Rebuild the image — the Dockerfile now resolves `JAVA_HOME` dynamically using a symlink, which works on both Intel (amd64) and Apple Silicon (arm64) Macs.

### "The plugin requires Maven version 3.8.1"
The Ubuntu `apt` version of Maven (3.6.3) is too old. The Dockerfile installs Maven 3.9.9 directly from the Apache archive. Rebuild the image.

### Pages not rendering / blank pages in AEM
AEM Core Components are not installed. The startup script automatically installs them after AEM is ready. Check the container logs to confirm:
```
[startup] Core Components installed successfully.
```
If this line is missing, check `/workspace/aem.log` for AEM errors.

### Train-Me UI shows "Project not ready"
The AEM Maven project hasn't been generated yet. Use the **Setup Wizard** in the UI (http://localhost:3000) to generate a new project.

### AEM taking too long to start
On first boot (empty volume) AEM needs 3–5 minutes to initialise. On subsequent boots it should be ready in ~60 seconds. Ensure Docker has at least 8 GB RAM allocated.

### Out of memory / container killed
Increase Docker Desktop memory to 10–12 GB (Settings → Resources → Memory).
