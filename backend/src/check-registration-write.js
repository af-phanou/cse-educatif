"use strict";

// Test d'insertion REELLE en transaction ROLLBACK, avec identite fictive.
// Aucun nom, email ou dossier ne demeure en base apres le controle.
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
const { INSERT_REQUEST_SQL } = require("./registration-submission");

async function main() {
  const password = fs.readFileSync(
    process.env.DB_PASSWORD_FILE || "/run/secrets/app_db_password", "utf8"
  ).trim();
  const client = new Client({
    host: process.env.DB_HOST || "db",
    database: process.env.DB_NAME || "cse_educatif",
    user: process.env.DB_USER || "cse_app",
    password,
    connectionTimeoutMillis: 5000
  });
  await client.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const email = "controle-" + randomUUID() + "@example.invalid";
    const inserted = await client.query(INSERT_REQUEST_SQL, [
      email, "FICTIF", "TEST", "01",
      null, null, null, null, null, null, "not_found"
    ]);
    if (inserted.rowCount !== 1) {
      throw new Error("Une demande fictive n'a pas pu etre inseree.");
    }
    const requestId = inserted.rows[0].id;
    await client.query(
      "INSERT INTO cse.registration_reviews(request_id,reason) VALUES ($1,$2)",
      [requestId,"not_found"]
    );
    await client.query(
      "INSERT INTO cse.email_outbox(request_id,recipient_email,audience,template) " +
        "VALUES ($1,$2,'employee','registration_received')",
      [requestId,email]
    );
    await client.query(
      "INSERT INTO cse.audit_events(action,object_type,object_id,metadata) " +
        "VALUES ($1,$2,$3,$4::jsonb)",
      ["registration.requested","registration_request",requestId,"{}"]
    );
    await client.query("ROLLBACK");
    inTransaction = false;
    console.log(JSON.stringify({status:"ok",write_test:"rolled_back",persisted:false,emails_sent:false}));
  } finally {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    }
    await client.end();
  }
}

main().catch(error => {
  // Code seul pour eviter de journaliser une valeur privee renvoyee par SQL.
  console.error("Test transaction inscription : ", error.code || "failed");
  process.exitCode = 1;
});
