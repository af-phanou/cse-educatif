"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  submitRegistrationRequest,
  PUBLIC_REPLY,
  INSERT_REQUEST_SQL
} = require("../src/registration-submission");

const form = () => ({
  firstName: "Élise",
  lastName: "L’Écuyer",
  establishmentNumber: "01",
  email: "personne@example.invalid",
  phone: "0600000000",
  addressLine1: "12 rue Test",
  city: "Roubaix"
});

function mockPool({rows, duplicate = false, failOn = ""}) {
  const calls = [];
  const client = {
    released: false,
    release() { this.released = true; },
    async query(sql, params = []) {
      calls.push({sql, params});
      if (failOn && sql.includes(failOn)) {
        const err = new Error("Echec simule");
        err.code = "SIMULATED";
        throw err;
      }
      if (sql.includes("FROM cse.establishments est")) {
        return { rows };
      }
      if (sql.startsWith("INSERT INTO cse.registration_requests")) {
        return duplicate
          ? {rowCount:0, rows:[]}
          : {rowCount:1, rows:[{id:"request-uuid-demo"}]};
      }
      return {rowCount:1, rows:[]};
    }
  };
  return {
    calls,
    client,
    async connect() { return client; }
  };
}
const matched = [{import_id:"import-id",entry_id:"roster-id"}];

test("correspondance unique : une demande pending, jamais un compte actif", async () => {
  const db = mockPool({rows:matched});
  const result = await submitRegistrationRequest(db, form());
  assert.deepEqual(result, PUBLIC_REPLY);
  assert.equal(db.calls.filter(c => c.sql.startsWith("INSERT INTO cse.registration_requests")).length, 1);
  assert.equal(db.calls.filter(c => c.sql.startsWith("INSERT INTO cse.registration_reviews")).length, 0);
  assert.equal(db.calls.filter(c => c.sql.startsWith("INSERT INTO cse.email_outbox")).length, 1);
  assert.equal(db.calls.at(-1).sql, "COMMIT");
  assert.equal(db.client.released, true);
});

test("absence du CSV : inscription recue mais revue manuelle obligatoire", async () => {
  const db = mockPool({rows:[{import_id:"lot",entry_id:null}]});
  await submitRegistrationRequest(db, form());
  const review = db.calls.find(c => c.sql.includes("INSERT INTO cse.registration_reviews"));
  assert.deepEqual(review.params, ["request-uuid-demo","not_found"]);
  assert.equal(db.calls.filter(c => c.sql.startsWith("INSERT INTO cse.email_outbox")).length, 2);
});

test("homonymes : revue manuelle", async () => {
  const db = mockPool({rows:[
    {import_id:"lot",entry_id:"a"}, {import_id:"lot",entry_id:"b"}
  ]});
  await submitRegistrationRequest(db, form());
  assert.equal(db.calls.find(c=>c.sql.includes("INSERT INTO cse.registration_reviews")).params[1], "ambiguous");
});

test("aucun lot actif : revue manuelle", async () => {
  const db = mockPool({rows:[{import_id:null,entry_id:null}]});
  await submitRegistrationRequest(db, form());
  assert.equal(db.calls.find(c=>c.sql.includes("INSERT INTO cse.registration_reviews")).params[1], "no_active_roster");
});

test("etablissement inexistant ou desactive : aucune demande enregistree", async () => {
  const db = mockPool({rows:[]});
  assert.deepEqual(await submitRegistrationRequest(db, form()), PUBLIC_REPLY);
  assert.equal(db.calls.some(c => c.sql.includes("INSERT INTO cse.registration_requests")), false);
  assert.equal(db.calls.some(c => c.sql.includes("INSERT INTO cse.email_outbox")), false);
  assert.equal(db.calls.at(-1).sql, "COMMIT");
});

test("adresse deja en attente : pas de nouvelle notification", async () => {
  const db = mockPool({rows:matched,duplicate:true});
  assert.deepEqual(await submitRegistrationRequest(db, form()), PUBLIC_REPLY);
  assert.equal(db.calls.some(c => c.sql.includes("INSERT INTO cse.email_outbox")), false);
  assert.equal(db.calls.at(-1).sql, "COMMIT");
});

test("ne renvoie aucune information sur le CSV ou le profil", async () => {
  const one = await submitRegistrationRequest(mockPool({rows:matched}), form());
  const two = await submitRegistrationRequest(mockPool({rows:[]}), form());
  assert.deepEqual(one, two);
  assert.equal(JSON.stringify(one).includes("Élise"), false);
});

test("requete SQL parametree : pas d'injection avec des noms complexes", async () => {
  const db = mockPool({rows:matched});
  await submitRegistrationRequest(db, {...form(),lastName:"O'Neil"});
  const inserted = db.calls.find(c => c.sql === INSERT_REQUEST_SQL);
  assert.ok(inserted);
  assert.equal(inserted.sql.includes("O'Neil"), false);
  assert.equal(inserted.params[2], "O'Neil");
  assert.equal(inserted.sql.includes("status"), false);
});

test("erreur de base : rollback sans email partiel", async () => {
  const db = mockPool({rows:matched,failOn:"INSERT INTO cse.email_outbox"});
  await assert.rejects(() => submitRegistrationRequest(db, form()));
  assert.equal(db.calls.at(-1).sql, "ROLLBACK");
  assert.equal(db.client.released, true);
});

test("formulaire invalide : aucune connexion SQL", async () => {
  const db = {async connect() { throw new Error("Ne pas connecter"); }};
  await assert.rejects(() => submitRegistrationRequest(db, {...form(),email:"invalide"}), /email/);
});

test("n'accepte pas de mot de passe avant l'etape de verification email", async () => {
  const db = {async connect() { throw new Error("Ne pas connecter"); }};
  await assert.rejects(() => submitRegistrationRequest(db,{...form(),password:"Secret123!"}), /invalide/);
});

test("la notification employee reste en attente du service email", async () => {
  const db = mockPool({rows:matched});
  await submitRegistrationRequest(db, form());
  const email = db.calls.find(c => c.sql.includes("INSERT INTO cse.email_outbox"));
  assert.equal(email.params[1], "personne@example.invalid");
  assert.equal(email.sql.includes("delivery_status"), false);
});
