"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRegistration, prepareRegistration, LOOKUP_ACTIVE_ROSTER_SQL } = require("../src/registration");

const demo = () => ({
  firstName: " Élise ",
  lastName: "L'Écuyer",
  establishmentNumber: " 0012 ",
  email: " TEST.EXEMPLE@example.invalid ",
  phone: " 06 00 00 00 00 ",
  addressLine1: " 12 rue de l'Exemple ",
  addressLine2: "",
  postalCode: "59000",
  city: "Roubaix"
});

function dbWithRows(rows, check = () => {}) {
  return {
    query: async (sql, params) => {
      check(sql, params);
      return { rows };
    }
  };
}

test("valide les champs fournis par le salarie et conserve les zeros initiaux", () => {
  const profile = validateRegistration(demo());
  assert.equal(profile.email, "test.exemple@example.invalid");
  assert.equal(profile.establishmentNumber, "0012");
  assert.equal(profile.firstName, "Élise");
  assert.equal(profile.addressLine2, null);
});

test("n'integre pas les champs non prevus (dont mot de passe et colonnes RH)", () => {
  const profile = validateRegistration({ ...demo(), password: "NE PAS STOCKER", salaire: "SECRET" });
  assert.equal(Object.hasOwn(profile, "password"), false);
  assert.equal(Object.hasOwn(profile, "salaire"), false);
});

test("rejette prenom, etablissement ou email invalides", () => {
  assert.throws(() => validateRegistration({ ...demo(), firstName: "" }));
  assert.throws(() => validateRegistration({ ...demo(), establishmentNumber: "1;DROP TABLE" }));
  assert.throws(() => validateRegistration({ ...demo(), email: "invalide" }));
});

test("refuse les caracteres de controle", () => {
  assert.throws(() => validateRegistration({ ...demo(), lastName: "A\nB" }));
});

test("recherche dans le lot CSV actif par SQL parametre", async () => {
  let called = false;
  await prepareRegistration(dbWithRows([{ import_id: "lot1", entry_id: "ligne1" }], (sql, params) => {
    called = true;
    assert.equal(sql, LOOKUP_ACTIVE_ROSTER_SQL);
    assert.match(sql, /status = 'active'/);
    assert.match(sql, /match_key = \$1/);
    assert.deepEqual(params, ["L ECUYER|ELISE|0012"]);
    assert.equal(sql.includes("L'Écuyer"), false);
  }), demo());
  assert.equal(called, true);
});

test("correspondance unique : eligible provisoire, compte toujours non cree", async () => {
  const result = await prepareRegistration(dbWithRows([{ import_id: "lot1", entry_id: "ligne1" }]), demo());
  assert.equal(result.internalStatus, "eligible_provisional");
  assert.equal(result.matchedRosterEntryId, "ligne1");
  assert.equal(result.persisted, false);
  assert.equal(result.emailSent, false);
});

test("aucun lot CSV actif : validation manuelle", async () => {
  const result = await prepareRegistration(dbWithRows([]), demo());
  assert.equal(result.internalStatus, "manual_review");
  assert.equal(result.reviewReason, "no_active_roster");
});

test("absent du lot : validation manuelle", async () => {
  const result = await prepareRegistration(dbWithRows([{ import_id: "lot1", entry_id: null }]), demo());
  assert.equal(result.internalStatus, "manual_review");
  assert.equal(result.reviewReason, "not_found");
});

test("homonymes : validation manuelle", async () => {
  const result = await prepareRegistration(dbWithRows([
    { import_id: "lot1", entry_id: "ligne1" },
    { import_id: "lot1", entry_id: "ligne2" }
  ]), demo());
  assert.equal(result.internalStatus, "manual_review");
  assert.equal(result.reviewReason, "ambiguous");
});

test("reponse publique identique quelle que soit l'eligibilite", async () => {
  const outputs = await Promise.all([
    prepareRegistration(dbWithRows([{ entry_id: "ligne1" }]), demo()),
    prepareRegistration(dbWithRows([{ entry_id: null }]), demo()),
    prepareRegistration(dbWithRows([]), demo()),
    prepareRegistration(dbWithRows([{ entry_id: "ligne1" }, { entry_id: "ligne2" }]), demo())
  ]);
  assert.deepEqual([...new Set(outputs.map(x => x.publicStatus))], ["verification_pending"]);
  assert.ok(outputs.every(x => x.emailSent === false && x.persisted === false));
});
