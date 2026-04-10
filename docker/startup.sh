#!/bin/bash
set -e

echo "============================================"
echo "  AEM Train-Me — Container Startup"
echo "============================================"

# ── Environment setup ──────────────────────────────────────────────────────
# Initialise /workspace/.env from the bundled example if it doesn't exist yet
# (first boot only; subsequent boots use the persisted volume copy)
if [ ! -f /workspace/.env ]; then
  echo "[startup] Initialising /workspace/.env from template..."
  cp /app/.env.example /workspace/.env
fi

# Ensure workspace directories exist (volume mount overrides image layers)
mkdir -p /workspace/aem-projects

# Load persisted config from /workspace/.env FIRST so values saved by the
# Setup Wizard (e.g. AEM_PROJECT_PATH) are restored on restart.
set -o allexport
# shellcheck source=/dev/null
source /workspace/.env 2>/dev/null || true
set +o allexport

# Set fixed paths — use := so we never override values already loaded from .env
export ENV_FILE=/workspace/.env
export DB_PATH=${DB_PATH:-/workspace/data.db}
export PROMPT_PATH=${PROMPT_PATH:-/app/prompts/aem-architect.md}
# Base directory where new AEM Maven projects are generated — must be on the volume
export AEM_PROJECTS_DIR=/workspace/aem-projects
# AEM_PROJECT_PATH intentionally NOT set here — it comes from /workspace/.env
# (written by persistEnv() when a project is generated via the Setup Wizard)

# ── Start AEM Author ───────────────────────────────────────────────────────
echo ""
echo "[startup] Starting AEM Author on port 4502..."
echo "          First boot takes 3-5 minutes while AEM initialises."
echo ""

cd /aem
java \
  -Xmx4096m \
  -Xms512m \
  -XX:+UseG1GC \
  -jar aem-quickstart.jar \
  -r author \
  -p 4502 \
  -nobrowser \
  > /workspace/aem.log 2>&1 &

AEM_PID=$!
echo "[startup] AEM PID: $AEM_PID"

# ── Wait for AEM to be ready ───────────────────────────────────────────────
echo "[startup] Waiting for AEM to respond at http://localhost:4502 ..."
WAIT=0
until curl -sf -u admin:admin \
    "http://localhost:4502/libs/granite/core/content/login.html" \
    > /dev/null 2>&1; do
  sleep 15
  WAIT=$((WAIT + 15))
  echo "          ...still waiting (${WAIT}s elapsed)"
done
echo "[startup] AEM is ready! (${WAIT}s)"

# ── Install AEM Core Components (first boot only) ──────────────────────────
# Core Components must be present before any trainee project pages can render.
# We check Package Manager — if already installed (subsequent boots), skip it.
CORE_PKG_CHECK=$(curl -sf -u admin:admin \
    "http://localhost:4502/crx/packmgr/service.jsp?cmd=ls" \
    | grep -c "core.wcm.components.all" 2>/dev/null || true)

if [ "$CORE_PKG_CHECK" -eq 0 ]; then
  echo "[startup] Installing AEM Core Components..."
  CORE_ZIP=$(ls /aem/packages/core.wcm.components.all-*.zip 2>/dev/null | head -1)
  if [ -n "$CORE_ZIP" ]; then
    curl -sf -u admin:admin \
      -F "file=@${CORE_ZIP}" \
      -F "name=core.wcm.components.all" \
      -F "force=true" \
      -F "install=true" \
      "http://localhost:4502/crx/packmgr/service.jsp" \
      > /dev/null
    echo "[startup] Core Components installed successfully."
  else
    echo "[startup] WARNING: Core Components zip not found in /aem/packages — pages may not render."
  fi
else
  echo "[startup] Core Components already installed, skipping."
fi

# ── Start train-me backend ─────────────────────────────────────────────────
echo ""
echo "[startup] Starting train-me backend on port 3001..."
cd /app/backend
node dist/index.js > /workspace/backend.log 2>&1 &
echo "[startup] Backend PID: $!"

# ── Start train-me frontend ────────────────────────────────────────────────
echo "[startup] Starting train-me frontend on port 3000..."
cd /app/frontend
npm start > /workspace/frontend.log 2>&1 &
echo "[startup] Frontend PID: $!"

echo ""
echo "============================================"
echo "  All services started!"
echo ""
echo "  Train-Me UI  →  http://localhost:3000"
echo "  AEM Author   →  http://localhost:4502"
echo "                  (admin / admin)"
echo "============================================"
echo ""
echo "Logs:"
echo "  AEM:      docker exec <container> tail -f /workspace/aem.log"
echo "  Backend:  docker exec <container> tail -f /workspace/backend.log"
echo "  Frontend: docker exec <container> tail -f /workspace/frontend.log"
echo ""

# Keep the container alive — exit if AEM crashes
wait $AEM_PID
