import { runAgentTask } from "./agent.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { localServer } from "./local.js";
import {
  createRuntime,
  seedPrompts,
  runTask,
  extractSpans,
  type Runtime,
} from "./runtime.js";
import { PROMPT, FIXTURE, RULE, hash, score, type Answer } from "./domain.js";
import type { ModelConfig } from "./model.js";
const args = process.argv.slice(2);
const option = (key: string) => {
  const n = args.indexOf(key);
  return n >= 0 ? args[n + 1] : undefined;
};
const write = async (name: string, data: unknown) =>
  writeFile(resolve("reports", name), JSON.stringify(data, null, 2) + "\n");
export async function comparison(runtime: Runtime, model: ModelConfig) {
  const runs = await Promise.all(
    [1, 2].map((version) =>
      runTask(runtime, model, {
        version,
        attempt: version,
        taskId: "A30-compare",
      }),
    ),
  );
  return {
    fixtureVersion: FIXTURE,
    ruleVersion: RULE,
    caseCount: 1,
    modelQualityMeasured: model.external,
    execution: { modelMode: model.external ? "external-http" : "local-http-mock", model: model.model },
    runs,
    summary: runs.map((r) => ({
      version: "prompt" in r ? r.prompt?.version : null,
      pass: r.quality.pass,
      durationMs: r.durationMs,
      cost: r.cost,
      usage: r.usage,
    })),
    warning:
      "One synthetic case; local HTTP model is scripted by prompt text. Not a model-quality benchmark. No automatic label change.",
  };
}
export async function promote(
  runtime: Runtime,
  version: number,
  report: Awaited<ReturnType<typeof comparison>>,
  confirmed: boolean,
  model: ModelConfig,
) {
  if (!confirmed) throw Error("explicit_confirmation_required");
  if (report.fixtureVersion !== FIXTURE || report.ruleVersion !== RULE)
    throw Error("stale_report");
  const run = report.runs.find(
    (r) => "prompt" in r && r.prompt?.version === version,
  );
  if (!run || !run.quality.pass || !("prompt" in run))
    throw Error("quality_gate");
  const targetMode = model.external ? "external-http" : "local-http-mock";
  if (!run.prompt || run.prompt.name !== PROMPT || run.prompt.version !== version ||
      run.prompt.fallback || run.prompt.source !== "langfuse")
    throw Error("prompt_identity_mismatch");
  if (report.execution?.modelMode !== targetMode || report.execution?.model !== model.model ||
      report.modelQualityMeasured !== model.external || run.modelMode !== targetMode ||
      run.appliedModel !== model.model)
    throw Error("execution_evidence_mismatch");
  const prompt = await runtime.client.prompt.get(PROMPT, {
    version,
    cacheTtlSeconds: 0,
    maxRetries: 0,
  });
  if (prompt.name !== PROMPT || prompt.version !== version)
    throw Error("prompt_identity_mismatch");
  if (
    hash(prompt.prompt) !== run.prompt?.contentHash ||
    hash(prompt.config) !== run.prompt?.configHash
  )
    throw Error("prompt_changed");
  await runtime.client.prompt.update({
    name: PROMPT,
    version,
    newLabels: ["production"],
  });
  const resolved = await runtime.client.prompt.get(PROMPT, {
    label: "production",
    cacheTtlSeconds: 0,
    maxRetries: 0,
  });
  if (resolved.version !== version) throw Error("label_verification_failed");
  return {
    operation: "promote",
    promptName: PROMPT,
    modelMode: targetMode,
    model: model.model,
    contentHash: run.prompt.contentHash,
    configHash: run.prompt.configHash,
    version,
    confirmed: true,
    reportRunId: run.runId,
    qualityPassed: true,
  };
}
export async function main() {
  const command = args[0] || "all",
    external = args.includes("--external");
  if (
    ![
      "all",
      "agent-failure",
      "agent-compare",
      "agent-run",
      "seed-prompts",
      "run",
      "compare",
      "failure",
      "replay",
      "promote",
      "rollback",
    ].includes(command)
  )
    throw Error("unknown_command");
  if (
    external &&
    ["seed-prompts", "promote", "rollback", "all"].includes(command) &&
    !args.includes("--confirm")
  )
    throw Error("external_mutation_requires_confirm");
  await mkdir("reports", { recursive: true });
  const local = await localServer(
    external ? undefined : resolve("reports/local-state.json"),
  );
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw Error(`missing_${name}`);
    return value;
  };
  let runtime: Runtime | undefined;
  try {
    const realModel = external && !args.includes("--mock-model");
    const model: ModelConfig = realModel
      ? {
          baseUrl: required("MODEL_BASE_URL"),
          model: required("MODEL_NAME"),
          apiKey: required("MODEL_API_KEY"),
          external: true,
        }
      : {
          baseUrl: local.baseUrl + "/v1",
          model: "atlas-http-mock",
          external: false,
        };
    runtime = createRuntime({
      baseUrl: external ? required("LANGFUSE_BASE_URL") : local.baseUrl,
      publicKey: external
        ? required("LANGFUSE_PUBLIC_KEY")
        : "synthetic-public",
      secretKey: external
        ? required("LANGFUSE_SECRET_KEY")
        : "synthetic-secret",
      external,
      sampleRate: Number(option("--sample-rate") ?? 1),
      environment: external
        ? process.env.LANGFUSE_TRACING_ENVIRONMENT
        : undefined,
    });
    const rt = runtime;
    let output: unknown;
    if (command.startsWith("agent-")) {
      const selector = args.includes("--http-selector")
        ? ("http" as const)
        : ("script" as const);
      if (command === "agent-compare")
        output = {
          meaning:
            "Separate executions with corrected selection policy; not checkpoint recovery or a model benchmark.",
          runs: await Promise.all([
            runAgentTask(rt, model, {
              selector,
              policy: "repeat-build",
              attempt: 1,
            }),
            runAgentTask(rt, model, {
              selector,
              policy: "evidence-first",
              attempt: 2,
            }),
          ]),
        };
      else
        output = await runAgentTask(rt, model, {
          selector,
          policy:
            command === "agent-failure" ? "repeat-build" : "evidence-first",
        });
    }
    if (command === "seed-prompts") output = await seedPrompts(rt, model.model);
    if (command === "run")
      output = await runTask(rt, model, {
        ...(option("--prompt-version")
          ? { version: Number(option("--prompt-version")) }
          : { label: option("--label") || "production" }),
        fallback: args.includes("--fallback"),
      });
    if (command === "compare") {
      output = await comparison(rt, model);
      await write("compare.json", output);
    }
    if (command === "failure") {
      output = await runTask(rt, model, { version: 1 });
      await write("failure.json", output);
    }
    if (command === "replay") {
      const previous = JSON.parse(
        await readFile("reports/failure.json", "utf8"),
      );
      if (
        previous.fixtureVersion !== FIXTURE ||
        previous.ruleVersion !== RULE ||
        !previous.candidateAnswer
      )
        throw Error("replay_version_mismatch");
      output = {
        recordedReplay: {
          sourceRunId: previous.runId,
          traceId: previous.traceId,
          quality: score(previous.candidateAnswer as Answer),
          externalCalls: 0,
        },
        regression: await runTask(rt, model, {
          version: 2,
          taskId: previous.taskId,
          attempt: previous.attempt + 1,
        }),
        meaning:
          "Rescore stored output, then execute a separate fixed-version regression. Not replaying hidden reasoning.",
      };
      await write("replay.json", output);
    }
    if (command === "promote")
      output = await promote(
        rt,
        Number(option("--version")),
        JSON.parse(await readFile("reports/compare.json", "utf8")),
        args.includes("--confirm"),
        model,
      );
    if (command === "rollback") {
      if (!args.includes("--confirm"))
        throw Error("explicit_confirmation_required");
      const version = Number(option("--version"));
      await rt.client.prompt.get(PROMPT, {
        version,
        cacheTtlSeconds: 0,
        maxRetries: 0,
      });
      await rt.client.prompt.update({
        name: PROMPT,
        version,
        newLabels: ["production"],
      });
      output = {
        operation: "rollback",
        version,
        confirmed: true,
        qualityNotApproved: true,
        warning:
          "Explicit configuration rollback, not approval of version quality. Re-run the case.",
      };
    }
    if (command === "all") {
      const seeded = await seedPrompts(rt, model.model);
      const report = await comparison(rt, model);
      const failure = report.runs[0];
      const fallback = await runTask(rt, model, {
        version: 999,
        fallback: true,
        attempt: 3,
      });
      const rejected = await runTask(rt, model, {
        version: 2,
        injectEvidence: true,
        attempt: 4,
      });
      const replay = {
        recordedReplay: {
          sourceRunId: failure.runId,
          traceId: failure.traceId,
          quality: score(
            ("candidateAnswer" in failure
              ? failure.candidateAnswer
              : undefined) as Answer,
          ),
          externalCalls: 0,
        },
        regression: await runTask(rt, model, { version: 2, attempt: 5 }),
      };
      output = {
        mode: external ? "external" : "local-http",
        seeded,
        comparison: report,
        fallback,
        evidenceBoundary: rejected,
        replay,
        publication: "not_promoted",
      };
    }
    await rt.flush();
    await write(
      command === "all" ? "demo-report.json" : `${command}.json`,
      output,
    );
    if (!external) {
      await write("otlp.json", local.otlp);
      await write("spans.json", extractSpans(local.otlp));
      await write(`${command}-otlp.json`, local.otlp);
      await write(`${command}-spans.json`, extractSpans(local.otlp));
      await write("http-contract.json", {
        requests: local.requests,
        modelRequestCount: local.modelRequests.length,
        authorizationHeadersPersisted: false,
      });
    }
    console.log(
      JSON.stringify({
        command,
        mode: external ? "external" : "local-http",
        report: `reports/${command === "all" ? "demo-report" : command}.json`,
        spanCount: external ? null : extractSpans(local.otlp).length,
      }),
    );
  } finally {
    if (runtime) await runtime.close();
    await local.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
