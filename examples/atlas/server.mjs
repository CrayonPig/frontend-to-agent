import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { DocumentStore } from "./core.mjs";
import { principal } from "./fixtures.mjs";
import { observedAnswer } from "./application.mjs";
export function createDemoServer() {
  const store = new DocumentStore();
  return createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-ID", requestId);
    if (req.method === "GET" && req.url === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(await readFile(new URL("./index.html", import.meta.url)));
      return;
    }
    if (req.method !== "POST" || req.url !== "/api/ask") {
      res.writeHead(404);
      res.end();
      return;
    }
    // This is a localhost demo with a fixed synthetic identity, not authentication.
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const input = JSON.parse(body);
      if (Object.keys(input).some((k) => !["question", "version"].includes(k)))
        throw Error("unexpected_field");
      if (![null, "1.4", "1.8", "2.0", "compare"].includes(input.version))
        throw Error("invalid_version");
      const { result, trace } = observedAnswer(
        store,
        principal,
        input,
        requestId,
      );
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.write(JSON.stringify({ type: "started", requestId }) + "\n");
      // Chunked synthetic delivery; no provider token stream or timing claim.
      const text =
        result.answer || result.reason || result.question || result.message;
      for (const chunk of text.match(/.{1,12}/gu) || []) {
        await new Promise((r) => setTimeout(r, 15));
        if (res.destroyed) return;
        res.write(
          JSON.stringify({ type: "delta", requestId, text: chunk }) + "\n",
        );
      }
      res.end(
        JSON.stringify({
          type: "completed",
          requestId,
          result,
          trace,
        }) + "\n",
      );
    } catch (e) {
      if (!res.headersSent)
        res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_request", requestId }));
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  createDemoServer().listen(8787, "127.0.0.1", () =>
    console.log("Synthetic Atlas demo: http://127.0.0.1:8787"),
  );
