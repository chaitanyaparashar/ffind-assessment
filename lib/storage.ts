/**
 * SSR-safe localStorage adapter for the chat app's full state.
 *
 * Storage shape (versioned under `STORAGE_KEY`):
 *   { chats: Chat[], activeId: string | null }
 *
 * Every function guards `typeof window !== "undefined"` so the module is
 * safe to import from server components. All errors (malformed JSON, quota
 * exceeded, disabled storage) degrade silently so the UI stays usable
 * even when persistence is broken.
 *
 * Includes a one-time migration from the v1 single-thread schema
 * (`chat-history-v1` → wrapped into a single Chat under the new key).
 */
import type { Chat, ChatsState, Message } from "./types";

export const STORAGE_KEY = "chats-v1";
const LEGACY_KEY = "chat-history-v1";

const EMPTY: ChatsState = { chats: [], activeId: null };

const hasWindow = (): boolean => typeof window !== "undefined";

function isMessage(x: unknown): x is Message {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    typeof m.createdAt === "number"
  );
}

function isChat(x: unknown): x is Chat {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    Array.isArray(c.messages) &&
    c.messages.every(isMessage) &&
    typeof c.createdAt === "number" &&
    typeof c.updatedAt === "number"
  );
}

function isState(x: unknown): x is ChatsState {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    Array.isArray(s.chats) &&
    s.chats.every(isChat) &&
    (s.activeId === null || typeof s.activeId === "string")
  );
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Used as the default title until Gemini summarizes the first exchange.
export function makeTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 40) return trimmed || "New chat";
  return trimmed.slice(0, 40).trimEnd() + "…";
}

// One-time migration: the previous version stored a single Message[] under
// `chat-history-v1`. Wrap that into a single Chat and write it into the new
// shape, then delete the legacy key so we never touch it again.
function migrateLegacy(): ChatsState | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isMessage)) {
      window.localStorage.removeItem(LEGACY_KEY);
      return null;
    }
    const now = Date.now();
    const firstUser = parsed.find((m) => m.role === "user");
    const title = firstUser ? makeTitle(firstUser.content) : "New chat";
    const chat: Chat = {
      id: newId(),
      title,
      messages: parsed,
      createdAt: parsed[0]?.createdAt ?? now,
      updatedAt: now,
    };
    const state: ChatsState = { chats: [chat], activeId: chat.id };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.removeItem(LEGACY_KEY);
    return state;
  } catch {
    return null;
  }
}

export function loadState(): ChatsState {
  if (!hasWindow()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const migrated = migrateLegacy();
      return migrated ?? EMPTY;
    }
    const parsed = JSON.parse(raw);
    if (!isState(parsed)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

export function saveState(state: ChatsState): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded / disabled — degrade silently
  }
}

export function clearState(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
