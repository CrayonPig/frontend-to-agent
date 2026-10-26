import { answerQuestion } from "./core.mjs";
import { Trace } from "./trace.mjs";
// One real retrieval inside answerQuestion; no synthetic rerank/model span is fabricated.
export function observedAnswer(store, principal, input, taskId) {
  const allowed = store.visible(principal, {
    version: input.version,
    caseId: input.caseId,
  });
  const trace = new Trace({
    taskId,
    allowedSourceIds: allowed.map((d) => d.id),
    allowedSourceRevisions: allowed.map((d) => `${d.id}@r${d.revision}`),
  });
  const parentId = trace.record("assistant.task", { kind: "span" });
  const started = performance.now();
  let retrieval = { candidateIds: [], sourceRevisions: [], durationMs: null };
  const result = answerQuestion(store, principal, {
    ...input,
    onRetrieve: (event) => {
      retrieval = event;
      trace.record("retrieve.docs", { parentId, kind: "span", ...event });
    },
  });
  // The rule adapter has no model generation, Prompt use, token count or cost.
  trace.record("answer.compose", {
    parentId,
    kind: "span",
    resultKind: result.kind,
    sourceIds: result.sourceIds || [],
    sourceRevisions: (result.sourceIds || []).map((id) => {
      const d = allowed.find((d) => d.id === id);
      return `${id}@r${d.revision}`;
    }),
    durationMs: performance.now() - started,
    usage: { inputTokens: null, outputTokens: null },
  });
  return { result, retrieval, trace: trace.export() };
}
