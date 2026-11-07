"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEstablishmentCode,
  validateEstablishmentBatch,
  listActiveEstablishments,
  upsertEstablishments
} = require("../src/establishments");

test("conserve les codes avec zeros initiaux", () => {
  assert.equal(normalizeEstablishmentCode(" 01 "), "01");
  assert.equal(normalizeEstablishmentCode(" 05 "), "05");
  assert.equal(normalizeEstablishmentCode(" c-12 "), "C-12");
});

test("refuse les nombres non textuels ou codes dangereux", () => {
  assert.throws(() => normalizeEstablishmentCode(1));
  assert.throws(() => normalizeEstablishmentCode("0; DROP TABLE"));
  assert.throws(() => normalizeEstablishmentCode(""));
});

test("ajoute plusieurs etablissements avec nom et ordre", () => {
  assert.deepEqual(validateEstablishmentBatch([
    {code:"10", name:"NOUVEL ETABLISSEMENT", displayOrder:10},
    {code:"11", name:"AUTRE ETABLISSEMENT"}
  ]), [
    {code:"10", name:"NOUVEL ETABLISSEMENT", active:null, displayOrder:10},
    {code:"11", name:"AUTRE ETABLISSEMENT", active:null, displayOrder:null}
  ]);
});

test("permet de desactiver sans supprimer", () => {
  const entries = validateEstablishmentBatch([{code:"09", name:"LES TOURNESOLS", active:false}]);
  assert.equal(entries[0].active, false);
});

test("rejette codes dupliques et lots trop longs", () => {
  assert.throws(() => validateEstablishmentBatch([{code:"01",name:"SIEGE"},{code:" 01 ",name:"AUTRE"}]));
  assert.throws(() => validateEstablishmentBatch([]));
  assert.throws(() => validateEstablishmentBatch(Array.from({length:101}, (_,i) => ({code:String(i),name:"SITE"}))));
});

test("refuse noms vides et statuts autres que booleens", () => {
  assert.throws(() => validateEstablishmentBatch([{code:"11",name:" " }]));
  assert.throws(() => validateEstablishmentBatch([{code:"11",name:"SITE",active:"false"}]));
});

test("liste deroulante uniquement active, ordonnee par nom de code", async () => {
  const rows = [{code:"01",name:"SIEGE"},{code:"05",name:"DAME DU ROITELET"}];
  const db = {query:async (sql) => {
    assert.match(sql, /WHERE active = true/);
    assert.match(sql, /ORDER BY display_order ASC, code ASC/);
    return {rows};
  }};
  assert.deepEqual(await listActiveEstablishments(db), rows);
});

test("ecriture refusee sans provenance admin verifiee", async () => {
  const db = {query:async () => {throw new Error("ne doit pas executer de SQL");}};
  await assert.rejects(() => upsertEstablishments(db, [{code:"11",name:"SITE"}], "http_public"));
  await assert.rejects(() => upsertEstablishments(db, [{code:"11",name:"SITE"}], "authenticated_superadmin"));
});

test("ajout de plusieurs etablissements : transaction + audit", async () => {
  const calls = [];
  let lastSaved = "";
  const db = {query:async (sql, params=[]) => {
    calls.push({sql,params});
    if (sql.startsWith("SELECT code FROM cse.establishments")) return {rowCount:0,rows:[]};
    if (sql.startsWith("INSERT INTO cse.establishments")) {
      lastSaved = params[0];
      return {rowCount:1,rows:[{code:params[0],name:params[1],active:true,display_order:1000}]};
    }
    return {rowCount:1,rows:[]};
  }};
  const saved = await upsertEstablishments(db, [
    {code:"10",name:"NOUVEAU 10"},
    {code:"11",name:"NOUVEAU 11"}
  ], "vps_ssh");
  assert.deepEqual(saved.map(x=>x.code),["10","11"]);
  assert.equal(lastSaved, "11");
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls.at(-1).sql, "COMMIT");
  assert.equal(calls.filter(c => c.sql.startsWith("INSERT INTO cse.establishment_changes")).length, 2);
});

test("erreur SQL : annulation complete du lot", async () => {
  const calls=[];
  const db={query:async (sql)=>{
    calls.push(sql);
    if(sql.startsWith("INSERT INTO cse.establishments")) throw new Error("base indisponible");
    return {rowCount:0,rows:[]};
  }};
  await assert.rejects(() => upsertEstablishments(db,[{code:"12",name:"TEST"}],"vps_ssh"));
  assert.equal(calls.at(-1),"ROLLBACK");
});
