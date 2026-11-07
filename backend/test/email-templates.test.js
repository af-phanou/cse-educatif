"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildVerificationEmail, buildRegistrationReceivedEmail,
  buildReviewRequiredEmail, buildDecisionEmail
} = require("../src/email-templates");
const sampleToken = "ab".repeat(32);

test("confirmation comporte un lien unique et une expiration de 30 minutes", () => {
  const mail = buildVerificationEmail(sampleToken);
  assert.match(mail.subject, /Confirmez votre adresse/);
  assert.match(mail.text, /30 minutes/);
  assert.match(mail.text, /https:\/\/cse-educatif-rxtg\.fr\/verification-email#jeton=/);
});

test("le lien utilise un fragment et jamais un parametre de recherche", () => {
  const mail = buildVerificationEmail(sampleToken);
  assert.ok(mail.text.includes("#jeton=" + sampleToken));
  assert.equal(mail.text.includes("?token="), false);
  assert.equal(mail.text.includes("?jeton="), false);
});

test("le gabarit n'annonce jamais qu'une confirmation active un compte", () => {
  const mail = buildVerificationEmail(sampleToken);
  assert.match(mail.text, /ne valide pas automatiquement/);
  assert.match(mail.html, /ne valide pas automatiquement/);
});

test("refuse les jetons mal formes", () => {
  assert.throws(() => buildVerificationEmail("invalide"));
  assert.throws(() => buildVerificationEmail(null));
});

test("accepte uniquement les deux origines HTTPS officielles", () => {
  assert.doesNotThrow(() => buildVerificationEmail(sampleToken, "https://www.cse-educatif-rxtg.fr"));
  assert.throws(() => buildVerificationEmail(sampleToken, "https://evil.example"));
  assert.throws(() => buildVerificationEmail(sampleToken, "http://cse-educatif-rxtg.fr"));
});

test("gabarit texte et HTML avec structure minimale", () => {
  const mail = buildVerificationEmail(sampleToken);
  assert.match(mail.html, /^<!doctype html>/);
  assert.match(mail.html, /<html lang="fr">/);
  assert.match(mail.html, /Confirmer mon adresse email/);
  assert.match(mail.text, /Les Papillons Blancs Roubaix-Tourcoing/);
});

test("accuse de reception ne promet pas d'activation", () => {
  const mail = buildRegistrationReceivedEmail();
  assert.match(mail.text, /en attente/);
  assert.equal(mail.text.includes(sampleToken), false);
});

test("alerte admin ne contient pas d'identite personnelle", () => {
  const mail = buildReviewRequiredEmail();
  assert.match(mail.text, /vérification/);
  assert.match(mail.text, /Aucune donnée nominative/);
  assert.equal(mail.text.includes("@example.invalid"), false);
});

test("decision positive n'annonce pas un compte deja actif", () => {
  const mail = buildDecisionEmail("approved");
  assert.match(mail.text, /ne signifie pas que votre compte est déjà actif/);
});

test("decision negative renvoie vers le CSE et non un lien public", () => {
  const mail = buildDecisionEmail("rejected");
  assert.match(mail.text, /contactez directement votre CSE/);
  assert.equal(mail.html.includes("#jeton="), false);
});

test("aucune decision inconnue acceptee", () => {
  assert.throws(() => buildDecisionEmail("pending"));
  assert.throws(() => buildDecisionEmail("active"));
});

test("generation d'emails ne requiert aucune configuration SMTP ou base", () => {
  assert.deepEqual(
    Object.keys(buildRegistrationReceivedEmail()).sort(),
    ["html", "subject", "text"]
  );
});
