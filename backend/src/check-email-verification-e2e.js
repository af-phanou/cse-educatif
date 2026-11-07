"use strict";

/**
 * Test PostgreSQL de la verification email dans UNE transaction ROLLBACK.
 *
 * - cree deux demandes DEMONSTRATION FICTIF EMAIL sur example.invalid ;
 * - genere un jeton aleatoire a usage unique ;
 * - teste le premier clic, un rejeu et un jeton deja expire ;
 * - bascule sur le role SQL cse_email_verifier AVANT les operations
 *   sensibles pour verifier que ses privileges sont suffisants ;
 * - ROLLBACK efface les demandes, challenges et logs du test.
 *
 * Pas de jeton brut, adresse, mot de passe ou mail dans la sortie.
 */
const fs = require("node:fs");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const { Client } = require("pg");
const {
  mintEmailToken,
  issueChallengeInTransaction,
  consumeChallengeInTransaction
} = require("./email-verification");

const DEMO_NAME = "DEMONSTRATION";
const DEMO_LAST = "FICTIF EMAIL";

function check(result,status) {
  if (!result || result.status!==status ||
      result.accountActivated!==false || result.emailSent!==false) {
    throw new Error("Etape de verification email inattendue.");
  }
}

function makeDb() {
  if (process.env.DB_ADMIN_USER!=="cse_dbadmin" ||
      (process.env.DB_NAME || "cse_educatif")!=="cse_educatif") {
    throw new Error("Service de maintenance SQL requis.");
  }
  const password=fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password",
    "utf8"
  ).trim();
  return new Client({
    host:process.env.DB_HOST || "db",
    port:Number(process.env.DB_PORT || 5432),
    database:"cse_educatif",
    user:"cse_dbadmin",
    password,
    connectionTimeoutMillis:5000,
    statement_timeout:15000,
    query_timeout:15000
  });
}

async function createFictitiousRequest(client) {
  const email="email-test-"+randomUUID()+"@example.invalid";
  const result=await client.query([
    "INSERT INTO cse.registration_requests",
    "(email,first_name,last_name,establishment_number)",
    "VALUES($1,$2,$3,'01') RETURNING id"
  ].join("\n"),[email,DEMO_NAME,DEMO_LAST]);
  if(result.rowCount!==1)throw new Error("Insertion demo impossible.");
  return result.rows[0].id;
}

async function main() {
  const db=makeDb();
  await db.connect();
  let inTransaction=false,firstId,expiredId;
  try {
    await db.query("BEGIN");
    inTransaction=true;
    const site=await db.query(
      "SELECT code FROM cse.establishments WHERE code='01' AND active=true"
    );
    if(site.rowCount!==1)throw new Error("Etablissement fictif 01 absent.");

    firstId=await createFictitiousRequest(db);
    expiredId=await createFictitiousRequest(db);

    // Challenge expire : cree uniquement par le compte SQL de maintenance
    // pour le test, sans demander de privilege inutile au role dedie.
    const expired=mintEmailToken();
    await db.query([
      "INSERT INTO cse.registration_email_challenges",
      "(request_id,token_hash,created_at,expires_at)",
      "VALUES($1,$2,now()-interval '2 hours',now()-interval '1 hour')"
    ].join("\n"),[expiredId,expired.tokenHash]);

    // Basculer sur les droits du VRAI compte applicatif de verification.
    await db.query("SET LOCAL ROLE cse_email_verifier");
    const role=await db.query("SELECT current_user AS username");
    if(role.rows[0].username!=="cse_email_verifier") {
      throw new Error("Role limite non actif.");
    }
    const issued=await issueChallengeInTransaction(db,firstId);
    if(!issued.issued || typeof issued.rawToken!=="string") {
      throw new Error("Generation du jeton impossible.");
    }

    // La base conserve seulement l'empreinte du jeton.
    const stored=await db.query([
      "SELECT token_hash FROM cse.registration_email_challenges",
      "WHERE request_id=$1"
    ].join("\n"),[firstId]);
    if(stored.rowCount!==1 ||
        String(stored.rows[0].token_hash).trim()===issued.rawToken ||
        String(stored.rows[0].token_hash).trim()!==createHash("sha256")
          .update(issued.rawToken,"ascii").digest("hex")) {
      throw new Error("Le secret brut ne doit pas etre conserve.");
    }

    const first=await consumeChallengeInTransaction(db,issued.rawToken);
    check(first,"verified");

    const replay=await consumeChallengeInTransaction(db,issued.rawToken);
    check(replay,"invalid_or_expired");

    const tooLate=await consumeChallengeInTransaction(db,expired.rawToken);
    check(tooLate,"invalid_or_expired");

    const unknown=await consumeChallengeInTransaction(db,randomBytes(32).toString("hex"));
    check(unknown,"invalid_or_expired");

    const invalidFormat=await consumeChallengeInTransaction(db,"unlieninvalide");
    check(invalidFormat,"invalid_or_expired");

    const after=await db.query([
      "SELECT email_verified_at,status FROM cse.registration_requests",
      "WHERE id=$1"
    ].join("\n"),[firstId]);
    if(after.rowCount!==1 ||
        after.rows[0].email_verified_at==null ||
        after.rows[0].status!=="pending") {
      throw new Error("Seule l'adresse email doit etre verifiee.");
    }

    await db.query("ROLLBACK");
    inTransaction=false;
    const remains=await db.query([
      "SELECT COUNT(*)::integer AS total FROM cse.registration_requests",
      "WHERE id=ANY($1::uuid[])"
    ].join("\n"),[[firstId,expiredId]]);
    if(Number(remains.rows[0].total)!==0){
      throw new Error("La transaction fictive n'a pas ete annulee.");
    }
    console.log(JSON.stringify({
      status:"ok",
      testedAgainst:"postgresql_real",
      role:"cse_email_verifier",
      firstUse:"verified",
      replay:"invalid_or_expired",
      expiredToken:"invalid_or_expired",
      unknownToken:"invalid_or_expired",
      invalidFormat:"invalid_or_expired",
      originalTokenStored:false,
      emailValidityMinutes:30,
      requestStatusUnchanged:true,
      rolledBack:true,
      accountsCreated:false,
      emailsSent:false
    }));
  } finally {
    if(inTransaction) {
      try{await db.query("ROLLBACK");}catch{/* best effort */}
    }
    await db.end();
  }
}

if(require.main===module){
  main().catch(error=>{
    // Ne jamais recopier une erreur contenant le contenu d'une requete.
    console.error("Test verification email :",error.code || "failed");
    process.exitCode=1;
  });
}
module.exports={check,DEMO_NAME,DEMO_LAST};
