/**
 * POST /api/chat — proxies a streaming chat completion from Google Gemini.
 *
 * Flow:
 *   1. Rate-limit by client IP (in-memory token bucket).
 *   2. Validate body with Zod (shape, content length, last-msg-from-user).
 *   3. Pipe `streamGemini()` straight back to the browser as a plain-text
 *      ReadableStream — the client reads it chunk-by-chunk into the UI.
 *
 * Edge runtime is used for fast streaming start and a smaller attack surface.
 * The Gemini SDK is only imported here (server-only) so the API key never
 * reaches the browser bundle.
 */
import { z } from "zod";
import { streamGemini } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

// Bound the request: at least one message, no more than 40 (cheap protection
// against a malicious client trying to push huge contexts), and content
// length capped so a runaway loop client-side can't DoS Gemini's quota.
const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40)
    .refine((arr) => arr[arr.length - 1].role === "user", {
      message: "Last message must be from user",
    }),
});

// Resolve a stable per-client identifier for rate limiting. Prefers the
// proxy-supplied forwarded headers; falls back to "anonymous" so missing
// headers in dev still flow through a single shared bucket.
function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

export async function POST(req: Request): Promise<Response> {
  const limit = rateLimit(getIp(req));
  if (!limit.ok) {
    return new Response(
      JSON.stringify({ error: "Rate limited" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(limit.retryAfter ?? 30),
        },
      },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const stream = await streamGemini(parsed.data.messages, req.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
