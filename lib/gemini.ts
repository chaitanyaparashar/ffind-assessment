import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Role } from "./types";

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

export async function streamGemini(
  messages: IncomingMessage[],
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const last = messages[messages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(last.content);

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
