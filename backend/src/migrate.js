"use strict";

// Migration privee : executee seulement par le service Docker « migrate ».
// Aucun secret n'est imprime dans les journaux.
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function readSecret(file) {
  const secret = fs.readFileSync(file, "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error("Format du secret de base de donnees invalide (64 caracteres hexadecimaux attendus).");
  }
  return secret;
}

async function main() {
  const adminPassword = readSecret(process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password");
  const appPassword = readSecret(process.env.APP_DB_PASSWORD_FILE || "/run/secrets/app_db_password");
  const managerPassword = readSecret(process.env.ESTABLISHMENTS_DB_PASSWORD_FILE || "/run/secrets/establishments_db_password");
  const reviewerPassword = readSecret(process.env.REVIEWER_DB_PASSWORD_FILE || "/run/secrets/registration_reviewer_db_password");
  const rosterPassword = readSecret(process.env.ROSTER_DB_PASSWORD_FILE || "/run/secrets/roster_db_password");
  const emailVerifierPassword = readSecret(process.env.EMAIL_VERIFIER_DB_PASSWORD_FILE || "/run/secrets/email_verifier_db_password");

  const pool = new Pool({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "cse_educatif",
    user: process.env.DB_ADMIN_USER || "cse_dbadmin",
    password: adminPassword,
    max: 1,
    connectionTimeoutMillis: 6000
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Evite deux migrations concurrentes (verrou libre en fin de transaction).
    await client.query("SELECT pg_advisory_xact_lock(92170418)");

    // Mot de passe dans une variable transactionnelle, sans interpolation JS.
    await client.query("SELECT set_config('cse.app_role_password', $1, true)", [appPassword]);
    await client.query([
      "DO $role$",
      "BEGIN",
      "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cse_app') THEN",
      "    EXECUTE format(",
      "      'CREATE ROLE cse_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.app_role_password')",
      "    );",
      "  ELSE",
      "    EXECUTE format(",
      "      'ALTER ROLE cse_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.app_role_password')",
      "    );",
      "  END IF;",
      "END",
      "$role$;"
    ].join("\n"));

    // Compte d'edition limite aux etablissements, reserve au panneau SSH.
    await client.query("SELECT set_config('cse.site_role_password', $1, true)", [managerPassword]);
    await client.query([
      "DO $role$",
      "BEGIN",
      "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cse_site_manager') THEN",
      "    EXECUTE format(",
      "      'CREATE ROLE cse_site_manager LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.site_role_password')",
      "    );",
      "  ELSE",
      "    EXECUTE format(",
      "      'ALTER ROLE cse_site_manager WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.site_role_password')",
      "    );",
      "  END IF;",
      "END",
      "$role$;"
    ].join("\n"));
    // Role de lecture/decision des inscriptions, distinct des autres services.
    await client.query("SELECT set_config('cse.reviewer_role_password', $1, true)", [reviewerPassword]);
    await client.query([
      "DO $role$",
      "BEGIN",
      "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cse_registration_reviewer') THEN",
      "    EXECUTE format(",
      "      'CREATE ROLE cse_registration_reviewer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.reviewer_role_password')",
      "    );",
      "  ELSE",
      "    EXECUTE format(",
      "      'ALTER ROLE cse_registration_reviewer WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.reviewer_role_password')",
      "    );",
      "  END IF;",
      "END",
      "$role$;"
    ].join("\n"));
    // Compte d'import CSV distinct, sans acces aux comptes ni aux emails.
    await client.query("SELECT set_config('cse.roster_role_password', $1, true)", [rosterPassword]);
    await client.query([
      "DO $role$",
      "BEGIN",
      "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cse_roster_manager') THEN",
      "    EXECUTE format(",
      "      'CREATE ROLE cse_roster_manager LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.roster_role_password')",
      "    );",
      "  ELSE",
      "    EXECUTE format(",
      "      'ALTER ROLE cse_roster_manager WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.roster_role_password')",
      "    );",
      "  END IF;",
      "END",
      "$role$;"
    ].join("\n"));
    // Compte de confirmation d'adresse distinct de l'API et des admins.
    await client.query("SELECT set_config('cse.email_role_password', $1, true)", [emailVerifierPassword]);
    await client.query([
      "DO $role$",
      "BEGIN",
      "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cse_email_verifier') THEN",
      "    EXECUTE format(",
      "      'CREATE ROLE cse_email_verifier LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.email_role_password')",
      "    );",
      "  ELSE",
      "    EXECUTE format(",
      "      'ALTER ROLE cse_email_verifier WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',",
      "      current_setting('cse.email_role_password')",
      "    );",
      "  END IF;",
      "END",
      "$role$;"
    ].join("\n"));
    await client.query("GRANT CONNECT ON DATABASE cse_educatif TO cse_app");
    await client.query("CREATE SCHEMA IF NOT EXISTS cse");
    await client.query("REVOKE ALL ON SCHEMA cse FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA cse TO cse_app");
    await client.query([
      "CREATE TABLE IF NOT EXISTS cse.schema_migrations (",
      "  version integer PRIMARY KEY,",
      "  filename text NOT NULL,",
      "  applied_at timestamptz NOT NULL DEFAULT now()",
      ");"
    ].join("\n"));

    const directory = path.join(__dirname, "..", "migrations");
    const files = fs.readdirSync(directory).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
    const applied = [];
    for (const file of files) {
      const version = Number(file.slice(0, 3));
      const existing = await client.query(
        "SELECT filename FROM cse.schema_migrations WHERE version = $1",
        [version]
      );
      if (existing.rowCount > 0) {
        if (existing.rows[0].filename !== file) {
          throw new Error("Conflit de version de migration : " + version);
        }
        continue;
      }
      await client.query(fs.readFileSync(path.join(directory, file), "utf8"));
      await client.query(
        "INSERT INTO cse.schema_migrations (version, filename) VALUES ($1, $2)",
        [version, file]
      );
      applied.push(file);
    }
    await client.query("COMMIT");
    console.log("Role cse_app configure avec privileges limites.");
    console.log("Role cse_site_manager configure avec privileges limites.");
    console.log("Role cse_registration_reviewer configure avec privileges limites.");
    console.log("Role cse_roster_manager configure avec privileges limites.");
    console.log("Role cse_email_verifier configure avec privileges limites.");
    console.log("Migrations appliquees :", applied.length ? applied.join(", ") : "aucune nouvelle");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    console.error("Echec migration :", error.code || "unknown", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("Connexion migration impossible :", error.code || "unknown", error.message);
  process.exitCode = 1;
});
