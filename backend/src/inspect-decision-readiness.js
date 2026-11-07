"use strict";

/**
 * Etat des preconditions des notifications de decision.
 *
 * STRICTEMENT LECTURE SEULE :
 * - aucune lecture d'adresses, de noms, ni de jetons dans le resultat ;
 * - aucun passage du mot de passe SMTP ;
 * - aucune file traitee et aucun changement de statut.
 *
 * A executer ponctuellement avec le compte de maintenance SQL prive.
 * Le simple fait de satisfaire les preconditions n'autorise PAS un envoi.
 */

const fs = require("node:fs");
const { Client } = require("pg");

const READINESS_SQL = [
  "WITH evaluation AS (",
  "  SELECT CASE",
  "    WHEN n.delivery_status <> 'not_configured'",
  "      THEN 'unexpected_delivery_state'",
  "    WHEN n.template NOT IN ('registration_approved','registration_rejected')",
  "      THEN 'template_outside_scope'",
  "    WHEN n.audience <> 'employee' THEN 'unexpected_audience'",
  "    WHEN n.recipient_email IS NOT NULL THEN 'unexpected_recipient_stored'",
  "    WHEN r.email_verified_at IS NULL THEN 'email_not_verified'",
  "    WHEN r.expires_at <= now() THEN 'registration_expired'",
  "    WHEN (n.template = 'registration_approved' AND r.status <> 'approved')",
  "      OR (n.template = 'registration_rejected' AND r.status <> 'rejected')",
  "      THEN 'decision_status_mismatch'",
  "    ELSE 'conditions_met_sending_disabled'",
  "  END AS condition",
  "  FROM cse.email_outbox AS n",
  "  JOIN cse.registration_requests AS r ON r.id = n.request_id",
  "  WHERE ($1::uuid[] IS NULL OR n.request_id = ANY($1::uuid[]))",
  ")",
  "SELECT condition, COUNT(*)::integer AS total",
  "FROM evaluation GROUP BY condition ORDER BY condition"
].join("\n");

async function inspectDecisionReadiness(db, requestIds = null) {
  if (!db || typeof db.query !== "function") throw new TypeError("Connexion SQL requise.");
  if (requestIds !== null && (
    !Array.isArray(requestIds) || requestIds.length > 20 ||
    requestIds.some(id => typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  )) throw new Error("Selection de demandes incorrecte.");
  const result = await db.query(READINESS_SQL, [requestIds]);
  return {
    status: "ok",
    mode: "read_only",
    sendingEnabled: false,
    smtpInvoked: false,
    recipientsDisclosed: false,
    conditions: result.rows.map(row => ({
      condition: row.condition,
      count: Number(row.total)
    }))
  };
}

async function main() {
  if (process.env.DB_ADMIN_USER !== "cse_dbadmin") {
    throw new Error("Acces de maintenance prive requis.");
  }
  const password = fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password", "utf8"
  ).trim();
  const db = new Client({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "cse_educatif",
    user: "cse_dbadmin",
    password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000
  });
  await db.connect();
  try {
    console.log(JSON.stringify(await inspectDecisionReadiness(db)));
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("Controle des preconditions email :", error.code || "failed");
    process.exitCode = 1;
  });
}

module.exports = { READINESS_SQL, inspectDecisionReadiness };
