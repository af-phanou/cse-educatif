"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClassification, fictitiousForm } = require("../src/check-eligibility-e2e");

function output(status, reason = null, entryId = null) {
  return {
    internalStatus:status,
    reviewReason:reason,
    matchedRosterEntryId:entryId,
    publicStatus:"verification_pending",
    persisted:false,
    emailSent:false
  };
}

test("le test integre utilise exclusivement une identite et un email fictifs", () => {
  const form = fictitiousForm("ALPHA","01");
  assert.equal(form.lastName,"FICTIFTEST");
  assert.equal(form.firstName,"ALPHA");
  assert.equal(form.email,"simulation-eligibilite@example.invalid");
  assert.equal(form.establishmentNumber,"01");
  assert.equal(form.addressLine1,null);
  assert.equal(Object.hasOwn(form,"password"),false);
});

test("correspondance unique reconnue, sans creation de compte", () => {
  assert.equal(assertClassification(
    output("eligible_provisional",null,"00000000-0000-4000-8000-000000000001"),
    "eligible_provisional",null,true
  ),true);
});

test("identites identiques orientees vers validation manuelle", () => {
  assert.equal(assertClassification(
    output("manual_review","ambiguous"),
    "manual_review","ambiguous",false
  ),true);
});

test("salarié absent du CSV : revue manuelle", () => {
  assert.equal(assertClassification(
    output("manual_review","not_found"),
    "manual_review","not_found",false
  ),true);
});

test("en l'absence de CSV actif, une demande ne peut pas etre reconnue", () => {
  assert.equal(assertClassification(
    output("manual_review","no_active_roster"),
    "manual_review","no_active_roster",false
  ),true);
});

test("etablissement inconnu : jamais eligible provisoire", () => {
  assert.equal(assertClassification(
    output("manual_review","establishment_unavailable"),
    "manual_review","establishment_unavailable",false
  ),true);
});

test("verification de securite refuse un etat actif ou un email envoye", () => {
  assert.throws(() => assertClassification(
    {...output("eligible_provisional",null,"id"),persisted:true},
    "eligible_provisional",null,true
  ));
  assert.throws(() => assertClassification(
    {...output("eligible_provisional",null,"id"),emailSent:true},
    "eligible_provisional",null,true
  ));
  assert.throws(() => assertClassification(
    {...output("eligible_provisional",null,"id"),publicStatus:"is_employee"},
    "eligible_provisional",null,true
  ));
});
