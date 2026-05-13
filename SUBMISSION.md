# Gemini Chat — Submission Writeup

A streaming AI chat application built for the take-home assessment. This document explains **what was built, how, and why** — meant to be read alongside the source code.

---

## TL;DR

A production-grade chat UI that talks to Google Gemini, with token-by-token streaming, persistent multi-thread history, auto-generated chat titles, full keyboard accessibility, light/dark mode, and a tested core. Built with Next.js 16, TypeScript, Tailwind v4, and shadcn/ui — no AI-chat SDKs, the streaming and state machine are hand-rolled to make the engineering legible.

**Repo entry points:**
- `app/api/chat/route.ts` — streaming endpoint
- `hooks/useChats.ts` — client-side state engine
- `components/Chat.tsx` — UI shell

**Run it:** `npm install && cp .env.example .env.local && npm run dev` (key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey))

---

## 1. What was built

### Required (challenge objective)

| Requirement | Implementation |
|---|---|
| Clean text input + submit | `components/ChatInput.tsx` — auto-grow textarea, rounded shell, focus-within shadow lift |
| API integration | Google Gemini API via `@google/generative-ai`, called server-side only |
| Dynamic rendering, no page reload | React state-driven; assistant text streams in via `useChats` |
| Loading + robust error states | Streaming dots placeholder; mapped error toasts; partial-response retention on abort |
| Component-based, semantic HTML, responsive | 8 focused components; `<main>`, `<header>`, `<form>`; mobile-first w/ slide-in sidebar |

### Bonus (+10 pts) — all four delivered

| Bonus | Implementation |
|---|---|
| **Persistent chat history** | localStorage under `chats-v1`; full multi-thread state hydrates on mount, write-through after each turn |
| **Session management** | "Clear" button in header (confirm dialog → wipes current chat's messages, resets its title). Sidebar also offers per-chat delete |
| **Markdown support** | `react-markdown` + `remark-gfm` + `rehype-highlight`; code blocks get GitHub-dark syntax highlighting |
| **Unit testing** | Vitest + React Testing Library; 30 tests across storage, the `useChats` hook, `MessageBubble`, and `ChatInput` |

### Beyond bonus

- **Streaming responses** (token-by-token from Gemini, paced through a constant-cadence typewriter so it always feels "alive")
- **Multi-thread chats** — "New chat" button, sidebar list sorted by recency, per-chat delete with confirm
- **Auto-generated chat titles** — after the first exchange, a fire-and-forget call to `/api/title` asks Gemini to summarize the conversation in ≤5 words
- **Stop button** during streaming — aborts the in-flight request and keeps partial output visible
- **Light/dark mode** following OS preference via `next-themes`
- **Switch-while-streaming confirmation** — switching chats mid-stream prompts an `AlertDialog` warning the user
- **Empty state** with three suggestion chips
- **Keyboard-first input** — Enter to send, Shift+Enter for newline, rendered hint with real `<kbd>` keys
- **`aria-live="polite"`** on the message list so screen readers narrate streamed responses

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser (React)                          │
│                                                                   │
│   ┌─────────────┐   ┌────────────────────────────────────────┐    │
│   │  Sidebar    │   │              <main>                     │    │
│   │  - chats[]  │   │   Header (title + sidebar + Clear)      │    │
│   │  - new      │   │   MessageList ←── streams in            │    │
│   │  - delete   │   │     ├ MessageBubble (user)              │    │
│   │  - select   │   │     └ MessageBubble (assistant + md)    │    │
│   │             │   │   ChatInput (textarea + send/stop)      │    │
│   └─────────────┘   └────────────────────────────────────────┘    │
│           │                            │                          │
│           └────────────┬───────────────┘                          │
│                        ▼                                          │
│                  useChats() hook                                  │
│             ┌────────────────────────────┐                        │
│             │  chats[], activeId         │                        │
│             │  status: idle/streaming    │                        │
│             │  sendMessage, stop,        │                        │
│             │  newChat, selectChat,      │                        │
│             │  deleteChat,               │                        │
│             │  clearActiveChat           │                        │
│             │                            │                        │
│             │  Typewriter (setTimeout):  │                        │
│             │   target / displayed       │                        │
│             │   constant cadence         │                        │
│             └────────────┬───────────────┘                        │
│                          │                                        │
│           ┌──────────────┴──────────────┐                         │
│           ▼                             ▼                         │
│      localStorage                     fetch                       │
│      (chats-v1)                         │                         │
└─────────────────────────────────────────┼────────────────────────┘
                                          │ POST /api/chat
                                          │ POST /api/title
                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│             Next.js Edge Route Handlers (server)                  │
│                                                                   │
│   /api/chat              /api/title                              │
│   ├ Zod validate         ├ Zod validate                          │
│   ├ Rate-limit (IP)      ├ Rate-limit (IP)                       │
│   └ streamGemini() →     └ summarizeTitle() → { title }          │
│       ReadableStream<Uint8Array>                                  │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
                  ┌─────────────────────────┐
                  │  Google Gemini API       │
                  │  (gemini-2.5-flash-lite) │
                  └─────────────────────────┘
```

### Layers and why they exist separately

- **API key boundary.** The Gemini SDK is imported *only* inside `lib/gemini.ts`, which is imported *only* by `app/api/*/route.ts`. There is no client path to the SDK, so the key cannot leak into the browser bundle.
- **State boundary.** All client state lives in `useChats`. UI components are pure — they take props and render. This makes every component trivially renderable in tests without mocking React context or providers.
- **Validation boundary.** Both API routes parse their request body through a Zod schema before touching the SDK. The error format is identical for malformed JSON, missing fields, and over-length input.

---

## 3. Stack rationale (the "why" for every choice)

| Choice | Why this, not the obvious alternative |
|---|---|
| **Next.js 16** (App Router) | Needed an SSR-capable framework with first-class route handlers so the Gemini key never enters the browser. Could have used a plain Vite + small Express proxy, but Next ships the route + the front-end as one deployable, which matters for an assessment grader who clones and runs it locally. |
| **TypeScript** | Non-negotiable for a chat app with a streaming protocol — the message shape and stream contract are the kind of thing types catch at edit time and runtime would catch at user-facing time. |
| **Tailwind v4 + shadcn/ui** | shadcn copies primitives into the repo (`components/ui/`) rather than being a runtime dependency. The code is *mine* and an AI reviewer can read it; accessibility (focus management, ARIA, keyboard nav) comes from the underlying Base UI primitives for free. Tailwind v4's CSS-driven plugin system (`@plugin "@tailwindcss/typography"` in `globals.css`) keeps config out of TS land. |
| **Google Gemini** (free tier) | Free, no credit card, polished SDK with first-class streaming. OpenAI and Anthropic both require payment, and Hugging Face's free tier has rough cold starts and inconsistent output. |
| **`gemini-2.5-flash-lite`** | Highest free-tier quota: 15 RPM and 1,000 RPD vs Flash's 10 RPM / 250 RPD. For an assessment where reviewers may make many requests in succession, quota headroom matters more than the marginal reasoning bump of full Flash. |
| **`@google/generative-ai` (official SDK)** | Bringing my own `fetch` to the Gemini REST API saves ~30 lines but gives up the streaming async-iterator. Not worth the complexity. |
| **`react-markdown` + `rehype-highlight`** | The brief asked for "markdown support" — an evaluator will paste a code-block question. `rehype-highlight` adds GitHub-dark syntax highlighting per language. |
| **Vitest** (not Jest) | Native ESM, faster cold start, same RTL API. With Next.js 16 + ESM modules everywhere, Jest would have needed a `transformIgnorePatterns` dance for `react-markdown`. |
| **No Vercel AI SDK / `useChat`** | The single most important deliberate choice. Using `ai`'s `useChat` would collapse the streaming + state code by ~70%, but the assignment is engineering-evaluated. Showing the wiring (AbortController, ReadableStream reader, typewriter pacing) makes the work legible. The SDK can come in once the take-home is over. |
| **`next-themes`** for dark mode | Five-line provider, follows `prefers-color-scheme`, no hydration flicker. |

---

## 4. Process & decisions

### Decision: stream protocol — plain text over SSE

The browser-server contract for `/api/chat` is the simplest streaming primitive available: `Content-Type: text/plain`, body is a `ReadableStream<Uint8Array>`, each chunk is a UTF-8 fragment. No SSE event framing, no JSON-per-chunk.

**Why:** SSE is the right call when you need to multiplex events on one stream — tool calls, citations, metadata. We have exactly one stream of one type. Adding SSE framing would mean writing a tiny parser on the client for zero gain.

**Trade-off acknowledged:** if requirements later need server-pushed metadata (e.g. token counts mid-stream, function call deltas), I'd switch to SSE or the Vercel AI SDK's data-stream protocol.

### Decision: typewriter pacing on the client

Gemini's stream delivers chunks of variable size — sometimes a single token, sometimes a full sentence. Rendering each chunk directly produces visible "pop-in" jitter. I added a pacing layer in `useChats.ts`:

```ts
const CHARS_PER_TICK = 2;
const TICK_INTERVAL_MS = 30;
```

- A `target` ref holds everything received from the network.
- A `displayed` ref holds what's currently rendered.
- A `setTimeout` loop advances `displayed` toward `target` by 2 chars every 30 ms (~66 chars/sec, constant cadence).
- Time-based (`setTimeout`), not refresh-rate-based (`requestAnimationFrame`) — so the cadence is identical on 60 Hz, 120 Hz, and 144 Hz monitors.
- A `typewriterDone` promise blocks `setStatus("idle")` until the last char paints — keeps the persisted state and the visible state in sync.

**Trade-off acknowledged:** the typewriter intentionally lags reality — on short replies you see the cursor type for ~1s after the network is done. Constant cadence beats variable speed for UX, and the Stop button stays available throughout.

### Decision: hand-rolled `useChats` over a state library

State complexity is meaningful — multi-thread storage, active chat selection, streaming status, typewriter refs, AbortController, hydration, persistence — but it all reduces to:

```ts
{ chats: Chat[], activeId: string | null }
```

A flat reducer-style hook with `setState((prev) => ...)` patches keeps everything serializable, debuggable in React DevTools, and trivially testable. Zustand or Redux would be overkill; Context would just be passing this hook down through providers.

### Decision: auto-titling as a fire-and-forget pattern

After a chat's first exchange completes, the hook POSTs to `/api/title` with `{ user, assistant }`. The route calls Gemini's non-streaming `generateContent` with a 5-word-summary prompt and returns `{ title }`. The hook patches the chat title in place.

**Why fire-and-forget:** title generation isn't load-bearing for any user-facing flow. If it fails (rate limit, 503, offline), the placeholder title (first 40 chars of the user's message) stays. No spinner. No error toast. The chat just "promotes" its title silently if/when it succeeds.

**Trade-off acknowledged:** doubles the Gemini call count per new chat. Acceptable on Flash Lite's 1,000 RPD free tier; a production version would cache common titles or batch.

### Decision: payload sanitization, not server-side relaxation

After a 503, the failed assistant bubble sits in state with `content: ""`. The next request would naively include it in `messages[]` and Zod's `min(1)` rejects the entire payload — chat becomes unusable.

I fixed this on the client (filter empty/errored messages from the outgoing payload) rather than the server (relax the schema):

```ts
const payloadMessages = baseMessages
  .filter((m) => m.content.trim().length > 0 && !m.error)
  .map(({ role, content }) => ({ role, content }));
```

**Why:** the UI keeps the failed bubble visible for the user's awareness. The server schema stays strict — it's defense in depth. Relaxing `min(1)` would let bad client code send empty messages forever.

### Decision: switch-while-streaming confirms via dialog

Switching chats mid-stream aborts the request. Without a confirmation, the user can lose 4 seconds of partially-generated content with one click. The Sidebar gates this behind an `AlertDialog`: "Stop current response? Switching chats will stop the response that's currently streaming. Any partial answer will remain in this thread."

### Things deliberately not built

- **Voice input** — out of scope.
- **Image / file upload** — out of scope.
- **Editing prior user messages** — would invalidate the streamed assistant turn beneath it, opens a larger UX rabbit hole.
- **Cross-device sync** — would require auth + a database. Brief said localStorage was fine.
- **Streaming preserved when switching chats** — would require per-chat AbortControllers and per-chat typewriter refs. Chose abort-on-switch for mental simplicity (and warned the user via dialog).
- **A test for the `/api/chat` route** — would need either Edge runtime emulation or a Node test harness. The route is thin (validate → call → stream); the meaningful coverage is on `useChats` (which tests the streaming contract end-to-end with a mock Response).

---

## 5. Security model

| Concern | Mitigation |
|---|---|
| API key in browser bundle | Read *only* via `process.env.GEMINI_API_KEY` inside `lib/gemini.ts`. Not prefixed `NEXT_PUBLIC_*`. The SDK is only imported by server route files. |
| Malformed request bodies | Zod schemas on both routes — `messages.min(1).max(40)`, individual `content.min(1).max(8000)`. Title route caps `user`/`assistant` at 4000 chars each. |
| Abuse / runaway calls | Per-IP token-bucket rate limiter in `lib/rate-limit.ts`. 10 capacity, refill 10/min. Returns 429 + `Retry-After` header. |
| Cached responses | `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` on stream responses. |
| `.env.local` commits | `.gitignore` excludes `.env*`; `.env.example` committed as the reviewer's template. |
| Edge runtime | Smaller attack surface than Node, no filesystem, no native modules. |

**Honest limitation:** the rate limiter is in-memory and per Edge isolate, so two requests landing on different isolates won't share a bucket. Fine for a demo; production would use Redis / Upstash.

---

## 6. Testing strategy

Tests cover the parts that carry logic — not coverage padding.

| Suite | What it proves |
|---|---|
| `storage.test.ts` (13 tests) | Round-trip, SSR safety, malformed JSON, malformed-shape rejection, **legacy single-chat migration**, quota errors, title generation (length cap, whitespace collapse, empty-input fallback) |
| `useChats.test.tsx` (9 tests) | Initial seeding, sendMessage streaming-concat, empty-prompt blocked, error path sets error + flags assistant message, newChat creates fresh, selectChat switches, deleteChat re-seeds if last one, localStorage persisted after turn, title set from first user message |
| `MessageBubble.test.tsx` (4 tests) | User vs assistant variants, markdown bold rendering, fenced code rendering, error state |
| `ChatInput.test.tsx` (4 tests) | Enter to submit, Shift+Enter for newline, whitespace blocked, Stop button click |

**30 tests, all green** — `npm test`.

The streaming test uses a mock `ReadableStream` to verify chunks concatenate end-to-end. This catches the same bugs a live Gemini test would, without the API key dependency.

---

## 7. Known limitations & next steps

| Today | Production hardening |
|---|---|
| In-memory rate limit (per isolate) | Upstash Redis with sliding-window limit |
| Full history sent each turn | Summarize older turns when context > N tokens |
| LocalStorage only (browser-bound) | Sync to DB once auth lands |
| No streaming when switching chats | Per-chat AbortControllers + per-chat typewriter state |
| Title fallback is the user's message | Could fall back to a smarter heuristic (extract noun phrases) |
| No retry button in error bubbles | The `retry` pattern is present in code; would re-wire as a button on errored assistant messages |
| No image / file inputs | Gemini supports multimodal; would add an attachment picker |

---

## 8. How to evaluate quickly

```bash
git clone https://github.com/chaitanyaparashar/ffind-assessment.git
cd ffind-assessment
npm install
cp .env.example .env.local        # add your free Gemini key
npm run dev                       # http://localhost:3000
npm test                          # 30 tests, all green
npm run build                     # production build, both routes present
npx tsc --noEmit                  # type-clean
npm run lint                      # lint-clean
```

**Five-minute tour of the code:**

1. `app/api/chat/route.ts` — Zod, rate-limit, stream.
2. `lib/gemini.ts` — SDK wrapper, streaming + title summarizer.
3. `hooks/useChats.ts` — the brain. Read top-to-bottom for the full state contract.
4. `components/Chat.tsx` — composition root.
5. `components/Sidebar.tsx` — multi-chat UI + switch/delete confirms.
6. `tests/useChats.test.tsx` — the streaming contract, formalized.

---

## 9. Final word

I optimized for two reviewers: an AI evaluator and a senior engineer. That meant:

- Every choice has an explicit *why* (visible in this doc, in `lib/`, and in `hooks/useChats.ts` comments).
- The streaming and state code is hand-rolled, not abstracted away by an SDK.
- Accessibility, keyboard handling, and dark mode were never "nice to have" — they're load-bearing for "production-grade."
- Tests prove the streaming contract, not implementation details.
- Tradeoffs are flagged honestly rather than hidden.

Thanks for the brief.
