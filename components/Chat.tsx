"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "./Header";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { Sidebar } from "./Sidebar";
import { useChats } from "@/hooks/useChats";

export function Chat() {
  const {
    chats,
    activeId,
    activeChat,
    messages,
    status,
    error,
    sendMessage,
    stop,
    newChat,
    selectChat,
    deleteChat,
    clearActiveChat,
  } = useChats();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const title = activeChat?.title ?? "Gemini Chat";

  return (
    <div className="flex h-dvh bg-background">
      <Sidebar
        chats={chats}
        activeId={activeId}
        status={status}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onSelect={selectChat}
        onDelete={deleteChat}
      />
      <main className="flex flex-1 flex-col">
        <Header
          title={title}
          onToggleSidebar={() => setSidebarOpen(true)}
          onClearActiveChat={clearActiveChat}
          canClear={messages.length > 0}
        />
        {messages.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState onPick={sendMessage} />
          </div>
        ) : (
          <MessageList messages={messages} status={status} />
        )}
        <div className="border-t bg-background/80 backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-4">
            <ChatInput
              onSubmit={sendMessage}
              onStop={stop}
              streaming={status === "streaming"}
            />
            <p className="mt-2.5 text-center text-xs text-muted-foreground">
              Press{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{" "}
              to send,{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Shift
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{" "}
              for newline.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
