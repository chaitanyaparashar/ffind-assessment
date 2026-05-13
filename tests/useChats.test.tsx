import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChats } from "@/hooks/useChats";

function mockStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// Mock both /api/chat (stream) and /api/title (JSON title summary).
function installFetchMock(streamChunks: string[]) {
  return vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/title")) {
      return Promise.resolve(
        new Response(JSON.stringify({ title: "Greeting Title" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(mockStreamResponse(streamChunks));
  });
}

describe("useChats", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds an initial chat on mount", () => {
    const { result } = renderHook(() => useChats());
    expect(result.current.chats).toHaveLength(1);
    expect(result.current.activeId).toBe(result.current.chats[0].id);
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe("idle");
  });

  it("appends user + streamed assistant reply in the active chat", async () => {
    installFetchMock(["Hello", " ", "world"]);

    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "hi" });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello world",
    });
  });

  it("ignores empty / whitespace-only prompts", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it("sets error state when the API returns non-OK", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBeTruthy();
    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.error).toBeTruthy();
  });

  it("newChat creates a fresh chat and activates it", async () => {
    installFetchMock(["ok"]);
    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("hi");
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));

    const firstId = result.current.activeId;
    act(() => result.current.newChat());

    expect(result.current.chats.length).toBeGreaterThanOrEqual(2);
    expect(result.current.activeId).not.toBe(firstId);
    expect(result.current.messages).toEqual([]);
  });

  it("selectChat switches between chats", async () => {
    installFetchMock(["ok"]);
    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("hi");
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));
    const firstId = result.current.activeId!;

    act(() => result.current.newChat());
    const secondId = result.current.activeId!;

    act(() => result.current.selectChat(firstId));
    expect(result.current.activeId).toBe(firstId);
    expect(result.current.messages).toHaveLength(2);

    act(() => result.current.selectChat(secondId));
    expect(result.current.activeId).toBe(secondId);
    expect(result.current.messages).toEqual([]);
  });

  it("deleteChat removes a chat and re-seeds if last one was deleted", async () => {
    const { result } = renderHook(() => useChats());
    const onlyId = result.current.activeId!;

    act(() => result.current.deleteChat(onlyId));
    expect(result.current.chats).toHaveLength(1);
    expect(result.current.activeId).not.toBe(onlyId);
  });

  it("persists state to localStorage after a successful turn", async () => {
    installFetchMock(["ok"]);
    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("hi");
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));

    const raw = localStorage.getItem("chats-v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.chats).toHaveLength(1);
    expect(parsed.chats[0].messages).toHaveLength(2);
  });

  it("sets the chat title from the first user message", async () => {
    installFetchMock(["ok"]);
    const { result } = renderHook(() => useChats());

    await act(async () => {
      await result.current.sendMessage("Tell me about TypeScript generics");
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));

    // Title is set synchronously from the user message; Gemini summarizer
    // may overwrite later, but the placeholder is deterministic.
    const title = result.current.activeChat?.title;
    expect(title === "Tell me about TypeScript generics" || title === "Greeting Title").toBe(true);
  });
});
