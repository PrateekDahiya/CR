/**
 * A tiny reverse proxy that puts the Next.js app (:3000) and the game server
 * (:4000) behind ONE public origin, so a phone only needs a single URL.
 *
 *   /socket.io/*            -> backend  (the socket.io transport)
 *   /_next/*, /sprites/*,   -> frontend (the app + its static assets)
 *   /cards/*, /cardart/*,
 *   /towers/*
 *   Accept: text/html       -> frontend (a page request)
 *   everything else         -> backend  (the REST API)
 *
 * Run: node scripts/tunnel-proxy.js  (listens on :8099)
 * Used by scripts/start-tunnel.ps1 (ngrok tunnels this port).
 */
const http = require("node:http");
const net = require("node:net");

const PORT = Number(process.env.PROXY_PORT || 8099);
const FRONTEND = { host: "127.0.0.1", port: 3000 };
const BACKEND = { host: "127.0.0.1", port: 4000 };

const STATIC_PREFIXES = [
  "/_next/",
  "/sprites/",
  "/cards/",
  "/cardart/",
  "/towers/",
  "/favicon.ico",
  "/icons/",
  "/images/",
  "/manifest.json",
  "/sw.js",
];

function isFrontend(req) {
  const url = (req.url || "/").split("?")[0];
  if (url.startsWith("/socket.io")) return false;
  for (const prefix of STATIC_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }
  const accept = String(req.headers.accept || "");
  if (accept.includes("text/html")) return true;
  // the app's own page routes
  return /^\/(battle|decks|deck|lobby|collection|animations|social|login|admin|shop|replay)?(\/|$)/.test(url) &&
    req.method === "GET" &&
    !url.startsWith("/api");
}

const server = http.createServer((req, res) => {
  const target = isFrontend(req) ? FRONTEND : BACKEND;
  const options = {
    host: target.host,
    port: target.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${target.host}:${target.port}` },
  };
  const proxy = http.request(options, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`proxy error: ${err.message}`);
  });
  req.pipe(proxy);
});

// the socket.io websocket upgrade (the Next.js HMR socket goes to the frontend)
server.on("upgrade", (req, socket, head) => {
  const url = (req.url || "/").split("?")[0];
  const target = url.startsWith("/_next/") ? FRONTEND : BACKEND;
  const proxy = net.connect(target.port, target.host, () => {
    const lines = [`GET ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === "host") lines.push(`host: ${target.host}:${target.port}`);
      else lines.push(`${key}: ${value}`);
    }
    proxy.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head && head.length > 0) proxy.write(head);
    proxy.pipe(socket);
    socket.pipe(proxy);
  });
  proxy.on("error", () => socket.destroy());
  socket.on("error", () => proxy.destroy());
});

server.listen(PORT, () => {
  console.log(`tunnel proxy on http://localhost:${PORT} -> frontend :${FRONTEND.port} / backend :${BACKEND.port}`);
});
