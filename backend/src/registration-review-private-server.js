"use strict";

/**
 * Panneau PRIVE de revue d'inscription, uniquement tunnel SSH.
 * Sur le VPS : bind Docker 127.0.0.1:8089. Sur Windows : tunnel 18089.
 * Ne jamais ajouter ce service au Caddyfile du domaine public.
 * Approbation administrative != activation du compte salarie.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { listPendingRequests, decideRequest } = require("./registration-review");
const {
  isValidPanelToken, requestPath,
  isAllowedReviewHost, isAllowedReviewOrigin
} = require("./private-admin-auth");

const password = fs.readFileSync(
  process.env.DB_PASSWORD_FILE || "/run/secrets/registration_reviewer_db_password",
  "utf8"
).trim();
const adminToken = fs.readFileSync(
  process.env.REVIEW_TOKEN_FILE || "/run/secrets/registration_review_panel_token",
  "utf8"
).trim();
if (!/^[a-f0-9]{64}$/i.test(password) || !/^[a-f0-9]{64}$/i.test(adminToken)) {
  throw new Error("Secrets privees du panneau invalides.");
}

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "cse_educatif",
  user: process.env.DB_USER || "cse_registration_reviewer",
  password,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

const port = Number(process.env.PORT || 3101);
const publicDir = path.resolve(__dirname, "../public");
const staticPaths = new Map([
  ["/", ["registration-review.html", "text/html; charset=utf-8"]],
  ["/review.css", ["registration-review.css", "text/css; charset=utf-8"]],
  ["/review.js", ["registration-review.js", "text/javascript; charset=utf-8"]]
]);

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join("; ")
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {...headers, "Content-Type":type});
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

const failures = new Map();
function authorize(req) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let state = failures.get(ip);
  if (!state || now > state.until) state = {count:0, until:now+10*60_000};
  if (state.count >= 20) return 429;
  if (isValidPanelToken(req.headers["x-cse-review-token"], adminToken)) {
    failures.delete(ip);
    return 200;
  }
  state.count++;
  failures.set(ip, state);
  return 401;
}

async function getJson(req) {
  if (req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new Error("Content-Type invalide.");
  }
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 4096) throw new Error("Taille de requete invalide.");
    chunks.push(chunk);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("JSON invalide."); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Format JSON invalide.");
  }
  return parsed;
}

const server = http.createServer(async (req, res) => {
  const pathname = requestPath(req.url);
  if (req.method === "GET" && pathname === "/healthz") {
    return send(res, 200, {status:"alive"});
  }
  if (!isAllowedReviewHost(req.headers.host)) {
    return send(res, 403, {error:"forbidden_host"});
  }

  if (req.method === "GET" && staticPaths.has(pathname)) {
    const [file,mime] = staticPaths.get(pathname);
    try {
      return send(res, 200, fs.readFileSync(path.join(publicDir,file)), mime);
    } catch {
      return send(res, 503, {error:"unavailable"});
    }
  }

  const list = pathname === "/api/demandes" && req.method === "GET";
  const match = pathname.match(/^\/api\/demandes\/([0-9a-f-]{36})\/decision$/i);
  const decision = Boolean(match) && req.method === "PUT";
  if (!list && !decision) return send(res, 404, {error:"not_found"});

  const access = authorize(req);
  if (access !== 200) {
    return send(res, access, {error:access === 429 ? "too_many_attempts" : "unauthorized"});
  }
  if (list) {
    try {
      return send(res, 200, {requests:await listPendingRequests(pool)});
    } catch (error) {
      console.error("Lecture demandes:", error.code || "unknown");
      return send(res, 503, {error:"unavailable"});
    }
  }

  if (!isAllowedReviewOrigin(req.headers.origin)) {
    return send(res, 403, {error:"invalid_origin"});
  }
  let body;
  try { body = await getJson(req); }
  catch { return send(res, 400, {error:"invalid_request"}); }
  if (!["approved","rejected"].includes(body.decision)) {
    return send(res, 400, {error:"invalid_decision"});
  }
  try {
    const result = await decideRequest(pool, match[1], body.decision);
    if (result.status === "not_pending") {
      return send(res, 409, {error:"already_handled_or_expired"});
    }
    return send(res, 200, result);
  } catch (error) {
    console.error("Decision d'inscription:", error.code || "unknown");
    if (!error.code && /invalide|non autorisee/.test(error.message)) {
      return send(res, 400, {error:"invalid_request"});
    }
    return send(res, 503, {error:"unavailable"});
  }
});

server.requestTimeout = 15000;
server.headersTimeout = 8000;
server.listen(port, "0.0.0.0", () => {
  console.log("Revue inscription privee active; tunnel SSH uniquement.");
});
process.once("SIGTERM", () => server.close(() => pool.end()));
process.once("SIGINT", () => server.close(() => pool.end()));
