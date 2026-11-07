"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FROM, SMTP_HOST, SMTP_PORT,
  makeTransport, testMessage, sendSelfTest
} = require("../src/email-smtp");

test("SMTP utilise uniquement smtp.mail.ovh.net:465 avec TLS explicite", () => {
  let settings = null;
  makeTransport("FAUX_MOT_DE_PASSE_TEST", config => {
    settings = config;
    return { sendMail() {} };
  });
  assert.equal(settings.host, SMTP_HOST);
  assert.equal(settings.host, "smtp.mail.ovh.net");
  assert.equal(settings.port, SMTP_PORT);
  assert.equal(settings.port, 465);
  assert.equal(settings.secure, true);
  assert.equal(settings.tls.rejectUnauthorized, true);
  assert.equal(settings.tls.minVersion, "TLSv1.2");
  assert.equal(settings.tls.servername, "smtp.mail.ovh.net");
});

test("le mot de passe n'est pas copie dans les options de journalisation", () => {
  let settings;
  makeTransport("FAUX_SECRET_TEST", c => {
    settings = c;
    return {};
  });
  assert.equal(settings.auth.user, FROM);
  assert.equal(settings.auth.pass, "FAUX_SECRET_TEST");
  assert.equal(settings.logger, false);
  assert.equal(settings.debug, false);
});

test("le message de test va seulement vers la boite CSE", () => {
  const mail = testMessage();
  assert.equal(mail.to, "contact@cse-educatif-rxtg.fr");
  assert.deepEqual(mail.envelope.to, ["contact@cse-educatif-rxtg.fr"]);
  assert.equal(mail.envelope.from, "contact@cse-educatif-rxtg.fr");
  assert.equal(mail.disableFileAccess, true);
  assert.equal(mail.disableUrlAccess, true);
});

test("l'email indique clairement qu'aucune inscription n'est creee", () => {
  const mail = testMessage();
  assert.match(mail.text, /Aucun compte salarie/);
  assert.match(mail.text, /Aucune notification automatisee/);
});

test("l'envoi de test accepte uniquement un accuse du serveur pour cette boite", async () => {
  let mailed;
  const transport = { sendMail: async mail => {
    mailed = mail;
    return {accepted:[FROM],rejected:[]};
  }};
  const out = await sendSelfTest(transport);
  assert.equal(out.status, "accepted_by_smtp");
  assert.equal(out.automatedSending, false);
  assert.equal(mailed.to, FROM);
});

test("refuse les echecs et les destinataires SMTP rejetes", async () => {
  await assert.rejects(() => sendSelfTest({
    sendMail: async () => ({accepted:[],rejected:[FROM]})
  }));
  await assert.rejects(() => sendSelfTest({
    sendMail: async () => ({accepted:["autre@example.invalid"],rejected:[]})
  }));
});

test("une configuration absente est refusee", async () => {
  assert.throws(() => makeTransport(""));
  await assert.rejects(() => sendSelfTest(null));
});
