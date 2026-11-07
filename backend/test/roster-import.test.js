"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  RosterError,analyzeCsv,previewImport,buildInsertChunk,
  stageImport,listImports,activateImport
}=require("../src/roster-import");

const uuid="11111111-2222-4333-8444-555555555555";
const csv=[
  "nom;prenom;numero_etablissement;colonne_sensible",
  "DUPONT;Alice;01;NE PAS STOCKER",
  "MARTIN;Jean;05;AUTRE SECRET",
  "DUPONT;Alice;01;TROISIEME SECRET",
  ""
].join("\n");

function fakeDb({existing=null,staged=true,fail="",badCount=false,inactive=false}={}){
  const calls=[];
  const client={
    released:false,
    release(){this.released=true;},
    async query(sql,params=[]){
      calls.push({sql,params});
      if(fail && sql.includes(fail)) {
        const error=new Error("Erreur SQL fictive");
        error.code="SIMULATED";
        throw error;
      }
      if(sql.startsWith("SELECT code FROM cse.establishments")) {
        return {rowCount:2,rows:inactive?[{code:"01"}]:[{code:"01"},{code:"05"}]};
      }
      if(sql.startsWith("SELECT id,status,rows_count FROM cse.roster_imports WHERE file_sha256")){
        return existing?{rowCount:1,rows:[existing]}:{rowCount:0,rows:[]};
      }
      if(sql.startsWith("INSERT INTO cse.roster_imports")){
        return {rowCount:1,rows:[{id:uuid}]};
      }
      if(sql.startsWith("SELECT id,status,rows_count FROM cse.roster_imports\nWHERE id=")){
        return staged?
          {rowCount:1,rows:[{id:uuid,status:"staged",rows_count:3}]}:
          {rowCount:1,rows:[{id:uuid,status:"active",rows_count:3}]};
      }
      if(sql.startsWith("SELECT COUNT(*)::integer")){
        return {rowCount:1,rows:[{total:badCount?2:3,invalid:inactive?1:0}]};
      }
      if(sql.startsWith("UPDATE cse.roster_imports SET status='active'")){
        return {rowCount:1,rows:[{id:uuid}]};
      }
      if(sql.startsWith("SELECT id, file_sha256, status, rows_count, created_at")){
        return {rowCount:1,rows:[{
          id:uuid,file_sha256:"a".repeat(64),status:"staged",rows_count:3,
          created_at:"2026-11-07T20:00:00Z",activated_at:null
        }]};
      }
      return {rowCount:1,rows:[]};
    }
  };
  return {
    calls,client,
    query:(...args)=>client.query(...args),
    connect:async()=>client
  };
}

test("analyse 3 lignes, dont doublons de meme personne et code",()=>{
  const p=analyzeCsv(csv);
  assert.equal(p.summary.rows,3);
  assert.equal(p.summary.duplicateRows,1);
  assert.equal(p.summary.ambiguousGroups,1);
  assert.deepEqual(p.summary.establishments,[{code:"01",count:2},{code:"05",count:1}]);
  assert.equal(p.entries[0].establishmentNumber,"01");
  assert.equal(p.summary.additionalColumnsStored,false);
});

test("ignore les colonnes supplementaires dans l'empreinte",()=>{
  const different=csv.replace("NE PAS STOCKER","DONNEE DIFFERENTE");
  assert.equal(analyzeCsv(csv).sha256,analyzeCsv(different).sha256);
  assert.equal(analyzeCsv(csv).entries[0].colonne_sensible,undefined);
});

test("conserve les zeros initiaux et refuse les codes malformes",()=>{
  assert.notEqual(analyzeCsv(csv).entries[0].matchKey,
    analyzeCsv(csv.replace(/;01;/g,";1;")).entries[0].matchKey);
  assert.throws(()=>analyzeCsv('nom;prenom;numero_etablissement\nTEST;A;"1;DROP"\n'));
});

test("fichier CSV vide et entetes manquants refuses",()=>{
  assert.throws(()=>analyzeCsv("nom;prenom;numero_etablissement\n"));
  assert.throws(()=>analyzeCsv("nom;prenom;ville\nTEST;Alice;Lille\n"));
});

test("previsualisation ne fait aucune insertion SQL",async()=>{
  const db=fakeDb();
  const p=await previewImport(db,csv);
  assert.equal(p.rows,3);
  assert.equal(db.calls.length,1);
  assert.equal(db.calls[0].params[0][0],"01");
});

test("previsualisation refuse code inconnu ou desactive",async()=>{
  const db=fakeDb({inactive:true});
  await assert.rejects(()=>previewImport(db,csv),/05/);
  assert.equal(db.calls.some(x=>x.sql.startsWith("INSERT")),false);
});

test("genere un INSERT parametre avec identifiant stable",()=>{
  const p=analyzeCsv(csv);
  const chunk=buildInsertChunk(uuid,p.entries);
  assert.equal(chunk.values.length,16);
  assert.match(chunk.sql,/\(\$1,\$2,\$3,\$4,\$5,\$6\)/);
  assert.equal(chunk.sql.includes("DUPONT"),false);
  assert.equal(chunk.values[0],uuid);
  assert.equal(chunk.values[3],"Alice");
});

test("refuse un bloc vide et un identifiant de lot invalide",()=>{
  assert.throws(()=>buildInsertChunk("abc",analyzeCsv(csv).entries));
  assert.throws(()=>buildInsertChunk(uuid,[]));
});

test("importe atomiquement les trois lignes en staged et journalise sans noms",async()=>{
  const db=fakeDb();
  const result=await stageImport(db,csv);
  assert.equal(result.status,"staged");
  assert.equal(result.id,uuid);
  assert.equal(db.calls[0].sql,"BEGIN");
  assert.equal(db.calls.at(-1).sql,"COMMIT");
  assert.equal(db.calls.some(x=>x.sql.startsWith("INSERT INTO cse.roster_entries")),true);
  const audit=db.calls.find(x=>x.sql.startsWith("INSERT INTO cse.audit_events"));
  assert.equal(audit.params[3].includes("DUPONT"),false);
  assert.equal(db.client.released,true);
});

test("n'importe pas deux fois le meme CSV",async()=>{
  const db=fakeDb({existing:{id:uuid,status:"staged",rows_count:3}});
  const result=await stageImport(db,csv);
  assert.equal(result.status,"already_exists");
  assert.equal(result.importStatus,"staged");
  assert.equal(db.calls.some(x=>x.sql.startsWith("INSERT INTO cse.roster_entries")),false);
});

test("rollback en cas d'echec de l'import",async()=>{
  const db=fakeDb({fail:"INSERT INTO cse.roster_entries"});
  await assert.rejects(()=>stageImport(db,csv));
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
  assert.equal(db.client.released,true);
});

test("liste uniquement les metadonnees de lots, sans noms",async()=>{
  const rows=await listImports(fakeDb());
  assert.equal(rows.length,1);
  assert.equal(rows[0].fingerprint,"aaaaaaaaaaaa");
  assert.equal(rows[0].rows,3);
  assert.equal(Object.hasOwn(rows[0],"firstName"),false);
});

test("activation archive d'abord le lot actif puis active le staged",async()=>{
  const db=fakeDb();
  const result=await activateImport(db,uuid);
  assert.deepEqual(result,{status:"active",id:uuid,rows:3});
  const archive=db.calls.findIndex(x=>x.sql.includes("SET status='archived'"));
  const activate=db.calls.findIndex(x=>x.sql.includes("SET status='active'"));
  assert.ok(archive>=0);
  assert.ok(activate>archive);
  assert.equal(db.calls.at(-1).sql,"COMMIT");
});

test("lot deja active : aucune operation d'activation",async()=>{
  const db=fakeDb({staged:false});
  assert.deepEqual(await activateImport(db,uuid),{status:"not_activatable"});
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
  assert.equal(db.calls.some(x=>x.sql.includes("SET status='archived'")),false);
});

test("activation impossible si nombre de lignes different",async()=>{
  const db=fakeDb({badCount:true});
  await assert.rejects(()=>activateImport(db,uuid),RosterError);
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
});

test("activation refuse code de site desactive depuis import",async()=>{
  const db=fakeDb({inactive:true});
  await assert.rejects(()=>activateImport(db,uuid),RosterError);
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
});

test("une panne d'audit annule tout le changement de lot",async()=>{
  const db=fakeDb({fail:"INSERT INTO cse.audit_events"});
  await assert.rejects(()=>activateImport(db,uuid));
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
});

test("identifiants dangereux refuses avant toute connexion",async()=>{
  const pool={connect:async()=>{throw Error("Ne pas connecter")}};
  await assert.rejects(()=>activateImport(pool,"x' OR 1=1"),RosterError);
});


test("ancien lot archive peut etre reactive apres verification explicite",async()=>{
  const db=fakeDb();
  const original=db.client.query;
  db.client.query=async(sql,params)=>{
    if(sql.startsWith("SELECT id,status,rows_count FROM cse.roster_imports\nWHERE id=")){
      db.calls.push({sql,params});
      return {rowCount:1,rows:[{id:uuid,status:"archived",rows_count:3}]};
    }
    return original(sql,params);
  };
  const result=await activateImport(db,uuid);
  assert.equal(result.status,"active");
  const sql=db.calls.find(x=>x.sql.includes("SET status='active'")).sql;
  assert.match(sql,/status IN \('staged','archived'\)/);
  const audit=db.calls.find(x=>x.sql.includes("INSERT INTO cse.audit_events"));
  assert.equal(JSON.parse(audit.params[3]).reactivated,true);
});
