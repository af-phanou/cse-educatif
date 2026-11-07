"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  READINESS_SQL, inspectDecisionReadiness
} = require("../src/inspect-decision-readiness");

const uuid = "11111111-2222-4333-8444-555555555555";

test("lecture seule : ne manipule pas la file et exige une verification email", () => {
  assert.match(READINESS_SQL, /JOIN cse\.registration_requests/);
  assert.match(READINESS_SQL, /email_verified_at IS NULL/);
  assert.match(READINESS_SQL, /expires_at <= now\(\)/);
  assert.match(READINESS_SQL, /decision_status_mismatch/);
  assert.match(READINESS_SQL, /delivery_status <> 'not_configured'/);
  assert.match(READINESS_SQL, /n\.recipient_email IS NOT NULL/);
  assert.match(READINESS_SQL, /conditions_met_sending_disabled/);
  assert.doesNotMatch(READINESS_SQL, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
  assert.doesNotMatch(READINESS_SQL, /\br\.email\b|\br\.first_name\b|\br\.last_name\b/);
});

test("resultats agreges uniquement, sans adresses ni jetons", async () => {
  let receivedSql, parameters;
  const db = {query: async (sql, params) => {
    receivedSql = sql;
    parameters = params;
    return {rows: [
      {
        condition: "email_not_verified", total: 2,
        email: "faux@example.invalid", rawToken: "SECRET_NE_PAS_MONTRER"
      },
      {condition:"conditions_met_sending_disabled", total:3}
    ]};
  }};
  const result = await inspectDecisionReadiness(db);
  assert.equal(receivedSql, READINESS_SQL);
  assert.deepEqual(parameters, [null]);
  assert.deepEqual(result, {
    status: "ok",
    mode: "read_only",
    sendingEnabled: false,
    smtpInvoked: false,
    recipientsDisclosed: false,
    conditions: [
      {condition:"email_not_verified",count:2},
      {condition:"conditions_met_sending_disabled",count:3}
    ]
  });
  assert.doesNotMatch(JSON.stringify(result), /faux@example|SECRET_NE_PAS_MONTRER/);
});

test("acceptation d'une selection restreinte d'UUID", async () => {
  const db = {query:async (_sql,params) => {
    assert.deepEqual(params,[[uuid]]);
    return {rows:[]};
  }};
  const result=await inspectDecisionReadiness(db,[uuid]);
  assert.deepEqual(result.conditions,[]);
  assert.equal(result.sendingEnabled,false);
});

test("aucun ID arbitraire ne peut etre injecte dans le controle", async () => {
  const db={query:async()=>{throw new Error("La base ne doit pas etre appelee.");}};
  await assert.rejects(()=>inspectDecisionReadiness(db,["';DROP TABLE"]));
  await assert.rejects(()=>inspectDecisionReadiness(db,"not-array"));
  await assert.rejects(()=>inspectDecisionReadiness(db,new Array(21).fill(uuid)));
  await assert.rejects(()=>inspectDecisionReadiness(null));
});

test("file vide : aucun envoi ni identification de salaries", async () => {
  const result=await inspectDecisionReadiness({
    query:async()=>({rows:[]})
  });
  assert.equal(result.status,"ok");
  assert.deepEqual(result.conditions,[]);
  assert.equal(result.smtpInvoked,false);
  assert.equal(result.recipientsDisclosed,false);
});
