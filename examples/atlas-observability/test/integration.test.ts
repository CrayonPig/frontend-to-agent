import { runAgentTask, parseAction } from "../src/agent.js";
import test from "node:test";
import { LangfuseClient } from "@langfuse/client";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { localServer } from "../src/local.js";
import {
  createRuntime,
  seedPrompts,
  runTask,
  extractSpans,
} from "../src/runtime.js";
import { comparison, promote } from "../src/cli.js";
import {
  PROMPT,
  templates,
  config,
  hash,
  score,
  faultyAnswer,
  validAnswer,
} from "../src/domain.js";
import { complete, validateEndpoint, parseUsage } from "../src/model.js";

test("real Langfuse SDK over local Prompt API and OTLP HTTP", async (t) => {
  const local = await localServer();
  const runtime = createRuntime({
    baseUrl: local.baseUrl,
    publicKey: "synthetic-public",
    secretKey: "synthetic-secret",
    external: false,
  });
  const model = {
    baseUrl: local.baseUrl + "/v1",
    model: "atlas-http-mock",
    external: false,
  };
  try {
    await t.test(
      "create, retrieve, compile use SDK HTTP and exact versions",
      async () => {
        assert.deepEqual(
          (await seedPrompts(runtime)).map((p) => p.version),
          [1, 2],
        );
        const p = await runtime.client.prompt.get(PROMPT, {
          version: 2,
          cacheTtlSeconds: 0,
          maxRetries: 0,
        });
        assert.ok(
          p
            .compile({ question: "Q", evidence: "E", build: "B" })
            .includes("问题：Q"),
        );
        assert.equal(local.state.prompts.length, 2);
        assert.ok(
          local.requests.some(
            (r) => r.method === "POST" && r.path === "/api/public/v2/prompts",
          ),
        );
      },
    );
    const report = await comparison(runtime, model);
    await runtime.flush();
    await t.test(
      "same task versions produces scoped failure and corrected response; missing usage stays null",
      () => {
        assert.deepEqual(
          report.runs.map((r) => r.quality.pass),
          [false, true],
        );
        for (const r of report.runs) {
          assert.equal(r.usage, null);
          assert.equal(r.cost, null);
          assert.equal(r.fixtureVersion, "atlas-fixture-01");
          assert.deepEqual(r.sourceRevisions, ["C-T20@r1"]);
        }
        assert.equal(report.runs[0].resultKind, null);
        assert.equal(report.runs[1].resultKind, "insufficient_evidence");
        assert.equal(local.modelRequests.length, 2);
        for (const request of local.modelRequests as any[]) {
          assert.equal(request.model, config.model);
          assert.equal(request.max_completion_tokens, 300);
        }
      },
    );
    await t.test(
      "SDK serializes complete OTLP parent tree, actual prompt object, masks data before HTTP",
      () => {
        const spans = extractSpans(local.otlp);
        assert.equal(spans.length, 16);
        for (const run of report.runs) {
          const own = spans.filter((s) => s.traceId === run.traceId),
            root = own.find((s) => s.name === "assistant.task");
          assert.ok(root);
          assert.equal(own.length, 8);
          assert.equal(root.parentSpanId, null);
          for (const child of own.filter((s) => s !== root))
            assert.equal(child.parentSpanId, root.spanId);
          const generation = own.find((s) => s.name === "model.answer");
          assert.equal(
            generation.attributes["langfuse.observation.type"],
            "generation",
          );
          assert.equal(
            generation.attributes["langfuse.observation.prompt.name"],
            PROMPT,
          );
          assert.equal(
            generation.attributes["langfuse.observation.prompt.version"],
            "prompt" in run ? run.prompt?.version : null,
          );
          assert.equal(
            generation.attributes["langfuse.observation.metadata.usageKnown"],
            "false",
          );
          assert.equal(
            generation.attributes["langfuse.observation.usage_details"],
            undefined,
          );
          assert.equal(
            generation.attributes["langfuse.trace.metadata.runId"],
            JSON.stringify(run.runId),
          );
          assert.equal(generation.status.code, 0); // Technical model transport succeeded even for bad content.
          const validator = own.find((s) => s.name === "answer.validate");
          assert.equal(
            JSON.parse(validator.attributes["langfuse.observation.output"])
              .pass,
            run.quality.pass,
          );
        }
        const raw = JSON.stringify(local.otlp);
        assert.ok(!raw.includes("SYNTHETIC_SECRET_CANARY"));
        assert.ok(raw.includes("[REDACTED]"));
        assert.ok(!raw.includes("synthetic-secret"));
        assert.ok(!raw.includes("process.command_args"));
        assert.ok(!raw.includes("process.executable.path"));
        assert.ok(!raw.includes("/workspace"));
        assert.ok(!raw.includes("T-B20"));
      },
    );
    await t.test(
      "confirmation and review gate required; label mutation via real SDK PATCH",
      async () => {
        await assert.rejects(
          () => promote(runtime, 2, report, false, model),
          /confirmation/,
        );
        await assert.rejects(
          () => promote(runtime, 1, report, true, model),
          /quality_gate/,
        );
        await promote(runtime, 2, report, true, model);
        assert.equal(
          (
            await runtime.client.prompt.get(PROMPT, {
              label: "production",
              cacheTtlSeconds: 0,
              maxRetries: 0,
            })
          ).version,
          2,
        );
        assert.ok(
          local.requests.some(
            (r) => r.method === "PATCH" && r.path.endsWith("/versions/2"),
          ),
        );
        const forged = structuredClone(report);
        const run = forged.runs[1];
        if ("prompt" in run && run.prompt) run.prompt.contentHash = "changed";
        await assert.rejects(
          () => promote(runtime, 2, forged, true, model),
          /prompt_changed/,
        );
      },
    );
    await t.test("promotion binds prompt identity and execution mode/model before PATCH", async () => {
      const patchCount = () => local.requests.filter(r => r.method === "PATCH").length;
      const before = patchCount();
      for (const field of ["name", "mode", "model", "report-model"]) {
        const changed = structuredClone(report);
        const run = changed.runs[1];
        if (field === "name" && "prompt" in run && run.prompt) run.prompt.name = "different-prompt";
        if (field === "mode") run.modelMode = "external-http";
        if (field === "model" && "appliedModel" in run) run.appliedModel = "different-model";
        if (field === "report-model") changed.execution.model = "different-model";
        await assert.rejects(() => promote(runtime, 2, changed, true, model), /identity_mismatch|evidence_mismatch/);
      }
      await assert.rejects(() => promote(runtime, 2, report, true, { ...model, external: true }), /execution_evidence_mismatch/);
      assert.equal(patchCount(), before);
    });
    await t.test("credential-bearing model requests require TLS outside loopback before fetch", async () => {
      assert.throws(() => validateEndpoint("http://example.com/v1", true, true), /model_https_required/);
      assert.throws(() => validateEndpoint("http://localhost.example.com/v1", true, true), /model_https_required/);
      for (const url of ["http://127.0.0.1/v1", "http://localhost/v1", "http://[::1]/v1", "https://example.com/v1"])
        assert.doesNotThrow(() => validateEndpoint(url, true, true));
      await assert.rejects(() => complete({baseUrl:"http://example.com/v1", model:"synthetic", apiKey:"synthetic-test-key", external:true}, "synthetic", 10, Date.now()+1000), /model_https_required/);
    });
    await t.test(
      "version immutable while label rollback does not approve its quality",
      async () => {
        await runtime.client.prompt.update({
          name: PROMPT,
          version: 1,
          newLabels: ["production"],
        });
        const p = await runtime.client.prompt.get(PROMPT, {
          label: "production",
          cacheTtlSeconds: 0,
          maxRetries: 0,
        });
        assert.equal(p.version, 1);
        assert.equal(p.prompt, templates[0]);
      },
    );
    await t.test(
      "another client label cache can lag; explicit fresh read resolves moved label",
      async () => {
        const reader = new LangfuseClient({
          baseUrl: local.baseUrl,
          publicKey: "synthetic-public",
          secretKey: "synthetic-secret",
        });
        assert.equal(
          (
            await reader.prompt.get(PROMPT, {
              label: "production",
              cacheTtlSeconds: 60,
              maxRetries: 0,
            })
          ).version,
          1,
        );
        await runtime.client.prompt.update({
          name: PROMPT,
          version: 2,
          newLabels: ["production"],
        });
        assert.equal(
          (
            await reader.prompt.get(PROMPT, {
              label: "production",
              cacheTtlSeconds: 60,
              maxRetries: 0,
            })
          ).version,
          1,
        );
        assert.equal(
          (
            await reader.prompt.get(PROMPT, {
              label: "production",
              cacheTtlSeconds: 0,
              maxRetries: 0,
            })
          ).version,
          2,
        );
      },
    );
    await t.test(
      "SDK fallback has local provenance and no false remote prompt association",
      async () => {
        const r = await runTask(runtime, model, {
          version: 999,
          fallback: true,
        });
        assert.ok("prompt" in r && r.prompt?.fallback);
        if ("prompt" in r) {
          assert.equal(r.prompt?.version, null);
          assert.equal(r.prompt?.source, "local-fallback");
        }
        await runtime.flush();
        const span = extractSpans(local.otlp).find(
          (s) => s.traceId === r.traceId && s.name === "model.answer",
        );
        assert.equal(
          span.attributes["langfuse.observation.prompt.version"],
          undefined,
        );
        assert.equal(
          span.attributes["langfuse.observation.metadata.promptSource"],
          '"local-fallback"',
        );
      },
    );
    await t.test(
      "unauthorized evidence is stopped before tool/model and never exported",
      async () => {
        const before = local.modelRequests.length;
        const r = await runTask(runtime, model, {
          version: 2,
          injectEvidence: true,
        });
        await runtime.flush();
        assert.equal(r.resultKind, "forbidden");
        assert.equal(local.modelRequests.length, before);
        const own = extractSpans(local.otlp).filter(
          (s) => s.traceId === r.traceId,
        );
        assert.equal(own.length, 4);
        assert.ok(!own.some((s) => s.name === "model.answer"));
        assert.ok(!JSON.stringify(own).includes("T-B20"));
      },
    );
    await t.test(
      "transport deadlines and egress policy prevent unintended calls",
      async () => {
        assert.throws(
          () => validateEndpoint("https://example.com", false),
          /external/,
        );
        assert.throws(
          () => validateEndpoint("https://user:pass@example.com", true),
          /credentials/,
        );
        await assert.rejects(
          () => complete(model, "test", 300, Date.now() - 1),
          /deadline/,
        );
        assert.equal(
          parseUsage({ prompt_tokens: -1, completion_tokens: 2 }),
          null,
        );
        assert.equal(
          parseUsage({ prompt_tokens: 1.5, completion_tokens: 2 }),
          null,
        );
        assert.equal(
          parseUsage({ prompt_tokens: 1, completion_tokens: NaN }),
          null,
        );
        assert.deepEqual(
          parseUsage({ prompt_tokens: 0, completion_tokens: 2 }),
          { inputTokens: 0, outputTokens: 2 },
        );
        assert.equal(score(faultyAnswer).pass, false);
        assert.equal(score(validAnswer).pass, true);
      },
    );
    await t.test(
      "prompt config is applied and invalid config rejected",
      async () => {
        assert.equal(
          hash(config),
          hash({ maxCompletionTokens: 300, model: "atlas-http-mock" }),
        );
        assert.equal(
          hash({ nested: { b: 2, a: 1 }, values: [{ y: 2, x: 1 }] }),
          hash({ values: [{ x: 1, y: 2 }], nested: { a: 1, b: 2 } }),
        );
        assert.notEqual(
          hash(config),
          hash({ maxCompletionTokens: 301, model: "atlas-http-mock" }),
        );
        assert.notEqual(hash([1, 2]), hash([2, 1]));
        const original = local.state.prompts[1].config;
        local.state.prompts[1].config = {
          model: "other-local-model",
          maxCompletionTokens: 77,
        };
        const r = await runTask(runtime, model, { version: 2 });
        assert.equal(
          "appliedModel" in r ? r.appliedModel : null,
          "other-local-model",
        );
        const last = local.modelRequests.at(-1) as any;
        assert.equal(last.model, "other-local-model");
        assert.equal(last.max_completion_tokens, 77);
        local.state.prompts[1].config = {
          model: "bad",
          maxCompletionTokens: 0,
        };
        await assert.rejects(
          () => runTask(runtime, model, { version: 2 }),
          /invalid_prompt_config/,
        );
        local.state.prompts[1].config = original;
      },
    );
    await t.test(
      "bounded Agent stops repeated tools and corrected state-driven policy completes with nested observations",
      async () => {
        const runs = await Promise.all([
          runAgentTask(runtime, model, { policy: "repeat-build", attempt: 1 }),
          runAgentTask(runtime, model, {
            policy: "evidence-first",
            attempt: 2,
          }),
          runAgentTask(runtime, model, { selector: "http", attempt: 3 }),
        ]);
        assert.equal(runs[0].stopReason, "tool_budget");
        assert.equal(runs[0].toolCalls, 2);
        assert.equal(runs[0].steps, 3);
        assert.equal(runs[0].quality, null);
        for (const r of runs.slice(1)) {
          assert.equal(r.stopReason, "completed");
          assert.equal(r.quality?.pass, true);
          assert.deepEqual(
            r.history.map((h) => h.action),
            ["read_docs", "build_status"],
          );
          assert.equal(r.cost, null);
          assert.equal(r.resumeSupported, false);
        }
        await runtime.flush();
        const all = extractSpans(local.otlp);
        for (const r of runs) {
          const own = all.filter((s) => s.traceId === r.traceId),
            root = own.find((s) => s.name === "agent.task");
          const steps = own.filter((s) => s.name === "agent.step");
          assert.equal(steps.length, 3);
          for (const step of steps)
            assert.equal(step.parentSpanId, root.spanId);
          for (const child of own.filter((s) =>
            [
              "agent.choose",
              "tool.read_docs",
              "tool.build_status",
              "answer.validate",
            ].includes(s.name),
          ))
            assert.ok(steps.some((s) => s.spanId === child.parentSpanId));
          assert.equal(own.filter((s) => s.name.startsWith("tool.")).length, 2);
          for (const choice of own.filter((s) => s.name === "agent.choose"))
            assert.equal(
              choice.attributes["langfuse.observation.type"],
              r.selector === "http" ? "generation" : "span",
            );
          assert.equal(
            own.find((s) => s.name === "task.stop").parentSpanId,
            root.spanId,
          );
        }
        for (const request of local.modelRequests) {
          assert.ok(!JSON.stringify(request).includes("T-B20"));
          assert.ok(!JSON.stringify(request).includes("本租户未启用"));
        }
      },
    );
    await t.test(
      "Agent enforces all budgets and action allowlist before execution",
      async () => {
        for (const [options, reason] of [
          [{ maxSteps: 1 }, "step_budget"],
          [{ maxCostUnits: 1 }, "cost_budget"],
          [{ deadlineAt: Date.now() - 1 }, "deadline"],
        ] as const) {
          const r = await runAgentTask(runtime, model, options);
          assert.equal(r.stopReason, reason);
          assert.ok(r.toolCalls <= 1);
        }
        await assert.rejects(
          () => runAgentTask(runtime, model, { maxSteps: NaN }),
          /invalid_budget/,
        );
        assert.throws(
          () =>
            parseAction({
              type: "build_status",
              component: "AtlasTable",
              version: "2.0",
              tenant: "demo-bay",
            }),
          /invalid_action/,
        );
        assert.throws(
          () => parseAction({ type: "save_draft" }),
          /invalid_action/,
        );
        assert.throws(
          () =>
            parseAction({
              type: "finish",
              answer: { ...validAnswer, reasoning: "private" },
            }),
          /invalid_action/,
        );
        local.setModelFault("early-finish");
        const early = await runAgentTask(runtime, model, { selector: "http" });
        assert.equal(early.stopReason, "quality_failed");
        assert.equal(early.toolCalls, 0);
        assert.ok(early.quality?.errors.includes("missing_tool_evidence"));
        local.setModelFault(null);
        const choices = (local.modelRequests as any[])
          .map((r) => r.messages[0].content)
          .filter((text) => text.includes("ATLAS_ACTION_SELECTOR_V1"))
          .map((text) => JSON.parse(text));
        assert.ok(
          choices.some(
            (r) => r.state.evidence.length === 0 && r.state.build === null,
          ),
        );
        assert.ok(
          choices.some(
            (r) =>
              r.state.evidence.length === 1 &&
              r.state.evidence[0].id === "C-T20",
          ),
        );
        assert.ok(
          choices.every((r) =>
            r.state.evidence.every((d: any) => d.id === "C-T20"),
          ),
        );
      },
    );
    await t.test(
      "external error bodies headers malformed JSON and stack paths never reach complete OTLP payload",
      async () => {
        for (const fault of ["http-error", "invalid-json", "invalid-content"]) {
          local.setModelFault(fault);
          await assert.rejects(
            () => runTask(runtime, model, { version: 2 }),
            /model_/,
          );
          const r = await runAgentTask(runtime, model, { selector: "http" });
          assert.equal(r.stopReason, "selector_error");
          assert.equal(r.toolCalls, 0);
        }
        local.setModelFault(null);
        local.setPromptUnavailable(true);
        await assert.rejects(
          () => runTask(runtime, model, { version: 2 }),
          /prompt_unavailable/,
        );
        local.setPromptUnavailable(false);
        await runtime.flush();
        const raw = JSON.stringify(local.otlp);
        for (const secret of [
          "SYNTHETIC_EXTERNAL_SECRET",
          "secret.invalid",
          "X-Diagnostic",
          "/workspace",
          "synthetic-secret",
          "T-B20",
        ])
          assert.ok(!raw.includes(secret), secret);
        assert.ok(raw.includes("model_http_502"));
        assert.ok(raw.includes("model_response_error"));
        assert.ok(raw.includes("model_answer_invalid"));
      },
    );
  } finally {
    await runtime.flush();
    await runtime.close();
    await local.close();
  }
});

test("sample rate zero exports no spans while task output remains available", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-observe-sampling-"));
  try {
    const cli = resolve("build/src/cli.js");
    execFileSync(process.execPath, [cli, "seed-prompts"], {
      cwd: dir,
      stdio: "pipe",
    });
    execFileSync(
      process.execPath,
      [cli, "run", "--prompt-version", "2", "--sample-rate", "0"],
      { cwd: dir, stdio: "pipe" },
    );
    const r = JSON.parse(await readFile(join(dir, "reports/run.json"), "utf8"));
    assert.equal(r.quality.pass, true);
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "reports/spans.json"), "utf8")),
      [],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("all keeps per-command reports paired with their own spans", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-pairing-"));
  try {
    const cli = resolve("build/src/cli.js");
    for (const command of ["seed-prompts", "failure", "replay", "compare"])
      execFileSync(process.execPath, [cli, command], {
        cwd: dir,
        stdio: "pipe",
      });
    const names = [
      "failure.json",
      "failure-spans.json",
      "replay.json",
      "replay-spans.json",
      "compare.json",
      "compare-spans.json",
    ];
    const before = await Promise.all(
      names.map((n) => readFile(join(dir, "reports", n), "utf8")),
    );
    execFileSync(process.execPath, [cli, "all"], { cwd: dir, stdio: "pipe" });
    const after = await Promise.all(
      names.map((n) => readFile(join(dir, "reports", n), "utf8")),
    );
    assert.deepEqual(after, before);
    const report = JSON.parse(
      await readFile(join(dir, "reports/demo-report.json"), "utf8"),
    );
    const spans = JSON.parse(
      await readFile(join(dir, "reports/all-spans.json"), "utf8"),
    );
    const runs = [
      ...report.comparison.runs,
      report.fallback,
      report.evidenceBoundary,
      report.replay.regression,
    ];
    for (const run of runs)
      assert.ok(spans.some((s: any) => s.traceId === run.traceId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
