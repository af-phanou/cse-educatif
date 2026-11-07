"use strict";

/*
 * Preparation d'inscription, cote serveur uniquement.
 * Pas encore route HTTP, pas de sauvegarde de compte, pas d'email.
 * Toute information retournee est reservee a des services internes
 * jusqu'a l'ajout d'une authentification, de l'anti-abus et d'Argon2id.
 */
const { matchKey, normalizeNumber } = require("./eligibility");

const LOOKUP_ACTIVE_ROSTER_SQL = [
  "SELECT active.id AS import_id, matching.id AS entry_id",
  "FROM (SELECT id FROM cse.roster_imports WHERE status = 'active' LIMIT 1) active",
  "LEFT JOIN LATERAL (",
  "  SELECT id FROM cse.roster_entries e",
  "  WHERE e.import_id = active.id AND e.match_key = $1",
  "  LIMIT 2",
  ") matching ON TRUE"
].join("\n");

function cleanText(value, field, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string") throw new Error("Champ invalide : " + field);
  const cleaned = value.normalize("NFC").trim().replace(/ {2,}/g, " ");
  if ((required && cleaned.length === 0) ||
      cleaned.length > max ||
      /[\p{Cc}\p{Cf}]/u.test(cleaned)) {
    throw new Error("Champ invalide : " + field);
  }
  return cleaned || null;
}

function validateRegistration(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Formulaire d'inscription invalide.");
  }

  const firstName = cleanText(input.firstName, "prenom", 120, true);
  const lastName = cleanText(input.lastName, "nom", 120, true);
  const establishmentRaw = cleanText(input.establishmentNumber, "etablissement", 40, true);
  const establishmentNumber = normalizeNumber(establishmentRaw);
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(establishmentNumber)) {
    throw new Error("Numero d'etablissement invalide.");
  }

  const email = cleanText(input.email, "email", 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Adresse email invalide.");
  }

  const phone = cleanText(input.phone, "telephone", 30);
  const addressLine1 = cleanText(input.addressLine1, "adresse", 160);
  const addressLine2 = cleanText(input.addressLine2, "complement", 160);
  const postalCode = cleanText(input.postalCode, "code_postal", 24);
  const city = cleanText(input.city, "ville", 120);

  // Seules ces donnees seront destinees au compte, jamais les colonnes CSV.
  // Aucun mot de passe n'est accepte ni traite par ce module preparatoire.
  return {
    firstName,
    lastName,
    establishmentNumber,
    email,
    phone,
    addressLine1,
    addressLine2,
    postalCode,
    city
  };
}

async function prepareRegistration(db, input) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Connexion PostgreSQL requise.");
  }
  const profile = validateRegistration(input);
  const key = matchKey(profile.lastName, profile.firstName, profile.establishmentNumber);
  const query = await db.query(LOOKUP_ACTIVE_ROSTER_SQL, [key]);

  // 0 ligne : aucun lot CSV actif ; 1 ligne / entry_id null : non trouve ;
  // 2 lignes : homonymes ou doublons dans le CSV -> revue obligatoire.
  let internalStatus, reviewReason = null, matchedRosterEntryId = null;
  if (query.rows.length === 0) {
    internalStatus = "manual_review";
    reviewReason = "no_active_roster";
  } else {
    const matching = query.rows.filter(row => row.entry_id != null);
    if (matching.length === 1) {
      internalStatus = "eligible_provisional";
      matchedRosterEntryId = matching[0].entry_id;
    } else {
      internalStatus = "manual_review";
      reviewReason = matching.length > 1 ? "ambiguous" : "not_found";
    }
  }

  return {
    profile,
    internalStatus,
    reviewReason,
    matchedRosterEntryId,
    // Ne jamais reveler a l'internaute si son nom figure dans le fichier RH.
    publicStatus: "verification_pending",
    persisted: false,
    emailSent: false
  };
}

module.exports = {
  validateRegistration,
  prepareRegistration,
  LOOKUP_ACTIVE_ROSTER_SQL
};
