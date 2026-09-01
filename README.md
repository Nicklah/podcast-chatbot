# Podcast Chatbot

> Ask questions about a podcast episode and get answers from its transcript — with the quote, not a plausible-sounding invention.

[![CI](https://github.com/Nicklah/podcast-chatbot/actions/workflows/ci.yml/badge.svg)](https://github.com/Nicklah/podcast-chatbot/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-39-2ea44f)

<!-- TODO after deploying: paste the Vercel URL here and add a screenshot to docs/. -->
**▶ Live demo: _not deployed yet_** · no login required

---

## The problem

A good episode is an hour long and completely unsearchable. You remember the guest said
something useful about pricing, but finding it again means scrubbing through 60 minutes
of audio hoping to recognise it. Show notes are three bullet points. A transcript exists,
but nobody reads a 9,000-word wall of text.

The knowledge is technically public and practically lost.

## What it does

- **Answers questions about one episode**, grounded in that episode's transcript.
- **Follow-up questions work** — "what else did they say about it?" resolves against what
  you already asked.
- **Streams the answer** as it's generated, instead of showing a blank screen for eight
  seconds.
- **Admits when it doesn't know.** Ask the sample episode about coffee — it isn't in the
  transcript, and the bot says so rather than inventing an answer. That refusal is the
  feature; try to break it.

## How it works

```
Browser  ──POST /api/chat──▶  Next.js route  ──▶  src/lib/chat.ts   (pure: builds the request)
(holds the                    (holds the key)      src/lib/gemini.ts (the only fetch)
 conversation)                                              │
      ◀─────── streamed text ──────────────────────────────┘
```

Two things I made sure I could explain out loud, because that was the actual goal of this
project:

**1. The model has no memory. My code is the memory.**

Gemini remembers nothing between requests. On the second message I don't send "and after
that?" — I send the transcript, *and* the first question, *and* the first answer, *and*
the new question, all over again. On the tenth message I send all ten. The entire
conversation is re-packed into every single call by
[`buildRequest`](src/lib/chat.ts), which is why that function has a test asserting exactly
that. Chat "memory" is a re-send, not a state the model keeps.

That has a cost: the request grows every turn, so `trimHistory` caps it at the last six
exchanges. Past that, the bot genuinely forgets the start of the conversation — because I
stopped sending it.

You can watch it working. Ask about the starter, then ask a follow-up that never names it:

> **You:** How long does a starter take?
> **Episode:** Mira Osei states that "A starter takes about two weeks before it's reliable".
>
> **You:** And how often do you feed it during that time?
> **Episode:** They don't discuss that in this episode. Mira states that you feed it
> "Twice a day once it's going," but does not specify the feeding schedule during the
> initial two-week period.

Two things happened there. "It" resolved to the starter, because the first exchange was
re-sent. And the answer splits a question the transcript half-covers — giving the fact it
has and refusing the part it doesn't — rather than smoothing over the gap.

**2. What happens when the transcript is longer than the context window.**

Every model has a limit on how much text it will accept. `gemini-2.5-flash` takes about a
million tokens, so one episode fits many times over — but I still budget it in
[`fitTranscript`](src/lib/chat.ts), for two reasons that aren't hypothetical: the whole
transcript is re-sent on *every* message and input tokens are billed per request, and most
other models are far smaller.

When a transcript doesn't fit, it's split on blank lines and whole paragraphs are kept from
the start until the budget runs out — never cut mid-sentence, and never silently. The
system prompt gets an extra line telling the model it only has the earlier part of the
episode, so the bot can say so instead of confidently answering from half the facts.

Keeping the *start* is an arguable choice: podcast intros establish who the guest is, and
losing that makes every later answer worse. The right fix isn't truncation at all — it's
retrieving only the relevant chunks, which is RAG, and which is a much later project.

**And one decision that isn't about the model at all:** the `/api/chat` route exists so the
API key stays on the server. If the browser called Gemini directly, the key would ship in
the JavaScript bundle and anyone could open devtools and spend the quota. The variable is
`GEMINI_API_KEY`, deliberately *without* a `NEXT_PUBLIC_` prefix — that prefix is what
would leak it.

## Tech stack

**TypeScript** (strict) · **Next.js 16** (App Router) · **Gemini API** via `fetch`, no SDK ·
**Vitest** · plain CSS · deploys to **Vercel**

> **Why no SDK:** calling the REST endpoint directly means the request body in
> `buildRequest` is literally what goes over the wire. For a project whose whole point was
> understanding what gets sent, a wrapper would have hidden the thing I was trying to learn.

## Testing

The code is split so the part that matters can be tested without a network or a key.

| File | What's tested |
|---|---|
| `src/lib/chat.ts` | Pure. The whole conversation is re-sent each turn, old turns get dropped, transcripts are truncated on paragraph boundaries, bad conversations are rejected, one SSE chunk parses. **23 tests.** |
| `src/lib/gemini.ts` | Against a fake `fetch`: streaming works, the key goes in a header and never the URL, a non-200 throws — and an SSE event split across two network chunks still arrives whole. **6 tests.** |
| `src/lib/grounding.ts` | The grading rules for the grounding check below — an invented answer to an unanswerable question must score as a failure. **10 tests.** |

```bash
npm test
```

The SSE one is the test I'd have missed by hand: a network chunk isn't a line, so the
stream can split `data: {"candidates"...` straight down the middle. It looks fine in
testing right up until it doesn't.

### Checking that it doesn't make things up

```bash
npm run check:grounding     # calls the real API, needs your key, costs a little quota
```

Seven questions written by hand against the sample episode: four that the episode answers,
and three it doesn't — including a phone number, and a leading question about franchise
plans that were never mentioned. The first four have to produce the fact; the last three
have to produce a refusal. It prints a score.

**Currently 7/7, stable across three runs** (`gemini-2.5-flash`, 1 Sep 2026).

This is not skipped in CI by accident, it's skipped on purpose — CI has no key, and a
check that costs money shouldn't run on every push.

**What this is not:** it's keyword matching, so it catches an invented phone number and
would miss a subtly wrong summary. And it's a little flaky, because the model isn't
deterministic. That flakiness is worth paying attention to rather than papering over — a
check that passes 5 times out of 7 is telling you the prompt isn't reliable enough. The
grown-up version of this compares against hand-written correct answers and is called an
eval; it's the next thing I want to learn.

## Limitations

Real ones, not modesty:

- **One episode, hardcoded** in `src/data/episode.ts`. No library, no search across a feed.
- **Nothing is saved.** Refresh the page and the conversation is gone. No database, no
  accounts.
- **It forgets past six exchanges**, by design — see above.
- **Grounding is a prompt, not a guarantee.** The system prompt tells the model to answer
  only from the transcript and to refuse otherwise; nothing in the code enforces it.
  `npm run check:grounding` measures how often it holds — currently 7/7 — but by keyword
  matching, which is a smoke test rather than a real evaluation. Seven questions is also a
  very small sample to claim anything from.
- **No audio.** Transcript text in; transcription is a separate problem.

## Running locally

```bash
git clone https://github.com/Nicklah/podcast-chatbot
cd podcast-chatbot
npm install
cp .env.example .env.local     # then paste in your key
npm run dev
```

You need a Gemini API key — free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
The free tier is plenty for this.

## Use your own podcast

Replace `src/data/episode.ts` with a transcript of a show you actually listen to and update
the `episode` details. Keep the blank line between paragraphs — that's what stops a
long transcript from being cut off mid-sentence.

The sample episode in the repo is fictional. Nobody said any of it.

## Deploying

Push to GitHub, import the repo at [vercel.com/new](https://vercel.com/new), and add
`GEMINI_API_KEY` under Settings → Environment Variables. Then put the URL at the top of
this file.

## License

MIT
