"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEMO, demoForm } = require("../src/demo-request-cli");

test("la commande de test utilise toujours un nom fictif et un domaine sans email", () => {
  assert.equal(DEMO.firstName,"DEMONSTRATION");
  assert.equal(DEMO.lastName,"FICTIF CSE");
  assert.equal(DEMO.email,"demo-validation-cse@example.invalid");
  assert.equal(DEMO.email.endsWith("@example.invalid"),true);
});

test("les coordonnees fictives n'incluent ni telephone ni adresse", () => {
  const form = demoForm("01");
  assert.equal(form.establishmentNumber,"01");
  assert.equal(form.phone,null);
  assert.equal(form.addressLine1,null);
  assert.equal(form.city,null);
  assert.equal(Object.hasOwn(form,"password"),false);
});

test("les codes d'etablissements sont valides et restent textuels", () => {
  assert.equal(demoForm("05").establishmentNumber,"05");
  assert.throws(() => demoForm(5));
  assert.throws(() => demoForm("01;DROP"));
  assert.throws(() => demoForm(""));
});
