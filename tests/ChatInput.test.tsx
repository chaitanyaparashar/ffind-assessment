import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "@/components/ChatInput";

describe("ChatInput", () => {
  it("submits on Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSubmit={onSubmit} onStop={() => {}} streaming={false} />);
    const ta = screen.getByRole("textbox");
    await user.type(ta, "hello");
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("inserts newline on Shift+Enter and does not submit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSubmit={onSubmit} onStop={() => {}} streaming={false} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(ta, "line1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(ta, "line2");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(ta.value).toContain("\n");
  });

  it("does not submit empty / whitespace", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSubmit={onSubmit} onStop={() => {}} streaming={false} />);
    const ta = screen.getByRole("textbox");
    await user.type(ta, "   ");
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows Stop button and calls onStop while streaming", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} onStop={onStop} streaming={true} />);
    const stop = screen.getByRole("button", { name: /stop/i });
    await user.click(stop);
    expect(onStop).toHaveBeenCalled();
  });
});
