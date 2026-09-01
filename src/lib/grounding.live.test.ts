/**
 * The live half of the grounding check. Calls the real API, costs real quota.
 *
 * Skipped by default, including in CI — it only runs via:
 *
 *   npm run check:grounding
 *
 * Expect it to be a little flaky: the model is not deterministic even at
 * temperature 0.2, so a borderline question can pass one run and fail the next.
 * That flakiness is information. A check that fails half the time is telling
 * you the prompt is not reliable enough, not that the test is bad.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildRequest } from "./chat";
import { streamGemini } from "./gemini";
import { episode, transcript } from "@/data/episode";
import { QUESTIONS, grade, summarise, type Graded } from "./grounding";

/** vitest doesn't read .env.local, so pick the key up by hand if it isn't already set. */
function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const match = readFileSync(".env.local", "utf8").match(/^GEMINI_API_KEY=(.*)$/m);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

async function ask(question: string, key: string): Promise<string> {
  const request = buildRequest({
    episode,
    transcript,
    messages: [{ role: "user", text: question }],
  });

  let answer = "";
  for await (const chunk of streamGemini(request, { apiKey: key })) answer += chunk;
  return answer;
}

describe.runIf(process.env.RUN_LIVE_CHECKS)("grounding, against the real model", () => {
  const key = apiKey();

  it("has a key to run with", () => {
    expect(key, "No GEMINI_API_KEY. Put it in .env.local — see .env.example.").not.toBe("");
  });

  const results: Graded[] = [];

  for (const question of QUESTIONS) {
    // Skip rather than fail when there's no key: one clear "no key" failure
    // above is the signal, seven identical auth errors is just noise.
    it.skipIf(key === "")(
      `[${question.kind}] ${question.question}`,
      { timeout: 30_000 },
      async () => {
        const answer = await ask(question.question, key);
        const result = grade(question, answer);
        results.push(result);

        expect(result.passed, `${question.because}\n\nGot: ${answer}`).toBe(true);
      },
    );
  }

  it.skipIf(key === "")("prints the summary", () => {
    console.log("\n" + summarise(results) + "\n");
  });
});
