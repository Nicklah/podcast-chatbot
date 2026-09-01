/**
 * The server route. This exists for one reason: the API key.
 *
 * If the browser called Gemini directly, the key would be in the JavaScript
 * bundle, and anyone could open devtools and spend your quota. So the browser
 * talks to this route, this route holds the key, and the key never leaves the
 * server.
 */
import { buildRequest, InvalidConversationError, type Message } from "@/lib/chat";
import { episode, transcript } from "@/data/episode";
import { streamGemini, GeminiError } from "@/lib/gemini";

export const runtime = "nodejs";

/** Never trust the request body — it comes from the internet. */
function parseMessages(body: unknown): Message[] {
  if (typeof body !== "object" || body === null || !("messages" in body)) {
    throw new InvalidConversationError("Expected a 'messages' array.");
  }

  const { messages } = body as { messages: unknown };
  if (!Array.isArray(messages)) {
    throw new InvalidConversationError("'messages' must be an array.");
  }

  return messages.map((m: unknown, i: number) => {
    if (
      typeof m !== "object" ||
      m === null ||
      !("role" in m) ||
      !("text" in m) ||
      (m.role !== "user" && m.role !== "model") ||
      typeof m.text !== "string"
    ) {
      throw new InvalidConversationError(`Message ${i} is not {role, text}.`);
    }
    // Cap message length so nobody can push a novel through the API on your key.
    return { role: m.role, text: m.text.slice(0, 4000) };
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // A configuration mistake, not a user mistake. Say which.
    return Response.json(
      { error: "GEMINI_API_KEY is not set. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  let messages: Message[];
  try {
    messages = parseMessages(await request.json());
  } catch (error) {
    const message = error instanceof InvalidConversationError ? error.message : "Invalid JSON.";
    return Response.json({ error: message }, { status: 400 });
  }

  let geminiRequest;
  try {
    geminiRequest = buildRequest({ episode, transcript, messages });
  } catch (error) {
    if (error instanceof InvalidConversationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  // Pipe Gemini's stream straight through as plain text. The browser appends
  // each chunk as it lands, which is why the answer appears word by word.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of streamGemini(geminiRequest, {
          apiKey,
          model: process.env.GEMINI_MODEL,
          signal: request.signal,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        // The response status was already sent, so an error here can only be
        // delivered as text in the body. Log the real one, show a safe one.
        console.error("Gemini stream failed:", error);
        const note =
          error instanceof GeminiError && error.status === 429
            ? "\n\n[Rate limited by Gemini. Wait a minute and try again.]"
            : "\n\n[Something went wrong talking to Gemini. Try again.]";
        controller.enqueue(encoder.encode(note));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
