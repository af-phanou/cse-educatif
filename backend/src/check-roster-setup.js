"use strict";

// Vérifie les droits PostgreSQL du service CSV, sans lire ni ecrire
// aucune donnee personnelle.
const fs=require("node:fs");
const { Client }=require("pg");

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
  try{
    const result=await db.query([
      "SELECT current_user AS role_name,",
      "has_column_privilege(current_user,'cse.roster_imports','file_sha256','INSERT') AS can_stage,",
      "has_column_privilege(current_user,'cse.roster_imports','status','UPDATE') AS can_activate,",
      "has_column_privilege(current_user,'cse.roster_entries','last_name','INSERT') AS can_import_names,",
      "has_column_privilege(current_user,'cse.roster_entries','last_name','SELECT') AS can_read_names,",
      "has_column_privilege(current_user,'cse.roster_entries','establishment_number','SELECT') AS can_verify_sites,",
      "has_column_privilege(current_user,'cse.establishments','code','SELECT') AS can_read_sites,",
      "has_table_privilege(current_user,'cse.roster_imports','DELETE') AS can_delete_imports,",
      "has_column_privilege(current_user,'cse.accounts','email','SELECT') AS can_read_accounts,",
      "has_column_privilege(current_user,'cse.registration_requests','email','SELECT') AS can_read_requests,",
      "has_column_privilege(current_user,'cse.audit_events','action','INSERT') AS can_audit"
    ].join("\n"));
    const r=result.rows[0];
    const checks={
      specialized_role:r.role_name==="cse_roster_manager",
      can_stage:r.can_stage&&r.can_import_names,
      can_activate:r.can_activate,
      cannot_read_roster_names:!r.can_read_names,
      can_verify_establishments:r.can_verify_sites&&r.can_read_sites,
      cannot_delete_history:!r.can_delete_imports,
      cannot_read_accounts:!r.can_read_accounts,
      cannot_read_registration_requests:!r.can_read_requests,
      can_append_audit:r.can_audit
    };
    const ok=Object.values(checks).every(Boolean);
    console.log(JSON.stringify({status:ok?"ok":"failed",checks}));
    if(!ok)process.exitCode=1;
  }finally{await db.end();}
}
main().catch(error=>{
  console.error("Controle droits CSV impossible:",error.code || "unknown");
  process.exitCode=1;
});
