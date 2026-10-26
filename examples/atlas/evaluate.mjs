import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { cases, principal, fixtureVersion } from "./fixtures.mjs";
import { DocumentStore, validateResult } from "./core.mjs";
import { grade } from "./expectations.mjs";
import { observedAnswer } from "./application.mjs";
export function evaluate() {
  const store = new DocumentStore();
  const runs = cases.map((c) => {
    const { result, retrieval, trace } = observedAnswer(
      store,
      principal,
      {
        question: c.question,
        version: c.version,
        caseId: c.id,
      },
      c.id,
    );
    let format = true;
    try {
      validateResult(
        result,
        store.visible(principal, { version: c.version, caseId: c.id }),
      );
    } catch {
      format = false;
    }
    const verdict = grade(c.id, result);
    return {
      caseId: c.id,
      split: c.split,
      format,
      ...verdict,
      candidateAnswer: result,
      retrieval,
      trace,
    };
  });
  return {
    fixtureVersion,
    adapter: "atlas-rule-mock-1",
    claim:
      "Checks deterministic fixtures and regression harness, NOT model quality or production readiness.",
    holdoutCaveat:
      "check split is separate from dev, but published and inspectable; not a blind model benchmark.",
    runs,
    summary: {
      total: runs.length,
      passed: runs.filter((r) => r.pass && r.format).length,
      dev: runs.filter((r) => r.split === "dev").length,
      check: runs.filter((r) => r.split === "check").length,
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = evaluate();
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "reports");
  await mkdir(dir, { recursive: true });
  await writeFile(
    resolve(dir, "baseline.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report.summary));
  if (report.summary.passed !== report.summary.total) process.exitCode = 1;
}
