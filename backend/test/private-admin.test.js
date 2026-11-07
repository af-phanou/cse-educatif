"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidPanelToken,
  isAllowedLocalHost,
  isAllowedMutationOrigin
} = require("../src/private-admin-auth");

const token = "a".repeat(64);

test("accepte uniquement le bon jeton prive", () => {
  assert.equal(isValidPanelToken(token, token), true);
  assert.equal(isValidPanelToken(token.toUpperCase(), token), true);
  assert.equal(isValidPanelToken("b".repeat(64), token), false);
});

test("refuse jetons incomplets, non-hexadecimaux ou absents", () => {
  assert.equal(isValidPanelToken(token.slice(1), token), false);
  assert.equal(isValidPanelToken("g".repeat(64), token), false);
  assert.equal(isValidPanelToken(null, token), false);
  assert.equal(isValidPanelToken(token + "\n", token), false);
});

test("refuse les domaines externes (anti DNS rebinding)", () => {
  assert.equal(isAllowedLocalHost("localhost:8088"), true);
  assert.equal(isAllowedLocalHost("127.0.0.1:8088"), true);
  assert.equal(isAllowedLocalHost("cse-educatif-rxtg.fr"), false);
  assert.equal(isAllowedLocalHost("evil.example:8088"), false);
});

test("autorise les modifications uniquement depuis le panneau localhost", () => {
  assert.equal(isAllowedMutationOrigin("http://localhost:8088"), true);
  assert.equal(isAllowedMutationOrigin("http://127.0.0.1:8088"), true);
  assert.equal(isAllowedMutationOrigin("https://cse-educatif-rxtg.fr"), false);
  assert.equal(isAllowedMutationOrigin(null), false);
});

test("une route Web arbitraire ne peut pas etre consideree comme autorisee", () => {
  const { upsertEstablishments } = require("../src/establishments");
  const db = { query: async () => { throw new Error("Ne pas executer de SQL"); } };
  return assert.rejects(() => upsertEstablishments(db, [{code:"10",name:"TEST"}], "public_http"));
});
