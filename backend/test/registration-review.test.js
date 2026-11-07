"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listPendingRequests, decideRequest, QUEUE_SQL
} = require("../src/registration-review");

const uuid = "11111111-2222-4333-8444-555555555555";

function fakePool({found = true, fail = ""} = {}) {
  const calls = [];
  const client = {
    released:false,
    release(){ this.released = true; },
    async query(sql, values = []) {
      calls.push({sql,values});
      if (fail && sql.includes(fail)) {
        const error = new Error("Erreur SQL de test");
        error.code = "SIMULATION";
        throw error;
      }
      if (sql.startsWith("SELECT id FROM cse.registration_requests")) {
        return {rowCount:found ? 1 : 0, rows:found ? [{id:uuid}] : []};
      }
      if (sql.startsWith("UPDATE cse.registration_requests")) {
        return {rowCount:1, rows:[{id:uuid}]};
      }
      return {rowCount:1,rows:[]};
    }
  };
  return {
    calls, client,
    async connect(){ return client; }
  };
}

test("la liste des demandes en attente ne lit ni telephone ni adresse", async () => {
  const db = {query:async sql => {
    assert.equal(sql, QUEUE_SQL);
    assert.match(sql, /status = 'pending'/);
    assert.match(sql, /expires_at > now\(\)/);
    assert.doesNotMatch(sql, /phone|address_line|postal_code|city/);
    return {rows:[{
      id:uuid, created_at:"2026-11-07T20:00:00Z",
      first_name:"Élise",last_name:"TEST",email:"elise@example.invalid",
      establishment_number:"01",review_reason:"ambiguous",
      email_verified_at:null, review_status:"pending"
    }]};
  }};
  const rows = await listPendingRequests(db);
  assert.equal(rows.length,1);
  assert.equal(rows[0].reason,"ambiguous");
  assert.equal(rows[0].emailVerified,false);
  assert.equal(Object.hasOwn(rows[0],"phone"),false);
});

test("une demande unique correspondante a une lecture minimale", async () => {
  const rows = await listPendingRequests({query:async () => ({rows:[
    {id:uuid,created_at:"2026-11-07",first_name:"Alice",last_name:"TEST",
      email:"a@example.invalid",establishment_number:"09",
      review_reason:null,email_verified_at:new Date(),review_status:null}
  ]})});
  assert.equal(rows[0].reason, "matched");
  assert.equal(rows[0].emailVerified,true);
  assert.equal(rows[0].reviewStatus,null);
});

test("approuve un dossier pending en transaction sans activer le compte", async () => {
  const pool = fakePool();
  const result = await decideRequest(pool, uuid, "approved");
  assert.deepEqual(result, {
    status:"recorded",decision:"approved",accountActivated:false,emailSent:false
  });
  assert.equal(pool.calls[0].sql,"BEGIN");
  assert.equal(pool.calls.at(-1).sql,"COMMIT");
  assert.equal(pool.client.released,true);
  assert.equal(pool.calls.filter(c => c.sql.startsWith("INSERT INTO cse.audit_events")).length,1);
  assert.equal(pool.calls.some(c => c.sql.includes("cse.accounts")),false);
  assert.equal(pool.calls.some(c => c.sql.includes("cse.email_outbox")),false);
});

test("refuse un dossier avec la meme procedure", async () => {
  const pool = fakePool();
  const result = await decideRequest(pool,uuid,"rejected");
  assert.equal(result.decision,"rejected");
  assert.deepEqual(pool.calls.find(c=>c.sql.startsWith("UPDATE cse.registration_requests")).values,
    ["rejected",uuid]);
});

test("dossier traite ou expire : ne modifie rien", async () => {
  const pool = fakePool({found:false});
  const result = await decideRequest(pool,uuid,"approved");
  assert.deepEqual(result,{status:"not_pending"});
  assert.equal(pool.calls.at(-1).sql,"ROLLBACK");
  assert.equal(pool.calls.some(c=>c.sql.startsWith("UPDATE")),false);
});

test("rejette un identifiant invalide sans ouvrir la base", async () => {
  const pool = {async connect(){ throw new Error("Ne pas connecter"); }};
  await assert.rejects(() => decideRequest(pool,"abc","approved"));
  await assert.rejects(() => decideRequest(pool,"1';DROP TABLE","rejected"));
});

test("rejette toute decision inconnue", async () => {
  const pool = {async connect(){ throw new Error("Ne pas connecter"); }};
  await assert.rejects(() => decideRequest(pool,uuid,"active"));
  await assert.rejects(() => decideRequest(pool,uuid,"pending"));
});

test("echec de l'audit : rollback de la decision", async () => {
  const pool = fakePool({fail:"INSERT INTO cse.audit_events"});
  await assert.rejects(() => decideRequest(pool,uuid,"approved"));
  assert.equal(pool.calls.at(-1).sql,"ROLLBACK");
  assert.equal(pool.client.released,true);
});
