"use strict";

/**
 * Gabarits email SANS transport SMTP, sans accès base, sans envoi.
 * Le domaine d'origine et les liens sont fixés pour éviter les
 * redirections de confirmation contrôlées par un tiers.
 *
 * ATTENTION: /verification-email n'est PAS encore déployé :
 * ne jamais expédier ces messages avant la mise en place de la page,
 * de la route de vérification, de l'anti-abus et du serveur SMTP.
 */
const { hashEmailToken } = require("./email-verification");

const ALLOWED_ORIGINS = new Set([
  "https://cse-educatif-rxtg.fr",
  "https://www.cse-educatif-rxtg.fr"
]);

function escapeHtml(raw) {
  return String(raw).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;",
    '"':"&quot;", "'":"&#39;"
  })[char]);
}

function buildMessage({subject, introduction, paragraphs, action}) {
  const pieces = [introduction, ...paragraphs];
  const text = [
    "CSE Éducatif — Les Papillons Blancs Roubaix-Tourcoing",
    "",
    ...pieces.flatMap(paragraph => [paragraph, ""]),
    ...(action ? [action.label + " :", action.url, ""] : []),
    "Ceci est un message automatique du CSE.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."
  ].join("\n");

  const blocks = pieces.map(para => (
    '<p style="margin:0 0 16px;line-height:1.55;">' + escapeHtml(para) + "</p>"
  )).join("");
  const button = action
    ? '<p style="margin:24px 0;"><a href="' + escapeHtml(action.url) +
      '" style="background:#0f2660;color:#fff;padding:12px 18px;border-radius:8px;' +
      'text-decoration:none;display:inline-block;font-weight:700;">' +
      escapeHtml(action.label) + "</a></p>"
    : "";
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172b49;">' +
    '<div style="max-width:640px;margin:30px auto;background:white;padding:30px;' +
    'border-radius:14px;"><h1 style="color:#0f2660;font-size:25px;margin-top:0;">' +
    "CSE Éducatif</h1><p style=\"color:#1278cc;font-weight:700;\">" +
    "Les Papillons Blancs Roubaix-Tourcoing</p>" +
    blocks + button +
    '<p style="font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;' +
    'padding-top:14px;margin-top:26px;">Ceci est un message automatique du CSE. ' +
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>" +
    "</div></body></html>";
  return {subject, text, html};
}

function buildVerificationEmail(rawToken, siteOrigin = "https://cse-educatif-rxtg.fr") {
  if (hashEmailToken(rawToken) === null) {
    throw new Error("Jeton de confirmation incorrect.");
  }
  if (!ALLOWED_ORIGINS.has(siteOrigin)) {
    throw new Error("Origine du lien de verification non autorisee.");
  }
  // Fragment URL : le navigateur n'envoie pas le jeton dans la requête
  // HTTP initiale. La future page devra l'envoyer par POST et l'effacer
  // immédiatement de la barre d'adresse sans aucune analytics.
  const actionUrl = siteOrigin + "/verification-email#jeton=" + rawToken.toLowerCase();
  return buildMessage({
    subject:"CSE Éducatif — Confirmez votre adresse email",
    introduction:"Bonjour,",
    paragraphs:[
      "Une demande d'inscription à CSE Éducatif a été créée avec cette adresse email.",
      "Pour confirmer que vous pouvez utiliser cette adresse, cliquez sur le lien ci-dessous dans les 30 minutes.",
      "La confirmation de l'adresse email ne valide pas automatiquement votre inscription : votre dossier doit encore être examiné selon la procédure du CSE."
    ],
    action:{label:"Confirmer mon adresse email",url:actionUrl}
  });
}

function buildRegistrationReceivedEmail() {
  return buildMessage({
    subject:"CSE Éducatif — Demande d'inscription reçue",
    introduction:"Bonjour,",
    paragraphs:[
      "Votre demande d'inscription au CSE Éducatif a été enregistrée.",
      "Votre dossier reste en attente des vérifications nécessaires. Vous serez informé de la suite lorsque le service de messagerie sera opérationnel."
    ]
  });
}

function buildReviewRequiredEmail() {
  return buildMessage({
    subject:"CSE Éducatif — Une inscription nécessite une vérification",
    introduction:"Bonjour,",
    paragraphs:[
      "Une demande d'inscription doit être examinée par une personne habilitée.",
      "Connectez-vous à l'administration sécurisée du CSE pour consulter le dossier. Aucune donnée nominative n'est incluse dans ce message."
    ]
  });
}

function buildDecisionEmail(decision) {
  if (decision !== "approved" && decision !== "rejected") {
    throw new Error("Statut de decision inconnu.");
  }
  const approved = decision === "approved";
  return buildMessage({
    subject:approved
      ? "CSE Éducatif — Votre demande a été examinée"
      : "CSE Éducatif — Suite donnée à votre inscription",
    introduction:"Bonjour,",
    paragraphs:approved
      ? [
        "Votre demande a été approuvée après vérification administrative.",
        "Cette décision ne signifie pas que votre compte est déjà actif. Les instructions de création d'accès vous seront communiquées lorsque le dispositif sera opérationnel."
      ]
      : [
        "Votre demande d'inscription n'a pas pu être approuvée à ce stade.",
        "Si vous pensez qu'il s'agit d'une erreur, contactez directement votre CSE par les canaux habituels."
      ]
  });
}

module.exports = {
  buildVerificationEmail,
  buildRegistrationReceivedEmail,
  buildReviewRequiredEmail,
  buildDecisionEmail
};
