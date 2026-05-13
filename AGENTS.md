<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project runs on Next.js 16. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Gemini Chat — Project Guide for Agents

A streaming chat UI that talks to Google Gemini. Read this before changing anything.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** — config is CSS-driven. `@tailwindcss/typography` is registered via `@plugin "@tailwindcss/typography";` in `app/globals.css`. There is **no** `tailwind.config.{ts,js}` file.
- **shadcn/ui** — copied into `components/ui/`. Wraps `@base-ui/react` (NOT Radix). `asChild` is not supported; use the `render` prop instead.
- **Google Gemini API** via `@google/generative-ai`. Model: `gemini-2.5-flash-lite` (free tier — 15 RPM, 1,000 RPD).
- **Vitest** + **React Testing Library** + **jsdom**.
- **Zod** for API request validation.

## Folder structure

```
app/
  layout.tsx              Root layout — ThemeProvider, Sonner, font
  page.tsx                Renders <Chat/>
  globals.css             Tailwind v4 entry + @plugin directives
  api/chat/route.ts       POST — streams plain-text chunks from Gemini
  api/title/route.ts      POST — returns { title } summarized by Gemini

components/
  Chat.tsx                Composition root; owns sidebar open state
  Sidebar.tsx             Chat list, new/select/delete + switch-while-streaming confirm
  Header.tsx              Title + sidebar toggle + Clear-chat dialog
  MessageList.tsx         Scroller with smart auto-follow
  MessageBubble.tsx       User vs assistant; markdown + code highlighting
  ChatInput.tsx           Auto-grow textarea + send/stop
  EmptyState.tsx          Initial suggestion chips
  LoadingDots.tsx         Three pulsing dots
  ThemeProvider.tsx       next-themes wrapper
  ui/                     shadcn primitives (Base UI underneath)

hooks/
  useChats.ts             ALL client state. Single source of truth.

lib/
  gemini.ts               SDK wrapper: streamGemini, summarizeTitle
  storage.ts              localStorage (chats-v1) + legacy migration + makeTitle
  rate-limit.ts           In-memory per-IP token bucket
  types.ts                Role, Message, ChatStatus, Chat, ChatsState
  utils.ts                shadcn cn()

tests/
  setup.ts                @testing-library/jest-dom registration
  storage.test.ts         13 tests
  useChats.test.tsx       9 tests
  MessageBubble.test.tsx  4 tests
  ChatInput.test.tsx      4 tests
```

## State model (read this before touching `useChats`)

The hook owns the full app state:

```ts
{ chats: Chat[], activeId: string | null }
```

- `Chat` = `{ id, title, messages, createdAt, updatedAt }`
- `Message` = `{ id, role, content, createdAt, error? }`
- All mutations go through `setState((prev) => ...)` patches so derivations stay coherent.
- A patched chat always bumps `updatedAt = Date.now()` for sidebar ordering.

## Streaming pipeline — the load-bearing flow

1. **Client → server.** `useChats.sendMessage(text)` POSTs to `/api/chat` with the filtered conversation history (empty/errored assistant messages are stripped). The Zod schema on the server (`content.min(1)`) is strict; do **not** relax it.
2. **Server → Gemini.** `app/api/chat/route.ts` validates, rate-limits per IP, then calls `streamGemini(messages, req.signal)`. Returns a `ReadableStream<Uint8Array>` of plain UTF-8 text (no SSE framing).
3. **Client typewriter.** The hook reads the stream into a `target` ref. A separate `setTimeout` loop (every `TICK_INTERVAL_MS`) advances a `displayed` ref toward `target` by `CHARS_PER_TICK` chars and writes to React state. This gives constant-cadence rendering regardless of network burst size or monitor refresh rate.
4. **Status flip.** Status stays `streaming` until both the network is done AND the typewriter has drained. This is enforced by a `typewriterDone` promise awaited before `setStatus("idle")`.
5. **Auto-title.** On the first successful turn of a chat, a fire-and-forget POST to `/api/title` summarizes the exchange in ≤5 words and patches the chat's title.

## Constants to know

In `hooks/useChats.ts`:
- `CHARS_PER_TICK` — how many characters per typewriter step. Default 2.
- `TICK_INTERVAL_MS` — ms between typewriter ticks. Default 30. → ~66 chars/sec.

Steady-state speed = `CHARS_PER_TICK * (1000 / TICK_INTERVAL_MS)` chars/sec.

## Security boundaries — do not break these

- `GEMINI_API_KEY` is read **only** inside `lib/gemini.ts`. The SDK is imported **only** by `app/api/*/route.ts`. The browser bundle must never see the key.
- Both API routes run on `runtime = "edge"`. Don't add Node-only modules to anything imported by them.
- Validate at the boundary. Every route body goes through Zod before reaching the SDK.

## Conventions

- **Client components** — first line must be `"use client";`. Don't make a component a client component unless it needs to be (state, effects, browser APIs, event handlers).
- **`cn()`** from `lib/utils.ts` for conditional class merges.
- **shadcn render prop** — when wrapping a Base UI trigger/close with a Button, use `render={<Button .../>}`, not `asChild`.
- **No commits/pushes without explicit user instruction.** This user has opted out of automated git operations. Do not run `git init`, `git add`, `git commit`, `git push`.
- **Tests are the contract.** When you change `useChats` or `storage`, run `npm test` before reporting done.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # vitest run (30 tests)
npm run lint       # eslint
npx tsc --noEmit   # type check
```

## Common pitfalls

1. **Editing `app/globals.css` indiscriminately** — Tailwind v4 plugin registration lives here. If you remove `@plugin "@tailwindcss/typography";`, all the `prose` classes break.
2. **Forgetting the Base UI `asChild` quirk** — copy-pasted shadcn examples often use `asChild`. In this repo it must be `render`.
3. **Sending empty assistant messages back to the server** — if you change how the payload is built in `sendMessage`, preserve the filter that drops `m.content.trim().length === 0 || m.error`.
4. **Setting status to `idle` while the typewriter is still drawing** — always `await typewriterDone` first.
5. **Returning `Response.json()` from a streaming branch** — the chat route streams; only the *error* branches return JSON.
6. **Treating the rate limit as global** — it's per Edge isolate. Don't write code that assumes a single shared bucket.

## When extending

- **New API route?** Same pattern as `app/api/title/route.ts`: edge runtime, Zod body, rate-limit, JSON in/out.
- **New shadcn component?** `npx shadcn@latest add <component>`. Verify it uses `render` (not `asChild`) before importing in code.
- **New hook state?** Add to `ChatsState` if it's persisted; add as a local `useRef`/`useState` in `useChats` if it's not.
- **Want to change typewriter feel?** Edit `CHARS_PER_TICK` and `TICK_INTERVAL_MS` near the top of `useChats.ts`. Nothing else.
