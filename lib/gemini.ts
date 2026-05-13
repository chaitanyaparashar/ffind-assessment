/**
 * Server-only wrapper around `@google/generative-ai`. Exposes two functions:
 *
 *   - `streamGemini` — used by /api/chat, returns a ReadableStream of text
 *   - `summarizeTitle` — used by /api/title, returns a short title string
 *
 * IMPORTANT: this module reads `process.env.GEMINI_API_KEY` and must NEVER be
 * imported by client code, or the key would leak into the browser bundle.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Role } from "./types";

// Flash Lite chosen for its 1,000 RPD free-tier quota (vs Flash's 250 RPD).
// Reasoning quality is sufficient for general chat; raw throughput matters
// more for an assessment where reviewers may make many requests.
const MODEL = "gemini-2.5-flash-lite";

type IncomingMessage = { role: Role; content: string };

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenerativeAI(key);
}

const TITLE_PROMPT =
  "Summarize the following chat as a short title in 5 words or fewer. " +
  "Return ONLY the title text — no quotes, no punctuation at the end, " +
  "no prefixes like 'Title:'.\n\n" +
  "User: {{user}}\n" +
  "Assistant: {{assistant}}";

export async function summarizeTitle(
  userText: string,
  assistantText: string,
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });
  const prompt = TITLE_PROMPT
    .replace("{{user}}", userText.slice(0, 500))
    .replace("{{assistant}}", assistantText.slice(0, 500));
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  // Strip surrounding quotes if Gemini adds them anyway.
  const cleaned = text.replace(/^["'`]|["'`.]$/g, "").trim();
  return cleaned;
}

/**
 * Stream a chat completion for the given message history.
 * @param messages The conversation so far; last message MUST be from "user".
 * @param signal Abort signal forwarded from the request — when the browser
 *   disconnects mid-stream, we stop reading from Gemini to save quota.
 */
export async function streamGemini(
  messages: IncomingMessage[],
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });

  // Gemini's SDK separates history (previous turns) from the prompt itself.
  // The role mapping differs from OpenAI: assistant → "model".
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const last = messages[messages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(last.content);

  // Adapt Gemini's async-iterator into a web-standard ReadableStream so the
  // browser can consume it via `response.body.getReader()`.
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          if (signal.aborted) break;
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
