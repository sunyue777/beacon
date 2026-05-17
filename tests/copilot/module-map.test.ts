import test from "node:test";
import assert from "node:assert/strict";
import { copilotModuleMap } from "@/lib/copilot/module-map";

test("only draft_assist is approval-gated in the v1.1 module map", () => {
  assert.equal(copilotModuleMap.talking_points.approval, "auto");
  assert.equal(copilotModuleMap.term_explainer.approval, "auto");
  assert.equal(copilotModuleMap.next_best_action.approval, "auto");
  assert.equal(copilotModuleMap.draft_assist.approval, "rm-approval");
});

test("next_best_action remains deterministic by default", () => {
  assert.equal(copilotModuleMap.next_best_action.runtime, "deterministic");
  assert.equal(copilotModuleMap.next_best_action.reasoning, "inline-why");
});
