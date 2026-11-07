"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeName, matchKey, parseEligibilityCsv, checkEligibility } = require("../src/eligibility");

test("parses CSV minimal avec BOM et accents, sans stocker d'autres colonnes", () => {
  const csv = "\uFEFFnom;prénom;numéro_etablissement;autre_colonne\nL’Écuyer;Élise;0012;IGNORER\n";
  const { entries } = parseEligibilityCsv(csv);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].establishmentNumber, "0012");
  assert.equal(entries[0].matchKey, "L ECUYER|ELISE|0012");
  assert.equal(Object.hasOwn(entries[0], "autre_colonne"), false);
});

test("garde les zeros initiaux des numeros d'etablissement", () => {
  assert.notEqual(matchKey("TEST", "Alex", "0012"), matchKey("TEST", "Alex", "12"));
});

test("accepte le format CSV avec guillemets", () => {
  const csv = 'nom,prenom,numero_etablissement\n"Duval, Martin",Noa,008\n';
  assert.equal(parseEligibilityCsv(csv).entries[0].lastName, "Duval, Martin");
});

test("met les homonymes en validation manuelle", () => {
  const { entries } = parseEligibilityCsv("nom;prenom;numero_etablissement\nTEST;Alice;10\nTEST;Alice;10\n");
  assert.deepEqual(checkEligibility(entries, {
    lastName: "TEST", firstName: "Alice", establishmentNumber: "10"
  }), { status: "manual_review", reason: "ambiguous" });
});

test("absent du CSV => revue manuelle", () => {
  const { entries } = parseEligibilityCsv("nom;prenom;numero_etablissement\nTEST;Alice;10\n");
  assert.equal(checkEligibility(entries, {
    lastName: "TEST", firstName: "Bob", establishmentNumber: "10"
  }).status, "manual_review");
});

test("ne valide qu'une correspondance unique", () => {
  const { entries } = parseEligibilityCsv("nom;prenom;numero_etablissement\nD'Étang;Yanis;0005\n");
  assert.equal(checkEligibility(entries, {
    lastName: "D Etang", firstName: "Yanis", establishmentNumber: "0005"
  }).status, "matched");
});

test("rejette les en-tetes incomplets et les champs vides", () => {
  assert.throws(() => parseEligibilityCsv("nom;prenom;ville\nTEST;Alice;Roubaix\n"));
  assert.throws(() => parseEligibilityCsv("nom;prenom;numero_etablissement\nTEST;;001\n"));
});

test("ne melange pas les lignes quand il y a des retours dans un champ", () => {
  const csv = 'nom;prenom;numero_etablissement\n"TEST\nDEUX";Alice;1\nBON;Jean;2\n';
  assert.equal(parseEligibilityCsv(csv).entries.length, 2);
  assert.equal(parseEligibilityCsv(csv).entries[1].sourceLine, 4);
});

test("normalise sans perdre les noms francais", () => {
  assert.equal(normalizeName("  Jean-Pierre d’ ÉTANG  "), "JEAN PIERRE D ETANG");
});
