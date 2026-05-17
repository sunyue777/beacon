import type { AgentRun } from "@/lib/repo/types";

export interface VocabularyGuardResult {
  text: string;
  vocabularyAdjusted: boolean;
  replacements: { pattern: string; replacement: string; count: number }[];
  step?: AgentRun["steps"][number];
}

export interface OutputVocabularyGuardResult {
  output: unknown;
  vocabularyAdjusted: boolean;
  replacements: { pattern: string; replacement: string; count: number }[];
  step?: AgentRun["steps"][number];
}

const vocabularyRules = [
  { pattern: /\bI recommend\b/gi, replacement: "Beacon surfaced" },
  { pattern: /\bI advise\b/gi, replacement: "Beacon prepared" },
  { pattern: /\bI suggest you\b/gi, replacement: "Beacon surfaced an option to" },
  { pattern: /\byou should\b/gi, replacement: "the RM can prepare to" },
  { pattern: /\bmy advice\b/gi, replacement: "the prepared evidence" },
  { pattern: /\bthe right choice\b/gi, replacement: "one evidence-backed path" },
  { pattern: /\bdecide\b/gi, replacement: "prepare" }
];

export function applyVocabularyGuard(text: string): VocabularyGuardResult {
  let next = text;
  const replacements: VocabularyGuardResult["replacements"] = [];

  for (const rule of vocabularyRules) {
    const matches = next.match(rule.pattern);
    if (!matches?.length) continue;
    next = next.replace(rule.pattern, rule.replacement);
    replacements.push({
      pattern: rule.pattern.source,
      replacement: rule.replacement,
      count: matches.length
    });
  }

  const vocabularyAdjusted = replacements.length > 0;
  return {
    text: next,
    vocabularyAdjusted,
    replacements,
    step: vocabularyAdjusted
      ? {
          name: "Vocabulary guard",
          source: "BeaconGuard",
          output: { replacements }
        }
      : undefined
  };
}

export function applyVocabularyGuardToOutput(output: unknown): OutputVocabularyGuardResult {
  const allReplacements: OutputVocabularyGuardResult["replacements"] = [];
  const guarded = visitOutput(output, allReplacements);
  const vocabularyAdjusted = allReplacements.length > 0;
  return {
    output: guarded,
    vocabularyAdjusted,
    replacements: allReplacements,
    step: vocabularyAdjusted
      ? {
          name: "Vocabulary guard",
          source: "BeaconGuard",
          output: { replacements: allReplacements }
        }
      : undefined
  };
}

function visitOutput(value: unknown, replacements: OutputVocabularyGuardResult["replacements"]): unknown {
  if (typeof value === "string") {
    const guarded = applyVocabularyGuard(value);
    replacements.push(...guarded.replacements);
    return guarded.text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => visitOutput(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, visitOutput(nested, replacements)])
    );
  }
  return value;
}
