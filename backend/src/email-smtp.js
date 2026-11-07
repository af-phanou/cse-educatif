"use strict";

/**
 * Transport SMTP technique vers la BOITE CSE ELLE-MEME exclusivement.
 * Pas de SMTP depuis l'API publique, aucune route HTTP, aucun envoi
 * aux salaries et aucun envoi automatique.
 *
 * Pour la production, construire un service d'envoi distinct avec
 * anti-abus et traitement des files de notifications.
 */
const fs = require("node:fs");
const nodemailer = require("nodemailer");

const FROM = "contact@cse-educatif-rxtg.fr";
const SMTP_HOST = "smtp.mail.ovh.net";
const SMTP_PORT = 465;
const SECRET_PATH = process.env.SMTP_PASSWORD_FILE || "/run/secrets/smtp_password";

function readPassword(secretPath = SECRET_PATH) {
  const password = fs.readFileSync(secretPath, "utf8").replace(/[\r\n]+$/, "");
  if (!password || password.includes("\r") || password.includes("\n")) {
    throw new Error("Secret SMTP absent ou mal forme.");
  }
  return password;
}

function makeTransport(password, factory = nodemailer.createTransport) {
  if (typeof password !== "string" || !password) {
    throw new Error("Mot de passe SMTP manquant.");
  }
  return factory({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    pool: false,
    auth: { user: FROM, pass: password },
    tls: {
      servername: SMTP_HOST,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2"
    },
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    logger: false,
    debug: false
  });
}

function testMessage() {
  return {
    from: { name: "CSE Educatif", address: FROM },
    to: FROM,
    envelope: { from: FROM, to: [FROM] },
    subject: "CSE Educatif - test du moteur SMTP de l'application",
    text: [
      "Bonjour,",
      "",
      "Message technique envoye a la boite CSE elle-meme.",
      "Aucun compte salarie n'a ete cree.",
      "Aucune inscription n'a ete approuvee.",
      "Aucune notification automatisee n'a ete activee."
    ].join("\n"),
    disableFileAccess: true,
    disableUrlAccess: true
  };
}

async function sendSelfTest(transport) {
  if (!transport || typeof transport.sendMail !== "function") {
    throw new TypeError("Transport SMTP requis.");
  }
  const message = testMessage();
  if (message.to !== FROM || message.envelope.to.length !== 1 ||
      message.envelope.to[0] !== FROM) {
    throw new Error("Le destinataire du test doit etre la boite CSE.");
  }
  const result = await transport.sendMail(message);
  const accepted = Array.isArray(result.accepted) &&
    result.accepted.some(address => String(address).toLowerCase() === FROM);
  const rejected = Array.isArray(result.rejected) && result.rejected.length > 0;
  if (!accepted || rejected) {
    throw new Error("Le serveur SMTP n'a pas confirme l'acceptation du message.");
  }
  return { status: "accepted_by_smtp", recipient: FROM, automatedSending: false };
}

module.exports = {
  FROM, SMTP_HOST, SMTP_PORT,
  readPassword, makeTransport, testMessage, sendSelfTest
};
