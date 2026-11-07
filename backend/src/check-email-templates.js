"use strict";

// Vérification locale des cinq gabarits, SANS SMTP, sans requête HTTP,
// sans données personnelles et sans affichage de jeton.
const {
  buildVerificationEmail, buildRegistrationReceivedEmail,
  buildReviewRequiredEmail, buildDecisionEmail
} = require("./email-templates");

function validate(mail) {
  return Boolean(mail &&
    typeof mail.subject === "string" && mail.subject.length > 10 &&
    typeof mail.text === "string" && mail.text.length > 70 &&
    typeof mail.html === "string" && mail.html.includes('<html lang="fr">'));
}

try {
  const fakeToken = "ab".repeat(32);
  const messages = [
    buildVerificationEmail(fakeToken),
    buildRegistrationReceivedEmail(),
    buildReviewRequiredEmail(),
    buildDecisionEmail("approved"),
    buildDecisionEmail("rejected")
  ];
  if (!messages.every(validate)) {
    throw new Error("Un gabarit email est incomplet.");
  }
  if (!messages[0].text.includes("#jeton=" + fakeToken)) {
    throw new Error("Lien de verification invalide.");
  }
  console.log(JSON.stringify({
    status:"ok",
    templatesPrepared:messages.length,
    verificationLinkUsesFragment:true,
    smtpConfigured:false,
    verificationWebPagePublished:false,
    emailsSent:false
  }));
} catch (_) {
  console.error("Verification des modeles d'email echouee.");
  process.exitCode=1;
}
