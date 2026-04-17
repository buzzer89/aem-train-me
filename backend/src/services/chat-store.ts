import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.resolve(__dirname, "../../data.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    title TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    files_created TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  files_created?: string[];
  created_at: string;
}

export function createSession(title?: string): string {
  const id = uuid();
  db.prepare("INSERT INTO sessions (id, title) VALUES (?, ?)").run(id, title ?? "New Session");
  return id;
}

export function addMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  filesCreated?: string[]
): string {
  const id = uuid();
  db.prepare(
    "INSERT INTO messages (id, session_id, role, content, files_created) VALUES (?, ?, ?, ?, ?)"
  ).run(id, sessionId, role, content, filesCreated ? JSON.stringify(filesCreated) : null);
  return id;
}

export function getHistory(sessionId: string): ChatMessage[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as Array<{
      id: string;
      session_id: string;
      role: string;
      content: string;
      files_created: string | null;
      created_at: string;
    }>;
  return rows.map((r) => ({
    ...r,
    role: r.role as ChatMessage["role"],
    files_created: r.files_created ? JSON.parse(r.files_created) : undefined,
  }));
}

export function listSessions(): Array<{ id: string; title: string; created_at: string }> {
  return db.prepare("SELECT id, title, created_at FROM sessions ORDER BY created_at DESC").all() as Array<{
    id: string;
    title: string;
    created_at: string;
  }>;
}

export function deleteSession(sessionId: string): boolean {
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  return result.changes > 0;
}
