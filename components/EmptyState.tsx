"use client";

import { Button } from "@/components/ui/button";
import { Sparkles, Code2, Lightbulb } from "lucide-react";

const SUGGESTIONS: Array<{ icon: React.ComponentType<{ className?: string }>; text: string }> = [
  { icon: Sparkles, text: "Explain quantum computing in simple terms" },
  { icon: Code2, text: "Write a haiku about TypeScript" },
  { icon: Lightbulb, text: "Give me 3 ideas for a weekend project" },
];

type Props = {
  onPick: (text: string) => void;
};

export function EmptyState({ onPick }: Props) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="mb-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Ask Gemini anything
      </h2>
      <p className="mb-10 max-w-md text-base text-muted-foreground sm:text-lg">
        Start a conversation. Your chat history is saved in your browser.
      </p>
      <div className="grid w-full gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map(({ icon: Icon, text }) => (
          <Button
            key={text}
            variant="outline"
            onClick={() => onPick(text)}
            className="h-auto whitespace-normal rounded-xl border-border/70 px-4 py-4 text-left text-sm font-normal leading-snug hover:bg-accent/60 hover:shadow-sm sm:text-[13px]"
          >
            <Icon className="mr-2 h-4 w-4 shrink-0 text-primary" />
            <span>{text}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
