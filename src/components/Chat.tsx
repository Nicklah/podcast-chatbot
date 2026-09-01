"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/chat";

// Tied to the sample episode — update these when you swap in your own transcript.
// The last one is deliberately NOT in the episode, so the refusal is easy to try.
const SUGGESTIONS = [
  "How long does a starter take?",
  "Why did they nearly close?",
  "What's their coffee like?",
];

export default function Chat() {
  // THE MEMORY. Gemini remembers nothing between requests; this array is the
  // entire conversation, and all of it gets posted again on every send.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (question === "" || streaming) return;

    const outgoing: Message[] = [...messages, { role: "user", text: question }];

    setMessages(outgoing);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The whole conversation, not just the new message.
        body: JSON.stringify({ messages: outgoing }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("No response body.");

      // Add the empty answer bubble first, then fill it in as chunks arrive.
      setMessages([...outgoing, { role: "model", text: "" }]);

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: last.text + value };
          return next;
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      // Drop the empty answer bubble so the thread doesn't end on a blank.
      setMessages((current) =>
        current.length > 0 && current[current.length - 1].text === ""
          ? current.slice(0, -1)
          : current,
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      <div className="thread" aria-live="polite">
        {messages.map((message, i) => (
          <div key={i} className={`msg ${message.role}`}>
            <span className="who">{message.role === "user" ? "You" : "Episode"}</span>
            {message.text}
            {streaming && i === messages.length - 1 && message.role === "model" && (
              <span className="caret" aria-hidden="true">
                &nbsp;
              </span>
            )}
          </div>
        ))}
        <div ref={threadEnd} />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {messages.length === 0 && (
        <div className="suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="question" className="visually-hidden" hidden>
          Ask about this episode
        </label>
        <input
          id="question"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about this episode…"
          disabled={streaming}
          autoComplete="off"
        />
        <button type="submit" disabled={streaming || input.trim() === ""}>
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </>
  );
}
