import { parseAnswer } from "./domain.js";
export type ModelConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  external: boolean;
};
export function validateEndpoint(url: string, external: boolean, hasCredentials = false) {
  const u = new URL(url);
  if (!external && !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
    throw Error("external_endpoint_requires_opt_in");
  if (!["http:", "https:"].includes(u.protocol))
    throw Error("invalid_protocol");
  if (u.username || u.password) throw Error("credentials_in_url");
  if (hasCredentials && u.protocol !== "https:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
    throw Error("model_https_required");
}
export function parseUsage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    ![v.prompt_tokens, v.completion_tokens].every(
      (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
    )
  )
    return null;
  return {
    inputTokens: v.prompt_tokens as number,
    outputTokens: v.completion_tokens as number,
  };
}
export async function requestChat(
  model: ModelConfig,
  input: string,
  maxCompletionTokens: number,
  deadlineAt: number,
) {
  try {
    validateEndpoint(model.baseUrl, model.external, Boolean(model.apiKey));
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw Error("deadline");
    const response = await fetch(
      `${model.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model.model,
          messages: [{ role: "user", content: input }],
          max_completion_tokens: maxCompletionTokens,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(remaining),
      },
    );
    if (!response.ok) throw Error(`model_http_${response.status}`);
    const raw = (await response.json()) as {
      choices?: {
        message?: { content?: string; refusal?: string };
        finish_reason?: string;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const choice = raw.choices?.[0];
    if (choice?.message?.refusal) throw Error("model_refusal");
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string"
    )
      throw Error("model_incomplete");
    const usage = parseUsage(raw.usage);
    return {
      content: choice.message.content,
      usage,
      cost: null,
      model: model.model,
    };
  } catch (error) {
    const message = (error as Error)?.message;
    const code =
      /^(deadline|model_http_[0-9]{3}|model_refusal|model_incomplete|external_endpoint_requires_opt_in|invalid_protocol|credentials_in_url|model_https_required)$/.test(
        message || "",
      )
        ? message
        : "model_response_error";
    throw safeError(code);
  }
}
export function safeError(code: string) {
  const error = new Error(code);
  error.stack = code;
  return error;
}
export async function complete(
  model: ModelConfig,
  input: string,
  maxCompletionTokens: number,
  deadlineAt: number,
) {
  const result = await requestChat(
    model,
    input,
    maxCompletionTokens,
    deadlineAt,
  );
  try {
    return { ...result, answer: parseAnswer(result.content) };
  } catch {
    throw safeError("model_answer_invalid");
  }
}
