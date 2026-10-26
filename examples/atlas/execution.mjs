import { createHash, randomUUID } from "node:crypto";
import { writeFile, rename, readFile } from "node:fs/promises";
const owner = (p) => `${p.tenant}:${p.userId}:${p.policyVersion}`;
const hash = (x) => createHash("sha256").update(x).digest("hex");
const check = (p, permission) => {
  if (p?.tenant !== "demo-aurora" || !p.permissions?.includes(permission))
    throw Error("forbidden");
};
export function getBuildStatus(p, args) {
  check(p, "build:read");
  if (
    !args ||
    Object.keys(args).sort().join(",") !== "component,version" ||
    args.component !== "AtlasTable" ||
    args.version !== "2.0"
  )
    throw Error("invalid_tool_arguments");
  return {
    component: "AtlasTable",
    version: "2.0",
    buildId: "build-demo-20",
    status: "succeeded",
    observedAt: "2026-10-26T00:00:00Z",
    synthetic: true,
  };
}
export class DraftStore {
  constructor(snapshot) {
    this.previews = new Map(snapshot?.previews || []);
    this.receipts = new Map(snapshot?.receipts || []);
  }
  preview(p, { taskId, content, version }, now = Date.now()) {
    check(p, "draft:write");
    if (
      !taskId ||
      typeof content !== "string" ||
      !content ||
      content.length > 4000 ||
      version !== "2.0"
    )
      throw Error("invalid_draft");
    const previewId = randomUUID();
    const preview = {
      previewId,
      owner: owner(p),
      taskId,
      content,
      version,
      contentHash: hash(content),
      expires: now + 60000,
    };
    this.previews.set(previewId, preview);
    return structuredClone(preview);
  }
  confirm(p, { previewId, contentHash, idempotencyKey }, now = Date.now()) {
    check(p, "draft:write");
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 3)
      throw Error("invalid_idempotency_key");
    const key = `${owner(p)}:${idempotencyKey}`;
    const prior = this.receipts.get(key);
    if (prior) {
      if (prior.previewId !== previewId || prior.contentHash !== contentHash)
        throw Error("idempotency_conflict");
      return structuredClone(prior);
    }
    const v = this.previews.get(previewId);
    if (!v || v.owner !== owner(p)) throw Error("forbidden");
    if (v.consumed) throw Error("preview_consumed");
    if (v.expires <= now) throw Error("confirmation_expired");
    if (v.contentHash !== contentHash) throw Error("confirmation_mismatch");
    // Sandbox write and idempotency receipt share one in-memory transaction.
    const receipt = {
      draftId: randomUUID(),
      previewId,
      contentHash,
      taskId: v.taskId,
      version: v.version,
      content: v.content,
      status: "saved",
      synthetic: true,
    };
    v.consumed = true;
    this.receipts.set(key, receipt);
    return structuredClone(receipt);
  }
  lookup(p, key) {
    check(p, "draft:write");
    return structuredClone(this.receipts.get(`${owner(p)}:${key}`) || null);
  }
  snapshot() {
    return structuredClone({
      previews: [...this.previews],
      receipts: [...this.receipts],
    });
  }
}
// Single-process demo checkpoint file, atomic replacement; not a concurrent transaction database.
export async function saveCheckpoint(path, state) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
export async function loadCheckpoint(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
export function runWorkflow(p, { component, version }) {
  if (!version)
    return {
      state: "needs_clarification",
      question: "请提供目标版本。",
      steps: ["validate"],
    };
  const build = getBuildStatus(p, { component, version });
  return {
    state: "completed",
    build,
    steps: ["validate", "build_status", "compose"],
    answer: `${component} ${version} 的合成演示构建 ${build.buildId} 已成功；这不证明组件文档中未说明的能力。`,
  };
}
export async function runAgent({
  principal: p,
  taskId,
  choose,
  maxSteps = 4,
  maxToolCalls = 2,
  maxCostUnits = 4,
  deadlineMs = 1000,
  checkpoint,
  onCheckpoint = async () => {},
  trace,
  now = Date.now,
}) {
  if (!taskId || typeof choose !== "function") throw Error("invalid_task");
  if (
    !Number.isInteger(maxSteps) ||
    maxSteps < 1 ||
    !Number.isInteger(maxToolCalls) ||
    maxToolCalls < 0 ||
    !Number.isFinite(maxCostUnits) ||
    maxCostUnits < 0 ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs <= 0
  )
    throw Error("invalid_budget");
  const start = now();
  if (!Number.isFinite(start) || !Number.isFinite(start + deadlineMs))
    throw Error("invalid_budget");
  const state = checkpoint
    ? structuredClone(checkpoint)
    : {
        taskId,
        owner: owner(p),
        attempt: 0,
        nextStep: 0,
        toolCalls: 0,
        costUnits: 0,
        deadlineAt: start + deadlineMs,
        observations: [],
        status: "running",
      };
  if (state.taskId !== taskId || state.owner !== owner(p))
    throw Error("checkpoint_scope");
  // Always reauthorize on recovery, even if the stored attempt was previously allowed.
  check(p, "build:read");
  // Restored state is trusted application storage, never caller/model-supplied JSON.
  // Missing deadlines require explicit migration; never silently grant a fresh budget.
  if (!Number.isFinite(state.deadlineAt)) throw Error("checkpoint_deadline");
  state.attempt++;
  const finish = async (reason) => {
    state.status = reason;
    trace?.record("task.result", {
      kind: "span",
      stopReason: reason,
      step: state.nextStep,
    });
    await onCheckpoint(structuredClone(state));
    return state;
  };
  if (state.status === "completed") return state;
  state.status = "running";
  for (; state.nextStep < maxSteps; ) {
    if (now() >= state.deadlineAt) return finish("time_budget");
    // Reserve one synthetic decision unit BEFORE invoking the mock chooser. Not currency.
    if (!Number.isFinite(state.costUnits) || state.costUnits + 1 > maxCostUnits)
      return finish("cost_budget");
    state.costUnits++;
    let timer;
    let action;
    try {
      action = await Promise.race([
        choose(structuredClone(state)),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("time_budget")),
            Math.max(1, state.deadlineAt - now()),
          );
        }),
      ]);
    } catch (e) {
      return finish(
        e.message === "time_budget" ? "time_budget" : "choice_error",
      );
    } finally {
      clearTimeout(timer);
    }
    if (now() >= state.deadlineAt) return finish("time_budget");
    const step = state.nextStep++;
    const parentId = trace?.record("agent.choose", {
      kind: "span",
      step,
    });
    if (action?.type === "finish") {
      if (typeof action.answer !== "string" || !action.answer.trim())
        return finish("invalid_finish");
      state.answer = action.answer;
      return finish("completed");
    }
    if (action?.type === "ask") {
      state.question = String(action.question || "");
      return finish("needs_clarification");
    }
    if (action?.type !== "build_status") return finish("action_not_allowed");
    if (state.toolCalls >= maxToolCalls) return finish("tool_budget");
    state.toolCalls++;
    try {
      const result = getBuildStatus(p, action.args);
      state.observations.push({ step, action: "build_status", result });
      trace?.record("tool.build_status", {
        parentId,
        kind: "span",
        step,
        resultKind: "succeeded",
      });
    } catch (e) {
      trace?.record("tool.build_status", {
        parentId,
        kind: "span",
        step,
        errorCategory: e.message,
      });
      return finish("tool_error");
    }
    await onCheckpoint(structuredClone(state));
  }
  return finish("step_budget");
}
