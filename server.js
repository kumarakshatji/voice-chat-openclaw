import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const execFileAsync = promisify(execFile);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function extractText(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  return (
    payload.response ||
    payload.text ||
    payload.message ||
    payload.answer ||
    payload.output ||
    payload.content ||
    payload.reply ||
    payload.result?.text ||
    payload.result?.reply ||
    payload.result?.message ||
    payload.result?.payloads?.[0]?.text ||
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    ""
  );
}

async function callLocalOpenClaw(message) {
  const openClawBin = process.env.OPENCLAW_BIN || "openclaw";
  const node24Bin = "/opt/homebrew/opt/node@24/bin";
  const env = {
    ...process.env,
    PATH: process.env.PATH?.includes(node24Bin)
      ? process.env.PATH
      : `${node24Bin}:${process.env.PATH || ""}`,
  };

  const { stdout } = await execFileAsync(
    openClawBin,
    ["agent", "--json", "--message", message],
    {
      env,
      timeout: Number(process.env.OPENCLAW_TIMEOUT_MS || 600000),
      maxBuffer: 1024 * 1024 * 4,
    },
  );

  const trimmed = stdout.trim();
  if (!trimmed) return { text: "", raw: "" };

  try {
    const payload = JSON.parse(trimmed);
    return { text: extractText(payload).trim(), raw: payload };
  } catch {
    return { text: trimmed, raw: trimmed };
  }
}

async function handleOpenClaw(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req) || "{}");
  } catch {
    sendJson(res, 400, { error: "Request body must be JSON." });
    return;
  }

  const message = String(body.message || "").trim();
  if (!message) {
    sendJson(res, 400, { error: "Message is required." });
    return;
  }

  const openClawUrl = process.env.OPENCLAW_URL;
  if (!openClawUrl) {
    try {
      const result = await callLocalOpenClaw(message);
      if (!result.text) {
        sendJson(res, 502, { error: "Local OpenClaw returned no readable text.", raw: result.raw });
        return;
      }

      sendJson(res, 200, result);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const reason = details.match(/\[openclaw\] Reason: (.+)/)?.[1] || details;
      sendJson(res, 502, {
        error: `OpenClaw request failed: ${reason}`,
        details,
      });
    }
    return;
  }

  const headers = { "content-type": "application/json" };
  if (process.env.OPENCLAW_API_KEY) {
    headers.authorization = `Bearer ${process.env.OPENCLAW_API_KEY}`;
  }

  try {
    const upstream = await fetch(openClawUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
    });

    const contentType = upstream.headers.get("content-type") || "";
    const raw = await upstream.text();
    let payload = raw;

    if (contentType.includes("application/json")) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw;
      }
    }

    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        error: "OpenClaw request failed.",
        details: payload,
      });
      return;
    }

    const text = extractText(payload).trim();
    sendJson(res, 200, { text, raw: payload });
  } catch (error) {
    sendJson(res, 502, {
      error: "Could not reach OpenClaw.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^\.\.(\/|\\|$)/, "");
  const filePath = join(publicDir, safePath);

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

createServer((req, res) => {
  if (req.url?.startsWith("/api/openclaw")) {
    void handleOpenClaw(req, res);
    return;
  }

  void serveStatic(req, res);
}).listen(port, () => {
  console.log(`Voice Chat OpenClaw running at http://localhost:${port}`);
});
