import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 8787);

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/evm.html", ["evm.html", "text/html; charset=utf-8"]],
  ["/explorer.css", ["explorer.css", "text/css; charset=utf-8"]],
  ["/explorer.js", ["explorer.js", "text/javascript; charset=utf-8"]],
  ["/ipi-logo.svg", ["ipi-logo.svg", "image/svg+xml"]],
]);

function upstreamUrl(pathname, search) {
  if (pathname === "/api/evm/rpc") {
    return "https://evm-rpc-testnet.ipi.io/" + search;
  }
  if (pathname.startsWith("/api/rpc/")) {
    return "https://rpc-testnet.ipi.io/" + pathname.slice("/api/rpc/".length) + search;
  }
  if (pathname.startsWith("/api/rest/")) {
    return "https://rest-testnet.ipi.io/" + pathname.slice("/api/rest/".length) + search;
  }
  if (pathname === "/api/monitor/prometheus/alerts") {
    return "https://scan-testnet.ipi.io/api/monitor/prometheus/alerts" + search;
  }
  return "";
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxy(request, response, target) {
  try {
    const body = request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await requestBody(request);
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        accept: request.headers.accept || "application/json",
        "content-type": request.headers["content-type"] || "application/json",
      },
      body,
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    response.end(payload);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Local proxy failed", message: error.message }));
  }
}

createServer(async function (request, response) {
  const url = new URL(request.url || "/", "http://" + host + ":" + port);
  const target = upstreamUrl(url.pathname, url.search);
  if (target) {
    await proxy(request, response, target);
    return;
  }

  const file = staticFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const payload = await readFile(join(root, file[0]));
    response.writeHead(200, {
      "content-type": file[1],
      "cache-control": "no-store",
    });
    response.end(payload);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
}).listen(port, host, function () {
  process.stdout.write("IPI Scan local preview: http://" + host + ":" + port + "/\n");
});
