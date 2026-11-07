"use strict";

const http = require("node:http");
const fs = require("node:fs");
const { Pool } = require("pg");
const { listActiveEstablishments } = require("./establishments");
const { submitRegistrationRequest } = require("./registration-submission");
const { allowedOrigin, readRegistrationBody, makeRateLimiter } = require("./registration-http");

const port = Number(process.env.PORT || 3000);
const secretFile = process.env.DB_PASSWORD_FILE || "/run/secrets/app_db_password";
const password = fs.readFileSync(secretFile, "utf8").trim();

const registrationLimiter = makeRateLimiter();
const registrationTestEnabled = process.env.CSE_REGISTRATION_TEST_ONLY === "1";

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "cse_educatif",
  user: process.env.DB_USER || "cse_app",
  password,
  max: 4,
  connectionTimeoutMillis: 4000,
  idleTimeoutMillis: 30000
});

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return sendJson(res, 200, { status: "alive" });
  }

  if (req.method === "GET" && req.url === "/readyz") {
    try {
      await pool.query("SELECT 1");
      return sendJson(res, 200, { status: "ready", database: "connected" });
    } catch (error) {
      console.error("Database readiness failed:", error.code || error.message);
      return sendJson(res, 503, { status: "unavailable" });
    }
  }

  // Repertoire public en lecture seule pour le futur formulaire d'inscription.
  // Le conteneur API n'est pas encore relie au domaine public.
  if (req.method === "GET" && req.url === "/api/etablissements") {
    try {
      const establishments = await listActiveEstablishments(pool);
      return sendJson(res, 200, { establishments });
    } catch (error) {
      console.error("Establishment directory unavailable:", error.code || "unknown");
      return sendJson(res, 503, { error: "service_unavailable" });
    }
  }

  // Cette route REST reste desactivee par defaut ET n'est pas reliee a Caddy.
  // Ne jamais activer sans protections completes et validation RGPD.
  if (req.url === "/api/inscriptions" && req.method === "POST") {
    if (!registrationTestEnabled) {
      return sendJson(res, 404, { error: "not_found" });
    }
    if (!allowedOrigin(req.headers.origin)) {
      return sendJson(res, 403, { error: "forbidden" });
    }
    if (!registrationLimiter.allow(req.socket.remoteAddress)) {
      return sendJson(res, 429, { error: "too_many_requests" });
    }
    try {
      const form = await readRegistrationBody(req);
      const status = await submitRegistrationRequest(pool, form);
      return sendJson(res, 202, status);
    } catch (error) {
      if (error.httpStatus) {
        return sendJson(res, error.httpStatus, { error: "invalid_request" });
      }
      if (!error.code) {
        return sendJson(res, 400, { error: "invalid_registration" });
      }
      console.error("Registration staging unavailable:", error.code);
      return sendJson(res, 503, { error: "service_unavailable" });
    }
  }

  return sendJson(res, 404, { error: "not_found" });
});

server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.listen(port, "0.0.0.0", () => {
  console.log("CSE Educatif API (private bootstrap) listening on port", port);
});

async function shutdown() {
  server.close();
  try {
    await pool.end();
  } catch (error) {
    console.error("Database shutdown error:", error.code || error.message);
  }
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
