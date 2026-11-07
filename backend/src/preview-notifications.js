"use strict";

/**
 * Observabilite de la file email. Lecture de totaux uniquement,
 * sans exposer de destinataire, nom, prenom ou jeton.
 *
 * A lancer ponctuellement dans le conteneur prive "migrate" via SSH.
 * Aucun envoi SMTP, aucune modification PostgreSQL.
 */
const fs=require("node:fs");
const {Client}=require("pg");

async function readNotificationStats(db) {
  const r=await db.query([
    "SELECT audience,template,delivery_status,COUNT(*)::integer AS total",
    "FROM cse.email_outbox",
    "GROUP BY audience,template,delivery_status",
    "ORDER BY audience,template,delivery_status"
  ].join("\n"));
  return {
    status:"ok",
    mode:"read_only",
    automaticSending:false,
    recipientsDisclosed:false,
    events:r.rows.map(row=>({
      audience:row.audience,
      template:row.template,
      deliveryStatus:row.delivery_status,
      count:Number(row.total)
    }))
  };
}

async function main(){
  if(process.env.DB_ADMIN_USER!=="cse_dbadmin"){
    throw new Error("Acces SQL de maintenance prive requis.");
  }
  const password=fs.readFileSync(
    process.env.DB_ADMIN_PASSWORD_FILE||"/run/secrets/postgres_password",
    "utf8"
  ).trim();
  const db=new Client({
    host:process.env.DB_HOST||"db",
    database:process.env.DB_NAME||"cse_educatif",
    user:"cse_dbadmin",
    password,
    connectionTimeoutMillis:5000,
    statement_timeout:10000
  });
  await db.connect();
  try{console.log(JSON.stringify(await readNotificationStats(db)));}
  finally{await db.end();}
}

if(require.main===module){
  main().catch(error=>{
    console.error("Controle file email :",error.code||"failed");
    process.exitCode=1;
  });
}
module.exports={readNotificationStats};
