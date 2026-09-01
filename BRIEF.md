# Brief — Podcast Chatbot

> Project 1 of [ROADMAP-NICKLAH.md](../ROADMAP-NICKLAH.md), Phase 1.
> Write the brief before the code, so the AI builds *your* idea instead of its own.

## The problem

A good podcast episode is an hour long and completely unsearchable. You remember that
the guest said something useful about pricing, but finding it again means scrubbing
through 60 minutes of audio hoping to recognise it. Show notes are three bullet points.
Transcripts exist but nobody reads a 9,000-word wall of text.

So the knowledge is technically public and practically lost.

## Who has it

Someone who listens to one show regularly and wants to *use* what's in it — look
something up, settle an argument, get the actual quote. Concretely: me, with the episode
I listened to last week.

## What "working" means

I paste in one episode transcript, ask "what did they say about X?", and get an answer
that is **grounded in that transcript** — with the quote, not a plausible-sounding
invention. If the episode doesn't cover it, the bot says so instead of guessing.

## Scope

**In:**
- One episode at a time, loaded from a file in the repo.
- A chat interface with conversation history — follow-up questions have to work
  ("what else did they say about it?").
- Streaming responses, so it doesn't sit blank for eight seconds.
- Grounded answers: quote the transcript, admit when something isn't in it.

**Out — deliberately, not by oversight:**
- No database, no login, no user accounts.
- No search across multiple episodes. *(That's project 9 — it needs RAG. Idea written
  down, moving on.)*
- No audio upload or transcription. Transcript text in, that's it.
- No conversation persistence. Refresh the page and it's gone.

## Constraints

- **Gemini** as the LLM API (free tier).
- The API key never reaches the browser. All model calls go through my own server route.
- Deployed on Vercel, link in the README.

## The thing I have to be able to explain

From the roadmap, and this is the actual definition of done:

1. **What I send to the API on the second message that I didn't send on the first** —
   i.e. that the model has no memory, and the conversation is something *my code* holds
   and re-sends every single time.
2. **What happens when the transcript is longer than the context window** — and what my
   code does about it.

If I can't explain those two things out loud, the project isn't finished, even if it
works.

## Design decision made up front

Split the code in two:

- `src/lib/chat.ts` — **pure**. No `fetch`, no API key, no environment. It takes a
  transcript plus a conversation and returns the exact JSON body to send to Gemini.
  Because it's pure, it can be tested properly without a network or a key.
- `src/lib/gemini.ts` — **the thin bit that actually talks to the network.** Kept small
  on purpose, because it's the part I can't easily test.

That's the part of the codebase I'd be nervous about changing, so that's the part that
gets tests. (Borrowed from Nicanor's projects, scaled down to one file.)
