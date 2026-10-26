import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { principal, documents, cases } from "../fixtures.mjs";
import {
  DocumentStore,
  answerQuestion,
  retrieve,
  validateResult,
} from "../core.mjs";
import { grade } from "../expectations.mjs";
import { evaluate } from "../evaluate.mjs";
import { Trace, withRetry, CallError, Semaphore } from "../trace.mjs";
import {
  ScopedCache,
  MemoryStore,
  assembleContext,
  percentile,
  costSummary,
  PromptRegistry,
} from "../governance.mjs";
import {
  DraftStore,
  getBuildStatus,
  runWorkflow,
  runAgent,
  saveCheckpoint,
  loadCheckpoint,
} from "../execution.mjs";
const p = principal;
test("Q01–Q14 independent bounded assertions and structure pass", () => {
  const r = evaluate();
  assert.equal(r.summary.passed, 14);
  assert.deepEqual([r.summary.dev, r.summary.check], [8, 6]);
});
test("fluent wrong-version answer fails despite valid structure", () => {
  const r = {
    kind: "answered",
    answer: "1.4 使用 pending 自动禁用按钮。",
    sourceIds: ["C-B20"],
  };
  assert.equal(validateResult(r, documents), r);
  assert.equal(grade("Q03", r).pass, false);
});
test("scoring admits paraphrase; not full answer equality", () => {
  assert.equal(
    grade("Q03", {
      kind: "answered",
      answer: "在 1.4 中 disabled 与 loading 要分开设置。",
      sourceIds: ["C-B14"],
    }).pass,
    true,
  );
});
test("forbidden docs never become retrieval candidates or context", () => {
  const store = new DocumentStore();
  const docs = retrieve(store, p, { query: "demo-bay share", version: "2.0" });
  assert.ok(!docs.some((d) => d.id === "T-B20"));
  assert.ok(
    !assembleContext(p, {
      question: "share",
      version: "2.0",
      docs: documents,
    }).text.includes("T-B20"),
  );
});
test("self-declared admin is rejected without hidden metadata", () => {
  const c = cases.find((c) => c.id === "Q08");
  const r = answerQuestion(new DocumentStore(), p, {
    question: c.question,
    version: c.version,
  });
  assert.equal(r.kind, "forbidden");
  assert.ok(!JSON.stringify(r).includes("T-B20"));
  assert.ok(!JSON.stringify(r).includes("未启用"));
});
test("injection is present only Q09 and cannot become a citation", () => {
  const store = new DocumentStore();
  assert.ok(!store.visible(p).some((d) => d.id === "X-T20"));
  const docs = store.visible(p, { caseId: "Q09" });
  assert.ok(docs.some((d) => d.id === "X-T20"));
  assert.throws(
    () =>
      validateResult(
        { kind: "answered", answer: "支持百万行", sourceIds: ["X-T20"] },
        docs,
      ),
    /invalid_citation/,
  );
});
test("conflict replaces baseline only Q14", () => {
  const s = new DocumentStore();
  const ids = s.visible(p, { caseId: "Q14" }).map((d) => d.id);
  assert.ok(!ids.includes("C-T20"));
  assert.ok(ids.includes("C-T20-A") && ids.includes("C-T20-B"));
  assert.ok(!s.visible(p).some((d) => d.id === "C-T20-A"));
});
test("invalid output types fail", () => {
  assert.throws(
    () =>
      validateResult(
        { kind: "answered", answer: 5, sourceIds: ["C-T20"] },
        documents,
      ),
    /invalid_text/,
  );
  assert.throws(
    () => validateResult({ kind: "success" }, documents),
    /invalid_kind/,
  );
});
test("cache isolates principal and permission epoch", () => {
  const s = new DocumentStore(),
    c = new ScopedCache(),
    input = { q: "share", v: "2.0" };
  c.set(p, s, input, {
    kind: "answered",
    answer: "enabled",
    sourceIds: ["T-A20"],
  });
  assert.ok(c.get(p, s, input));
  assert.equal(c.get({ ...p, userId: "reader-other" }, s, input), null);
  assert.equal(c.get({ ...p, policyVersion: "policy-2" }, s, input), null);
  assert.equal(c.get({ ...p, permissions: [] }, s, input), null);
});
test("delete invalidates cache; old update cannot resurrect tombstone", () => {
  const s = new DocumentStore(),
    c = new ScopedCache();
  c.set(p, s, "table", {
    kind: "answered",
    answer: "table",
    sourceIds: ["C-T20"],
  });
  assert.equal(s.apply({ id: "C-T20", revision: 2, deleted: true }), true);
  assert.equal(c.get(p, s, "table"), null);
  assert.equal(s.apply(documents.find((d) => d.id === "C-T20")), false);
  assert.ok(!s.visible(p).some((d) => d.id === "C-T20"));
});
test("duplicate update is idempotent; newer revision applies once", () => {
  const s = new DocumentStore(),
    d = { ...documents[0], revision: 2, text: "updated" };
  assert.equal(s.apply(d), true);
  const gen = s.generation;
  assert.equal(s.apply(d), false);
  assert.equal(s.generation, gen);
});
test("cache expires", () => {
  const s = new DocumentStore(),
    c = new ScopedCache();
  c.set(
    p,
    s,
    "q",
    { kind: "insufficient_evidence", reason: "unknown" },
    10,
    100,
  );
  assert.ok(c.get(p, s, "q", 109));
  assert.equal(c.get(p, s, "q", 110), null);
});
test("tool rejects extra args and unauthorized principal", () => {
  assert.equal(
    getBuildStatus(p, { component: "AtlasTable", version: "2.0" }).status,
    "succeeded",
  );
  assert.throws(
    () =>
      getBuildStatus(p, {
        component: "AtlasTable",
        version: "2.0",
        tenant: "demo-bay",
      }),
    /invalid_tool/,
  );
  assert.throws(
    () =>
      getBuildStatus(
        { ...p, permissions: [] },
        { component: "AtlasTable", version: "2.0" },
      ),
    /forbidden/,
  );
});
test("workflow version gap stops before tool call", () => {
  assert.equal(
    runWorkflow(p, { component: "AtlasTable" }).state,
    "needs_clarification",
  );
  assert.equal(
    runWorkflow(p, { component: "AtlasTable", version: "2.0" }).state,
    "completed",
  );
});
const preview = (s) =>
  s.preview(
    p,
    {
      taskId: "task-1",
      content: "将 loading 改为 pending，保留 disabled。",
      version: "2.0",
    },
    100,
  );
test("draft preview requires explicit confirmation and binds content", () => {
  const s = new DraftStore(),
    v = preview(s);
  assert.equal(s.lookup(p, "key-1"), null);
  assert.throws(
    () =>
      s.confirm(
        p,
        {
          previewId: v.previewId,
          contentHash: "changed",
          idempotencyKey: "key-1",
        },
        101,
      ),
    /mismatch/,
  );
  const args = {
    previewId: v.previewId,
    contentHash: v.contentHash,
    idempotencyKey: "key-1",
  };
  const receipt = s.confirm(p, args, 101);
  assert.equal(s.confirm(p, args, 102).draftId, receipt.draftId);
});
test("confirmation cannot cross identity, policy, expiry or idempotency payload", () => {
  const s = new DraftStore(),
    v = preview(s);
  const args = {
    previewId: v.previewId,
    contentHash: v.contentHash,
    idempotencyKey: "key-1",
  };
  assert.throws(
    () => s.confirm({ ...p, userId: "other" }, args, 101),
    /forbidden/,
  );
  assert.throws(
    () => s.confirm({ ...p, policyVersion: "policy-2" }, args, 101),
    /forbidden/,
  );
  assert.throws(() => s.confirm(p, args, 60100), /expired/);
  s.confirm(p, args, 101);
  assert.throws(
    () => s.confirm(p, { ...args, contentHash: "changed" }, 102),
    /idempotency_conflict/,
  );
});
test("persisted receipt resolves uncertain result without duplicate write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-"));
  try {
    const s = new DraftStore(),
      v = preview(s);
    const first = s.confirm(
      p,
      {
        previewId: v.previewId,
        contentHash: v.contentHash,
        idempotencyKey: "key-1",
      },
      101,
    );
    await saveCheckpoint(join(dir, "draft.json"), s.snapshot());
    const restored = new DraftStore(
      await loadCheckpoint(join(dir, "draft.json")),
    );
    assert.equal(restored.lookup(p, "key-1").draftId, first.draftId);
    assert.equal(restored.receipts.size, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("agent bounds tool count and disallows write intents", async () => {
  const choose = () => ({
    type: "build_status",
    args: { component: "AtlasTable", version: "2.0" },
  });
  const r = await runAgent({
    principal: p,
    taskId: "t",
    choose,
    maxToolCalls: 1,
  });
  assert.equal(r.status, "tool_budget");
  assert.equal(r.observations.length, 1);
  assert.equal(
    (
      await runAgent({
        principal: p,
        taskId: "t",
        choose: () => ({ type: "share" }),
      })
    ).status,
    "action_not_allowed",
  );
});
test("agent step and wall time budgets terminate", async () => {
  const choose = () => ({
    type: "build_status",
    args: { component: "AtlasTable", version: "2.0" },
  });
  assert.equal(
    (await runAgent({ principal: p, taskId: "t", choose, maxSteps: 1 })).status,
    "step_budget",
  );
  assert.equal(
    (
      await runAgent({
        principal: p,
        taskId: "t",
        choose: () => new Promise(() => {}),
        deadlineMs: 5,
      })
    ).status,
    "time_budget",
  );
});
test("resume reuses observation and reauthorizes checkpoint", async () => {
  let cp;
  await assert.rejects(
    () =>
      runAgent({
        principal: p,
        taskId: "task",
        choose: () => ({
          type: "build_status",
          args: { component: "AtlasTable", version: "2.0" },
        }),
        onCheckpoint: (s) => {
          cp = s;
          throw Error("simulated_process_exit");
        },
      }),
    /simulated/,
  );
  const trace = new Trace({ taskId: "task", attempt: 2 });
  const resumed = await runAgent({
    principal: p,
    taskId: "task",
    checkpoint: cp,
    trace,
    choose: (s) => ({
      type: "finish",
      answer: `build count ${s.observations.length}`,
    }),
  });
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.toolCalls, 1);
  assert.equal(resumed.attempt, 2);
  await assert.rejects(
    () =>
      runAgent({
        principal: { ...p, permissions: [] },
        taskId: "task",
        checkpoint: cp,
        choose: () => ({ type: "finish" }),
      }),
    /forbidden/,
  );
});
test("trace has parent relation and allowlist export excludes private values", () => {
  const t = new Trace({ taskId: "t" });
  const parent = t.record("assistant.task", { kind: "span" });
  t.record("model.call", {
    parentId: parent,
    kind: "generation",
    apiKey: "secret",
    question: "private",
    reasoning: "private",
  });
  assert.equal(t.export().events[1].parentId, parent);
  assert.ok(!JSON.stringify(t.export()).includes("secret"));
  assert.ok(!JSON.stringify(t.export()).includes("private"));
  assert.throws(() => t.record("x", { parentId: "missing" }), /unknown_parent/);
});
test("retry only transient errors and honors attempt budget", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls++;
        throw new CallError("schema");
      }),
    /schema/,
  );
  assert.equal(calls, 1);
  calls = 0;
  const result = await withRetry(
    async () => {
      if (++calls === 1) throw new CallError("temporary");
      return "ok";
    },
    { sleep: async () => {} },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});
test("timeout does not imply remote cancelled; no automatic timeout retry", async () => {
  let calls = 0,
    executed = false;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++;
          await new Promise((r) => setTimeout(r, 15));
          executed = true;
        },
        { deadlineMs: 2 },
      ),
    /timeout/,
  );
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 1);
  assert.equal(executed, true);
});
test("concurrency limit holds across queue handoff", async () => {
  const s = new Semaphore(2);
  let active = 0,
    max = 0;
  await Promise.all(
    Array.from({ length: 6 }, () =>
      s.use(async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      }),
    ),
  );
  assert.equal(max, 2);
  assert.equal(s.active, 0);
});
test("memory scopes, expires, and deletes without modifying knowledge", () => {
  const m = new MemoryStore();
  m.put(p, {
    id: "pref",
    value: "brief",
    source: "explicit-demo-input",
    expiresAt: 200,
  });
  assert.ok(m.read(p, "pref", 100));
  assert.equal(m.read({ ...p, userId: "other" }, "pref", 100), null);
  assert.equal(m.read(p, "pref", 200), null);
  m.delete(p, "pref");
  assert.equal(m.read(p, "pref", 100), null);
});
test("context pins target version and never treats compression as evidence", () => {
  const c = assembleContext(p, {
    question: "按钮",
    version: "1.4",
    docs: documents,
    maxChars: 300,
  });
  assert.ok(c.text.startsWith("目标版本=1.4"));
  assert.deepEqual(c.sourceIds, ["C-B14"]);
  assert.throws(
    () =>
      assembleContext(p, {
        question: "long",
        version: "1.4",
        docs: [],
        maxChars: 1,
      }),
    /context_budget/,
  );
});
test("cost unknown remains unknown and percentiles need samples", () => {
  assert.equal(costSummary([{ cost: null, pass: true }]).costPerSuccess, null);
  assert.equal(
    costSummary([
      { cost: 2, pass: true },
      { cost: 3, pass: false },
    ]).costPerSuccess,
    5,
  );
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([1, 2, 3, 100], 0.95), 100);
});
test("prompt versions immutable, label movement gated", () => {
  const r = new PromptRegistry();
  r.add("p1", "template");
  assert.throws(() => r.add("p1", "changed"), /immutable/);
  assert.throws(
    () =>
      r.promote("production", "p1", {
        approved: false,
        regressionPassed: true,
      }),
    /release_gate/,
  );
  r.promote("production", "p1", { approved: true, regressionPassed: true });
  assert.equal(r.resolve("production").version, "p1");
});
test("HTTP boundary rejects forged identity and produces final stream event", async () => {
  const { createDemoServer } = await import("../server.mjs");
  const server = createDemoServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/api/ask`;
  try {
    const denied = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        question: "share",
        version: "2.0",
        tenant: "demo-bay",
      }),
    });
    assert.equal(denied.status, 400);
    const ok = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        question: "Atlas UI 2.0 要按列展示记录，用哪个组件？",
        version: "2.0",
      }),
    });
    assert.equal(ok.status, 200);
    const events = (await ok.text()).trim().split("\n").map(JSON.parse);
    assert.equal(events.at(-1).type, "completed");
    assert.equal(events.at(-1).result.kind, "answered");
    assert.equal(new Set(events.map((e) => e.requestId)).size, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("trace rejects hidden source identifiers before export", () => {
  const t = new Trace({ taskId: "t", allowedSourceIds: ["C-T20"] });
  assert.throws(
    () => t.record("retrieve.docs", { sourceIds: ["T-B20"] }),
    /unauthorized_trace_source/,
  );
  assert.equal(t.events.length, 0);
});
test("document fact update changes answer and citation revision remains discoverable", () => {
  const s = new DocumentStore();
  s.apply({
    ...documents.find((d) => d.id === "C-T20"),
    revision: 2,
    facts: { rowKeyRequired: false },
    text: "AtlasTable rowKey 可选",
  });
  const r = answerQuestion(s, p, {
    question: "AtlasTable rowKey 可以省略吗？",
    version: "2.0",
  });
  assert.ok(r.answer.includes("可选"));
  assert.ok(!r.answer.includes("必填"));
  assert.equal(s.docs.get(r.sourceIds[0]).revision, 2);
});
test("agent rejects invalid budgets and empty finish", async () => {
  await assert.rejects(
    () =>
      runAgent({
        principal: p,
        taskId: "t",
        choose: () => ({ type: "finish" }),
        maxSteps: NaN,
      }),
    /invalid_budget/,
  );
  assert.equal(
    (
      await runAgent({
        principal: p,
        taskId: "t",
        choose: () => ({ type: "finish" }),
      })
    ).status,
    "invalid_finish",
  );
});
test("agent reserves synthetic cost before chooser; sync overrun cannot finish", async () => {
  let calls = 0;
  const r = await runAgent({
    principal: p,
    taskId: "t",
    choose: () => {
      calls++;
      return { type: "finish", answer: "ok" };
    },
    maxCostUnits: 0,
  });
  assert.equal(r.status, "cost_budget");
  assert.equal(calls, 0);
  let clock = 0;
  const late = await runAgent({
    principal: p,
    taskId: "t",
    now: () => clock,
    deadlineMs: 10,
    choose: () => {
      clock = 11;
      return { type: "finish", answer: "too late" };
    },
  });
  assert.equal(late.status, "time_budget");
});

test("context fixture scope excludes Q14 conflict and Q09 injection by default", () => {
  const normal = assembleContext(p, {
    question: "rowKey",
    version: "2.0",
    docs: documents,
  });
  assert.ok(normal.sourceIds.includes("C-T20"));
  assert.ok(!normal.sourceIds.includes("C-T20-A"));
  assert.ok(!normal.sourceIds.includes("X-T20"));
  const conflict = assembleContext(p, {
    question: "rowKey",
    version: "2.0",
    docs: documents,
    caseId: "Q14",
  });
  assert.ok(!conflict.sourceIds.includes("C-T20"));
  assert.ok(conflict.sourceIds.includes("C-T20-A"));
  assert.ok(conflict.sourceIds.includes("C-T20-B"));
});

test("negative mutations detect unsupported claims, leak and wrong refusal", () => {
  assert.equal(
    grade("Q05", {
      kind: "answered",
      answer: "支持百万行虚拟滚动",
      sourceIds: ["C-T20"],
    }).pass,
    false,
  );
  assert.equal(
    grade("Q08", {
      kind: "forbidden",
      message: "权限不足，但 T-B20 说未启用。",
    }).pass,
    false,
  );
  assert.equal(
    grade("Q14", {
      kind: "answered",
      answer: "rowKey 必填",
      sourceIds: ["C-T20-A"],
    }).pass,
    false,
  );
  assert.equal(
    grade("Q01", { kind: "insufficient_evidence", reason: "不知道" }).pass,
    false,
  );
});

test("one preview cannot create duplicate drafts under different keys", () => {
  const s = new DraftStore(),
    v = preview(s);
  const args = {
    previewId: v.previewId,
    contentHash: v.contentHash,
    idempotencyKey: "key-1",
  };
  s.confirm(p, args, 101);
  assert.throws(
    () => s.confirm(p, { ...args, idempotencyKey: "key-2" }, 102),
    /preview_consumed/,
  );
  assert.equal(s.receipts.size, 1);
});

test("observed answer captures actual candidate revisions and never invents retrieval for refusal", async () => {
  const { observedAnswer } = await import("../application.mjs");
  const s = new DocumentStore();
  const r = observedAnswer(
    s,
    p,
    { question: cases[2].question, version: "1.4" },
    "q03",
  );
  assert.ok(r.retrieval.candidateIds.includes("C-B14"));
  assert.ok(r.retrieval.sourceRevisions.includes("C-B14@r1"));
  assert.equal(
    r.trace.events.filter((e) => e.name === "retrieve.docs").length,
    1,
  );
  assert.equal(r.trace.versions.adapterVersion, "atlas-rule-mock-1");
  assert.equal(r.trace.versions.promptVersion, "not-used");
  const denied = observedAnswer(
    s,
    p,
    { question: cases[7].question, version: "2.0" },
    "q08",
  );
  assert.equal(
    denied.trace.events.filter((e) => e.name === "retrieve.docs").length,
    0,
  );
  assert.ok(!JSON.stringify(denied.trace).includes("T-B20"));
});

test("trace forbids hidden candidates, unknown source and mismatched revision", () => {
  const t = new Trace({
    allowedSourceIds: ["C-T20"],
    allowedSourceRevisions: ["C-T20@r1"],
  });
  assert.throws(
    () => t.record("retrieve.docs", { candidateIds: ["T-B20"] }),
    /unauthorized_trace_source/,
  );
  assert.throws(
    () => t.record("retrieve.docs", { sourceIds: ["nonexistent"] }),
    /unauthorized_trace_source/,
  );
  assert.throws(
    () => t.record("retrieve.docs", { sourceRevisions: ["C-T20@r99"] }),
    /unauthorized_trace_revision/,
  );
  assert.equal(t.events.length, 0);
});

test("A30 build success cannot establish undocumented virtual scrolling", () => {
  const answer = answerQuestion(new DocumentStore(), p, {
    question: cases[4].question,
    version: "2.0",
  });
  const build = getBuildStatus(p, { component: "AtlasTable", version: "2.0" });
  assert.equal(answer.kind, "insufficient_evidence");
  assert.equal(build.status, "succeeded");
  assert.equal(
    grade("Q05", {
      kind: "answered",
      answer: "构建成功，所以支持百万行虚拟滚动。",
      sourceIds: ["C-T20"],
    }).pass,
    false,
  );
});

test("scripted loop records actual stop reason without claiming model generation", async () => {
  const trace = new Trace({ taskId: "stop-test" });
  await runAgent({
    principal: p,
    taskId: "stop-test",
    trace,
    choose: () => ({ type: "finish", answer: "synthetic answer" }),
  });
  const events = trace.export().events;
  assert.ok(
    events.some(
      (e) => e.name === "task.result" && e.stopReason === "completed",
    ),
  );
  assert.ok(!events.some((e) => e.kind === "generation"));
});

test("required comparison and conflict evidence stays atomic under context pressure", () => {
  for (const input of [
    { question: "compare", version: "compare" },
    { question: "rowKey", version: "2.0", caseId: "Q14" },
  ]) {
    const full = assembleContext(p, { ...input, docs: documents });
    const required = input.caseId ? ["C-T20-A", "C-T20-B"] : ["C-B14", "C-B20"];
    assert.ok(required.every((id) => full.sourceIds.includes(id)));
    assert.throws(
      () => assembleContext(p, { ...input, docs: documents, maxChars: 70 }),
      /context_budget/,
    );
    assert.throws(
      () =>
        assembleContext(p, {
          ...input,
          docs: documents.filter((d) => d.id !== required[0]),
        }),
      /required_evidence_missing/,
    );
  }
});


test("persisted absolute deadline stops expired resume before any new choice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-deadline-"));
  let clock = 100;
  const file = join(dir, "task.json");
  try {
    await assert.rejects(() => runAgent({
      principal: p, taskId: "deadline-task", now: () => clock, deadlineMs: 10,
      choose: () => ({ type: "build_status", args: { component: "AtlasTable", version: "2.0" } }),
      onCheckpoint: async state => {
        await saveCheckpoint(file, state);
        throw Error("simulated_process_exit");
      },
    }), /simulated_process_exit/);
    const checkpoint = await loadCheckpoint(file);
    assert.equal(checkpoint.deadlineAt, 110);
    clock = 110;
    let choices = 0;
    const resumed = await runAgent({
      principal: p, taskId: "deadline-task", checkpoint,
      now: () => clock, deadlineMs: 100000,
      choose: () => { choices++; return { type: "finish", answer: "late" }; },
    });
    assert.equal(resumed.status, "time_budget");
    assert.equal(resumed.deadlineAt, 110);
    assert.equal(resumed.attempt, 2);
    assert.equal(resumed.toolCalls, 1);
    assert.equal(resumed.costUnits, checkpoint.costUnits);
    assert.equal(choices, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("resume before deadline cannot finish after original deadline", async () => {
  let checkpoint;
  let clock = 100;
  await assert.rejects(() => runAgent({
    principal: p, taskId: "deadline-task", now: () => clock, deadlineMs: 10,
    choose: () => ({ type: "build_status", args: { component: "AtlasTable", version: "2.0" } }),
    onCheckpoint: state => { checkpoint = state; throw Error("interrupted"); },
  }), /interrupted/);
  clock = 109;
  const resumed = await runAgent({
    principal: p, taskId: "deadline-task", checkpoint, now: () => clock,
    deadlineMs: 100000,
    choose: () => { clock = 111; return { type: "finish", answer: "too late" }; },
  });
  assert.equal(resumed.status, "time_budget");
  assert.equal(resumed.deadlineAt, 110);
  assert.equal(resumed.toolCalls, 1);
  for (const deadlineAt of [undefined, NaN, Infinity]) {
    await assert.rejects(() => runAgent({
      principal: p, taskId: "deadline-task", checkpoint: { ...checkpoint, deadlineAt },
      now: () => clock, choose: () => { throw Error("must_not_choose"); },
    }), /checkpoint_deadline/);
  }
});
