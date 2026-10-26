import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseClient } from "@langfuse/client";
import {
  startActiveObservation,
  propagateAttributes,
  getActiveTraceId,
} from "@langfuse/tracing";
import { randomUUID } from "node:crypto";
import {
  CASE,
  FIXTURE,
  RULE,
  PROMPT,
  QUESTION,
  evidence,
  hidden,
  principal,
  build,
  config,
  templates,
  hash,
  score,
} from "./domain.js";
import {
  complete,
  safeError,
  validateEndpoint,
  type ModelConfig,
} from "./model.js";
export function redact(data: unknown): unknown {
  if (typeof data === "string")
    return data.replaceAll("SYNTHETIC_SECRET_CANARY", "[REDACTED]");
  if (Array.isArray(data)) return data.map(redact);
  if (data && typeof data === "object")
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        /api.?key|authorization|password|secret/i.test(k)
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return data;
}
export function createRuntime(options: {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  external: boolean;
  sampleRate?: number;
  environment?: string;
}) {
  validateEndpoint(options.baseUrl, options.external);
  const sampleRate = options.sampleRate ?? 1;
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1)
    throw Error("invalid_sampling");
  const environment = options.environment || "atlas-local-demo";
  if (!/^[a-z0-9_-]{1,40}$/.test(environment))
    throw Error("invalid_environment");
  const processor = new LangfuseSpanProcessor({
    baseUrl: options.baseUrl,
    publicKey: options.publicKey,
    secretKey: options.secretKey,
    environment,
    release: "atlas-observability-1",
    compression: "none",
    mediaUploadEnabled: false,
    mask: ({ data }) => redact(data),
  });
  const sdk = new NodeSDK({
    autoDetectResources: false, // Do not export host/process/command-line data.
    spanProcessors: [processor],
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRate),
    }),
  });
  sdk.start();
  const client = new LangfuseClient({
    baseUrl: options.baseUrl,
    publicKey: options.publicKey,
    secretKey: options.secretKey,
    timeout: 2,
  });
  client.prompt.logger.setLevel(4); // Do not send raw SDK error responses to console.
  return {
    client,
    processor,
    environment,
    flush: () => processor.forceFlush(),
    close: () => sdk.shutdown(),
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
export async function seedPrompts(runtime: Runtime, modelName = config.model) {
  const seedConfig = { ...config, model: modelName };
  const created = [];
  for (let i = 0; i < 2; i++) {
    let existing;
    try {
      existing = await runtime.client.prompt.get(PROMPT, {
        version: i + 1,
        cacheTtlSeconds: 0,
        maxRetries: 0,
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
    }
    if (existing) {
      if (
        existing.prompt !== templates[i] ||
        hash(existing.config) !== hash(seedConfig)
      )
        throw Error("existing_prompt_differs_do_not_overwrite");
      created.push({ version: existing.version, created: false });
      continue;
    }
    const p = await runtime.client.prompt.create({
      name: PROMPT,
      type: "text",
      prompt: templates[i],
      config: seedConfig,
      labels: [i === 0 ? "production" : "staging"],
      tags: ["synthetic-atlas"],
      commitMessage: `Synthetic A30 version ${i + 1}`,
    });
    if (p.version !== i + 1) throw Error("unexpected_prompt_version");
    created.push({ version: p.version, created: true });
  }
  return created;
}
function parseConfig(raw: unknown) {
  if (!raw || typeof raw !== "object") throw safeError("invalid_prompt_config");
  const c = raw as Record<string, unknown>;
  if (
    typeof c.model !== "string" ||
    !Number.isInteger(c.maxCompletionTokens) ||
    Number(c.maxCompletionTokens) < 1 ||
    Number(c.maxCompletionTokens) > 1000
  )
    throw safeError("invalid_prompt_config");
  return { model: c.model, maxCompletionTokens: Number(c.maxCompletionTokens) };
}
export async function runTask(
  runtime: Runtime,
  model: ModelConfig,
  options: {
    version?: number;
    label?: string;
    fallback?: boolean;
    attempt?: number;
    taskId?: string;
    injectEvidence?: boolean;
    deadlineMs?: number;
  } = {},
) {
  const runId = randomUUID(),
    taskId = options.taskId || "A30-demo",
    attempt = options.attempt ?? 1,
    deadlineAt = Date.now() + (options.deadlineMs ?? 5000),
    started = performance.now();
  return await startActiveObservation(
    "assistant.task",
    async (root) =>
      await propagateAttributes(
        {
          userId: principal.userId,
          sessionId: "session-a30-demo",
          metadata: {
            taskId,
            runId,
            attempt: String(attempt),
            fixtureVersion: FIXTURE,
          },
        },
        async () => {
          const traceId = getActiveTraceId()!;
          root.update({
            input: { caseId: CASE, targetVersion: "2.0" },
            metadata: { deadlineAt, ruleVersion: RULE },
          });
          await startActiveObservation("authorize", async (span) => {
            if (principal.tenant !== "demo-aurora") throw Error("forbidden");
            await Promise.resolve();
            span.update({
              output: { policyVersion: principal.policyVersion, allowed: true },
            });
          });
          const candidates = await startActiveObservation(
            "retrieve.docs",
            async (span) => {
              await new Promise((r) => setTimeout(r, 1));
              const docs = [evidence];
              span.update({
                output: {
                  candidateIds: docs.map((d) => d.id),
                  sourceRevisions: docs.map((d) => `${d.id}@${d.revision}`),
                },
              });
              return docs;
            },
          );
          const selected = await startActiveObservation(
            "select.evidence",
            async (span) => {
              const docs = options.injectEvidence
                ? [...candidates, hidden]
                : candidates;
              if (
                docs.some(
                  (d) => d.scope !== "shared" && d.scope !== principal.tenant,
                )
              ) {
                span.update({
                  level: "ERROR",
                  statusMessage: "evidence_scope",
                  output: { rejected: true },
                });
                return null;
              }
              span.update({ output: { sourceIds: docs.map((d) => d.id) } });
              return docs;
            },
          );
          if (!selected) {
            root.update({
              output: {
                resultKind: "forbidden",
                errorCategory: "evidence_scope",
              },
            });
            return {
              runId,
              taskId,
              attempt,
              traceId,
              environment: runtime.environment,
              sdkVersions: {
                langfuse: "6.0.2",
                otelApi: "1.9.0",
                otelSdkNode: "0.208.0",
              },
              modelMode: model.external ? "external-http" : "local-http-mock",
              caseId: CASE,
              fixtureVersion: FIXTURE,
              ruleVersion: RULE,
              resultKind: "forbidden",
              errorCategory: "evidence_scope",
              candidateIds: candidates.map((d) => d.id),
              sourceRevisions: candidates.map((d) => `${d.id}@${d.revision}`),
              quality: { pass: false, errors: ["evidence_scope"] },
              durationMs: performance.now() - started,
              usage: null,
              cost: null,
            };
          }
          const tool = await startActiveObservation(
            "tool.build_status",
            async (span) => {
              await Promise.resolve();
              span.update({
                input: { component: "AtlasTable", version: "2.0" },
                output: {
                  status: build.status,
                  buildId: build.buildId,
                  observedAt: build.observedAt,
                },
              });
              return build;
            },
            { asType: "tool" },
          );
          const prompt = await startActiveObservation(
            "prompt.resolve",
            async (span) => {
              const p = await runtime.client.prompt
                .get(PROMPT, {
                  type: "text",
                  ...(options.version
                    ? { version: options.version }
                    : { label: options.label || "production" }),
                  cacheTtlSeconds: 0,
                  maxRetries: 0,
                  fetchTimeoutMs: Math.max(1, deadlineAt - Date.now()),
                  ...(options.fallback ? { fallback: templates[1] } : {}),
                })
                .catch(() => {
                  throw safeError("prompt_unavailable");
                });
              span.update({
                output: {
                  name: PROMPT,
                  version: p.isFallback ? null : p.version,
                  source: p.isFallback ? "local-fallback" : "langfuse",
                  fallback: p.isFallback,
                },
              });
              return p;
            },
          );
          const appliedConfig = prompt.isFallback
            ? { ...config, model: model.model }
            : parseConfig(prompt.config);
          if (model.external && appliedConfig.model !== model.model)
            throw safeError("model_not_in_runtime_allowlist");
          const actualModel = { ...model, model: appliedConfig.model };
          const promptInfo = {
            name: PROMPT,
            version: prompt.isFallback ? null : prompt.version,
            label: options.label ?? null,
            source: prompt.isFallback ? "local-fallback" : "langfuse",
            fallback: prompt.isFallback,
            fallbackVersion: prompt.isFallback ? "local-v2" : null,
            contentHash: hash(prompt.prompt),
            configHash: hash(appliedConfig),
          };
          const input = prompt.compile({
            question: QUESTION,
            evidence: JSON.stringify(selected),
            build: JSON.stringify(tool),
          });
          const generation = await startActiveObservation(
            "model.answer",
            async (gen) => {
              gen.update({
                ...(prompt.isFallback ? {} : { prompt }),
                model: actualModel.model,
                modelParameters: {
                  max_completion_tokens: appliedConfig.maxCompletionTokens,
                },
                input: { caseId: CASE, sourceIds: selected.map((d) => d.id) },
                metadata: {
                  promptSource: promptInfo.source,
                  promptVersion: promptInfo.version ?? "local-v2",
                  diagnostic: "SYNTHETIC_SECRET_CANARY",
                },
              });
              try {
                const result = await complete(
                  actualModel,
                  input,
                  appliedConfig.maxCompletionTokens,
                  deadlineAt,
                );
                gen.update({
                  output: result.answer,
                  ...(result.usage
                    ? {
                        usageDetails: {
                          input: result.usage.inputTokens,
                          output: result.usage.outputTokens,
                        },
                      }
                    : {}),
                  metadata: {
                    usageKnown: result.usage !== null,
                    costKnown: false,
                  },
                });
                return result;
              } catch (error) {
                gen.update({
                  level: "ERROR",
                  statusMessage: (error as Error).message.replace(
                    /[^a-z0-9_]/gi,
                    "_",
                  ),
                });
                throw error;
              }
            },
            { asType: "generation" },
          );
          const quality = await startActiveObservation(
            "answer.validate",
            async (span) => {
              const q = score(generation.answer);
              span.update({
                output: q,
                ...(!q.pass
                  ? { level: "ERROR" as const, statusMessage: "quality_failed" }
                  : {}),
              });
              return q;
            },
          );
          root.update({
            output: {
              resultKind: quality.pass ? "insufficient_evidence" : null,
              qualityStatus: quality.pass ? "passed" : "failed",
              qualityPassed: quality.pass,
            },
          });
          return {
            runId,
            taskId,
            attempt,
            traceId,
            environment: runtime.environment,
            sdkVersions: {
              langfuse: "6.0.2",
              otelApi: "1.9.0",
              otelSdkNode: "0.208.0",
            },
            modelMode: model.external ? "external-http" : "local-http-mock",
            caseId: CASE,
            fixtureVersion: FIXTURE,
            ruleVersion: RULE,
            candidateIds: candidates.map((d) => d.id),
            sourceRevisions: selected.map((d) => `${d.id}@${d.revision}`),
            prompt: promptInfo,
            appliedModel: actualModel.model,
            maxCompletionTokens: appliedConfig.maxCompletionTokens,
            tool,
            candidateAnswer: generation.answer,
            quality,
            durationMs: performance.now() - started,
            usage: generation.usage,
            cost: generation.cost,
            resultKind: quality.pass ? "insufficient_evidence" : null,
            qualityStatus: quality.pass ? "passed" : "failed",
          };
        },
      ),
  );
}
export function extractSpans(packets: unknown[]) {
  const spans: any[] = [];
  for (const p of packets as any[])
    for (const r of p.resourceSpans || [])
      for (const s of r.scopeSpans || [])
        for (const span of s.spans || []) {
          spans.push({
            name: span.name,
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId || null,
            attributes: Object.fromEntries(
              (span.attributes || []).map((a: any) => [
                a.key,
                a.value?.stringValue ??
                  a.value?.intValue ??
                  a.value?.boolValue ??
                  a.value,
              ]),
            ),
            status: span.status,
            startTimeUnixNano: span.startTimeUnixNano,
            endTimeUnixNano: span.endTimeUnixNano,
            durationMs:
              Number(
                BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano),
              ) / 1e6,
          });
        }
  return spans;
}
