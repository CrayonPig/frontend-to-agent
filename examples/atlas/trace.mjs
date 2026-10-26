import { randomUUID } from "node:crypto";
// Export allowlist: raw text, identity credentials and arbitrary tool outputs never pass through.
export class Trace {
  constructor({
    taskId,
    attempt = 1,
    fixtureVersion = "atlas-fixture-01",
    promptVersion = "not-used",
    adapterVersion = "atlas-rule-mock-1",
    modelVersion = "not-used",
    allowedSourceIds = [],
    allowedSourceRevisions = [],
  } = {}) {
    this.allowedSourceIds = new Set(allowedSourceIds);
    this.allowedSourceRevisions = new Set(allowedSourceRevisions);
    this.id = randomUUID();
    this.taskId = taskId;
    this.attempt = attempt;
    this.versions = {
      fixtureVersion,
      promptVersion,
      modelVersion,
      adapterVersion,
    };
    this.events = [];
  }
  record(name, fields = {}) {
    if (!/^[a-z][a-z_.]*$/.test(name)) throw Error("invalid_observation_name");
    if (fields.parentId && !this.events.some((e) => e.id === fields.parentId))
      throw Error("unknown_parent");
    const event = { id: randomUUID(), traceId: this.id, name };
    for (const key of [
      "parentId",
      "kind",
      "resultKind",
      "errorCategory",
      "durationMs",
      "step",
      "stopReason",
    ]) {
      const v = fields[key];
      if (v !== undefined && (typeof v === "string" || typeof v === "number"))
        event[key] = v;
    }
    // IDs and revisions must come from the pre-authorized snapshot.
    for (const key of ["sourceIds", "candidateIds"]) {
      if (fields[key]) {
        if (
          !Array.isArray(fields[key]) ||
          fields[key].some((id) => !this.allowedSourceIds.has(id))
        )
          throw Error("unauthorized_trace_source");
        event[key] = [...fields[key]];
      }
    }
    if (fields.sourceRevisions) {
      if (
        !Array.isArray(fields.sourceRevisions) ||
        fields.sourceRevisions.some(
          (ref) => !this.allowedSourceRevisions.has(ref),
        )
      )
        throw Error("unauthorized_trace_revision");
      event.sourceRevisions = [...fields.sourceRevisions];
    }
    if (fields.usage)
      event.usage = {
        inputTokens: fields.usage.inputTokens ?? null,
        outputTokens: fields.usage.outputTokens ?? null,
      };
    this.events.push(event);
    return event.id;
  }
  export() {
    return structuredClone({
      traceId: this.id,
      taskId: this.taskId,
      attempt: this.attempt,
      versions: this.versions,
      events: this.events,
    });
  }
}
export class CallError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export async function withRetry(
  call,
  {
    maxAttempts = 2,
    deadlineMs = 1000,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    signal,
  } = {},
) {
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs <= 0
  )
    throw new CallError("invalid_budget");
  const started = now();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new CallError("cancelled");
    const left = deadlineMs - (now() - started);
    if (left <= 0) throw new CallError("timeout");
    let timer;
    try {
      return await Promise.race([
        call({ attempt, signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new CallError("timeout")), left);
        }),
      ]);
    } catch (e) {
      if (
        !["rate_limit", "temporary"].includes(e.code) ||
        attempt === maxAttempts
      )
        throw e;
      const wait = 10 * attempt;
      if (now() - started + wait >= deadlineMs) throw new CallError("timeout");
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new CallError("attempt_budget");
}
export class Semaphore {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw Error("invalid_limit");
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }
  async use(fn) {
    if (this.active >= this.limit)
      await new Promise((resolve) => this.queue.push(resolve));
    else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}
