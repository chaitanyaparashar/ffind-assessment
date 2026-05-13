/**
 * POST /api/title — generates a short summary title for a chat thread.
 *
 * Called fire-and-forget by the client after a chat's first user+assistant
 * exchange completes. If this fails (rate-limit, network, etc.) the client
 * silently keeps the fallback title (first 40 chars of the user message) —
 * the chat never blocks on title generation.
 */
import { z } from "zod";
import { summarizeTitle } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

const BodySchema = z.object({
  user: z.string().min(1).max(4000),
  assistant: z.string().min(1).max(4000),
});

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
    return Response.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 30) } },
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
    const title = await summarizeTitle(parsed.data.user, parsed.data.assistant);
    return Response.json({ title });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
