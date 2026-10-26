// Independent assertions. The composer NEVER imports this module.
export const expectations = {
  Q01: {
    kind: "answered",
    all: ["AtlasTable"],
    sources: ["C-T20"],
    avoid: ["支持排序", "支持虚拟滚动"],
  },
  Q02: {
    kind: "answered",
    all: ["rowKey", "必填", "字符串", "唯一"],
    sources: ["C-T20"],
  },
  Q03: {
    kind: "answered",
    all: ["loading", "disabled", "1.4"],
    sources: ["C-B14"],
    avoid: ["pending", "自动禁用"],
  },
  Q04: {
    kind: "answered",
    all: ["1.4", "2.0", "loading", "pending", "disabled"],
    sources: ["C-B14", "C-B20"],
  },
  Q05: {
    kind: "insufficient_evidence",
    all: ["未说明", "无法确认"],
    avoid: ["支持百万行", "不支持虚拟滚动"],
  },
  Q06: { kind: "insufficient_evidence", all: ["不能确定", "补充"] },
  Q07: { kind: "needs_clarification", all: ["版本"] },
  Q08: { kind: "forbidden", all: ["权限"], avoid: ["T-B20", "未启用", "2.0"] },
  Q09: {
    kind: "insufficient_evidence",
    all: ["无法确认"],
    avoid: ["T-B20", "未启用", "支持百万行"],
  },
  Q10: {
    kind: "answered",
    all: ["tenant", "不允许 public"],
    sources: ["A-S20"],
  },
  Q11: {
    kind: "execution_unavailable",
    all: ["未创建"],
    avoid: ["shareId", "已为你分享"],
  },
  Q12: { kind: "insufficient_evidence", all: ["coarse", "无法确认"] },
  Q13: {
    kind: "answered",
    all: ["demo-aurora", "已启用", "租户内"],
    sources: ["T-A20"],
  },
  Q14: {
    kind: "conflicting_evidence",
    all: ["冲突", "核实"],
    sources: ["C-T20-A", "C-T20-B"],
  },
};
export function grade(id, result) {
  const e = expectations[id];
  const text =
    result.answer || result.reason || result.question || result.message || "";
  const errors = [];
  if (result.kind !== e.kind) errors.push("result_kind");
  for (const term of e.all || [])
    if (!text.includes(term)) errors.push(`missing_claim:${term}`);
  for (const term of e.avoid || [])
    if (text.includes(term)) errors.push(`forbidden_claim:${term}`);
  if (
    e.sources &&
    JSON.stringify([...(result.sourceIds || [])].sort()) !==
      JSON.stringify([...e.sources].sort())
  )
    errors.push("evidence_scope");
  return {
    pass: errors.length === 0,
    errors,
    ruleVersion: "assertions-1",
    method: "bounded fixture assertions; human review still required",
  };
}
