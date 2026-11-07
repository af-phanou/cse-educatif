"use strict";

/**
 * Import CSV d'eligibilite — SERVICE PRIVE accessible seulement via SSH.
 * Aucune donnee RH n'est affichee en retour : uniquement des totaux.
 * Le nouvel import ne modifie pas les comptes salarie existants.
 */
const { createHash } = require("node:crypto");
const {
  parseEligibilityCsv, normalizeNumber, matchKey
} = require("./eligibility");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[0-9A-Z][0-9A-Z._/-]{0,19}$/;
const CHUNK_SIZE = 200;
const LOCK_ID = 92170420;

class RosterError extends Error {
  constructor(message) { super(message); this.name = "RosterError"; }
}

function analyzeCsv(csv) {
  let parsed;
  try { parsed = parseEligibilityCsv(csv); }
  catch (error) { throw new RosterError(error.message); }

  const counts = new Map();
  const occurrences = new Map();
  const entries = parsed.entries.map(row => {
    const establishmentNumber = normalizeNumber(row.establishmentNumber);
    if (!CODE_RE.test(establishmentNumber)) {
      throw new RosterError("Code etablissement invalide a la ligne " + row.sourceLine + ".");
    }
    const match = matchKey(row.lastName, row.firstName, establishmentNumber);
    const entry = {...row, establishmentNumber, matchKey:match};
    counts.set(establishmentNumber, (counts.get(establishmentNumber) || 0) + 1);
    occurrences.set(match, (occurrences.get(match) || 0) + 1);
    return entry;
  });
  if (!entries.length) throw new RosterError("Fichier CSV vide.");

  const groups = [...occurrences.values()];
  const duplicates = groups.reduce((sum,count)=>sum + Math.max(0,count-1),0);
  const ambiguousGroups = groups.filter(count=>count>1).length;
  const canonical = JSON.stringify(entries.map(entry => [
    entry.lastName,entry.firstName,entry.establishmentNumber
  ]));
  const sha256 = createHash("sha256").update(canonical,"utf8").digest("hex");
  return {
    entries,
    sha256,
    summary:{
      rows:entries.length,
      duplicateRows:duplicates,
      ambiguousGroups,
      establishments:[...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(
        ([code,count])=>({code,count})
      ),
      fingerprint:sha256.slice(0,12),
      additionalColumnsStored:false
    }
  };
}

async function validateCodes(db, codes) {
  const result = await db.query(
    "SELECT code FROM cse.establishments WHERE active = true AND code = ANY($1::text[])",
    [codes]
  );
  const valid = new Set(result.rows.map(x=>x.code));
  const unknown = codes.filter(code=>!valid.has(code));
  if (unknown.length) {
    throw new RosterError(
      "Etablissements absents ou desactives : " + unknown.slice(0,20).join(", ") +
      (unknown.length>20?" (et d'autres)":"") +
      ". Corrigez d'abord le repertoire des etablissements."
    );
  }
}

async function previewImport(db, csv) {
  if (!db || typeof db.query!=="function") throw new TypeError("Connexion SQL requise.");
  const parsed = analyzeCsv(csv);
  await validateCodes(db, parsed.summary.establishments.map(row=>row.code));
  return parsed.summary;
}

const INSERT_ENTRY_COLUMNS = [
  "import_id", "source_line", "last_name", "first_name",
  "establishment_number", "match_key"
];

function buildInsertChunk(importId, entries) {
  if (!UUID_RE.test(importId) || entries.length<1 || entries.length>CHUNK_SIZE) {
    throw new Error("Lot technique invalide.");
  }
  const values = [importId];
  const placeholders = [];
  for (const entry of entries) {
    const start = values.length + 1;
    values.push(
      entry.sourceLine, entry.lastName, entry.firstName,
      entry.establishmentNumber, entry.matchKey
    );
    placeholders.push(
      "($1,$"+start+",$"+(start+1)+",$"+(start+2)+",$"+(start+3)+",$"+(start+4)+")"
    );
  }
  return {
    sql:"INSERT INTO cse.roster_entries (" + INSERT_ENTRY_COLUMNS.join(",") +
      ") VALUES " + placeholders.join(","),
    values
  };
}

async function stageImport(pool, csv) {
  if (!pool || typeof pool.connect!=="function") throw new TypeError("Connexion SQL requise.");
  const parsed = analyzeCsv(csv);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)",[LOCK_ID]);
    await validateCodes(client, parsed.summary.establishments.map(row=>row.code));

    const existing = await client.query(
      "SELECT id,status,rows_count FROM cse.roster_imports WHERE file_sha256 = $1 FOR UPDATE",
      [parsed.sha256]
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return {
        status:"already_exists",id:existing.rows[0].id,
        importStatus:existing.rows[0].status,
        ...parsed.summary
      };
    }

    const created = await client.query([
      "INSERT INTO cse.roster_imports (file_sha256,rows_count)",
      "VALUES ($1,$2) RETURNING id"
    ].join("\n"),[parsed.sha256,parsed.entries.length]);
    const id = created.rows[0].id;
    for(let i=0;i<parsed.entries.length;i+=CHUNK_SIZE){
      const chunk = buildInsertChunk(id,parsed.entries.slice(i,i+CHUNK_SIZE));
      await client.query(chunk.sql,chunk.values);
    }

    await client.query([
      "INSERT INTO cse.audit_events (action,object_type,object_id,metadata)",
      "VALUES ($1,$2,$3,$4::jsonb)"
    ].join("\n"),[
      "roster.staged","roster_import",id,JSON.stringify({
        rows:parsed.summary.rows,
        duplicateRows:parsed.summary.duplicateRows,
        source:"ssh_csv_panel"
      })
    ]);
    await client.query("COMMIT");
    return {status:"staged",id,...parsed.summary};
  } catch(error) {
    try {await client.query("ROLLBACK");} catch {/* best effort */}
    throw error;
  } finally {
    client.release();
  }
}

async function listImports(db) {
  if(!db || typeof db.query!=="function")throw new TypeError("Connexion SQL requise.");
  const result=await db.query([
    "SELECT id, file_sha256, status, rows_count, created_at, activated_at",
    "FROM cse.roster_imports",
    "ORDER BY created_at DESC, id DESC",
    "LIMIT 40"
  ].join("\n"));
  return result.rows.map(row=>({
    id:row.id,
    status:row.status,
    rows:Number(row.rows_count),
    createdAt:row.created_at,
    activatedAt:row.activated_at,
    fingerprint:String(row.file_sha256).trim().slice(0,12)
  }));
}

async function activateImport(pool,id) {
  if(typeof id!=="string" || !UUID_RE.test(id)) throw new RosterError("Identifiant de lot invalide.");
  if(!pool || typeof pool.connect!=="function")throw new TypeError("Connexion SQL requise.");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)",[LOCK_ID]);
    const found=await client.query([
      "SELECT id,status,rows_count FROM cse.roster_imports",
      "WHERE id=$1 FOR UPDATE"
    ].join("\n"),[id]);
    if(found.rowCount!==1 ||
       !["staged","archived"].includes(found.rows[0].status)){
      await client.query("ROLLBACK");
      return {status:"not_activatable"};
    }

    const check=await client.query([
      "SELECT COUNT(*)::integer AS total,",
      "  COUNT(*) FILTER (WHERE est.code IS NULL)::integer AS invalid",
      "FROM cse.roster_entries e",
      "LEFT JOIN cse.establishments est ON est.code = e.establishment_number AND est.active = true",
      "WHERE e.import_id = $1"
    ].join("\n"),[id]);
    if(Number(check.rows[0].total)!==Number(found.rows[0].rows_count) ||
       Number(check.rows[0].invalid)!==0 || Number(check.rows[0].total)===0){
      throw new RosterError(
        "Activation refusee : lot incomplet ou etablissements devenus inactifs."
      );
    }

    await client.query(
      "UPDATE cse.roster_imports SET status='archived' WHERE status='active'"
    );
    const changed=await client.query([
      "UPDATE cse.roster_imports SET status='active', activated_at=now()",
      "WHERE id=$1 AND status IN ('staged','archived') RETURNING id"
    ].join("\n"),[id]);
    if(changed.rowCount!==1) throw new RosterError("Impossible d'activer le lot.");

    await client.query([
      "INSERT INTO cse.audit_events (action,object_type,object_id,metadata)",
      "VALUES ($1,$2,$3,$4::jsonb)"
    ].join("\n"),[
      "roster.activated","roster_import",id,
      JSON.stringify({
        rows:Number(check.rows[0].total),
        reactivated:found.rows[0].status==="archived",
        source:"ssh_csv_panel"
      })
    ]);
    await client.query("COMMIT");
    return {status:"active",id,rows:Number(check.rows[0].total)};
  } catch(error){
    try {await client.query("ROLLBACK");} catch{/* best effort */}
    throw error;
  } finally {client.release();}
}

module.exports={
  RosterError,analyzeCsv,previewImport,buildInsertChunk,
  stageImport,listImports,activateImport
};
