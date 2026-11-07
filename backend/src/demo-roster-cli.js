"use strict";

/**
 * Controle et nettoyage d'un SEUL lot de demonstration fictif.
 * L'operateur doit d'abord televerser le CSV d'exemple via le panneau SSH.
 * Aucune donnee RH reelle n'est acceptee par cette commande.
 *
 * Inspecter :
 *   node src/demo-roster-cli.js check
 * Effacer SEULEMENT le lot fictif :
 *   node src/demo-roster-cli.js cleanup --confirm-demo-cleanup
 *
 * A executer avec les secrets du service prive "migrate", jamais via HTTP.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { analyzeCsv } = require("./roster-import");

const demoFile = path.join(__dirname, "..", "examples", "DEMO_eligibilite_salaries.csv");
const fixture = analyzeCsv(fs.readFileSync(demoFile, "utf8"));

if (fixture.summary.rows !== 3 ||
    fixture.summary.ambiguousGroups !== 1 ||
    fixture.summary.duplicateRows !== 1 ||
    fixture.entries.some(x => x.lastName !== "FICTIFTEST") ||
    fixture.entries.map(x => x.firstName + ":" + x.establishmentNumber).join(",") !==
      "ALPHA:01,BETA:05,ALPHA:01") {
  throw new Error("Contenu du fichier CSV fictif inattendu : execution refusee.");
}

function assertSameDemoEntries(rows) {
  if (rows.length !== fixture.entries.length) {
    throw new Error("Le lot ne correspond pas exactement au fichier fictif : nettoyage refuse.");
  }
  for (let i = 0; i < rows.length; i++) {
    const expected = fixture.entries[i];
    const actual = rows[i];
    if (Number(actual.source_line) !== expected.sourceLine ||
        actual.last_name !== expected.lastName ||
        actual.first_name !== expected.firstName ||
        actual.establishment_number !== expected.establishmentNumber ||
        actual.match_key !== expected.matchKey) {
      throw new Error("Une ligne differe du CSV fictif : nettoyage refuse.");
    }
  }
}

async function main(command) {
  if (process.env.DB_ADMIN_USER !== "cse_dbadmin" ||
      (process.env.DB_NAME || "cse_educatif") !== "cse_educatif") {
    throw new Error("Service d'administration SQL attendu.");
  }
  const secret = fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password",
    "utf8"
  ).trim();
  const pool = new Pool({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: "cse_educatif",
    user: "cse_dbadmin",
    password: secret,
    max: 1,
    connectionTimeoutMillis: 5000
  });
  const client = await pool.connect();
  let transaction = false;
  try {
    await client.query("BEGIN");
    transaction = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [92170420]);

    const match = await client.query([
      "SELECT id, status, rows_count FROM cse.roster_imports",
      "WHERE file_sha256 = $1 FOR UPDATE"
    ].join("\n"), [fixture.sha256]);

    if (match.rowCount === 0) {
      await client.query("COMMIT");
      transaction = false;
      console.log(JSON.stringify({
        status: "not_found",
        demoRows: 0,
        fingerprint: fixture.sha256.slice(0, 12),
        dataModified: false
      }));
      return;
    }
    if (match.rowCount !== 1) throw new Error("Nombre de lots inattendu.");
    const lot = match.rows[0];
    if (!["staged", "active", "archived"].includes(lot.status) ||
        Number(lot.rows_count) !== fixture.entries.length) {
      throw new Error("Statut ou nombre de lignes inattendu : nettoyage refuse.");
    }

    const entries = await client.query([
      "SELECT source_line, last_name, first_name, establishment_number, match_key",
      "FROM cse.roster_entries WHERE import_id = $1 ORDER BY source_line"
    ].join("\n"), [lot.id]);
    assertSameDemoEntries(entries.rows);

    if (command === "check") {
      await client.query("COMMIT");
      transaction = false;
      console.log(JSON.stringify({
        status: "demo_found",
        importStatus: lot.status,
        demoRows: fixture.summary.rows,
        identicalIdentityGroups: fixture.summary.ambiguousGroups,
        fingerprint: fixture.sha256.slice(0, 12),
        dataModified: false
      }));
      return;
    }

    // Avant de retirer un faux lot actif, s'assurer qu'aucune autre
    // liste precedemment active n'a ete archivee. Dans ce cas, restituer
    // d'abord le bon lot via le panneau, puis relancer cette commande.
    if (lot.status === "active") {
      const previous = await client.query([
        "SELECT COUNT(*)::int AS total FROM cse.roster_imports",
        "WHERE id <> $1 AND status = 'archived'"
      ].join("\n"), [lot.id]);
      if (Number(previous.rows[0].total) > 0) {
        throw new Error(
          "Autres lots archives presents : retablir la bonne liste active avant nettoyage."
        );
      }
    }

    // Ne jamais supprimer des entrees rattachees a une demande ou a un
    // compte, meme si le CSV correspond au fichier fictif attendu.
    const references = await client.query([
      "SELECT",
      "  (SELECT count(*)::int FROM cse.accounts a",
      "     JOIN cse.roster_entries e ON e.id = a.matched_roster_entry_id",
      "     WHERE e.import_id = $1) AS accounts_count,",
      "  (SELECT count(*)::int FROM cse.registration_requests r",
      "     JOIN cse.roster_entries e ON e.id = r.matched_roster_entry_id",
      "     WHERE e.import_id = $1) AS requests_count"
    ].join("\n"), [lot.id]);
    const refs = references.rows[0];
    if (Number(refs.accounts_count) !== 0 || Number(refs.requests_count) !== 0) {
      throw new Error("Le lot est reference par des dossiers : nettoyage refuse.");
    }

    const removedEntries = await client.query(
      "DELETE FROM cse.roster_entries WHERE import_id = $1",
      [lot.id]
    );
    if (removedEntries.rowCount !== fixture.entries.length) {
      throw new Error("Nombre de lignes supprimees inattendu.");
    }
    const removedLot = await client.query(
      "DELETE FROM cse.roster_imports WHERE id = $1",
      [lot.id]
    );
    if (removedLot.rowCount !== 1) throw new Error("Suppression du lot impossible.");

    await client.query("COMMIT");
    transaction = false;
    console.log(JSON.stringify({
      status: "demo_cleaned",
      deletedFictitiousRows: removedEntries.rowCount,
      deletedFictitiousImports: removedLot.rowCount,
      priorStatus: lot.status,
      mailsSent: false,
      auditTrailRetained: true
    }));
  } finally {
    if (transaction) {
      try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    }
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const cmd = process.argv[2];
  const valid = (cmd === "check" && process.argv.length === 3) ||
    (cmd === "cleanup" &&
      process.argv[3] === "--confirm-demo-cleanup" &&
      process.argv.length === 4);
  if (!valid) {
    console.error("Usage: check | cleanup --confirm-demo-cleanup");
    process.exitCode = 2;
  } else {
    main(cmd).catch(error => {
      console.error("Controle/nettoyage du CSV fictif :", error.code || error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { assertSameDemoEntries, fixture };
