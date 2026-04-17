import { Router, Request, Response } from "express";
import { runAgent } from "../services/ai-agent.js";
import { createSession, addMessage, getHistory, listSessions, deleteSession } from "../services/chat-store.js";

const router = Router();

const VALID_MODES = new Set(["trainer", "general"]);

// POST /api/chat — streamed AI response via SSE
router.post("/", (req: Request, res: Response) => {
  const { message, sessionId, mode = "trainer" } = req.body as {
    message: string;
    sessionId?: string;
    mode?: string;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const validMode = VALID_MODES.has(mode) ? (mode as "trainer" | "general") : "trainer";
  const sid = sessionId || createSession(message.slice(0, 60));

  // Save user message
  addMessage(sid, "user", message);

  // Get history
  const history = getHistory(sid).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Session-Id": sid,
  });

  res.write(`data: ${JSON.stringify({ type: "session", sessionId: sid })}\n\n`);

  runAgent(message, history.slice(0, -1), {
    onChunk(text) {
      res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
    },
    onToolCall(name, args, result) {
      res.write(
        `data: ${JSON.stringify({ type: "tool_call", name, args, resultPreview: result.slice(0, 200) })}\n\n`
      );
    },
    onFilesCreated(files) {
      if (files.length > 0) {
        res.write(`data: ${JSON.stringify({ type: "files_created", files })}\n\n`);
      }
    },
    onComplete(fullResponse, filesCreated, turnId) {
      addMessage(sid, "assistant", fullResponse, filesCreated);
      res.write(`data: ${JSON.stringify({ type: "done", filesCreated, turnId })}\n\n`);
      res.end();
    },
    onError(error) {
      res.write(`data: ${JSON.stringify({ type: "error", error })}\n\n`);
      res.end();
    },
  }, validMode);
});

// GET /api/chat/history?sessionId=...
router.get("/history", (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  const history = getHistory(sessionId);
  res.json({ sessionId, messages: history });
});

// GET /api/chat/sessions
router.get("/sessions", (_req: Request, res: Response) => {
  const sessions = listSessions();
  res.json(sessions);
});

// DELETE /api/chat/sessions/:id
router.delete("/sessions/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "session id is required" });
    return;
  }
  const deleted = deleteSession(id);
  res.json({ deleted });
});

export default router;
