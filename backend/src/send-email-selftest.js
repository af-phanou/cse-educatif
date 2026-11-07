"use strict";

// Programme d'essai facultatif, declenche UNE seule fois par l'operateur.
// Le mot de passe est lu dans un secret Docker non versionne.
// Aucun identifiant, message ou reponse SMTP n'est affiche en cas d'echec.
const { readPassword, makeTransport, sendSelfTest } = require("./email-smtp");

async function main() {
  const password = readPassword();
  const transport = makeTransport(password);
  try {
    const result = await sendSelfTest(transport);
    console.log(JSON.stringify({
      ...result,
      accountCreated: false,
      emailsToEmployees: 0
    }));
  } finally {
    if (typeof transport.close === "function") transport.close();
  }
}

main().catch(error => {
  // Conserver les diagnostics limites aux codes; jamais d'erreur SMTP
  // complete qui pourrait contenir des identifiants ou du contenu.
  const code = typeof error.code === "string" &&
    /^[A-Z0-9_]{1,32}$/.test(error.code)
    ? error.code : "SMTP_TEST_FAILED";
  console.error("Echec du test SMTP de l'application :", code);
  process.exitCode = 1;
});
