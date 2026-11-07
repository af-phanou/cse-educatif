"use strict";

/**
 * Panneau prive sur 127.0.0.1:8088 du VPS, acces UNIQUEMENT via tunnel SSH.
 * Ne pas exposer sur Caddy et ne pas modifier la publication Docker localhost.
 * Authentification additionnelle par token aleatoire, jamais via URL/cookie.
 * Ce n'est pas encore le portail definitif avec roles superadministrateurs.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const {
  listAllEstablishments,
  upsertEstablishments
} = require("./establishments");
const {
  isValidPanelToken,
  isAllowedLocalHost,
  isAllowedMutationOrigin,
  requestPath
} = require("./private-admin-auth");

const adminToken = fs.readFileSync(
  process.env.PANEL_TOKEN_FILE || "/run/secrets/establishments_panel_token",
  "utf8"
).trim();
const password = fs.readFileSync(
  process.env.DB_PASSWORD_FILE || "/run/secrets/establishments_db_password",
  "utf8"
).trim();
if (!/^[a-f0-9]{64}$/i.test(adminToken) ||
    !/^[a-f0-9]{64}$/i.test(password)) {
  throw new Error("Secrets du panneau d'administration invalides.");
}

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "cse_educatif",
  user: process.env.DB_USER || "cse_site_manager",
  password,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

const port = Number(process.env.PORT || 3100);
const publicDir = path.resolve(__dirname, "../public");
const resources = new Map([
  ["/", ["establishments-admin.html", "text/html; charset=utf-8"]],
  ["/admin.js", ["establishments-admin.js", "text/javascript; charset=utf-8"]],
  ["/admin.css", ["establishments-admin.css", "text/css; charset=utf-8"]]
]);

const securityHeaders = {
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

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {...securityHeaders, "Content-Type": contentType});
  res.end(contentType.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function readJson(req) {
  if (req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    const err = new Error("Format JSON obligatoire");
    err.httpStatus = 415;
    throw err;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) {
      const err = new Error("Lot trop volumineux (32 Kio)");
      err.httpStatus = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const err = new Error("JSON invalide");
    err.httpStatus = 400;
    throw err;
  }
}

// Defence en profondeur : jamais de requete depuis une autre origine/host.
const failures = new Map();
function permitted(req) {
  const address = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let state = failures.get(address) || {count:0, until:now + 10 * 60_000};
  if (now > state.until) state = {count:0, until:now + 10 * 60_000};
  if (state.count >= 20) return {status:429};
  if (isValidPanelToken(req.headers["x-cse-admin-token"], adminToken)) {
    failures.delete(address);
    return {status:200};
  }
  state.count++;
  failures.set(address, state);
  return {status:401};
}

const server = http.createServer(async (req, res) => {
  const pathname = requestPath(req.url);
  if (req.method === "GET" && pathname === "/healthz") {
    return send(res, 200, {status:"alive"});
  }
  if (!isAllowedLocalHost(req.headers.host)) {
    return send(res, 403, {error:"forbidden_host"});
  }
  if (req.method === "GET" && resources.has(pathname)) {
    const [file, mime] = resources.get(pathname);
    // Chemins predefinis seulement, jamais de chemin fourni par l'utilisateur.
    try {
      const data = fs.readFileSync(path.join(publicDir, file));
      return send(res, 200, data, mime);
    } catch {
      return send(res, 503, {error:"unavailable"});
    }
  }
  if (pathname !== "/api/sites") {
    return send(res, 404, {error:"not_found"});
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return send(res, 405, {error:"method_not_allowed"});
  }

  const allowed = permitted(req);
  if (allowed.status !== 200) {
    return send(res, allowed.status, {error:allowed.status === 429 ? "too_many_attempts" : "unauthorized"});
  }
  if (req.method === "GET") {
    try {
      return send(res, 200, {sites: await listAllEstablishments(pool)});
    } catch (error) {
      console.error("Lecture etablissements:", error.code || "unknown");
      return send(res, 503, {error:"unavailable"});
    }
  }

  if (!isAllowedMutationOrigin(req.headers.origin)) {
    return send(res, 403, {error:"invalid_origin"});
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return send(res, error.httpStatus || 400, {error:"invalid_request", message:error.message});
  }
  const client = await pool.connect().catch(() => null);
  if (!client) return send(res, 503, {error:"unavailable"});
  try {
    if (!payload || !Array.isArray(payload.sites)) {
      return send(res, 400, {error:"sites_array_required"});
    }
    const saved = await upsertEstablishments(client, payload.sites, "ssh_panel");
    return send(res, 200, {saved});
  } catch (error) {
    if (error.code) {
      console.error("Mise a jour etablissements:", error.code);
      return send(res, 400, {error:"operation_rejected"});
    }
    return send(res, 400, {error:"invalid_input", message:error.message});
  } finally {
    client.release();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 8000;
server.listen(port, "0.0.0.0", () => {
  console.log("Panneau prive etablissements pret; acces SSH uniquement.");
});
process.once("SIGINT", () => server.close(() => pool.end()));
process.once("SIGTERM", () => server.close(() => pool.end()));
