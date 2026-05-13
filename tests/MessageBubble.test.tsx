import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/MessageBubble";
import type { Message } from "@/lib/types";

function make(partial: Partial<Message>): Message {
  return {
    id: "x",
    role: "user",
    content: "",
    createdAt: 0,
    ...partial,
  };
}

describe("MessageBubble", () => {
  it("renders user content with role=user", () => {
    render(<MessageBubble message={make({ role: "user", content: "hello" })} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders assistant markdown bold", () => {
    render(
      <MessageBubble
        message={make({ role: "assistant", content: "this is **bold**" })}
      />,
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders assistant fenced code blocks", () => {
    render(
      <MessageBubble
        message={make({
          role: "assistant",
          content: "```js\nconst x = 1;\n```",
        })}
      />,
    );
    const code = document.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toMatch(/const x = 1/);
  });

  it("renders error state when message.error is set", () => {
    render(
      <MessageBubble
        message={make({
          role: "assistant",
          content: "",
          error: "Something broke",
        })}
      />,
    );
    expect(screen.getByText(/Something broke/)).toBeInTheDocument();
  });
});
