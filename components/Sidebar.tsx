"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Chat, ChatStatus } from "@/lib/types";

type Props = {
  chats: Chat[];
  activeId: string | null;
  status: ChatStatus;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export function Sidebar({
  chats,
  activeId,
  status,
  open,
  onClose,
  onNewChat,
  onSelect,
  onDelete,
}: Props) {
  // Confirmation state for two things that need a warning:
  //   - switching chat while a stream is in flight
  //   - deleting a chat (any chat)
  // We stash the pending target id so the dialog's Confirm action knows
  // which chat to act on.
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const isStreaming = status === "streaming";

  function handleSelect(id: string) {
    if (id === activeId) {
      onClose();
      return;
    }
    if (isStreaming) {
      setSwitchTarget(id);
      return;
    }
    onSelect(id);
    onClose();
  }

  function handleNewChat() {
    if (isStreaming) {
      setSwitchTarget("__new__");
      return;
    }
    onNewChat();
    onClose();
  }

  function confirmSwitch() {
    const target = switchTarget;
    setSwitchTarget(null);
    if (!target) return;
    if (target === "__new__") onNewChat();
    else onSelect(target);
    onClose();
  }

  function confirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    onDelete(target);
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r bg-card transition-transform md:relative md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Chat history"
      >
        <div className="flex items-center justify-between border-b px-3 py-3">
          <Button
            onClick={handleNewChat}
            className="flex-1 justify-start gap-2 rounded-lg"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-2 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No chats yet
            </p>
          ) : (
            <ul className="space-y-1">
              {sorted.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(c.id)}
                        className="flex flex-1 items-center gap-2 truncate text-left"
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.title}</span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(c.id);
                        }}
                        aria-label={`Delete chat: ${c.title}`}
                        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          History is saved locally in your browser.
        </div>
      </aside>

      {/* Switch-while-streaming confirm */}
      <AlertDialog
        open={switchTarget !== null}
        onOpenChange={(o) => !o && setSwitchTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop current response?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching chats will stop the response that&apos;s currently
              streaming. Any partial answer will remain in this thread.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSwitchTarget(null)}>
              Keep streaming
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>
              Stop and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the conversation. This action
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
