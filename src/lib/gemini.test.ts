import { describe, it, expect, vi, afterEach } from "vitest";
import { streamGemini, GeminiError } from "./gemini";
import type { GeminiRequest } from "./chat";

const request: GeminiRequest = {
  system_instruction: { parts: [{ text: "system" }] },
  contents: [{ role: "user", parts: [{ text: "hi" }] }],
  generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
};

/** A fake Gemini that hands back exactly these network chunks, in order. */
function fakeGemini(chunks: string[], init: ResponseInit = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return vi.fn(async () => new Response(body, { status: 200, ...init }));
}

async function collect(generator: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const chunk of generator) out.push(chunk);
  return out;
}

const sse = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;

afterEach(() => vi.unstubAllGlobals());

describe("streamGemini", () => {
  it("yields each chunk of text as it arrives", async () => {
    vi.stubGlobal("fetch", fakeGemini([sse("Hello"), sse(" there")]));

    const out = await collect(streamGemini(request, { apiKey: "test-key" }));

    expect(out).toEqual(["Hello", " there"]);
  });

  // The bug this file exists for: a network chunk is not a line. The stream can
  // split an SSE event straight down the middle, and naive parsing loses it.
  it("survives an SSE event split across two network chunks", async () => {
    const whole = sse("Two weeks.");
    const half = Math.floor(whole.length / 2);

    vi.stubGlobal("fetch", fakeGemini([whole.slice(0, half), whole.slice(half)]));

    const out = await collect(streamGemini(request, { apiKey: "test-key" }));

    expect(out.join("")).toBe("Two weeks.");
  });

  it("handles two events arriving in one network chunk", async () => {
    vi.stubGlobal("fetch", fakeGemini([sse("a") + sse("b")]));

    expect((await collect(streamGemini(request, { apiKey: "test-key" }))).join("")).toBe("ab");
  });

  it("sends the key in a header, never in the URL", async () => {
    const fetchMock = fakeGemini([sse("ok")]);
    vi.stubGlobal("fetch", fetchMock);

    await collect(streamGemini(request, { apiKey: "secret-key" }));

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((options.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(url).toContain("alt=sse"); // streaming, not one big response at the end
  });

  it("uses the model you pass it", async () => {
    const fetchMock = fakeGemini([sse("ok")]);
    vi.stubGlobal("fetch", fetchMock);

    await collect(streamGemini(request, { apiKey: "k", model: "gemini-2.5-pro" }));

    expect(fetchMock.mock.calls[0][0]).toContain("gemini-2.5-pro");
  });

  it("throws a GeminiError with the status when the API rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota exceeded", { status: 429 })),
    );

    await expect(collect(streamGemini(request, { apiKey: "k" }))).rejects.toBeInstanceOf(
      GeminiError,
    );
  });
});
