"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {
  hashEmailToken,mintEmailToken,
  issueChallengeInTransaction,consumeChallengeInTransaction,
  verifyEmailChallenge,PUBLIC_INVALID,
  ISSUE_ALLOWED_SQL,INSERT_CHALLENGE_SQL,VERIFY_CHALLENGE_SQL,
  CONSUME_SQL,MARK_EMAIL_SQL
}=require("../src/email-verification");

const id="11111111-2222-4333-8444-555555555555";
const challengeId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function fakeClient(options={}){
  const calls=[];
  let consumed=false;
  const client={
    calls,
    released:false,
    release(){this.released=true;},
    async query(sql,params=[]){
      calls.push({sql,params});
      if(options.failAudit && sql.includes("INSERT INTO cse.audit_events")){
        throw new Error("Echec fictif de journal");
      }
      if(sql===ISSUE_ALLOWED_SQL){
        return options.issuable===false ? {rowCount:0,rows:[]} :
          {rowCount:1,rows:[{id}]};
      }
      if(sql===INSERT_CHALLENGE_SQL){
        return options.alreadyIssued ? {rowCount:0,rows:[]} :
          {rowCount:1,rows:[{id:challengeId}]};
      }
      if(sql===VERIFY_CHALLENGE_SQL){
        return options.invalid || consumed ? {rowCount:0,rows:[]} :
          {rowCount:1,rows:[{challenge_id:challengeId,request_id:id}]};
      }
      if(sql===CONSUME_SQL){
        if(options.noConsume) return {rowCount:0,rows:[]};
        consumed=true;
        return {rowCount:1,rows:[{id:challengeId}]};
      }
      if(sql===MARK_EMAIL_SQL){
        return options.noMark ? {rowCount:0,rows:[]} :
          {rowCount:1,rows:[{id}]};
      }
      return {rowCount:1,rows:[]};
    }
  };
  return client;
}
function fakePool(client){return {connect:async()=>client};}

test("jeton cryptographiquement aleatoire de 32 octets",()=>{
  const a=mintEmailToken(),b=mintEmailToken();
  assert.match(a.rawToken,/^[0-9a-f]{64}$/);
  assert.equal(a.rawToken.length,64);
  assert.notEqual(a.rawToken,b.rawToken);
});

test("seule l'empreinte SHA-256 du jeton est destinee a PostgreSQL",()=>{
  const minted=mintEmailToken();
  assert.equal(minted.tokenHash,
    createHash("sha256").update(minted.rawToken,"ascii").digest("hex"));
  assert.notEqual(minted.tokenHash,minted.rawToken);
  assert.equal(hashEmailToken(minted.rawToken.toUpperCase()),minted.tokenHash);
});

test("format invalide : aucun hash ni tentative de verification",async()=>{
  assert.equal(hashEmailToken("invalide"),null);
  assert.equal(hashEmailToken(null),null);
  const db=fakeClient();
  assert.deepEqual(await consumeChallengeInTransaction(db,"invalide"),PUBLIC_INVALID);
  assert.equal(db.calls.length,0);
});

test("ne genere pas de jeton pour une demande inconnue ou invalide",async()=>{
  const db=fakeClient({issuable:false});
  assert.deepEqual(await issueChallengeInTransaction(db,id),
    {issued:false,rawToken:null});
  assert.equal(db.calls.some(c=>c.sql===INSERT_CHALLENGE_SQL),false);
  assert.deepEqual(await issueChallengeInTransaction(db,"abc"),
    {issued:false,rawToken:null});
});

test("un seul jeton par demande sans divulguer le jeton existant",async()=>{
  const db=fakeClient({alreadyIssued:true});
  const result=await issueChallengeInTransaction(db,id);
  assert.deepEqual(result,{issued:false,rawToken:null});
});

test("generation insere uniquement le hash avec une duree de 30 minutes",async()=>{
  const db=fakeClient();
  const result=await issueChallengeInTransaction(db,id);
  assert.equal(result.issued,true);
  const insert=db.calls.find(c=>c.sql===INSERT_CHALLENGE_SQL);
  assert.equal(insert.params[0],id);
  assert.equal(insert.params[1],hashEmailToken(result.rawToken));
  assert.notEqual(insert.params[1],result.rawToken);
  assert.match(insert.sql,/interval '30 minutes'/);
  assert.equal(insert.sql.includes(result.rawToken),false);
});

test("premier clic : consomme le jeton et verifie l'email seulement",async()=>{
  const db=fakeClient();
  const token=mintEmailToken().rawToken;
  const result=await consumeChallengeInTransaction(db,token);
  assert.deepEqual(result,{status:"verified",accountActivated:false,emailSent:false});
  const queries=db.calls.map(c=>c.sql);
  assert.ok(queries.includes(CONSUME_SQL));
  assert.ok(queries.includes(MARK_EMAIL_SQL));
  assert.equal(queries.some(s=>s.includes("cse.accounts")),false);
  assert.equal(queries.some(s=>s.includes("cse.email_outbox")),false);
  const audit=db.calls.find(c=>c.sql.includes("INSERT INTO cse.audit_events"));
  assert.equal(audit.params[2],id);
  assert.equal(JSON.stringify(audit.params).includes(token),false);
});

test("second clic avec le meme jeton : refuse",async()=>{
  const db=fakeClient();
  const token=mintEmailToken().rawToken;
  assert.equal((await consumeChallengeInTransaction(db,token)).status,"verified");
  assert.deepEqual(await consumeChallengeInTransaction(db,token),PUBLIC_INVALID);
});

test("jeton expire, inconnu ou demande non valable : reponse neutre",async()=>{
  const db=fakeClient({invalid:true});
  const result=await consumeChallengeInTransaction(db,mintEmailToken().rawToken);
  assert.deepEqual(result,PUBLIC_INVALID);
  assert.equal(db.calls.some(c=>c.sql===MARK_EMAIL_SQL),false);
  assert.match(VERIFY_CHALLENGE_SQL,/expires_at > now\(\)/);
  assert.match(VERIFY_CHALLENGE_SQL,/status IN \('pending','approved'\)/);
});

test("un changement concurrent de jeton annule la verification",async()=>{
  const db=fakeClient({noConsume:true});
  await assert.rejects(()=>consumeChallengeInTransaction(db,mintEmailToken().rawToken));
  assert.equal(db.calls.some(c=>c.sql===MARK_EMAIL_SQL),false);
});

test("un changement concurrent de la demande annule la verification",async()=>{
  const db=fakeClient({noMark:true});
  await assert.rejects(()=>consumeChallengeInTransaction(db,mintEmailToken().rawToken));
});

test("transaction complete : commit et liberation de connexion",async()=>{
  const db=fakeClient();
  const result=await verifyEmailChallenge(fakePool(db),mintEmailToken().rawToken);
  assert.equal(result.status,"verified");
  assert.equal(db.calls[0].sql,"BEGIN");
  assert.equal(db.calls.at(-1).sql,"COMMIT");
  assert.equal(db.released,true);
});

test("si l'audit echoue, transaction annulee sans confirmation partielle",async()=>{
  const db=fakeClient({failAudit:true});
  await assert.rejects(()=>verifyEmailChallenge(fakePool(db),mintEmailToken().rawToken));
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
  assert.equal(db.released,true);
});

test("jeton mal forme : pas de connexion en base",async()=>{
  const pool={connect:async()=>{throw Error("Ne pas contacter PostgreSQL");}};
  assert.deepEqual(await verifyEmailChallenge(pool,"mauvais"),PUBLIC_INVALID);
});
