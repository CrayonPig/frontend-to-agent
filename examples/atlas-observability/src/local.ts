import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { scriptedChoice } from "./agent.js";
import { faultyAnswer, validAnswer } from "./domain.js";
export type StoredPrompt = {
  name: string;
  version: number;
  type: "text";
  prompt: string;
  config: unknown;
  labels: string[];
  tags: string[];
};
export type LocalState = { prompts: StoredPrompt[] };
export async function localServer(stateFile?: string) {
  let state: LocalState = { prompts: [] };
  if (stateFile) {
    try {
      state = JSON.parse(await readFile(stateFile, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  const requests: { method: string; path: string }[] = [];
  const otlp: unknown[] = [];
  const modelRequests: unknown[] = [];
  let promptUnavailable = false;
  let modelFault: string | null = null;
  const persist = async () => {
    if (stateFile) {
      await mkdir(dirname(stateFile), { recursive: true });
      await writeFile(stateFile, JSON.stringify(state, null, 2));
    }
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    requests.push({ method: req.method || "", path: url.pathname });
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      let bytes: Buffer = Buffer.concat(chunks);
      if (req.headers["content-encoding"] === "gzip") bytes = gunzipSync(bytes);
      const body = bytes.length ? JSON.parse(bytes.toString()) : {};
      const reply = (status: number, data: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/api/public/otel/v1/traces") {
        otlp.push(body);
        reply(200, {});
        return;
      }
      if (url.pathname === "/v1/chat/completions") {
        modelRequests.push(body);
        if (modelFault && modelFault !== "early-finish") {
          res.writeHead(modelFault === "http-error" ? 502 : 200, {
            "Content-Type": "application/json",
            "X-Diagnostic": "SYNTHETIC_EXTERNAL_SECRET",
          });
          res.end(
            modelFault === "invalid-content"
              ? JSON.stringify({
                  choices: [
                    {
                      message: { content: "SYNTHETIC_EXTERNAL_SECRET" },
                      finish_reason: "stop",
                    },
                  ],
                })
              : "SYNTHETIC_EXTERNAL_SECRET https://secret.invalid/private",
          );
          return;
        }
        const text = JSON.stringify(body.messages);
        let action;
        if (text.includes("ATLAS_ACTION_SELECTOR_V1")) {
          const request = JSON.parse(body.messages[0].content);
          action =
            modelFault === "early-finish"
              ? { type: "finish", answer: validAnswer }
              : scriptedChoice(request.state, request.policy);
        }
        const answer = text.includes("分别核对两个子问题")
          ? validAnswer
          : faultyAnswer;
        reply(200, {
          id: "synthetic-completion",
          object: "chat.completion",
          model: "atlas-http-mock",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(action ?? answer),
              },
              finish_reason: "stop",
            },
          ],
        });
        return;
      }
      if (promptUnavailable) {
        reply(503, { message: "synthetic_prompt_unavailable" });
        return;
      }
      if (url.pathname === "/api/public/v2/prompts" && req.method === "POST") {
        const version =
          state.prompts.filter((p) => p.name === body.name).length + 1;
        for (const p of state.prompts.filter((p) => p.name === body.name))
          p.labels = p.labels.filter((l) => !body.labels?.includes(l));
        const item: StoredPrompt = {
          name: body.name,
          version,
          type: "text",
          prompt: body.prompt,
          config: body.config,
          labels: body.labels || [],
          tags: body.tags || [],
        };
        state.prompts.push(item);
        await persist();
        reply(200, item);
        return;
      }
      const match = url.pathname.match(
        /^\/api\/public\/v2\/prompts\/([^/]+)(?:\/versions\/(\d+))?$/,
      );
      if (match) {
        const name = decodeURIComponent(match[1]);
        if (req.method === "PATCH") {
          const item = state.prompts.find(
            (p) => p.name === name && p.version === Number(match[2]),
          );
          if (!item) {
            reply(404, { message: "missing" });
            return;
          }
          for (const p of state.prompts.filter((p) => p.name === name))
            p.labels = p.labels.filter(
              (l) => !(body.newLabels || []).includes(l),
            );
          item.labels = body.newLabels;
          await persist();
          reply(200, item);
          return;
        }
        if (req.method === "GET") {
          const version = url.searchParams.get("version"),
            label = url.searchParams.get("label") || "production";
          const item = state.prompts
            .filter((p) => p.name === name)
            .find((p) =>
              version
                ? p.version === Number(version)
                : p.labels.includes(label),
            );
          if (!item) {
            reply(404, { message: "missing" });
            return;
          }
          reply(200, item);
          return;
        }
      }
      reply(404, { message: "unknown_route" });
    } catch {
      res.writeHead(500);
      res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    state,
    requests,
    otlp,
    modelRequests,
    setModelFault: (value: string | null) => {
      modelFault = value;
    },
    setPromptUnavailable: (v: boolean) => {
      promptUnavailable = v;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
