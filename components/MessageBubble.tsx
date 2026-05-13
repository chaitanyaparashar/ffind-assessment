"use client";

/**
 * MessageBubble — renders one chat message in three visual variants:
 *
 *   - user      → primary-colored bubble, right-aligned, preserves whitespace
 *   - assistant → muted bubble, left-aligned, markdown + code highlighting
 *   - error     → destructive bubble showing `message.error` instead of content
 *
 * Assistant messages route through `react-markdown` (+ GFM tables/lists +
 * `rehype-highlight` for fenced code blocks). The Tailwind `prose` plugin
 * provides the readable typography.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

type Props = { message: Message };

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isError = Boolean(message.error);

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-5 py-3 text-[15px] leading-relaxed",
          isUser && "bg-primary text-primary-foreground shadow-sm",
          !isUser && !isError && "bg-muted text-foreground",
          isError && "bg-destructive/10 text-destructive border border-destructive/30",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : isError ? (
          <p>{message.error}</p>
        ) : (
          <div className="prose prose-base dark:prose-invert max-w-none break-words prose-p:my-2 prose-pre:my-3 prose-pre:rounded-lg prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
