"use client";

/**
 * useChats — the single source of truth for all client-side chat state.
 *
 * What it owns:
 *   - `chats[]` and `activeId` (which thread is showing)
 *   - streaming `status` and `error` for the active turn
 *   - an `AbortController` so Stop / clear / switch can cancel cleanly
 *   - the typewriter timer that paces streamed text to a constant cadence
 *   - hydration from localStorage on mount + write-through after each turn
 *
 * Components above are intentionally dumb — they call methods from here and
 * render the resulting state. All mutations go through `setState((prev) => ...)`
 * patches so every chat update bumps `updatedAt` for sidebar ordering.
 *
 * Streaming flow inside `sendMessage`:
 *   network reader  →  `target` ref   (everything we've received)
 *                       │
 *                       ▼
 *                  typewriter tick  →  React state  →  UI
 *                       │
 *                       └── awaited by `typewriterDone` before status → idle
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadState,
  saveState,
  clearState,
  makeTitle,
} from "@/lib/storage";
import type { Chat, ChatStatus, ChatsState, Message } from "@/lib/types";

// Web crypto with a deterministic fallback for older test runners.
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Translate raw SDK / fetch errors into user-readable copy. Patterns are
// matched in priority order; anything we don't recognize and that is over
// 160 chars long gets a generic message rather than dumping a stack trace.
function friendlyError(raw: string): string {
  if (/503|service unavailable|high demand|overloaded/i.test(raw)) {
    return "Gemini is busy right now. Please try again in a moment.";
  }
  if (/\b429\b|rate.?limit/i.test(raw)) {
    return "Too many requests. Please slow down and try again.";
  }
  if (/\b401\b|api key|unauthorized/i.test(raw)) {
    return "API key missing or invalid. Check your .env.local.";
  }
  if (/\b400\b|invalid|too small/i.test(raw)) {
    return "The request was malformed. Try clearing the chat and starting over.";
  }
  if (/network|fetch failed|failed to fetch/i.test(raw)) {
    return "Network error. Check your connection.";
  }
  if (raw.length > 160) return "Something went wrong. Please try again.";
  return raw;
}

// Typewriter pacing — constant cadence, time-based (NOT refresh-rate based).
// Speed = CHARS_PER_TICK × (1000 / TICK_INTERVAL_MS) chars/sec.
// Defaults: 2 × (1000 / 30) ≈ 66 chars/sec — feels like ChatGPT/Claude.
const CHARS_PER_TICK = 2;
const TICK_INTERVAL_MS = 30;

function createChat(): Chat {
  const now = Date.now();
  return {
    id: newId(),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function useChats() {
  const [state, setState] = useState<ChatsState>({ chats: [], activeId: null });
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once on mount; if storage is empty, seed an initial chat so
  // the UI never has to handle "no chats" as a state.
  useEffect(() => {
    const loaded = loadState();
    hydratedRef.current = true;
    if (loaded.chats.length > 0) {
      const activeId =
        loaded.activeId && loaded.chats.some((c) => c.id === loaded.activeId)
          ? loaded.activeId
          : loaded.chats[0].id;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ chats: loaded.chats, activeId });
      return;
    }
    const seed = createChat();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ chats: [seed], activeId: seed.id });
  }, []);

  // Persist after each idle turn so localStorage stays current.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (status !== "idle") return;
    if (state.chats.length === 0) return;
    saveState(state);
  }, [state, status]);

  // Cancel typewriter on unmount.
  useEffect(() => {
    return () => {
      if (tickTimerRef.current != null) clearTimeout(tickTimerRef.current);
    };
  }, []);

  const activeChat: Chat | null =
    state.chats.find((c) => c.id === state.activeId) ?? null;

  // ── Mutators ───────────────────────────────────────────────────────────
  // All mutations go through patchActiveChat / replaceState so updatedAt
  // and ordering stay consistent.

  const patchActiveChat = useCallback(
    (patch: (chat: Chat) => Chat) => {
      setState((prev) => {
        if (!prev.activeId) return prev;
        const chats = prev.chats.map((c) =>
          c.id === prev.activeId ? { ...patch(c), updatedAt: Date.now() } : c,
        );
        return { ...prev, chats };
      });
    },
    [],
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    if (tickTimerRef.current != null) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setStatus("idle");
    setError(null);
    setState((prev) => {
      // If there's already an empty "New chat" at the top, just activate it.
      const blank = prev.chats.find(
        (c) => c.messages.length === 0 && c.title === "New chat",
      );
      if (blank) return { ...prev, activeId: blank.id };
      const fresh = createChat();
      return { chats: [fresh, ...prev.chats], activeId: fresh.id };
    });
  }, []);

  const selectChat = useCallback((id: string) => {
    abortRef.current?.abort();
    if (tickTimerRef.current != null) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setStatus("idle");
    setError(null);
    setState((prev) => ({ ...prev, activeId: id }));
  }, []);

  const deleteChat = useCallback((id: string) => {
    setState((prev) => {
      const remaining = prev.chats.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = createChat();
        return { chats: [fresh], activeId: fresh.id };
      }
      const activeId =
        prev.activeId === id ? remaining[0].id : prev.activeId;
      return { chats: remaining, activeId };
    });
    if (state.activeId === id) {
      abortRef.current?.abort();
      if (tickTimerRef.current != null) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      setStatus("idle");
      setError(null);
    }
  }, [state.activeId]);

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    if (tickTimerRef.current != null) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    clearState();
    const fresh = createChat();
    setState({ chats: [fresh], activeId: fresh.id });
    setStatus("idle");
    setError(null);
  }, []);

  // Wipe messages from the active chat but keep the row in the sidebar so
  // the user's mental model of "which thread am I in" doesn't reset.
  const clearActiveChat = useCallback(() => {
    abortRef.current?.abort();
    if (tickTimerRef.current != null) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setStatus("idle");
    setError(null);
    setState((prev) => {
      if (!prev.activeId) return prev;
      const now = Date.now();
      return {
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === prev.activeId
            ? { ...c, messages: [], title: "New chat", updatedAt: now }
            : c,
        ),
      };
    });
  }, []);

  // Auto-title: after a chat's first exchange completes, ask the server to
  // summarize it into a short title. Fire-and-forget — failure just leaves
  // the placeholder title in place.
  const requestAutoTitle = useCallback(
    async (chatId: string, userText: string, assistantText: string) => {
      try {
        const res = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: userText, assistant: assistantText }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string };
        if (!data.title) return;
        setState((prev) => ({
          ...prev,
          chats: prev.chats.map((c) =>
            c.id === chatId ? { ...c, title: data.title!.slice(0, 60) } : c,
          ),
        }));
      } catch {
        // Silent failure — fallback title stays.
      }
    },
    [],
  );

  // ── sendMessage ────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (status === "streaming") return;
      const chatId = state.activeId;
      if (!chatId) return;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) return;

      const isFirstMessage = chat.messages.length === 0;

      const userMsg: Message = {
        id: newId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      const assistantId = newId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };

      const baseMessages = [...chat.messages, userMsg];
      patchActiveChat((c) => ({
        ...c,
        messages: [...baseMessages, assistantMsg],
        title: isFirstMessage ? makeTitle(trimmed) : c.title,
      }));
      setStatus("streaming");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // Strip prior failed / empty assistant turns from the payload so the
      // server's Zod schema (content min=1) doesn't reject the request.
      const payloadMessages = baseMessages
        .filter((m) => m.content.trim().length > 0 && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      // Typewriter — local per turn.
      let target = "";
      let displayed = "";
      let networkDone = false;
      let typewriterResolve: (() => void) | null = null;
      const typewriterDone = new Promise<void>((resolve) => {
        typewriterResolve = resolve;
      });

      const cancelTypewriter = () => {
        if (tickTimerRef.current != null) {
          clearTimeout(tickTimerRef.current);
          tickTimerRef.current = null;
        }
      };

      const writeAssistantContent = (content: string) => {
        setState((prev) => ({
          ...prev,
          chats: prev.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content } : m,
                  ),
                }
              : c,
          ),
        }));
      };

      const tick = () => {
        tickTimerRef.current = null;
        const remaining = target.length - displayed.length;
        if (remaining <= 0) {
          if (networkDone) typewriterResolve?.();
          return;
        }
        const step = Math.min(CHARS_PER_TICK, remaining);
        displayed = target.slice(0, displayed.length + step);
        writeAssistantContent(displayed);
        tickTimerRef.current = setTimeout(tick, TICK_INTERVAL_MS);
      };

      const ensureTypewriterRunning = () => {
        if (tickTimerRef.current != null) return;
        tickTimerRef.current = setTimeout(tick, TICK_INTERVAL_MS);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payloadMessages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let detail = `Request failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) detail = String(j.error);
          } catch {}
          throw new Error(detail);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          target += decoder.decode(value, { stream: true });
          ensureTypewriterRunning();
        }

        networkDone = true;
        ensureTypewriterRunning();
        await typewriterDone;

        setStatus("idle");

        // Auto-title after the first successful exchange.
        if (isFirstMessage && target.trim().length > 0) {
          requestAutoTitle(chatId, trimmed, target);
        }
      } catch (err) {
        cancelTypewriter();
        if (target.length > displayed.length) {
          writeAssistantContent(target);
        }
        if ((err as Error).name === "AbortError") {
          setStatus("idle");
          return;
        }
        const raw = err instanceof Error ? err.message : "Unknown error";
        const message = friendlyError(raw);
        setError(message);
        setState((prev) => ({
          ...prev,
          chats: prev.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, error: message } : m,
                  ),
                }
              : c,
          ),
        }));
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [state, status, patchActiveChat, requestAutoTitle],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    chats: state.chats,
    activeId: state.activeId,
    activeChat,
    messages: activeChat?.messages ?? [],
    status,
    error,
    sendMessage,
    stop,
    newChat,
    selectChat,
    deleteChat,
    clearAll,
    clearActiveChat,
  };
}
