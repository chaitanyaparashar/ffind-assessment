import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadState,
  saveState,
  clearState,
  makeTitle,
  STORAGE_KEY,
} from "@/lib/storage";
import type { ChatsState, Message } from "@/lib/types";

const sampleMessages: Message[] = [
  { id: "1", role: "user", content: "hi", createdAt: 1 },
  { id: "2", role: "assistant", content: "hello", createdAt: 2 },
];

const sampleState: ChatsState = {
  chats: [
    {
      id: "c1",
      title: "Greeting",
      messages: sampleMessages,
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  activeId: "c1",
};

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadState", () => {
    it("returns empty state when nothing stored", () => {
      expect(loadState()).toEqual({ chats: [], activeId: null });
    });

    it("round-trips state", () => {
      saveState(sampleState);
      expect(loadState()).toEqual(sampleState);
    });

    it("returns empty on malformed JSON", () => {
      localStorage.setItem(STORAGE_KEY, "{not json");
      expect(loadState()).toEqual({ chats: [], activeId: null });
    });

    it("returns empty when stored value is not the expected shape", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ foo: 1 }]));
      expect(loadState()).toEqual({ chats: [], activeId: null });
    });

    it("migrates legacy chat-history-v1 into a single chat", () => {
      localStorage.setItem("chat-history-v1", JSON.stringify(sampleMessages));
      const result = loadState();
      expect(result.chats).toHaveLength(1);
      expect(result.chats[0].messages).toEqual(sampleMessages);
      expect(result.activeId).toBe(result.chats[0].id);
      expect(localStorage.getItem("chat-history-v1")).toBeNull();
    });

    it("does not migrate when legacy data is malformed", () => {
      localStorage.setItem("chat-history-v1", JSON.stringify({ foo: 1 }));
      const result = loadState();
      expect(result).toEqual({ chats: [], activeId: null });
      expect(localStorage.getItem("chat-history-v1")).toBeNull();
    });
  });

  describe("saveState", () => {
    it("writes JSON to localStorage", () => {
      saveState(sampleState);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string)).toEqual(sampleState);
    });

    it("does not throw on quota errors", () => {
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceeded");
        });
      expect(() => saveState(sampleState)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("clearState", () => {
    it("removes the storage key", () => {
      saveState(sampleState);
      clearState();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(loadState()).toEqual({ chats: [], activeId: null });
    });
  });

  describe("makeTitle", () => {
    it("returns trimmed text under 40 chars as-is", () => {
      expect(makeTitle("Hello world")).toBe("Hello world");
    });

    it("collapses whitespace", () => {
      expect(makeTitle("Hello   \n world")).toBe("Hello world");
    });

    it("truncates with ellipsis past 40 chars", () => {
      const long = "a".repeat(60);
      const result = makeTitle(long);
      expect(result.endsWith("…")).toBe(true);
      expect(result.length).toBeLessThanOrEqual(41);
    });

    it('returns "New chat" for empty input', () => {
      expect(makeTitle("   ")).toBe("New chat");
    });
  });
});
