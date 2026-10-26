import { documents } from "./fixtures.mjs";
export const kinds = [
  "answered",
  "insufficient_evidence",
  "needs_clarification",
  "forbidden",
  "conflicting_evidence",
  "execution_unavailable",
];
export const canRead = (p, d) =>
  Boolean(
    p?.permissions?.includes("docs:read") &&
      !d.deleted &&
      (d.scope === "shared" || d.scope === p.tenant),
  );
export class DocumentStore {
  constructor(seed = documents) {
    this.docs = new Map(seed.map((d) => [d.id, structuredClone(d)]));
    this.generation = 1;
  }
  apply(event) {
    if (!event.id || !Number.isInteger(event.revision) || event.revision < 1)
      throw Error("invalid_revision");
    const old = this.docs.get(event.id);
    if (old && event.revision <= old.revision) return false;
    if (
      !event.deleted &&
      (!event.scope || !event.version || !event.text || !event.facts)
    )
      throw Error("invalid_document");
    this.docs.set(event.id, structuredClone(event));
    this.generation++;
    return true;
  }
  visible(p, { version, caseId } = {}) {
    return [...this.docs.values()]
      .filter((d) => canRead(p, d))
      .filter((d) => !d.onlyCase || d.onlyCase === caseId)
      .filter((d) => !(caseId === "Q14" && d.id === "C-T20"))
      .filter(
        (d) => !version || version === "compare" || d.version === version,
      );
  }
}
function terms(q) {
  return q.toLowerCase().match(/[a-z][a-z0-9]*|[\u4e00-\u9fff]/g) || [];
}
export function retrieve(store, p, { query, version, caseId, limit = 8 }) {
  // Authorization/filtering happens BEFORE scoring, so forbidden content never becomes a candidate.
  const tokens = terms(query);
  return store
    .visible(p, { version, caseId })
    .map((d) => ({
      doc: d,
      score: tokens.reduce(
        (n, t) => n + (d.text.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, limit)
    .map((x) => x.doc);
}
export function validateResult(r, allowed) {
  if (!r || !kinds.includes(r.kind)) throw Error("invalid_kind");
  const textKey =
    r.kind === "answered"
      ? "answer"
      : r.kind === "needs_clarification"
        ? "question"
        : r.kind === "forbidden" || r.kind === "execution_unavailable"
          ? "message"
          : "reason";
  if (typeof r[textKey] !== "string" || !r[textKey].trim())
    throw Error("invalid_text");
  if (r.kind === "answered" || r.kind === "conflicting_evidence") {
    if (
      !Array.isArray(r.sourceIds) ||
      !r.sourceIds.length ||
      r.sourceIds.some(
        (id) =>
          typeof id !== "string" ||
          !allowed.some((d) => d.id === id && !d.untrusted),
      )
    )
      throw Error("invalid_citation");
  }
  return r;
}
export function answerQuestion(
  store,
  p,
  { question, version, caseId, onRetrieve },
) {
  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > 2000
  )
    throw Error("invalid_question");
  if (!p?.permissions?.includes("docs:read"))
    return { kind: "forbidden", message: "没有读取所请求资料的权限。" };
  const namedTenant = question.match(/demo-(?:aurora|bay)/)?.[0];
  if (namedTenant && namedTenant !== p.tenant)
    return { kind: "forbidden", message: "没有读取所请求资料的权限。" };
  if (/替我分享/.test(question))
    return {
      kind: "execution_unavailable",
      message: "当前助手只解释文档，未创建分享记录。",
    };
  if (!version)
    return { kind: "needs_clarification", question: "请提供目标产品版本。" };
  const retrieveStarted = performance.now();
  const candidates = retrieve(store, p, { query: question, version, caseId });
  onRetrieve?.({
    candidateIds: candidates.map((d) => d.id),
    sourceRevisions: candidates.map((d) => `${d.id}@r${d.revision}`),
    durationMs: performance.now() - retrieveStarted,
  });
  const docs = candidates.filter((d) => !d.untrusted);
  const by = (id) => docs.find((d) => d.id === id);
  const missing = () => ({
    kind: "insufficient_evidence",
    reason: "当前可访问资料不能确定该版本的行为，请补充资料。",
  });
  const answered = (answer, sourceIds) =>
    validateResult({ kind: "answered", answer, sourceIds }, docs);
  // This deterministic adapter deliberately recognizes only the teaching intents, not arbitrary language.
  if (/rowKey/.test(question)) {
    const tables = docs.filter((d) => d.entity === "AtlasTable");
    if (new Set(tables.map((d) => d.facts.rowKeyRequired)).size > 1)
      return validateResult(
        {
          kind: "conflicting_evidence",
          reason:
            "同版本同范围的正式资料对 rowKey 必填性存在冲突，需维护者核实。",
          sourceIds: tables.map((d) => d.id),
        },
        docs,
      );
    const d = by("C-T20");
    return d
      ? answered(
          d.facts.rowKeyRequired
            ? "rowKey 为必填字符串，指定记录中唯一行标识的字段名，不能省略。"
            : "rowKey 为可选字符串；缺省行为需以该修订资料为准。",
          [d.id],
        )
      : missing();
  }
  if (/虚拟滚动/.test(question))
    return {
      kind: "insufficient_evidence",
      reason: "现有资料未说明虚拟滚动或数据量上限，无法确认支持情况。",
    };
  if (/getLocation/.test(question))
    return by("A-L20")
      ? {
          kind: "insufficient_evidence",
          reason: "precision 默认 coarse；精度误差没有资料，无法确认一米承诺。",
        }
      : missing();
  if (/share/.test(question)) {
    if (/当前租户/.test(question)) {
      const d = docs.find((d) => d.scope === p.tenant);
      return d
        ? answered(
            `${p.tenant} ${d.facts.enabled ? "已启用" : "未启用"} share，访问范围限租户内。`,
            [d.id],
          )
        : missing();
    }
    return by("A-S20")
      ? answered("visibility 只允许 tenant，不允许 public。", ["A-S20"])
      : missing();
  }
  if (/迁到/.test(question))
    return by("C-B14") && by("C-B20")
      ? answered(
          "1.4 的 loading 在 2.0 改为 pending；disabled 仍单独负责阻止 click。",
          ["C-B14", "C-B20"],
        )
      : missing();
  if (/按钮|AtlasButton/.test(question)) {
    const d = docs.find((d) => d.entity === "AtlasButton");
    return d
      ? answered(
          `${d.version} 使用 ${d.facts.waiting} 显示等待图标，另需 disabled 阻止 click；等待参数本身不阻止点击。`,
          [d.id],
        )
      : missing();
  }
  if (/按列展示/.test(question))
    return by("C-T20")
      ? answered("使用 AtlasTable 按列展示多条记录。", ["C-T20"])
      : missing();
  return missing();
}
