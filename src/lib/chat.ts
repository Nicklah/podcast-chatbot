/**
 * The pure core.
 *
 * No fetch. No API key. No environment variables. No clock.
 * Transcript + conversation in, the exact JSON body Gemini expects out.
 *
 * Everything in this file can be tested without a network connection or a key,
 * which is why the logic that matters lives here and not in the API route.
 */

/** Gemini calls the assistant "model", not "assistant". */
export type Role = "user" | "model";

export interface Message {
  role: Role;
  text: string;
}

export interface Episode {
  show: string;
  title: string;
  /** Free text — "12 Mar 2026", "S3E14", whatever the show publishes. */
  published: string;
}

/** The shape of a Gemini generateContent request body. */
export interface GeminiRequest {
  system_instruction: { parts: { text: string }[] };
  contents: { role: Role; parts: { text: string }[] }[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}

/**
 * Rough token estimate: ~4 characters per token for English prose.
 *
 * This is an approximation, not a measurement. The real count comes from the
 * model's own tokenizer and will differ by a few percent. That is fine here —
 * it is used to decide "does this obviously not fit", not to bill anyone.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * How much of the token budget the transcript is allowed to use.
 *
 * gemini-2.5-flash accepts about a million input tokens, so a single hour-long
 * episode (~10k tokens) fits many times over and this limit never fires in
 * normal use. It exists anyway for two honest reasons:
 *
 *   1. The whole transcript is re-sent on EVERY message. Input tokens are
 *      billed per request, so an unbounded transcript is an unbounded bill.
 *   2. Context windows are a real constraint on most other models, and code
 *      that silently sends 2M tokens fails with a 400 instead of degrading.
 */
export const TRANSCRIPT_TOKEN_BUDGET = 60_000;

/** How many past messages to re-send. 12 = the last six back-and-forths. */
export const HISTORY_MESSAGE_LIMIT = 12;

export interface FittedTranscript {
  text: string;
  /** True when part of the transcript had to be dropped. */
  truncated: boolean;
  keptChars: number;
  totalChars: number;
}

/**
 * Cut a transcript down to the token budget.
 *
 * Splits on blank lines so a paragraph is never sliced mid-sentence, then keeps
 * whole paragraphs from the start until the budget runs out.
 *
 * Keeping the START (rather than the end, or the middle) is a deliberate,
 * arguable choice: podcast intros set up who the guest is and what the episode
 * is about, and losing that makes every later answer worse. A smarter version
 * would retrieve only the relevant chunks instead of truncating at all — that
 * is RAG, and it is project 9.
 */
export function fitTranscript(
  transcript: string,
  budgetTokens: number = TRANSCRIPT_TOKEN_BUDGET,
): FittedTranscript {
  const totalChars = transcript.length;

  if (estimateTokens(transcript) <= budgetTokens) {
    return { text: transcript, truncated: false, keptChars: totalChars, totalChars };
  }

  const paragraphs = transcript.split(/\n\s*\n/);
  const kept: string[] = [];
  let usedTokens = 0;

  for (const paragraph of paragraphs) {
    const cost = estimateTokens(paragraph) + 1; // +1 for the separator
    if (usedTokens + cost > budgetTokens) break;
    kept.push(paragraph);
    usedTokens += cost;
  }

  const text = kept.join("\n\n");
  return { text, truncated: true, keptChars: text.length, totalChars };
}

/**
 * The system prompt. This is where "don't make things up" lives.
 *
 * Two jobs: hand the model the transcript, and tell it that the transcript is
 * the only thing it is allowed to answer from. Without the second half it will
 * cheerfully answer from its training data and sound just as confident.
 */
export function buildSystemPrompt(episode: Episode, transcript: FittedTranscript): string {
  const truncationNote = transcript.truncated
    ? "\n\nNOTE: this transcript was cut short to fit. If a question seems to be about " +
      "something later in the episode, say that you only have the earlier part."
    : "";

  return [
    `You are a helpful assistant answering questions about one episode of the podcast "${episode.show}".`,
    ``,
    `Episode: "${episode.title}" (${episode.published})`,
    ``,
    `Rules:`,
    `- Answer ONLY from the transcript below. It is the whole of what you know about this episode.`,
    `- Quote the transcript when you can. A short direct quote beats a paraphrase.`,
    `- If the answer is not in the transcript, say so plainly: "They don't discuss that in this episode."`,
    `  Do not fill the gap from general knowledge, and do not guess.`,
    `- Keep answers short. Two or three sentences unless asked for more.`,
    ``,
    `--- TRANSCRIPT START ---`,
    transcript.text,
    `--- TRANSCRIPT END ---${truncationNote}`,
  ].join("\n");
}

/**
 * Keep the conversation to the most recent N messages.
 *
 * Without this the request grows forever: every message re-sends every previous
 * message, so a long chat gets slower and more expensive with each turn.
 */
export function trimHistory(
  messages: Message[],
  limit: number = HISTORY_MESSAGE_LIMIT,
): Message[] {
  return messages.slice(-limit);
}

export class InvalidConversationError extends Error {}

/**
 * Build the request body.
 *
 * THIS IS THE FILE TO READ if you want to know what actually gets sent.
 *
 * The important thing, and the one worth being able to explain out loud: the
 * model is stateless. It remembers nothing between requests. The transcript and
 * the ENTIRE conversation so far are packed into every single call — on message
 * five, messages one through four are sent again. The "memory" in a chatbot is
 * not in the model, it is this function.
 */
export function buildRequest(input: {
  episode: Episode;
  transcript: string;
  /** Full conversation, oldest first, ending with the user's new message. */
  messages: Message[];
  transcriptBudget?: number;
  historyLimit?: number;
}): GeminiRequest {
  const { episode, transcript, messages } = input;

  if (messages.length === 0) {
    throw new InvalidConversationError("Conversation is empty.");
  }
  if (messages[messages.length - 1].role !== "user") {
    throw new InvalidConversationError("Conversation must end with a user message.");
  }
  if (messages.some((m) => m.text.trim() === "")) {
    throw new InvalidConversationError("Messages cannot be empty.");
  }

  const fitted = fitTranscript(transcript, input.transcriptBudget);
  const history = trimHistory(messages, input.historyLimit);

  return {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(episode, fitted) }],
    },
    contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: {
      // Low, not zero: this is a factual lookup task, so creativity is a bug.
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  };
}

/**
 * Pull the text out of one server-sent-events line from Gemini's stream.
 *
 * The stream looks like:
 *   data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
 *   <blank line>
 *   data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}
 *
 * Returns null for anything that isn't a text chunk — blank lines, keep-alive
 * comments, and malformed JSON. A dropped chunk is better than a crashed
 * stream halfway through an answer.
 */
export function textFromSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice("data:".length).trim();
  if (payload === "" || payload === "[DONE]") return null;

  try {
    const parsed = JSON.parse(payload) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = parsed.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    return text === "" ? null : text;
  } catch {
    return null;
  }
}
