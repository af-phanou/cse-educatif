"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readNotificationStats}=require("../src/preview-notifications");

test("liste uniquement des totaux par type et statut",async()=>{
  const db={query:async sql=>{
    assert.match(sql,/COUNT\(\*\)::integer/);
    assert.match(sql,/GROUP BY audience,template,delivery_status/);
    assert.doesNotMatch(sql,/recipient_email|first_name|last_name|token_hash/);
    return {rows:[
      {audience:"employee",template:"registration_approved",
        delivery_status:"not_configured",total:2},
      {audience:"administration",template:"registration_review_required",
        delivery_status:"not_configured",total:1}
    ]};
  }};
  const result=await readNotificationStats(db);
  assert.equal(result.status,"ok");
  assert.equal(result.automaticSending,false);
  assert.equal(result.recipientsDisclosed,false);
  assert.equal(result.events.length,2);
  assert.equal(result.events[0].count,2);
  assert.equal(JSON.stringify(result).includes("@"),false);
});

test("file vide est acceptable et n'implique aucun envoi",async()=>{
  const res=await readNotificationStats({query:async()=>({rows:[]})});
  assert.deepEqual(res.events,[]);
  assert.equal(res.mode,"read_only");
  assert.equal(res.automaticSending,false);
});

test("ne reimporte pas de donnees personnelles issues des resultats SQL",async()=>{
  const res=await readNotificationStats({query:async()=>({rows:[{
    audience:"employee",template:"registration_rejected",
    delivery_status:"not_configured",total:1,
    recipient_email:"personne@example.invalid",
    first_name:"FAUX"
  }]})});
  assert.deepEqual(Object.keys(res.events[0]).sort(),[
    "audience","count","deliveryStatus","template"
  ]);
  assert.equal(JSON.stringify(res).includes("personne@example.invalid"),false);
});
