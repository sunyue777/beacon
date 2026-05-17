import test from "node:test";
import assert from "node:assert/strict";
import { applyVocabularyGuard, applyVocabularyGuardToOutput } from "@/lib/copilot/guard";

test("applyVocabularyGuard rewrites direct advisory language", () => {
  const result = applyVocabularyGuard("I recommend this path because you should act now.");
  assert.equal(result.vocabularyAdjusted, true);
  assert.match(result.text, /Beacon surfaced/);
  assert.match(result.text, /the RM can prepare to act now/);
  assert.equal(result.replacements.length, 2);
});

test("applyVocabularyGuard preserves clean text", () => {
  const result = applyVocabularyGuard("Beacon surfaced evidence for RM review.");
  assert.equal(result.vocabularyAdjusted, false);
  assert.equal(result.text, "Beacon surfaced evidence for RM review.");
  assert.equal(result.replacements.length, 0);
});

test("applyVocabularyGuardToOutput walks nested arrays and objects", () => {
  const result = applyVocabularyGuardToOutput({
    headline: "I advise a review.",
    bullets: ["you should call", "clean evidence"],
    nested: { text: "the right choice is unclear" }
  });
  assert.equal(result.vocabularyAdjusted, true);
  assert.deepEqual(result.output, {
    headline: "Beacon prepared a review.",
    bullets: ["the RM can prepare to call", "clean evidence"],
    nested: { text: "one evidence-backed path is unclear" }
  });
});

test("applyVocabularyGuardToOutput preserves non-string values", () => {
  const input = { count: 3, ok: true, empty: null, list: [1, false, undefined] };
  const result = applyVocabularyGuardToOutput(input);
  assert.equal(result.vocabularyAdjusted, false);
  assert.deepEqual(result.output, input);
});

test("applyVocabularyGuardToOutput reports replacement counts", () => {
  const result = applyVocabularyGuardToOutput(["I recommend", "I recommend", "decide"]);
  assert.equal(result.vocabularyAdjusted, true);
  assert.equal(result.replacements.reduce((sum, item) => sum + item.count, 0), 3);
  assert.equal(result.step?.name, "Vocabulary guard");
});

test("applyVocabularyGuardToOutput rewrites nested action reasons", () => {
  const result = applyVocabularyGuardToOutput({
    actions: [
      {
        id: "rebalance",
        reason: "I recommend rebalancing because you should reduce concentration."
      }
    ]
  });
  assert.equal(result.vocabularyAdjusted, true);
  assert.deepEqual(result.output, {
    actions: [
      {
        id: "rebalance",
        reason: "Beacon surfaced rebalancing because the RM can prepare to reduce concentration."
      }
    ]
  });
});
