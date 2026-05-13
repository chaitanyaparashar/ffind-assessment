"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { LoadingDots } from "./LoadingDots";
import type { Message, ChatStatus } from "@/lib/types";

type Props = {
  messages: Message[];
  status: ChatStatus;
};

// How close to the bottom (in px) counts as "user is following along".
// If they scroll above this threshold, we stop auto-following so they can
// read history without getting yanked back down.
const FOLLOW_THRESHOLD_PX = 120;

export function MessageList({ messages, status }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const lastCountRef = useRef(messages.length);

  // Track whether the user is currently near the bottom. We update this
  // on every scroll event so we know if they've manually scrolled away.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      followingRef.current = distance < FOLLOW_THRESHOLD_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // When a NEW message is added (user submit or assistant placeholder),
  // always snap to bottom and re-enable follow mode — the user clearly
  // wants to see what they just sent.
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      followingRef.current = true;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  // While streaming (assistant content grows char-by-char), keep the view
  // pinned to the bottom — but only if the user hasn't scrolled away.
  useEffect(() => {
    if (!followingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-8"
      aria-live="polite"
      aria-busy={status === "streaming"}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.map((m) => {
          const isStreamingPlaceholder =
            m.role === "assistant" &&
            !m.content &&
            !m.error &&
            status === "streaming";
          if (isStreamingPlaceholder) {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="rounded-2xl bg-muted px-5 py-3.5 text-muted-foreground">
                  <LoadingDots />
                </div>
              </div>
            );
          }
          return <MessageBubble key={m.id} message={m} />;
        })}
      </div>
    </div>
  );
}
