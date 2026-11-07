"use strict";

/*
 * Test integre PostgreSQL des CONDITIONS D'ENVOI sans SMTP.
 * Cinq demandes fictives @example.invalid, cinq notifications,
 * toutes inserees et supprimees dans une transaction ROLLBACK.
 * Ce script ne copie aucun identifiant de salarie et n'envoie rien.
 */
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
const { inspectDecisionReadiness } = require("./inspect-decision-readiness");

const SCENARIOS = [
  {
    status:"approved", verified:true, expired:false,
    template:"registration_approved",
    condition:"conditions_met_sending_disabled"
  },
  {
    status:"rejected", verified:false, expired:false,
    template:"registration_rejected",
    condition:"email_not_verified"
  },
  {
    status:"approved", verified:true, expired:false,
    template:"registration_rejected",
    condition:"decision_status_mismatch"
  },
  {
    status:"approved", verified:true, expired:true,
    template:"registration_approved",
    condition:"registration_expired"
  },
  {
    status:"pending", verified:true, expired:false,
    template:"registration_received",
    condition:"template_outside_scope"
  }
];

async function main() {
  if (process.env.DB_ADMIN_USER !== "cse_dbadmin" ||
      (process.env.DB_NAME || "cse_educatif") !== "cse_educatif") {
    throw new Error("Le service de maintenance prive est obligatoire.");
  }
  const password=fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE || "/run/secrets/postgres_password",
    "utf8"
  ).trim();
  const db = new Client({
    host:process.env.DB_HOST || "db",
    port:Number(process.env.DB_PORT || 5432),
    database:"cse_educatif",
    user:"cse_dbadmin", password,
    connectionTimeoutMillis:5000,
    statement_timeout:15000,
    query_timeout:15000
  });
  await db.connect();
  let inTransaction=false;
  let requestIds=[];
  try {
    await db.query("BEGIN");
    inTransaction=true;
    const sites=await db.query([
      "SELECT code FROM cse.establishments",
      "WHERE active = true ORDER BY code LIMIT 1"
    ].join("\n"));
    if(sites.rowCount!==1)throw new Error("Aucun etablissement de test.");
    const establishmentCode=sites.rows[0].code;

    for (const scenario of SCENARIOS) {
      const address="readiness-fictive-"+randomUUID()+"@example.invalid";
      const result=await db.query([
        "INSERT INTO cse.registration_requests",
        " (email,first_name,last_name,establishment_number,",
        "  status,email_verified_at,expires_at)",
        "VALUES($1,'DEMONSTRATION','FICTIF READINESS',$2,$3,",
        " CASE WHEN $4::boolean THEN now() ELSE NULL END,",
        " now() + $5::interval)",
        "RETURNING id"
      ].join("\n"),[
        address, establishmentCode, scenario.status, scenario.verified,
        scenario.expired ? "-1 day" : "1 day"
      ]);
      if(result.rowCount!==1)throw new Error("Creation fictive echouee.");
      const id=result.rows[0].id;
      requestIds.push(id);
      const outbox=await db.query([
        "INSERT INTO cse.email_outbox",
        "(request_id,recipient_email,audience,template)",
        "VALUES ($1,NULL,'employee',$2) RETURNING id"
      ].join("\n"),[id,scenario.template]);
      if(outbox.rowCount!==1)throw new Error("Notification fictive echouee.");
    }

    const inspected=await inspectDecisionReadiness(db,requestIds);
    if(inspected.status!=="ok" || inspected.sendingEnabled!==false ||
       inspected.smtpInvoked!==false || inspected.recipientsDisclosed!==false ||
       inspected.conditions.length!==SCENARIOS.length) {
      throw new Error("Diagnostic des conditions inattendu.");
    }
    const expected=new Set(SCENARIOS.map(s=>s.condition));
    for(const item of inspected.conditions){
      if(!expected.has(item.condition) || item.count!==1){
        throw new Error("Une condition de verification ne correspond pas.");
      }
    }

    await db.query("ROLLBACK");
    inTransaction=false;
    const remaining=await db.query([
      "SELECT COUNT(*)::integer AS total FROM cse.registration_requests",
      "WHERE id = ANY($1::uuid[])"
    ].join("\n"),[requestIds]);
    if(Number(remaining.rows[0].total)!==0){
      throw new Error("Demandes fictives encore presentes apres rollback.");
    }
    console.log(JSON.stringify({
      status:"ok",
      testedAgainst:"postgresql_real",
      scenariosChecked:SCENARIOS.length,
      conditions:inspected.conditions,
      rolledBack:true,
      persisted:false,
      emailsSent:false,
      smtpInvoked:false,
      recipientsDisclosed:false,
      sendingEnabled:false
    }));
  } finally {
    if(inTransaction){
      try{await db.query("ROLLBACK");}catch{/* best effort */}
    }
    await db.end();
  }
}

if(require.main===module){
  main().catch(error=>{
    console.error("Test preconditions notifications :",error.code || "failed");
    process.exitCode=1;
  });
}
module.exports={SCENARIOS};
