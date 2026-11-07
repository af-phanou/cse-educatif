"use strict";

/*
 * CLI de demonstration STRICTEMENT fictive. Aucune route HTTP.
 * Creation via le role cse_app, nettoyage via cse_dbadmin, jamais
 * avec de vraies coordonnees ni un vrai nom de salarie.
 *
 * Usage dans le conteneur API      : node src/demo-request-cli.js create
 * Usage dans le conteneur migrate  : node src/demo-request-cli.js cleanup --confirm-demo-cleanup
 */
const fs = require("node:fs");
const { Pool } = require("pg");
const { submitRegistrationRequest } = require("./registration-submission");

const DEMO = Object.freeze({
  firstName: "DEMONSTRATION",
  lastName: "FICTIF CSE",
  email: "demo-validation-cse@example.invalid"
});

function demoForm(establishmentNumber) {
  if (typeof establishmentNumber !== "string" ||
      !/^[A-Z0-9][A-Z0-9._/-]{0,19}$/.test(establishmentNumber)) {
    throw new Error("Code d'etablissement invalide.");
  }
  return {
    firstName: DEMO.firstName,
    lastName: DEMO.lastName,
    establishmentNumber,
    email: DEMO.email,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null
  };
}

function createPool({admin}) {
  const username = admin ? process.env.DB_ADMIN_USER : process.env.DB_USER;
  const required = admin ? "cse_dbadmin" : "cse_app";
  if (username !== required) throw new Error("Role SQL inattendu : execution interdite.");
  const filename = admin
    ? (process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password")
    : (process.env.DB_PASSWORD_FILE || "/run/secrets/app_db_password");
  const password = fs.readFileSync(filename, "utf8").trim();
  return new Pool({
    host:process.env.DB_HOST || "db",
    port:Number(process.env.DB_PORT || 5432),
    user:username,
    database:process.env.DB_NAME || "cse_educatif",
    password,
    max:1,
    connectionTimeoutMillis:5000
  });
}

async function create() {
  const pool = createPool({admin:false});
  try {
    const result = await pool.query([
      "SELECT code FROM cse.establishments",
      "WHERE active = true ORDER BY display_order, code LIMIT 1"
    ].join("\n"));
    if (!result.rows.length) throw new Error("Aucun etablissement actif pour la demonstration.");
    await submitRegistrationRequest(pool, demoForm(result.rows[0].code));
    console.log(JSON.stringify({
      status:"submitted_or_already_pending",
      testDataOnly:true,
      accountActivated:false,
      emailSent:false,
      instruction:"Actualiser le panneau prive des demandes pour voir le dossier fictif."
    }));
  } finally {
    await pool.end();
  }
}

async function cleanup() {
  const pool = createPool({admin:true});
  const client = await pool.connect();
  let transaction = false;
  try {
    await client.query("BEGIN");
    transaction = true;
    // Filtre strict : impossible de supprimer un autre dossier,
    // y compris un eventuel enregistrement avec cette meme adresse
    // mais un vrai nom. Les notifications tests se suppriment en cascade.
    const result = await client.query([
      "DELETE FROM cse.registration_requests",
      "WHERE email = $1 AND first_name = $2 AND last_name = $3",
      "  AND email_verified_at IS NULL",
      "RETURNING id"
    ].join("\n"), [DEMO.email,DEMO.firstName,DEMO.lastName]);
    await client.query("COMMIT");
    transaction = false;
    // Ne pas supprimer l'historique d'audit append-only.
    console.log(JSON.stringify({
      status:"demo_cleaned",
      deletedFictitiousRequests:result.rowCount,
      emailSent:false,
      auditTrailRetained:true
    }));
  } finally {
    if (transaction) {
      try { await client.query("ROLLBACK"); } catch { /* nettoyage partiel impossible */ }
    }
    client.release();
    await pool.end();
  }
}

async function main() {
  if (process.argv[2] === "create" && process.argv.length === 3) return create();
  if (process.argv[2] === "cleanup" &&
      process.argv[3] === "--confirm-demo-cleanup" && process.argv.length === 4) {
    return cleanup();
  }
  throw new Error("Usage: create | cleanup --confirm-demo-cleanup");
}
if (require.main === module) {
  main().catch(error => {
    console.error("Test fictif impossible :", error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = { DEMO, demoForm };
