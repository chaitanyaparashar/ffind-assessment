# Gemini Chat

A streaming AI chat application built with Next.js, TypeScript, and Google Gemini.

## Features

- Streaming token-by-token responses
- Markdown rendering with syntax-highlighted code blocks
- Persistent chat history (localStorage)
- Clear Chat with confirm dialog
- Stop generation mid-stream (partial response retained)
- Light/dark mode (system preference)
- Fully keyboard accessible (Enter to send, Shift+Enter for newline)
- Responsive, mobile-first layout
- Unit-tested hooks and components

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (owned in repo, not a runtime dependency)
- **Google Gemini API** (free tier — no credit card required)
- **react-markdown** + **rehype-highlight** for rendered responses
- **Zod** for API request validation
- **Vitest** + **React Testing Library** for tests

## Setup

```bash
git clone <repo>
cd ffind-assessment
npm install
cp .env.example .env.local
# Add your key from https://aistudio.google.com/apikey
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm test` — run test suite
- `npm run lint` — lint

## How it works

### Streaming

The browser calls `POST /api/chat` with the full message history. The route validates the body with Zod, applies a per-IP rate limit, and returns a `ReadableStream<Uint8Array>` of plain UTF-8 text chunks streamed directly from the Gemini SDK. The browser reads the stream and appends each chunk to the assistant message, triggering re-renders that the user sees as live "typing".

Plain-text streaming was chosen over SSE because there is only one stream per request. SSE framing would add parsing complexity for zero gain at this scope. If the app needed to multiplex events (tool calls, metadata, citations), SSE would be the right call.

### State

`useChat` is the single source of truth. It owns:
- the message list
- streaming status (`idle | streaming | error`)
- an `AbortController` for `stop()`
- error state and a retry path
- `localStorage` hydration on mount, write-through after each turn

Components are dumb — they take props and render. This makes them trivially testable and easy to reason about.

### Security

- `GEMINI_API_KEY` is read **only** in the server route. It is not prefixed with `NEXT_PUBLIC_*` and therefore never reaches the browser bundle.
- The route validates request bodies (Zod), caps history length, caps individual message size, and applies a per-IP token-bucket rate limit.
- The route runs on the Edge runtime — fast streaming start, smaller attack surface than a Node server.
- `.env.local` is gitignored; `.env.example` is committed so reviewers know what to set.

### Accessibility

- All interactive elements are keyboard reachable; the shadcn primitives handle focus management.
- The message list uses `aria-live="polite"` so screen readers announce assistant chunks.
- Semantic landmarks: `<main>`, `<header>`, `<form>`.

### Tradeoffs

- **In-memory rate limit** resets per cold start, and the Edge runtime can run on multiple isolates — fine for a demo. Production: Redis / Upstash.
- **Full conversation history** is sent on every request — simple, stateless. Production: summarize older turns when context grows large.
- **Free Gemini tier** has 5–15 RPM limits; the UI handles 429s with a toast and retry.

## Architecture

```
app/           Next.js App Router (page + API route)
components/    Presentation (Chat, MessageList, MessageBubble, ChatInput, …)
components/ui/ shadcn primitives (owned in repo)
hooks/         useChat — all chat state
lib/           gemini client, storage, rate-limit, types
tests/         Vitest suites for storage, useChat, MessageBubble, ChatInput
```

## Testing

Tests cover the parts that carry logic — not coverage padding:

- `storage.test.ts` — SSR safety, round-trip, malformed JSON, quota errors
- `useChat.test.tsx` — sendMessage flow, streaming concatenation, error path, clear, persistence
- `MessageBubble.test.tsx` — markdown rendering, code blocks, error state
- `ChatInput.test.tsx` — Enter to submit, Shift+Enter for newline, empty blocked, Stop button

Run with `npm test`.
