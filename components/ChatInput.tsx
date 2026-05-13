"use client";

import { useRef, useState, useEffect, FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square } from "lucide-react";

type Props = {
  onSubmit: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
};

export function ChatInput({ onSubmit, onStop, streaming }: Props) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 28 * 6 + 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (streaming) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-3xl border bg-background px-3 py-2.5 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring"
    >
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Gemini anything..."
        rows={1}
        className="min-h-[44px] resize-none border-0 bg-transparent px-1 py-2 text-base leading-relaxed shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 md:text-base"
        aria-label="Message"
      />
      {streaming ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Stop"
          onClick={onStop}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={!value.trim()}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </form>
  );
}
