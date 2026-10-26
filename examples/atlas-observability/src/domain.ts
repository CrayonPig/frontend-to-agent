import { createHash } from "node:crypto";
export const FIXTURE = "atlas-fixture-01";
export const RULE = "a30-rule-1";
export const PROMPT = "atlas-answer";
export const CASE = "A30-unsupported-capability";
export const QUESTION = "AtlasTable 2.0 有 virtual 参数吗？演示构建通过了吗？";
export const evidence = {
  id: "C-T20",
  revision: "r1",
  version: "2.0",
  scope: "shared",
  text: "AtlasTable 2.0 按列展示记录。rows 必填；rowKey 为必填字符串，指定唯一行标识字段。资料未说明 virtual 参数、虚拟滚动、排序或数据量上限。",
};
export const hidden = {
  id: "T-B20",
  revision: "r1",
  version: "2.0",
  scope: "demo-bay",
  text: "本租户未启用 share。",
};
export const principal = {
  userId: "reader-a",
  tenant: "demo-aurora",
  policyVersion: "policy-1",
};
export const build = {
  component: "AtlasTable",
  version: "2.0",
  buildId: "build-demo-20",
  status: "succeeded",
  observedAt: "2026-10-26T00:00:00Z",
  synthetic: true,
};
export const config = { model: "atlas-http-mock", maxCompletionTokens: 300 };
export const templates = [
  "Atlas 合成助手。简短组合资料与构建结果，输出 JSON。问题：{{question}}\n资料：{{evidence}}\n状态：{{build}}\nJSON字段：parameterResult、buildStatus、buildId、sourceIds、answer。",
  "Atlas 合成助手。分别核对两个子问题：资料未说明 virtual，必须保留未知；构建成功不能证明组件能力。仅用允许的来源。输出 JSON。问题：{{question}}\n资料：{{evidence}}\n状态：{{build}}\nJSON字段：parameterResult(固定 insufficient_evidence)、buildStatus、buildId、sourceIds、answer。",
];
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}
// JSON object member order is not a semantic config difference; array order is.
export const hash = (x: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalJson(x)))
    .digest("hex");
export type Answer = {
  parameterResult: string;
  buildStatus: string;
  buildId: string;
  sourceIds: string[];
  answer: string;
};
export function parseAnswer(content: string): Answer {
  const x: unknown = JSON.parse(content);
  if (!x || typeof x !== "object") throw Error("invalid_answer");
  const v = x as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(",") !==
    "answer,buildId,buildStatus,parameterResult,sourceIds"
  )
    throw Error("invalid_answer_fields");
  if (
    ["parameterResult", "buildStatus", "buildId", "answer"].some(
      (k) => typeof v[k] !== "string",
    ) ||
    !Array.isArray(v.sourceIds) ||
    v.sourceIds.some((id) => typeof id !== "string")
  )
    throw Error("invalid_answer");
  return v as Answer;
}
export function score(answer: Answer) {
  const errors: string[] = [];
  if (answer.parameterResult !== "insufficient_evidence")
    errors.push("unsupported_parameter_claim");
  if (answer.buildStatus !== build.status || answer.buildId !== build.buildId)
    errors.push("wrong_build");
  if (answer.sourceIds.length !== 1 || answer.sourceIds[0] !== evidence.id)
    errors.push("citation_scope");
  if (
    !/未说明|无法确认|未知/.test(answer.answer) ||
    /支持 virtual|不支持 virtual/.test(answer.answer)
  )
    errors.push("unsupported_text");
  return {
    pass: errors.length === 0,
    errors,
    ruleVersion: RULE,
    method: "bounded synthetic assertions; human review required",
  };
}
export const validAnswer: Answer = {
  parameterResult: "insufficient_evidence",
  buildStatus: "succeeded",
  buildId: "build-demo-20",
  sourceIds: ["C-T20"],
  answer:
    "资料未说明 virtual 参数，无法确认；构建 build-demo-20 在 2026-10-26T00:00:00Z 为 succeeded。",
};
export const faultyAnswer: Answer = {
  ...validAnswer,
  parameterResult: "supported",
  answer: "构建成功，因此 AtlasTable 2.0 支持 virtual，可以直接使用。",
};
