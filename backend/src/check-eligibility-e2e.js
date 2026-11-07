"use strict";

/**
 * Test d'integration REEL avec PostgreSQL, sans enregistrer de donnees.
 *
 * - charge temporairement 3 identites STRICTEMENT fictives (CSV de demo) ;
 * - interroge la vraie requete SQL de verification d'inscription ;
 * - teste correspondance unique, homonymes, absence, etablissement inconnu ;
 * - annule toutes les modifications par ROLLBACK, meme en cas d'erreur ;
 * - refuse de demarrer si un autre lot RH est actif.
 *
 * A lancer exclusivement sur le service Docker "migrate" du VPS.
 * Aucun endpoint HTTP, compte, mot de passe ou email n'est cree.
 */
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const { Client } = require("pg");
const { fixture } = require("./demo-roster-cli");
const { prepareRegistration } = require("./registration");

const LOCK_ID = 92170420;

function assertClassification(actual, status, reason, matched) {
  if (!actual || actual.internalStatus !== status ||
      actual.reviewReason !== reason ||
      Boolean(actual.matchedRosterEntryId) !== Boolean(matched) ||
      actual.publicStatus !== "verification_pending" ||
      actual.persisted !== false || actual.emailSent !== false) {
    throw new Error("Une verification d'eligibilite a donne un resultat inattendu.");
  }
  return true;
}

function fictitiousForm(firstName, establishmentNumber) {
  return {
    firstName, lastName: "FICTIFTEST", establishmentNumber,
    email: "simulation-eligibilite@example.invalid",
    phone: null, addressLine1: null, addressLine2: null,
    postalCode: null, city: null
  };
}

async function main() {
  if (process.env.DB_ADMIN_USER !== "cse_dbadmin" ||
      (process.env.DB_NAME || "cse_educatif") !== "cse_educatif") {
    throw new Error("Le conteneur SQL de maintenance est obligatoire.");
  }
  if (fixture.entries.length !== 3 ||
      fixture.summary.ambiguousGroups !== 1 ||
      fixture.entries.some(entry => entry.lastName !== "FICTIFTEST")) {
    throw new Error("Le fichier de demonstration est invalide.");
  }

  const password = fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password",
    "utf8"
  ).trim();
  const client = new Client({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: "cse_educatif",
    user: "cse_dbadmin",
    password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    query_timeout: 15000
  });

  await client.connect();
  let transactionOpen = false;
  let testImportId;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);

    // Ne pas remplacer ni archiver une vraie liste RH deja active.
    const active = await client.query(
      "SELECT COUNT(*)::int AS total FROM cse.roster_imports WHERE status='active'"
    );
    if (Number(active.rows[0].total) !== 0) {
      throw new Error("Un autre CSV est deja actif : test refuse pour ne pas perturber l'eligibilite.");
    }

    const sites = await client.query(
      "SELECT code FROM cse.establishments WHERE active=true AND code=ANY($1::text[])",
      [["01", "05"]]
    );
    if (sites.rowCount !== 2) {
      throw new Error("Les etablissements fictifs 01 et 05 doivent etre actifs.");
    }

    // Sans import actif : toute inscription demande un examen manuel.
    const before = await prepareRegistration(client, fictitiousForm("BETA", "05"));
    assertClassification(before, "manual_review", "no_active_roster", false);

    const fingerprint = randomBytes(32).toString("hex");
    const inserted = await client.query([
      "INSERT INTO cse.roster_imports(file_sha256,status,rows_count,activated_at)",
      "VALUES($1,'active',$2,now()) RETURNING id"
    ].join("\n"), [fingerprint,fixture.entries.length]);
    testImportId = inserted.rows[0].id;

    for (const entry of fixture.entries) {
      await client.query([
        "INSERT INTO cse.roster_entries",
        "(import_id,source_line,last_name,first_name,establishment_number,match_key)",
        "VALUES($1,$2,$3,$4,$5,$6)"
      ].join("\n"), [
        testImportId, entry.sourceLine,entry.lastName,
        entry.firstName,entry.establishmentNumber,entry.matchKey
      ]);
    }

    const recognized = await prepareRegistration(client, fictitiousForm("BETA", "05"));
    assertClassification(recognized, "eligible_provisional", null, true);

    const homonym = await prepareRegistration(client, fictitiousForm("ALPHA", "01"));
    assertClassification(homonym, "manual_review", "ambiguous", false);

    const missing = await prepareRegistration(client, fictitiousForm("INCONNU", "01"));
    assertClassification(missing, "manual_review", "not_found", false);

    const otherSite = await prepareRegistration(client, fictitiousForm("BETA", "01"));
    assertClassification(otherSite, "manual_review", "not_found", false);

    const unknownSite = await prepareRegistration(client, fictitiousForm("BETA", "99"));
    assertClassification(unknownSite, "manual_review", "establishment_unavailable", false);

    // Les 6 verifications se font contre la VRAIE base, pas des mockups.
    await client.query("ROLLBACK");
    transactionOpen = false;

    const remaining = await client.query(
      "SELECT COUNT(*)::int AS total FROM cse.roster_imports WHERE id=$1",
      [testImportId]
    );
    const stillActive = await client.query(
      "SELECT COUNT(*)::int AS total FROM cse.roster_imports WHERE status='active'"
    );
    if (Number(remaining.rows[0].total) !== 0 ||
        Number(stillActive.rows[0].total) !== 0) {
      throw new Error("Echec de la verification de nettoyage par ROLLBACK.");
    }

    console.log(JSON.stringify({
      status:"ok",
      scenarios:{
        no_active_csv:"manual_review",
        recognized_once:"eligible_provisional",
        identical_identities:"manual_review",
        absent_from_csv:"manual_review",
        different_establishment:"manual_review",
        unknown_establishment:"manual_review"
      },
      testedAgainst:"postgresql_real",
      rolledBack:true,
      demoRosterPersisted:false,
      employeeAccountCreated:false,
      emailsSent:false
    }));
  } finally {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    }
    await client.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    // Ne jamais afficher de requete SQL, identite ni secret depuis le driver.
    console.error("Test reel d'eligibilite :", error.code || (
      error.message.startsWith("Un autre CSV") ||
      error.message.startsWith("Les etablissements") ||
      error.message.startsWith("Le conteneur SQL") ||
      error.message.startsWith("Le fichier") ||
      error.message.startsWith("Une verification") ||
      error.message.startsWith("Echec de la verification")
        ? error.message : "echec"
    ));
    process.exitCode = 1;
  });
}

module.exports = { assertClassification, fictitiousForm };
