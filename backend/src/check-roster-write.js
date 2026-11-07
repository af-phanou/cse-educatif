"use strict";

// Test d'ecriture reel mais fictif, entierement annule par ROLLBACK.
// Aucun lot ne reste en base et aucun lot actif n'est remplace.
const fs=require("node:fs");
const {randomBytes}=require("node:crypto");
const {Client}=require("pg");

async function main(){
  const pass=fs.readFileSync(
    process.env.DB_PASSWORD_FILE || "/run/secrets/roster_db_password","utf8"
  ).trim();
  const db=new Client({
    host:process.env.DB_HOST || "db",
    port:Number(process.env.DB_PORT || 5432),
    database:process.env.DB_NAME || "cse_educatif",
    user:process.env.DB_USER || "cse_roster_manager",
    password:pass,connectionTimeoutMillis:5000
  });
  await db.connect();
  let transaction=false;
  try{
    await db.query("BEGIN");transaction=true;
    const first=await db.query(
      "SELECT code FROM cse.establishments WHERE active=true ORDER BY code LIMIT 1"
    );
    if(!first.rowCount)throw Error("Aucun etablissement actif.");
    const code=first.rows[0].code;
    const fingerprint=randomBytes(32).toString("hex");
    const imported=await db.query([
      "INSERT INTO cse.roster_imports(file_sha256,rows_count)",
      "VALUES($1,1) RETURNING id"
    ].join("\n"),[fingerprint]);
    const id=imported.rows[0].id;
    await db.query([
      "INSERT INTO cse.roster_entries",
      "(import_id,source_line,last_name,first_name,establishment_number,match_key)",
      "VALUES($1,2,'FICTIF','TEST',$2,$3)"
    ].join("\n"),[id,code,"FICTIF|TEST|"+code]);
    await db.query(
      "UPDATE cse.roster_imports SET status='staged' WHERE id=$1",[id]
    );
    await db.query([
      "INSERT INTO cse.audit_events(action,object_type,object_id,metadata)",
      "VALUES($1,$2,$3,$4::jsonb)"
    ].join("\n"),[
      "roster.test","roster_import",id,JSON.stringify({test:true})
    ]);
    await db.query("ROLLBACK");transaction=false;
    console.log(JSON.stringify({
      status:"ok",write_test:"rolled_back",persisted:false,
      existingActiveRosterChanged:false,emailsSent:false
    }));
  }finally{
    if(transaction){
      try{await db.query("ROLLBACK");}catch{/* best effort */}
    }
    await db.end();
  }
}
main().catch(error=>{
  console.error("Test ecriture CSV impossible:",error.code || "unknown");
  process.exitCode=1;
});
