# AEM Train-Me — Quick Start Guide

An AI-powered training platform for Adobe Experience Manager. Describe a feature in plain English, and the AI writes production-quality AEM code, deploys it to a live AEM instance, and explains how it works.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Docker Desktop** | Download from https://www.docker.com/products/docker-desktop/ |
| **Memory** | Docker Desktop must have **8 GB+ RAM** allocated |
| **AI API Key** | An OpenAI key (`sk-...`) or Anthropic key (`sk-ant-...`) |

### Set Docker memory

Docker Desktop → Settings → Resources → Memory → set to **8192 MB** (8 GB minimum)

### Get an API key

| Provider | Where to get a key | Key looks like |
|---|---|---|
| OpenAI (default) | https://platform.openai.com/api-keys | `sk-...` |
| Anthropic | https://console.anthropic.com | `sk-ant-...` |

> You need a pay-as-you-go API account. A ChatGPT Plus or Claude Pro subscription does **not** include API access — they are separate.

---

## Step 1 — Load the Docker image

If you received a `.tar` file:

```bash
docker load -i aem-train-me.tar
```

If pulling from a registry:

```bash
docker pull <registry-url>/aem-train-me:latest
```

Verify the image is loaded:

```bash
docker images | grep aem-train-me
```

---

## Step 2 — Start the container

### macOS / Linux

```bash
AI_API_KEY=sk-your-key-here docker-compose up -d
```

### Windows (PowerShell)

```powershell
$env:AI_API_KEY="sk-your-key-here"
docker-compose up -d
```

### Windows (Command Prompt)

```cmd
set AI_API_KEY=sk-your-key-here
docker-compose up -d
```

### Using Anthropic instead of OpenAI

Edit `docker-compose.yml` and uncomment the two Anthropic lines, then run:

```bash
AI_API_KEY=sk-ant-your-key-here docker-compose up -d
```

---

## Step 3 — Wait for AEM to start

First boot takes **3-5 minutes** while AEM initializes. Watch the progress:

```bash
docker logs -f aem-train-me-aem-train-me-1
```

You'll see output like:

```
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
============================================
```

Subsequent starts are much faster (~60 seconds).

---

## Step 4 — Open the app

| App | URL | Credentials |
|---|---|---|
| **Train-Me UI** | http://localhost:3000 | — |
| **AEM Author** | http://localhost:4502 | admin / admin |

On your first visit, a **Setup Wizard** will appear to generate an AEM Maven project. Follow the prompts (the defaults are fine).

---

## Using the app

The interface has three panels:

| Panel | What it does |
|---|---|
| **Left — Project Explorer** | Browse all generated AEM files by category |
| **Center — AI Chat** | Describe what you want to build, or ask AEM questions |
| **Right — Command Center** | Build & deploy to AEM, view Maven logs, tail error.log |

### Example prompts to try

- "Create a hero banner component with title, description, image, and CTA"
- "Build a servlet that generates a sitemap XML"
- "Create an OSGi service that fetches data from an external REST API"
- "Build a Sling Scheduler that runs every hour"
- "Create a custom workflow process step for page approval"

### Two modes

- **Deloitte Trainer** — AI writes complete AEM code, writes all files, and helps you build & deploy
- **General AEM** — Educational Q&A about AEM concepts (no code generation)

### Build & Deploy workflow

1. Ask the AI to create a feature
2. Click **Build & Deploy** in the Command Center
3. If the build fails, click **Fix with AI** — the AI reads the errors and fixes them
4. Open the AEM Author at http://localhost:4502 to see your deployed component

---

## Stopping & restarting

```bash
# Stop (all data preserved — fast restart next time)
docker-compose down

# Restart
AI_API_KEY=sk-your-key-here docker-compose up -d
```

All your AEM data, generated projects, and chat history are preserved across restarts.

### Full reset (wipes everything)

Only do this if you want a completely clean slate:

```bash
docker-compose down -v
```

---

## Troubleshooting

### "Please set AI_API_KEY" error

You forgot to set the key. Run with:

```bash
AI_API_KEY=sk-your-key-here docker-compose up -d
```

### AEM takes too long to start

- Ensure Docker has at least **8 GB RAM** allocated
- First boot is 3-5 minutes — subsequent boots are ~60 seconds

### Out of memory / container killed

Increase Docker Desktop memory to **10-12 GB** (Settings → Resources → Memory)

### Blank pages in AEM

AEM Core Components may not have installed. Check:

```bash
docker logs aem-train-me-aem-train-me-1 | grep "Core Components"
```

You should see `Core Components installed successfully.` If not, restart the container.

### Build button shows no output

Check the container is running:

```bash
docker ps
```

Check backend logs:

```bash
docker exec aem-train-me-aem-train-me-1 tail -50 /workspace/backend.log
```
