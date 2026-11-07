"use strict";

/*
 * ESSAI SANS ENVOI : deux fausses decisions en vraie base PostgreSQL,
 * avec le role SQL limite cse_registration_reviewer.
 *
 * Toutes les ecritures sont annulees par ROLLBACK.
 * Aucun compte, aucune notification persistante, aucun email transmis.
 */
const fs = require("node:fs");
const {randomUUID} = require("node:crypto");
const {Client} = require("pg");
const {decideRequestInTransaction} = require("./registration-review");

async function main() {
  if (process.env.DB_ADMIN_USER !== "cse_dbadmin" ||
      (process.env.DB_NAME || "cse_educatif") !== "cse_educatif") {
    throw new Error("Service prive de migration SQL requis.");
  }
  const password = fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password",
    "utf8"
  ).trim();
  const db = new Client({
    host:process.env.DB_HOST || "db",
    port:Number(process.env.DB_PORT || 5432),
    database:"cse_educatif",
    user:"cse_dbadmin",
    password,
    connectionTimeoutMillis:5000,
    statement_timeout:15000,
    query_timeout:15000
  });
  await db.connect();
  let inTransaction=false, ids=[];
  try {
    await db.query("BEGIN");
    inTransaction=true;
    const sites=await db.query(
      "SELECT code FROM cse.establishments WHERE active=true ORDER BY code LIMIT 1"
    );
    if (sites.rowCount!==1) throw new Error("Aucun etablissement actif pour le test.");
    const code=sites.rows[0].code;

    for (const decision of ["approved","rejected"]) {
      const email="notification-fictive-"+randomUUID()+"@example.invalid";
      const created=await db.query([
        "INSERT INTO cse.registration_requests",
        "(email, first_name, last_name, establishment_number)",
        "VALUES($1,'DEMONSTRATION','FICTIF NOTIFICATION',$2) RETURNING id"
      ].join("\n"),[email,code]);
      if (created.rowCount!==1) throw new Error("Demande fictive non creee.");
      ids.push({id:created.rows[0].id,decision});
    }

    // Teste les autorisations REELLES du role de revue prive.
    await db.query("SET LOCAL ROLE cse_registration_reviewer");
    const role=await db.query("SELECT current_user AS name");
    if (role.rows[0].name!=="cse_registration_reviewer") {
      throw new Error("Role de validation non applique.");
    }
    for (const {id,decision} of ids) {
      const result=await decideRequestInTransaction(db,id,decision);
      if (result.status!=="recorded" || result.decision!==decision ||
          result.notificationPrepared!==true ||
          result.accountActivated!==false || result.emailSent!==false) {
        throw new Error("Decision de test incorrecte.");
      }
      const replay=await decideRequestInTransaction(db,id,decision);
      if (replay.status!=="not_pending") {
        throw new Error("Une decision ne doit pas etre traitee deux fois.");
      }
    }
    await db.query("RESET ROLE");

    const notices=await db.query([
      "SELECT n.template, n.delivery_status, n.audience, n.recipient_email",
      "FROM cse.email_outbox n",
      "WHERE n.request_id = ANY($1::uuid[]) ORDER BY n.template"
    ].join("\n"),[ids.map(x=>x.id)]);
    if (notices.rowCount!==2 ||
        notices.rows.some(row=>
          !["registration_approved","registration_rejected"].includes(row.template) ||
          row.delivery_status!=="not_configured" ||
          row.audience!=="employee" ||
          row.recipient_email!==null)) {
      throw new Error("Notifications fictives incorrectes ou adressee sans verification.");
    }
    const requestStatuses=await db.query([
      "SELECT id,status FROM cse.registration_requests",
      "WHERE id=ANY($1::uuid[])"
    ].join("\n"),[ids.map(x=>x.id)]);
    if (requestStatuses.rowCount!==2 ||
        ids.some(entry=>!requestStatuses.rows.some(
          row=>row.id===entry.id&&row.status===entry.decision
        ))) {
      throw new Error("Statuts administratifs incorrects.");
    }

    const audit=await db.query([
      "SELECT COUNT(*)::integer AS total FROM cse.audit_events",
      "WHERE object_id=ANY($1::uuid[]) AND action='registration.reviewed'"
    ].join("\n"),[ids.map(x=>x.id)]);
    if (Number(audit.rows[0].total)!==2) {
      throw new Error("Audit des decisions incomplet.");
    }

    await db.query("ROLLBACK");
    inTransaction=false;
    const remaining=await db.query(
      "SELECT COUNT(*)::integer AS total FROM cse.registration_requests WHERE id=ANY($1::uuid[])",
      [ids.map(x=>x.id)]
    );
    if (Number(remaining.rows[0].total)!==0) {
      throw new Error("Donnees fictives non annulees.");
    }
    console.log(JSON.stringify({
      status:"ok",
      role:"cse_registration_reviewer",
      approvedDecision:"recorded",
      rejectedDecision:"recorded",
      duplicateDecisionsPrevented:true,
      outboxEntriesCreated:2,
      deliveryStatus:"not_configured",
      recipientAddressesStored:false,
      auditEntriesCreated:2,
      rolledBack:true,
      persisted:false,
      accountsCreated:false,
      emailsSent:false
    }));
  } finally {
    if (inTransaction) {
      try { await db.query("ROLLBACK"); } catch { /* best effort */ }
    }
    await db.end();
  }
}
if (require.main===module) {
  main().catch(error=>{
    // Aucune sortie de contenu SQL, de donnee utilisateur ou de secret.
    console.error("Test notifications fictives :",error.code||"failed");
    process.exitCode=1;
  });
}
