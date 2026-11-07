"use strict";

/*
 * Gestion de maintenance via acces SSH au VPS et secret admin PostgreSQL.
 * PAS un endpoint HTTP. A remplacer/completer par une interface superadmin
 * apres authentification forte, autorisations serveur et audit par personne.
 */
const fs = require("node:fs");
const { Pool } = require("pg");
const {
  listAllEstablishments,
  upsertEstablishments
} = require("./establishments");

const command = process.argv[2];
if ((command !== "list" && command !== "upsert") ||
    (command === "upsert" && process.argv[3] !== "--stdin")) {
  console.error("Usage : node src/manage-establishments.js list | upsert --stdin");
  process.exit(2);
}

async function main() {
  const password = fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password",
    "utf8"
  ).trim();
  const pool = new Pool({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "cse_educatif",
    user: process.env.DB_ADMIN_USER || "cse_dbadmin",
    password,
    max: 1,
    connectionTimeoutMillis: 6000
  });
  try {
    if (command === "list") {
      console.log(JSON.stringify(await listAllEstablishments(pool), null, 2));
      return;
    }
    const contents = fs.readFileSync(0, "utf8");
    if (Buffer.byteLength(contents, "utf8") > 32768) {
      throw new Error("Fichier trop volumineux (max 32 Ko pour un lot).");
    }
    const batch = JSON.parse(contents);
    const client = await pool.connect();
    try {
      const items = await upsertEstablishments(client, batch, "vps_ssh");
      console.log(JSON.stringify({
        status: "saved",
        count: items.length,
        codes: items.map(row => row.code)
      }));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  // Ne pas ecrire la configuration de connexion, le CSV RH ni le secret.
  console.error("Gestion des etablissements :", error.code || "invalid_input", error.message);
  process.exitCode = 1;
});
