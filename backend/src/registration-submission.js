"use strict";

/**
 * Enregistrement atomique d'une DEMANDE, sans creation de compte et
 * sans envoi email. Ne pas exposer publiquement avant les protections
 * anti-abus, verification email, RGPD, administration et messagerie.
 */
const { validateRegistration, prepareRegistration } = require("./registration");

const PUBLIC_REPLY = Object.freeze({
  status: "verification_pending",
  message: "Si la demande est recevable, elle sera examinee selon la procedure CSE."
});

const INSERT_REQUEST_SQL = [
  "INSERT INTO cse.registration_requests (",
  " email, first_name, last_name, establishment_number,",
  " phone, address_line1, address_line2, postal_code, city,",
  " matched_roster_entry_id, review_reason",
  ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
  "ON CONFLICT DO NOTHING",
  "RETURNING id"
].join("\n");

async function submitRegistrationRequest(pool, input) {
  // Rejet des informations non attendues (notamment mots de passe : ce n'est
  // pas encore le parcours de creation de compte ni de verification email).
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.hasOwn(input, "password") ||
      Object.hasOwn(input, "passwordConfirmation")) {
    throw new Error("Formulaire invalide.");
  }
  validateRegistration(input);
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("Connexion PostgreSQL requise.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prepared = await prepareRegistration(client, input);

    // Un code d'etablissement inconnu ou desactive n'est jamais admis.
    // La reponse externe reste volontairement generique.
    if (prepared.reviewReason === "establishment_unavailable") {
      await client.query("COMMIT");
      return PUBLIC_REPLY;
    }

    const p = prepared.profile;
    const saved = await client.query(INSERT_REQUEST_SQL, [
      p.email, p.firstName, p.lastName, p.establishmentNumber,
      p.phone, p.addressLine1, p.addressLine2, p.postalCode, p.city,
      prepared.matchedRosterEntryId, prepared.reviewReason
    ]);

    if (saved.rowCount === 0) {
      // Adresse deja utilisee pour une demande en attente : ne pas divulguer
      // l'existence du dossier, ne pas creer d'email supplementaire.
      await client.query("COMMIT");
      return PUBLIC_REPLY;
    }

    const requestId = saved.rows[0].id;
    // Trace interne de creation, sans coordonnees personnelles dans metadata.
    await client.query([
      "INSERT INTO cse.audit_events (action,object_type,object_id,metadata)",
      "VALUES ($1,$2,$3,$4::jsonb)"
    ].join("\n"), [
      "registration.requested", "registration_request", requestId,
      JSON.stringify({reviewRequired: prepared.internalStatus === "manual_review"})
    ]);

    // File d'emails a envoyer LORSQUE le SMTP et la preuve de possession
    // de l'adresse seront implementes. Aucun email n'est envoye ici.
    await client.query([
      "INSERT INTO cse.email_outbox",
      "(request_id, recipient_email, audience, template)",
      "VALUES ($1,$2,'employee','registration_received')"
    ].join("\n"), [requestId, p.email]);

    if (prepared.internalStatus === "manual_review") {
      await client.query([
        "INSERT INTO cse.registration_reviews (request_id,reason)",
        "VALUES ($1,$2)"
      ].join("\n"), [requestId, prepared.reviewReason]);

      // Destination admin non configuree : le futur service SMTP devra
      // determiner les destinataires autorises.
      await client.query([
        "INSERT INTO cse.email_outbox",
        "(request_id, recipient_email, audience, template)",
        "VALUES ($1,NULL,'administration','registration_review_required')"
      ].join("\n"), [requestId]);
    }

    await client.query("COMMIT");
    return PUBLIC_REPLY;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { submitRegistrationRequest, PUBLIC_REPLY, INSERT_REQUEST_SQL };
