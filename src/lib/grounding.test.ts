import { describe, it, expect } from "vitest";
import { containsAny, grade, summarise, QUESTIONS, type GroundingQuestion } from "./grounding";

const answerable: GroundingQuestion = {
  question: "How long does a starter take?",
  kind: "answer",
  expect: ["two weeks"],
  because: "test",
};

const unanswerable: GroundingQuestion = {
  question: "What coffee do they serve?",
  kind: "refuse",
  because: "test",
};

describe("grade", () => {
  it("passes an answerable question that contains the fact", () => {
    expect(grade(answerable, "About two weeks, she says.").passed).toBe(true);
  });

  it("fails an answerable question that misses the fact", () => {
    expect(grade(answerable, "She doesn't really say.").passed).toBe(false);
  });

  it("passes an unanswerable question when the model declines", () => {
    expect(grade(unanswerable, "They don't discuss coffee in this episode.").passed).toBe(true);
  });

  // The failure this whole file exists to catch.
  it("fails an unanswerable question when the model invents an answer", () => {
    expect(grade(unanswerable, "They serve a single-origin Ethiopian filter.").passed).toBe(false);
  });

  it("ignores case", () => {
    expect(grade(answerable, "TWO WEEKS.").passed).toBe(true);
  });
});

describe("containsAny", () => {
  it("is false for an empty needle list, so a missing 'expect' cannot pass by accident", () => {
    expect(containsAny("anything at all", [])).toBe(false);
  });
});

describe("QUESTIONS", () => {
  it("gives every answerable question something to look for", () => {
    for (const question of QUESTIONS.filter((q) => q.kind === "answer")) {
      expect(question.expect?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("checks both that it answers and that it declines", () => {
    expect(QUESTIONS.some((q) => q.kind === "answer")).toBe(true);
    expect(QUESTIONS.some((q) => q.kind === "refuse")).toBe(true);
  });
});

describe("summarise", () => {
  it("leads with the score", () => {
    const output = summarise([
      grade(answerable, "two weeks"),
      grade(unanswerable, "They serve coffee."),
    ]);
    expect(output.split("\n")[0]).toBe("1/2 grounding checks passed");
  });

  it("explains why a failure matters instead of just printing FAIL", () => {
    const output = summarise([grade(unanswerable, "Ethiopian filter.")]);
    expect(output).toContain("why it matters");
    expect(output).toContain("Ethiopian filter.");
  });
});
