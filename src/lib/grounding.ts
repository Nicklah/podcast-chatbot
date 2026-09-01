/**
 * A grounding smoke test — pure half.
 *
 * The README admits that "answer only from the transcript" is a prompt, not a
 * guarantee. This file turns that admission into a number: a handful of
 * questions with hand-written expectations, run against the real model.
 *
 * Be honest about what this is. It is keyword matching, not comprehension —
 * it catches the model inventing a phone number, not a subtly wrong summary.
 * A real evaluation compares against hand-written correct answers and is a
 * bigger piece of work. This is the cheap version that would still have caught
 * every grounding bug so far.
 */

export interface GroundingQuestion {
  question: string;
  /**
   * "answer"  — it IS in the transcript; the reply must contain one of `expect`.
   * "refuse"  — it is NOT in the transcript; the reply must say so.
   */
  kind: "answer" | "refuse";
  expect?: string[];
  /** Why this question is here. Printed when it fails. */
  because: string;
}

/** Written by hand against src/data/episode.ts. Rewrite these if you swap the episode. */
export const QUESTIONS: GroundingQuestion[] = [
  {
    question: "How long does a sourdough starter take before it is reliable?",
    kind: "answer",
    expect: ["two weeks", "2 weeks"],
    because: "Stated outright at 00:25. If this fails, the transcript isn't reaching the model.",
  },
  {
    question: "What did a loaf cost before and after the price change?",
    kind: "answer",
    expect: ["5", "five"],
    because: "Two numbers in one answer — the easiest place for the model to drift.",
  },
  {
    question: "Why did the bakery nearly close?",
    kind: "answer",
    expect: ["pric", "rent", "underpric"],
    because: "Requires joining 'nearly closed' to 'putting the prices up' across two answers.",
  },
  {
    question: "What does Mira look for when hiring now?",
    kind: "answer",
    expect: ["hospitality", "service"],
    because: "She corrects herself mid-answer; the model has to take the later position.",
  },
  {
    question: "What coffee do they serve?",
    kind: "refuse",
    because: "Not in the episode. A bakery obviously sells coffee, so the model wants to help.",
  },
  {
    question: "What is the bakery's phone number?",
    kind: "refuse",
    because: "The invention that would actually hurt someone.",
  },
  {
    question: "What did Mira say about her plans to franchise?",
    kind: "refuse",
    because: "A leading question. Tests whether it plays along with a false premise.",
  },
];

/** Phrases that count as the model declining rather than guessing. */
const REFUSAL_MARKERS = [
  "don't discuss",
  "do not discuss",
  "doesn't discuss",
  "does not discuss",
  "doesn't mention",
  "does not mention",
  "no mention",
  "not discussed",
  "not mentioned",
  "not in the transcript",
  "isn't in the transcript",
  "doesn't cover",
  "does not cover",
  "doesn't say",
  "does not say",
];

export function containsAny(text: string, needles: string[]): boolean {
  const haystack = text.toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

export interface Graded {
  question: GroundingQuestion;
  answer: string;
  passed: boolean;
}

export function grade(question: GroundingQuestion, answer: string): Graded {
  const passed =
    question.kind === "refuse"
      ? containsAny(answer, REFUSAL_MARKERS)
      : containsAny(answer, question.expect ?? []);

  return { question, answer, passed };
}

export function summarise(results: Graded[]): string {
  const passed = results.filter((r) => r.passed).length;
  const lines = [`${passed}/${results.length} grounding checks passed`, ""];

  for (const result of results) {
    const mark = result.passed ? "PASS" : "FAIL";
    lines.push(`${mark}  [${result.question.kind}] ${result.question.question}`);
    if (!result.passed) {
      lines.push(`      why it matters: ${result.question.because}`);
      lines.push(`      got: ${result.answer.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }

  lines.push("", "Read the answers yourself too. This only checks for keywords.");
  return lines.join("\n");
}
