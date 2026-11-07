"use strict";

// Verification NON intrusive des privileges du compte API.
// N'ecrit aucune donnee et n'affiche aucun secret ni donnees de salaries.
const fs = require("node:fs");
const { Client } = require("pg");

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
  try {
    const result = await client.query([
      "SELECT current_user AS role_name,",
      "has_column_privilege(current_user, 'cse.registration_requests', 'email', 'INSERT') AS can_submit,",
      "has_column_privilege(current_user, 'cse.registration_requests', 'status', 'INSERT') AS can_set_status,",
      "has_table_privilege(current_user, 'cse.registration_requests', 'UPDATE') AS can_change_status,",
      "has_table_privilege(current_user, 'cse.registration_requests', 'DELETE') AS can_delete,",
      "has_column_privilege(current_user, 'cse.roster_entries', 'match_key', 'SELECT') AS can_match_csv,",
      "has_column_privilege(current_user, 'cse.accounts', 'email', 'SELECT') AS can_read_accounts,",
      "has_column_privilege(current_user, 'cse.email_outbox', 'recipient_email', 'INSERT') AS can_prepare_email"
    ].join("\n"));
    const r = result.rows[0];
    const checks = {
      api_role_limited: r.role_name === "cse_app",
      registration_insert_only: r.can_submit && !r.can_set_status &&
        !r.can_change_status && !r.can_delete,
      csv_match_read_only: r.can_match_csv,
      account_emails_not_readable: !r.can_read_accounts,
      unsent_email_queue_ready: r.can_prepare_email
    };
    const passed = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ status:passed ? "ok" : "failed", checks }));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error("Verification SQL impossible :", error.code || "unknown");
  process.exitCode = 1;
});
