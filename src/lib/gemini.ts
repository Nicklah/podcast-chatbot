/**
 * The impure shell. The only file that touches the network.
 *
 * Kept deliberately small: everything that could be decided without a network
 * connection was decided in chat.ts. What is left is tested against a fake
 * fetch in gemini.test.ts, because the chunk buffering below is easy to get
 * subtly wrong and impossible to notice by eye.
 */
import { textFromSseLine, type GeminiRequest } from "./chat";

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Thrown when Gemini answers with something other than 200. */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Send a request to Gemini and yield the answer one chunk at a time.
 *
 * Streaming is `?alt=sse`: instead of one JSON response after eight seconds of
 * nothing, the server sends a series of `data:` lines as the model produces
 * them. That is the whole difference between a chatbot that feels alive and one
 * that feels broken.
 */
export async function* streamGemini(
  request: GeminiRequest,
  options: { apiKey: string; model?: string; signal?: AbortSignal },
): AsyncGenerator<string> {
  const model = options.model ?? DEFAULT_MODEL;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // In the header, never the URL: query strings end up in server logs,
      // browser history and error trackers. Headers usually don't.
      "x-goog-api-key": options.apiKey,
    },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new GeminiError(
      `Gemini returned ${response.status}. ${detail.slice(0, 300)}`,
      response.status,
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  // A network chunk is not the same thing as a line: one read can contain two
  // events, or half of one. So hold a buffer and only emit on a newline.
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // the last piece may be incomplete

      for (const line of lines) {
        const text = textFromSseLine(line);
        if (text !== null) yield text;
      }
    }

    // Whatever was left when the stream closed.
    const last = textFromSseLine(buffer);
    if (last !== null) yield last;
  } finally {
    reader.releaseLock();
  }
}
