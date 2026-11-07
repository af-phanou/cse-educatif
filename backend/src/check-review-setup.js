"use strict";

// Teste uniquement les permissions SQL du role de revue, sans lire de
// donnees personnelles ni effectuer d'ecriture.
const fs = require("node:fs");
const { Client } = require("pg");

async function main() {
  const password = fs.readFileSync(
    process.env.DB_PASSWORD_FILE || "/run/secrets/registration_reviewer_db_password",
    "utf8"
  ).trim();
  const db = new Client({
    host:process.env.DB_HOST || "db",
    port:Number(process.env.DB_PORT || 5432),
    database:process.env.DB_NAME || "cse_educatif",
    user:process.env.DB_USER || "cse_registration_reviewer",
    password,
    connectionTimeoutMillis:5000
  });
  await db.connect();
  try {
    const result = await db.query([
      "SELECT current_user AS role_name,",
      "has_column_privilege(current_user,'cse.registration_requests','email','SELECT') AS can_read_request_email,",
      "has_column_privilege(current_user,'cse.registration_requests','phone','SELECT') AS can_read_request_phone,",
      "has_column_privilege(current_user,'cse.registration_requests','status','UPDATE') AS can_decide,",
      "has_column_privilege(current_user,'cse.registration_requests','email','UPDATE') AS can_change_email,",
      "has_column_privilege(current_user,'cse.registration_reviews','status','UPDATE') AS can_review,",
      "has_column_privilege(current_user,'cse.audit_events','action','INSERT') AS can_audit,",
      "has_table_privilege(current_user,'cse.accounts','UPDATE') AS can_activate_accounts,",
      "has_table_privilege(current_user,'cse.roster_entries','SELECT') AS can_read_roster"
    ].join("\n"));
    const row = result.rows[0];
    const checks = {
      reviewer_role:row.role_name === "cse_registration_reviewer",
      can_read_minimal_request:row.can_read_request_email,
      cannot_read_phone:!row.can_read_request_phone,
      can_decide_and_review:row.can_decide && row.can_review,
      cannot_change_email:!row.can_change_email,
      audit_only_append:row.can_audit,
      cannot_activate_accounts:!row.can_activate_accounts,
      cannot_read_hr_roster:!row.can_read_roster
    };
    const good = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({status:good ? "ok" : "failed",checks}));
    if (!good) process.exitCode=1;
  } finally {
    await db.end();
  }
}
main().catch(error => {
  console.error("Verification du role de revue impossible:",error.code || "unknown");
  process.exitCode=1;
});
