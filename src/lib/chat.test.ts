import { describe, it, expect } from "vitest";
import {
  buildRequest,
  buildSystemPrompt,
  estimateTokens,
  fitTranscript,
  trimHistory,
  textFromSseLine,
  InvalidConversationError,
  type Episode,
  type Message,
} from "./chat";

const episode: Episode = {
  show: "Test Show",
  title: "An Episode About Sourdough",
  published: "12 Mar 2026",
};

const transcript = "HOST: Welcome back.\n\nGUEST: Happy to be here. The starter takes two weeks.";

describe("buildRequest — what actually gets sent", () => {
  // The whole point of project 1. If this test fails, the chatbot has amnesia.
  it("re-sends the entire conversation on every request", () => {
    const first: Message[] = [{ role: "user", text: "How long does the starter take?" }];

    const second: Message[] = [
      ...first,
      { role: "model", text: "Two weeks." },
      { role: "user", text: "And after that?" },
    ];

    const firstRequest = buildRequest({ episode, transcript, messages: first });
    const secondRequest = buildRequest({ episode, transcript, messages: second });

    expect(firstRequest.contents).toHaveLength(1);

    // The second request contains everything the first one did, plus the new turn.
    // Nothing is remembered on Gemini's side — this is the memory.
    expect(secondRequest.contents).toHaveLength(3);
    expect(secondRequest.contents[0]).toEqual(firstRequest.contents[0]);
    expect(secondRequest.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("sends the transcript again on every request, not just the first", () => {
    const later = buildRequest({
      episode,
      transcript,
      messages: [
        { role: "user", text: "First question" },
        { role: "model", text: "First answer" },
        { role: "user", text: "Tenth question" },
      ],
    });

    expect(later.system_instruction.parts[0].text).toContain("The starter takes two weeks");
  });

  it("uses Gemini's role name for the assistant", () => {
    const request = buildRequest({
      episode,
      transcript,
      messages: [
        { role: "user", text: "Hi" },
        { role: "model", text: "Hello" },
        { role: "user", text: "Again" },
      ],
    });

    // Not "assistant" and not "bot". Gemini rejects the request otherwise.
    expect(request.contents[1].role).toBe("model");
  });

  it("keeps temperature low, because this is a lookup task", () => {
    const request = buildRequest({ episode, transcript, messages: [{ role: "user", text: "Hi" }] });
    expect(request.generationConfig.temperature).toBeLessThanOrEqual(0.3);
  });

  it("drops the oldest turns once the conversation gets long", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", text: `question ${i}` });
      messages.push({ role: "model", text: `answer ${i}` });
    }
    messages.push({ role: "user", text: "final question" });

    const request = buildRequest({ episode, transcript, messages, historyLimit: 4 });

    expect(request.contents).toHaveLength(4);
    expect(request.contents[3].parts[0].text).toBe("final question");
    expect(JSON.stringify(request.contents)).not.toContain("question 0");
  });
});

describe("buildRequest — bad input", () => {
  it("rejects an empty conversation", () => {
    expect(() => buildRequest({ episode, transcript, messages: [] })).toThrow(
      InvalidConversationError,
    );
  });

  it("rejects a conversation that does not end with the user", () => {
    expect(() =>
      buildRequest({
        episode,
        transcript,
        messages: [
          { role: "user", text: "Hi" },
          { role: "model", text: "Hello" },
        ],
      }),
    ).toThrow(InvalidConversationError);
  });

  it("rejects a blank message", () => {
    expect(() =>
      buildRequest({ episode, transcript, messages: [{ role: "user", text: "   " }] }),
    ).toThrow(InvalidConversationError);
  });
});

describe("fitTranscript — the context window question", () => {
  it("leaves a short transcript completely alone", () => {
    const fitted = fitTranscript(transcript, 10_000);
    expect(fitted.truncated).toBe(false);
    expect(fitted.text).toBe(transcript);
  });

  it("drops paragraphs from the end when the transcript is too long", () => {
    const long = ["one".repeat(100), "two".repeat(100), "three".repeat(100)].join("\n\n");
    const budget = estimateTokens("one".repeat(100)) + 1;

    const fitted = fitTranscript(long, budget);

    expect(fitted.truncated).toBe(true);
    expect(fitted.keptChars).toBeLessThan(fitted.totalChars);
    expect(fitted.text).toContain("one");
    expect(fitted.text).not.toContain("three");
  });

  it("never cuts a paragraph in half", () => {
    const long = ["alpha beta gamma", "delta epsilon zeta"].join("\n\n");
    const fitted = fitTranscript(long, estimateTokens("alpha beta gamma") + 1);

    expect(fitted.text).toBe("alpha beta gamma");
  });

  it("tells the model when it is missing part of the episode", () => {
    const truncated = { text: "start only", truncated: true, keptChars: 10, totalChars: 999 };
    expect(buildSystemPrompt(episode, truncated)).toContain("only have the earlier part");

    const whole = { text: "all of it", truncated: false, keptChars: 9, totalChars: 9 };
    expect(buildSystemPrompt(episode, whole)).not.toContain("only have the earlier part");
  });

  it("survives a transcript with no paragraph breaks at all", () => {
    const wall = "word ".repeat(5000);
    const fitted = fitTranscript(wall, 10);

    // One unsplittable paragraph that exceeds the budget: keep nothing rather
    // than blow the budget. The system prompt then admits it is missing text.
    expect(fitted.truncated).toBe(true);
    expect(fitted.text).toBe("");
  });
});

describe("buildSystemPrompt — grounding", () => {
  it("tells the model to refuse rather than guess", () => {
    const prompt = buildSystemPrompt(episode, fitTranscript(transcript));
    expect(prompt).toContain("ONLY from the transcript");
    expect(prompt).toContain("do not guess");
  });

  it("names the episode so the model can refer to it", () => {
    const prompt = buildSystemPrompt(episode, fitTranscript(transcript));
    expect(prompt).toContain("An Episode About Sourdough");
    expect(prompt).toContain("Test Show");
  });
});

describe("trimHistory", () => {
  it("keeps the most recent messages, not the oldest", () => {
    const messages: Message[] = [
      { role: "user", text: "a" },
      { role: "model", text: "b" },
      { role: "user", text: "c" },
    ];
    expect(trimHistory(messages, 2).map((m) => m.text)).toEqual(["b", "c"]);
  });

  it("does nothing to a short conversation", () => {
    const messages: Message[] = [{ role: "user", text: "a" }];
    expect(trimHistory(messages, 10)).toEqual(messages);
  });
});

describe("textFromSseLine", () => {
  it("pulls the text out of a real chunk", () => {
    const line = 'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}';
    expect(textFromSseLine(line)).toBe("Hello");
  });

  it("joins multiple parts in one chunk", () => {
    const line = 'data: {"candidates":[{"content":{"parts":[{"text":"a"},{"text":"b"}]}}]}';
    expect(textFromSseLine(line)).toBe("ab");
  });

  it("ignores blank lines, comments and the done marker", () => {
    expect(textFromSseLine("")).toBeNull();
    expect(textFromSseLine(": keep-alive")).toBeNull();
    expect(textFromSseLine("data: [DONE]")).toBeNull();
  });

  // A half-received chunk should not take down an answer that is mid-stream.
  it("returns null for malformed JSON instead of throwing", () => {
    expect(textFromSseLine('data: {"candidates":[{"conte')).toBeNull();
  });

  it("returns null for a chunk with no text, e.g. a finishReason-only chunk", () => {
    expect(textFromSseLine('data: {"candidates":[{"finishReason":"STOP"}]}')).toBeNull();
  });
});

describe("estimateTokens", () => {
  it("is roughly four characters per token", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});
